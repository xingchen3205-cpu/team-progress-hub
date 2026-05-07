import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  redactExpertReviewAssignmentForRole,
  serializeExpertReviewAssignment,
} from "@/lib/expert-review";
import { assertRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import {
  canTeamGroupAccessProjectStage,
  inferExpertReviewMaterialKindFromRequirement,
  parseProjectStageDescription,
  projectMaterialRequirementOptions,
  type ProjectMaterialRequirementKey,
} from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";
import { normalizeReviewScoreRuleCount, validateReviewScoreRule } from "@/lib/review-score-rules";
import { buildExpertReviewAssignmentVisibilityWhere } from "@/lib/team-scope";

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

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader", "member", "expert"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const assignments = await prisma.expertReviewAssignment.findMany({
    where: buildExpertReviewAssignmentVisibilityWhere(user),
    orderBy: [{ createdAt: "desc" }],
    include: assignmentInclude,
  });

  return NextResponse.json({
    assignments: assignments.map((assignment) =>
      redactExpertReviewAssignmentForRole(serializeExpertReviewAssignment(assignment), user.role),
    ),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        expertUserId?: string;
        expertUserIds?: string[];
        stageId?: string;
        materialSubmissionIds?: string[];
        teamGroupIds?: string[];
        targetName?: string;
        roundLabel?: string;
        overview?: string;
        startAt?: string;
        deadline?: string;
        dropHighestCount?: number;
        dropLowestCount?: number;
      }
    | null;

  const stageId = body?.stageId?.trim();
  const materialSubmissionIds = Array.isArray(body?.materialSubmissionIds)
    ? [
        ...new Set(
          body.materialSubmissionIds
            .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
            .map((id) => id.trim()),
        ),
      ]
    : [];
  const expertUserIds = Array.isArray(body?.expertUserIds)
    ? [
        ...new Set(
          body.expertUserIds
            .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
            .map((id) => id.trim()),
        ),
      ]
    : [];
  const teamGroupIds = Array.isArray(body?.teamGroupIds)
    ? [
        ...new Set(
          body.teamGroupIds
            .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
            .map((id) => id.trim()),
        ),
      ]
    : [];
  const expertUserId = body?.expertUserId?.trim();
  const targetName = body?.targetName?.trim();
  const roundLabel = body?.roundLabel?.trim() || null;
  const overview = body?.overview?.trim() || null;
  const startAt = body?.startAt ? new Date(body.startAt) : null;
  const deadline = body?.deadline ? new Date(body.deadline) : null;
  const dropHighestCount = normalizeReviewScoreRuleCount(body?.dropHighestCount, 1);
  const dropLowestCount = normalizeReviewScoreRuleCount(body?.dropLowestCount, 1);

  if (startAt && Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ message: "评审开始时间格式无效" }, { status: 400 });
  }

  if (deadline && Number.isNaN(deadline.getTime())) {
    return NextResponse.json({ message: "评审截止时间格式无效" }, { status: 400 });
  }

  if (startAt && deadline && deadline.getTime() <= startAt.getTime()) {
    return NextResponse.json({ message: "评审截止时间必须晚于评审开始时间" }, { status: 400 });
  }

  if (stageId || materialSubmissionIds.length > 0 || teamGroupIds.length > 0 || expertUserIds.length > 0) {
    if (!stageId || expertUserIds.length === 0) {
      return NextResponse.json({ message: "请选择项目管理轮次和评审专家" }, { status: 400 });
    }

    const projectReviewStage = await prisma.projectReviewStage.findUnique({
      where: { id: stageId },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        isOpen: true,
        startAt: true,
        deadline: true,
      },
    });

    if (!projectReviewStage) {
      return NextResponse.json({ message: "项目管理轮次不存在" }, { status: 404 });
    }

    const expertCount = await prisma.user.count({
      where: { id: { in: expertUserIds }, role: "expert" },
    });

    if (expertCount !== expertUserIds.length) {
      return NextResponse.json({ message: "请选择有效的评审专家账号" }, { status: 400 });
    }

    const scoreRuleError = validateReviewScoreRule({
      expertCount: expertUserIds.length,
      dropHighestCount,
      dropLowestCount,
    });
    if (scoreRuleError) {
      return NextResponse.json({ message: scoreRuleError }, { status: 400 });
    }

    const stageMeta = parseProjectStageDescription(projectReviewStage.description, projectReviewStage.type);
    const requirementLabels = new Map<ProjectMaterialRequirementKey, string>(
      projectMaterialRequirementOptions.map((option) => [option.key, option.label]),
    );
    const materialKindByTitle = (title: string) => {
      const matched = projectMaterialRequirementOptions.find((option) => title.includes(option.label));
      return matched?.key ?? "plan_pdf";
    };
    const effectiveRoundLabel =
      roundLabel || `${projectReviewStage.name} · ${projectReviewStage.type === "roadshow" ? "项目路演" : "网络评审"}`;
    const effectiveOverview =
      overview ||
      stageMeta.description ||
      `来源于项目管理「${projectReviewStage.name}」已生效材料。`;
    const effectiveStartAt = startAt;
    const effectiveDeadline = deadline;

    if (!effectiveStartAt || !effectiveDeadline) {
      return NextResponse.json({ message: "请设置专家评审开始时间和截止时间" }, { status: 400 });
    }

    if (
      projectReviewStage.isOpen !== false &&
      projectReviewStage.deadline &&
      effectiveStartAt.getTime() < projectReviewStage.deadline.getTime()
    ) {
      return NextResponse.json(
        { message: "评审开始时间不能早于项目材料上传截止时间；如需提前评审，请先在项目管理中关闭学生上传。" },
        { status: 400 },
      );
    }

    let selectedMaterials: Array<
      Awaited<ReturnType<typeof prisma.projectMaterialSubmission.findMany>>[number] & {
        teamGroup: { id: string; name: string };
      }
    > = [];
    let selectedTeamGroups: Array<{ id: string; name: string }> = [];

    if (projectReviewStage.type === "roadshow") {
      if (teamGroupIds.length === 0) {
        return NextResponse.json({ message: "请选择路演项目组" }, { status: 400 });
      }

      selectedTeamGroups = await prisma.teamGroup.findMany({
        where: { id: { in: teamGroupIds } },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });

      if (selectedTeamGroups.length !== teamGroupIds.length) {
        return NextResponse.json({ message: "项目组不存在" }, { status: 400 });
      }

      const hasInvalidGroup = selectedTeamGroups.some(
        (teamGroup) =>
          !canTeamGroupAccessProjectStage({
            allowedTeamGroupIds: stageMeta.allowedTeamGroupIds,
            legacyTeamGroupId: null,
            actorTeamGroupId: teamGroup.id,
          }),
      );

      if (hasInvalidGroup) {
        return NextResponse.json({ message: "所选项目组不在当前轮次开放范围内" }, { status: 400 });
      }
    } else {
      if (materialSubmissionIds.length === 0) {
        return NextResponse.json({ message: "请选择已生效项目材料" }, { status: 400 });
      }

      const projectMaterialSubmissions = await prisma.projectMaterialSubmission.findMany({
        where: {
          id: { in: materialSubmissionIds },
          stageId,
          status: "approved",
        },
        include: {
          teamGroup: { select: { id: true, name: true } },
        },
      });

      if (projectMaterialSubmissions.length === 0) {
        return NextResponse.json({ message: "请选择已生效项目材料" }, { status: 400 });
      }

      selectedMaterials = projectMaterialSubmissions.filter(
        (projectMaterialSubmission) =>
          hasGlobalAdminPrivileges(user.role) || projectMaterialSubmission.teamGroupId === user.teamGroupId,
      );

      if (selectedMaterials.length === 0) {
        return NextResponse.json({ message: "无权限分配所选项目材料" }, { status: 403 });
      }
    }

    const materialGroups = new Map<string, typeof selectedMaterials>();
    if (projectReviewStage.type !== "roadshow") {
      for (const projectMaterialSubmission of selectedMaterials) {
        const current = materialGroups.get(projectMaterialSubmission.teamGroupId) ?? [];
        current.push(projectMaterialSubmission);
        materialGroups.set(projectMaterialSubmission.teamGroupId, current);
      }
    }

    const packageTargets =
      projectReviewStage.type === "roadshow"
        ? selectedTeamGroups.map((teamGroup) => ({
            teamGroupId: teamGroup.id,
            targetName: teamGroup.name,
            materials: [] as typeof selectedMaterials,
          }))
        : Array.from(materialGroups.entries()).map(([teamGroupId, materials]) => ({
            teamGroupId,
            targetName: materials[0]?.teamGroup.name ?? "项目组",
            materials,
          }));

    const existingReviewPackages = await prisma.expertReviewPackage.findMany({
      where: {
        projectReviewStageId: projectReviewStage.id,
        teamGroupId: { in: packageTargets.map((target) => target.teamGroupId) },
      },
      select: {
        id: true,
        teamGroupId: true,
        status: true,
      },
    });

    const existingConfiguredPackage = existingReviewPackages.find(
      (reviewPackage) => reviewPackage.status === "configured" || reviewPackage.status === "archived",
    );

    if (existingConfiguredPackage) {
      return NextResponse.json({ message: "该阶段已存在评审配置，请编辑当前评审包" }, { status: 409 });
    }

    const assignments = await prisma.$transaction(async (tx) => {

      const packageIds: string[] = [];
      for (const target of packageTargets) {
        const reusablePackage = existingReviewPackages.find(
          (reviewPackage) =>
            reviewPackage.status === "cancelled" && reviewPackage.teamGroupId === target.teamGroupId,
        );
        if (reusablePackage) {
          await tx.reviewDisplaySession.deleteMany({ where: { packageId: reusablePackage.id } });
          await tx.expertReviewMaterial.deleteMany({ where: { packageId: reusablePackage.id } });
          await tx.expertReviewAssignment.deleteMany({ where: { packageId: reusablePackage.id } });
        }
        const reviewPackage = reusablePackage
          ? await tx.expertReviewPackage.update({
              where: { id: reusablePackage.id },
              data: {
                targetName: target.targetName,
                roundLabel: effectiveRoundLabel,
                overview: effectiveOverview,
                status: "configured",
                startAt: effectiveStartAt,
                deadline: effectiveDeadline,
                dropHighestCount,
                dropLowestCount,
                createdById: user.id,
              },
              select: { id: true },
            })
          : await tx.expertReviewPackage.create({
              data: {
                targetName: target.targetName,
                roundLabel: effectiveRoundLabel,
                overview: effectiveOverview,
                status: "configured",
                startAt: effectiveStartAt,
                deadline: effectiveDeadline,
                dropHighestCount,
                dropLowestCount,
                createdById: user.id,
                teamGroupId: target.teamGroupId,
                projectReviewStageId: projectReviewStage.id,
              },
              select: { id: true },
            });
        packageIds.push(reviewPackage.id);

        if (projectReviewStage.type === "online_review") {
          const materialByExpertKind = new Map<
            "plan" | "ppt" | "video",
            (typeof selectedMaterials)[number] & { requirementKey: ProjectMaterialRequirementKey }
          >();

          for (const material of target.materials) {
            const requirementKey = materialKindByTitle(material.title);
            const expertMaterialKind = inferExpertReviewMaterialKindFromRequirement(requirementKey);
            materialByExpertKind.set(expertMaterialKind, { ...material, requirementKey });
          }

          for (const [kind, material] of materialByExpertKind.entries()) {
            await tx.expertReviewMaterial.create({
              data: {
                packageId: reviewPackage.id,
                kind,
                name: requirementLabels.get(material.requirementKey) ?? material.title,
                fileName: material.fileName,
                filePath: material.filePath,
                fileSize: material.fileSize,
                mimeType: material.mimeType,
              },
            });
          }
        }

        await tx.expertReviewAssignment.createMany({
          data: expertUserIds.map((id) => ({
            packageId: reviewPackage.id,
            expertUserId: id,
          })),
        });
      }

      return tx.expertReviewAssignment.findMany({
        where: { packageId: { in: packageIds } },
        include: assignmentInclude,
        orderBy: [{ createdAt: "desc" }],
      });
    });

    const serializedAssignments = assignments.map((assignment) =>
      redactExpertReviewAssignmentForRole(serializeExpertReviewAssignment(assignment), user.role),
    );

    return NextResponse.json(
      {
        assignment: serializedAssignments[0] ?? null,
        assignments: serializedAssignments,
      },
      { status: 201 },
    );
  }

  if (!expertUserId || !targetName) {
    return NextResponse.json({ message: "评审任务信息不完整" }, { status: 400 });
  }

  const expertUser = await prisma.user.findUnique({
    where: { id: expertUserId },
    select: { id: true, role: true },
  });

  if (!expertUser || expertUser.role !== "expert") {
    return NextResponse.json({ message: "请选择有效的评审专家账号" }, { status: 400 });
  }

  const singleScoreRuleError = validateReviewScoreRule({
    expertCount: 1,
    dropHighestCount,
    dropLowestCount,
  });
  if (singleScoreRuleError) {
    return NextResponse.json({ message: singleScoreRuleError }, { status: 400 });
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const reviewPackage = await tx.expertReviewPackage.create({
      data: {
        targetName,
        roundLabel,
        overview,
        status: "configured",
        startAt,
        deadline,
        dropHighestCount,
        dropLowestCount,
        createdById: user.id,
        teamGroupId: hasGlobalAdminPrivileges(user.role) ? null : user.teamGroupId,
      },
      select: { id: true },
    });

    return tx.expertReviewAssignment.create({
      data: {
        packageId: reviewPackage.id,
        expertUserId,
      },
      include: assignmentInclude,
    });
  });

  return NextResponse.json(
    {
      assignment: redactExpertReviewAssignmentForRole(
        serializeExpertReviewAssignment(assignment),
        user.role,
      ),
    },
    { status: 201 },
  );
}
