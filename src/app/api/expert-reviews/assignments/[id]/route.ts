import { NextRequest, NextResponse } from "next/server";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import {
  redactExpertReviewAssignmentForRole,
  serializeExpertReviewAssignment,
} from "@/lib/expert-review";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { normalizeReviewScoreRuleCount, validateReviewScoreRule } from "@/lib/review-score-rules";
import { canAccessTeamScopedResource } from "@/lib/team-scope";

const assignmentInclude = {
  expertUser: {
    select: {
      id: true,
      name: true,
      avatar: true,
      role: true,
    },
  },
  reviewPackage: {
    select: {
      id: true,
      teamGroupId: true,
      targetName: true,
      roundLabel: true,
      overview: true,
      status: true,
      startAt: true,
      deadline: true,
      dropHighestCount: true,
      dropLowestCount: true,
      projectReviewStage: {
        select: {
          id: true,
          type: true,
        },
      },
      materials: {
        orderBy: { uploadedAt: "asc" },
        select: {
          id: true,
          kind: true,
          name: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          uploadedAt: true,
        },
      },
    },
  },
  score: {
    select: {
      id: true,
      scorePersonalGrowth: true,
      scoreInnovation: true,
      scoreIndustry: true,
      scoreTeamwork: true,
      totalScore: true,
      commentTotal: true,
      submittedAt: true,
      updatedAt: true,
      lockedAt: true,
    },
  },
  displaySeats: {
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      session: {
        select: {
          status: true,
          startedAt: true,
          tokenExpiresAt: true,
          screenPhase: true,
          currentPackageId: true,
        },
      },
    },
  },
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        expertUserIds?: string[];
        roundLabel?: string;
        overview?: string;
        startAt?: string | null;
        deadline?: string | null;
        dropHighestCount?: number;
        dropLowestCount?: number;
      }
    | null;

  const expertUserIds = Array.isArray(body?.expertUserIds)
    ? [
        ...new Set(
          body.expertUserIds
            .filter((expertUserId): expertUserId is string => typeof expertUserId === "string" && Boolean(expertUserId.trim()))
            .map((expertUserId) => expertUserId.trim()),
        ),
      ]
    : [];

  if (expertUserIds.length === 0) {
    return NextResponse.json({ message: "请至少保留一位评审专家" }, { status: 400 });
  }

  const parsedDeadline =
    body && "deadline" in body
      ? body.deadline
        ? new Date(body.deadline)
        : null
      : undefined;

  const parsedStartAt =
    body && "startAt" in body
      ? body.startAt
        ? new Date(body.startAt)
        : null
      : undefined;

  if (parsedStartAt instanceof Date && Number.isNaN(parsedStartAt.getTime())) {
    return NextResponse.json({ message: "评审开始时间格式无效" }, { status: 400 });
  }

  if (parsedDeadline instanceof Date && Number.isNaN(parsedDeadline.getTime())) {
    return NextResponse.json({ message: "评审截止时间格式无效" }, { status: 400 });
  }

  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id },
    include: {
      reviewPackage: {
        include: {
          projectReviewStage: {
            select: {
              isOpen: true,
              deadline: true,
            },
          },
          assignments: {
            include: { score: true },
          },
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "评审任务不存在" }, { status: 404 });
  }

  const effectiveStartAt = parsedStartAt === undefined ? assignment.reviewPackage.startAt : parsedStartAt;
  const effectiveDeadline = parsedDeadline === undefined ? assignment.reviewPackage.deadline : parsedDeadline;
  if (effectiveStartAt && effectiveDeadline && effectiveDeadline.getTime() <= effectiveStartAt.getTime()) {
    return NextResponse.json({ message: "评审截止时间必须晚于评审开始时间" }, { status: 400 });
  }

  const projectReviewStage = assignment.reviewPackage.projectReviewStage;
  if (
    projectReviewStage?.isOpen !== false &&
    projectReviewStage?.deadline &&
    effectiveStartAt &&
    effectiveStartAt.getTime() < projectReviewStage.deadline.getTime()
  ) {
    return NextResponse.json(
      { message: "评审开始时间不能早于项目材料上传截止时间；如需提前评审，请先在项目管理中关闭学生上传。" },
      { status: 400 },
    );
  }

  if (
    !canAccessTeamScopedResource(user, {
      ownerId: assignment.reviewPackage.createdById,
      teamGroupId: assignment.reviewPackage.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权限编辑该评审任务" }, { status: 403 });
  }

  const expertCount = await prisma.user.count({
    where: { id: { in: expertUserIds }, role: "expert" },
  });

  if (expertCount !== expertUserIds.length) {
    return NextResponse.json({ message: "请选择有效的评审专家账号" }, { status: 400 });
  }

  const dropHighestCount = normalizeReviewScoreRuleCount(
    body?.dropHighestCount,
    assignment.reviewPackage.dropHighestCount,
  );
  const dropLowestCount = normalizeReviewScoreRuleCount(
    body?.dropLowestCount,
    assignment.reviewPackage.dropLowestCount,
  );
  const scoreRuleError = validateReviewScoreRule({
    expertCount: expertUserIds.length,
    dropHighestCount,
    dropLowestCount,
  });
  if (scoreRuleError) {
    return NextResponse.json({ message: scoreRuleError }, { status: 400 });
  }

  const assignmentsToRemove = assignment.reviewPackage.assignments.filter(
    (item) => !expertUserIds.includes(item.expertUserId),
  );
  const scoredAssignmentToRemove = assignmentsToRemove.find((item) => item.score);

  if (scoredAssignmentToRemove) {
    return NextResponse.json({ message: "已有评分的专家不能从本轮移除" }, { status: 400 });
  }

  const existingExpertIds = new Set(assignment.reviewPackage.assignments.map((item) => item.expertUserId));
  const expertIdsToCreate = expertUserIds.filter((expertUserId) => !existingExpertIds.has(expertUserId));

  const updatedAssignments = await prisma.$transaction(async (tx) => {
    await tx.expertReviewPackage.update({
      where: { id: assignment.packageId },
      data: {
        roundLabel: body?.roundLabel?.trim() || null,
        overview: body?.overview?.trim() || null,
        status: "configured",
        dropHighestCount,
        dropLowestCount,
        ...(parsedStartAt !== undefined ? { startAt: parsedStartAt } : {}),
        ...(parsedDeadline !== undefined ? { deadline: parsedDeadline } : {}),
      },
    });

    if (assignmentsToRemove.length > 0) {
      await tx.expertReviewAssignment.deleteMany({
        where: { id: { in: assignmentsToRemove.map((item) => item.id) } },
      });
    }

    if (expertIdsToCreate.length > 0) {
      await tx.expertReviewAssignment.createMany({
        data: expertIdsToCreate.map((expertUserId) => ({
          packageId: assignment.packageId,
          expertUserId,
        })),
      });
    }

    await tx.expertReviewAssignment.updateMany({
      where: {
        packageId: assignment.packageId,
        status: "locked",
      },
      data: { status: "pending" },
    });

    return tx.expertReviewAssignment.findMany({
      where: { packageId: assignment.packageId },
      orderBy: [{ createdAt: "desc" }],
      include: assignmentInclude,
    });
  });

  return NextResponse.json({
    assignments: updatedAssignments.map((item) =>
      redactExpertReviewAssignmentForRole(serializeExpertReviewAssignment(item), user.role),
    ),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const confirm = request.nextUrl.searchParams.get("confirm");
  const deleteScope = request.nextUrl.searchParams.get("scope");
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim() ?? request.nextUrl.searchParams.get("reason")?.trim() ?? "";
  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id },
    include: {
      reviewPackage: {
        include: {
          materials: true,
          displaySessions: true,
          assignments: {
            include: {
              score: true,
              expertUser: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "评审任务不存在" }, { status: 404 });
  }

  if (
    !canAccessTeamScopedResource(user, {
      ownerId: assignment.reviewPackage.createdById,
      teamGroupId: assignment.reviewPackage.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权限删除该评审任务" }, { status: 403 });
  }

  const packagesToDelete =
    deleteScope === "stage" && assignment.reviewPackage.projectReviewStageId
      ? await prisma.expertReviewPackage.findMany({
          where: {
            projectReviewStageId: assignment.reviewPackage.projectReviewStageId,
            status: { not: "cancelled" },
          },
          include: {
            materials: true,
            displaySessions: true,
            assignments: {
              include: {
                score: true,
                expertUser: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        })
      : [assignment.reviewPackage];

  if (packagesToDelete.length === 0) {
    return NextResponse.json({ success: true, message: "本阶段评审配置已清空" });
  }

  const inaccessiblePackage = packagesToDelete.find(
    (reviewPackage) =>
      !canAccessTeamScopedResource(user, {
        ownerId: reviewPackage.createdById,
        teamGroupId: reviewPackage.teamGroupId,
      }),
  );
  if (inaccessiblePackage) {
    return NextResponse.json({ message: "无权限删除该阶段的全部评审配置" }, { status: 403 });
  }

  const packageIds = packagesToDelete.map((reviewPackage) => reviewPackage.id);
  const isStageDelete = deleteScope === "stage" && Boolean(assignment.reviewPackage.projectReviewStageId);
  const auditObjectType = isStageDelete ? "expert_review_stage" : "expert_review_package";
  const auditObjectId = isStageDelete
    ? assignment.reviewPackage.projectReviewStageId ?? assignment.packageId
    : assignment.packageId;
  const auditTeamGroupId = isStageDelete ? null : assignment.reviewPackage.teamGroupId;
  const auditBeforeState = {
    scope: isStageDelete ? "stage" : "package",
    projectReviewStageId: assignment.reviewPackage.projectReviewStageId,
    packageCount: packagesToDelete.length,
    packages: packagesToDelete.map((reviewPackage) => ({
      packageId: reviewPackage.id,
      targetName: reviewPackage.targetName,
      status: reviewPackage.status,
      teamGroupId: reviewPackage.teamGroupId,
      dropHighestCount: reviewPackage.dropHighestCount,
      dropLowestCount: reviewPackage.dropLowestCount,
      assignmentCount: reviewPackage.assignments.length,
      displaySessionCount: reviewPackage.displaySessions.length,
      materialCount: reviewPackage.materials.length,
    })),
  };

  const hasLockedScore = packagesToDelete.some((reviewPackage) =>
    reviewPackage.assignments.some((item) => item.score?.lockedAt),
  );
  if (hasLockedScore) {
    if (confirm !== "permanent") {
      return NextResponse.json(
        { message: isStageDelete ? "本阶段已有评分记录，请先完成二次确认后重置全部评审配置" : "已有评分记录，请先完成二次确认后重置评审包" },
        { status: 403 },
      );
    }

    if (!reason) {
      return NextResponse.json({ message: "重置原因不能为空" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const scoreSnapshots = packagesToDelete.flatMap((reviewPackage) =>
        reviewPackage.assignments.flatMap((item) =>
          item.score
            ? [
                {
                  packageId: item.packageId,
                  teamGroupId: reviewPackage.teamGroupId,
                  assignmentId: item.id,
                  reviewerId: item.score.reviewerId,
                  snapshot: JSON.stringify({
                    assignmentId: item.id,
                    expertUserId: item.expertUserId,
                    expertName: item.expertUser.name,
                    status: item.status,
                    score: {
                      id: item.score.id,
                      reviewerId: item.score.reviewerId,
                      scorePersonalGrowth: item.score.scorePersonalGrowth,
                      scoreInnovation: item.score.scoreInnovation,
                      scoreIndustry: item.score.scoreIndustry,
                      scoreTeamwork: item.score.scoreTeamwork,
                      totalScore: item.score.totalScore,
                      commentTotal: item.score.commentTotal,
                      submittedAt: item.score.submittedAt.toISOString(),
                      updatedAt: item.score.updatedAt.toISOString(),
                      lockedAt: item.score.lockedAt?.toISOString() ?? null,
                    },
                  }),
                  resetById: user.id,
                  resetReason: reason,
                },
              ]
            : [],
        ),
      );

      if (scoreSnapshots.length > 0) {
        await tx.expertReviewScoreHistory.createMany({
          data: scoreSnapshots,
        });
      }

      await createAuditLogEntry({
        tx,
        operator: user,
        action: isStageDelete ? "expert_review_stage.reset" : "expert_review_package.reset",
        objectType: auditObjectType,
        objectId: auditObjectId,
        teamGroupId: auditTeamGroupId,
        beforeState: {
          ...auditBeforeState,
          scoreHistoryCount: scoreSnapshots.length,
        },
        afterState: {
          packageDeleted: packageIds,
          scoreHistoryCreated: scoreSnapshots.length,
        },
        reason,
      });

      await tx.reviewDisplaySession.deleteMany({
        where: { packageId: { in: packageIds } },
      });
      await tx.expertReviewMaterial.deleteMany({
        where: { packageId: { in: packageIds } },
      });
      await tx.expertReviewAssignment.deleteMany({
        where: { packageId: { in: packageIds } },
      });
      await tx.expertReviewPackage.deleteMany({
        where: { id: { in: packageIds } },
      });
    });

    return NextResponse.json({
      success: true,
      message: isStageDelete ? "本阶段全部评审配置已重置，可重新配置" : "评审包已重置，可重新配置",
    });
  }

  await prisma.$transaction(async (tx) => {
    await createAuditLogEntry({
      tx,
      operator: user,
      action: isStageDelete ? "expert_review_stage.cancel" : "expert_review_package.cancel",
      objectType: auditObjectType,
      objectId: auditObjectId,
      teamGroupId: auditTeamGroupId,
      beforeState: auditBeforeState,
      afterState: {
        status: "cancelled",
        packageIds,
      },
      reason,
    });

    await tx.reviewDisplaySession.deleteMany({
      where: { packageId: { in: packageIds } },
    });
    await tx.expertReviewMaterial.deleteMany({
      where: { packageId: { in: packageIds } },
    });
    await tx.expertReviewAssignment.deleteMany({
      where: { packageId: { in: packageIds } },
    });
    await tx.expertReviewPackage.updateMany({
      where: { id: { in: packageIds } },
      data: {
        status: "cancelled",
        startAt: null,
        deadline: null,
        overview: null,
      },
    });
  });

  return NextResponse.json({
    success: true,
    message: isStageDelete ? "本阶段全部评审配置已取消" : "评审配置已取消",
  });
}
