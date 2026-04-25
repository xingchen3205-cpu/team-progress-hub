import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  redactExpertReviewAssignmentForRole,
  serializeExpertReviewAssignment,
} from "@/lib/expert-review";
import { assertRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import {
  inferExpertReviewMaterialKindFromRequirement,
  parseProjectStageDescription,
  projectMaterialRequirementOptions,
  type ProjectMaterialRequirementKey,
} from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";
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
        targetName?: string;
        roundLabel?: string;
        overview?: string;
        deadline?: string;
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
  const expertUserId = body?.expertUserId?.trim();
  const targetName = body?.targetName?.trim();
  const roundLabel = body?.roundLabel?.trim() || null;
  const overview = body?.overview?.trim() || null;
  const deadline = body?.deadline ? new Date(body.deadline) : null;

  if (deadline && Number.isNaN(deadline.getTime())) {
    return NextResponse.json({ message: "截止时间格式无效" }, { status: 400 });
  }

  if (stageId || materialSubmissionIds.length > 0 || expertUserIds.length > 0) {
    if (!stageId || materialSubmissionIds.length === 0 || expertUserIds.length === 0) {
      return NextResponse.json({ message: "请选择项目管理轮次、已生效项目材料和评审专家" }, { status: 400 });
    }

    const projectReviewStage = await prisma.projectReviewStage.findUnique({
      where: { id: stageId },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
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

    const selectedMaterials = projectMaterialSubmissions.filter(
      (projectMaterialSubmission) =>
        hasGlobalAdminPrivileges(user.role) || projectMaterialSubmission.teamGroupId === user.teamGroupId,
    );

    if (selectedMaterials.length === 0) {
      return NextResponse.json({ message: "无权限分配所选项目材料" }, { status: 403 });
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
      roundLabel || `${projectReviewStage.name} · ${projectReviewStage.type === "roadshow" ? "路演" : "网络评审"}`;
    const effectiveOverview =
      overview ||
      stageMeta.description ||
      `来源于项目管理「${projectReviewStage.name}」已生效材料。`;
    const effectiveDeadline = deadline ?? projectReviewStage.deadline ?? null;

    const assignments = await prisma.$transaction(async (tx) => {
      const materialGroups = new Map<string, typeof selectedMaterials>();
      for (const projectMaterialSubmission of selectedMaterials) {
        const current = materialGroups.get(projectMaterialSubmission.teamGroupId) ?? [];
        current.push(projectMaterialSubmission);
        materialGroups.set(projectMaterialSubmission.teamGroupId, current);
      }

      const packageIds: string[] = [];
      for (const [teamGroupId, materials] of materialGroups.entries()) {
        const reviewPackage = await tx.expertReviewPackage.create({
          data: {
            targetName: materials[0]?.teamGroup.name ?? "项目组",
            roundLabel: effectiveRoundLabel,
            overview: effectiveOverview,
            deadline: effectiveDeadline,
            createdById: user.id,
            teamGroupId,
          },
          select: { id: true },
        });
        packageIds.push(reviewPackage.id);

        if (projectReviewStage.type === "online_review") {
          const materialByExpertKind = new Map<
            "plan" | "ppt" | "video",
            (typeof materials)[number] & { requirementKey: ProjectMaterialRequirementKey }
          >();

          for (const material of materials) {
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

  const assignment = await prisma.$transaction(async (tx) => {
    const reviewPackage = await tx.expertReviewPackage.create({
      data: {
        targetName,
        roundLabel,
        overview,
        deadline,
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
