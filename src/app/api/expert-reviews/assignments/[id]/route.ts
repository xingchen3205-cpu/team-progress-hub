import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  redactExpertReviewAssignmentForRole,
  serializeExpertReviewAssignment,
} from "@/lib/expert-review";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTeamScopedResource } from "@/lib/team-scope";
import { deleteStoredFile } from "@/lib/uploads";

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
      targetName: true,
      roundLabel: true,
      overview: true,
      deadline: true,
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
        deadline?: string | null;
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

  if (parsedDeadline instanceof Date && Number.isNaN(parsedDeadline.getTime())) {
    return NextResponse.json({ message: "截止时间格式无效" }, { status: 400 });
  }

  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id },
    include: {
      reviewPackage: {
        include: {
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
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id },
    include: {
      reviewPackage: {
        include: {
          materials: true,
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

  const fileKeys = assignment.reviewPackage.materials.map((item) => item.filePath);

  await prisma.expertReviewPackage.delete({
    where: { id: assignment.packageId },
  });

  await Promise.allSettled(fileKeys.map((fileKey) => deleteStoredFile(fileKey)));

  return NextResponse.json({ success: true });
}
