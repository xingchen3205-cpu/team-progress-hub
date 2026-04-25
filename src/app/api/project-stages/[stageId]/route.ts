import { Prisma, type ProjectReviewStageType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeProjectReviewStage } from "@/lib/api-serializers";
import { assertMainWorkspaceRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import {
  canManageProjectReviewStage,
  canTeamGroupAccessProjectStage,
  encodeProjectStageDescription,
  parseProjectStageDescription,
  type ProjectMaterialRequirementKey,
} from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const authorizeProjectStageRequest = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: NextResponse.json({ message: "未登录" }, { status: 401 }) };
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return { error: NextResponse.json({ message: "无权限" }, { status: 403 }) };
  }

  return { user };
};

const authorizeProjectStageWriteRequest = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: NextResponse.json({ message: "未登录" }, { status: 401 }) };
  }

  if (!canManageProjectReviewStage(user.role)) {
    return {
      error: NextResponse.json({ message: "无权限管理项目评审阶段" }, { status: 403 }),
    };
  }

  return { user };
};

const projectReviewStageInclude = {
  creator: {
    select: { id: true, name: true, avatar: true, role: true },
  },
  teamGroup: {
    select: { id: true, name: true },
  },
  _count: {
    select: { submissions: true },
  },
};

const parseOptionalDate = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return { date: null };
  }

  if (typeof value !== "string") {
    return { error: "时间格式无效" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: "时间格式无效" };
  }

  return { date };
};

const normalizeBodyTeamGroupIds = (body: Record<string, unknown>) => {
  if (Array.isArray(body.teamGroupIds)) {
    return [
      ...new Set(
        body.teamGroupIds
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }

  const legacyTeamGroupId = typeof body.teamGroupId === "string" ? body.teamGroupId.trim() : "";
  return legacyTeamGroupId ? [legacyTeamGroupId] : [];
};

const validateTeamGroupsExist = async (teamGroupIds: string[]) => {
  if (teamGroupIds.length === 0) {
    return null;
  }

  const existingCount = await prisma.teamGroup.count({
    where: { id: { in: teamGroupIds } },
  });

  return existingCount === teamGroupIds.length
    ? null
    : NextResponse.json({ message: "项目组不存在" }, { status: 400 });
};

const parseProjectStageBody = async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (
    !body ||
    typeof body?.name !== "string" ||
    typeof body?.type !== "string" ||
    (body.description !== null &&
      body.description !== undefined &&
      typeof body.description !== "string") ||
    (body.teamGroupId !== null &&
      body.teamGroupId !== undefined &&
      typeof body.teamGroupId !== "string") ||
    (body.teamGroupIds !== undefined &&
      (!Array.isArray(body.teamGroupIds) ||
        body.teamGroupIds.some((item) => typeof item !== "string"))) ||
    (body.isOpen !== undefined && typeof body.isOpen !== "boolean")
  ) {
    return { error: NextResponse.json({ message: "项目评审阶段信息无效" }, { status: 400 }) };
  }

  const name = body?.name?.trim();
  const stageType = body?.type?.trim() as ProjectReviewStageType | undefined;
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const teamGroupIds = normalizeBodyTeamGroupIds(body);
  const teamGroupId = teamGroupIds.length === 1 ? teamGroupIds[0] : null;
  const isOpen = body.isOpen === true;
  const requiredMaterials = Array.isArray(body.requiredMaterials)
    ? (body.requiredMaterials.filter((item): item is ProjectMaterialRequirementKey => typeof item === "string") as ProjectMaterialRequirementKey[])
    : undefined;

  if (!name || (stageType !== "online_review" && stageType !== "roadshow")) {
    return { error: NextResponse.json({ message: "项目评审阶段信息无效" }, { status: 400 }) };
  }

  const parsedStartAt = parseOptionalDate(body?.startAt);
  const parsedDeadline = parseOptionalDate(body?.deadline);

  if (parsedStartAt.error || parsedDeadline.error) {
    return { error: NextResponse.json({ message: "时间格式无效" }, { status: 400 }) };
  }

  return {
    data: {
      name,
      stageType,
      description,
      requiredMaterials,
      isOpen,
      startAt: parsedStartAt.date,
      deadline: parsedDeadline.date,
      teamGroupId,
      teamGroupIds,
    },
  };
};

const mapProjectStageWriteError = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return NextResponse.json({ message: "项目评审阶段不存在" }, { status: 404 });
    }
    if (error.code === "P2003") {
      return NextResponse.json({ message: "项目组不存在" }, { status: 400 });
    }
  }

  throw error;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stageId: string }> },
) {
  const { user, error } = await authorizeProjectStageRequest(request);
  if (error) {
    return error;
  }

  const { stageId } = await params;

  const stage = await prisma.projectReviewStage.findFirst({
    where: { id: stageId },
    include: projectReviewStageInclude,
  });

  if (!stage) {
    return NextResponse.json({ message: "项目评审阶段不存在" }, { status: 404 });
  }

  if (!hasGlobalAdminPrivileges(user.role)) {
    const stageMeta = parseProjectStageDescription(stage.description, stage.type);
    const canAccessStage = canTeamGroupAccessProjectStage({
      allowedTeamGroupIds: stageMeta.allowedTeamGroupIds,
      legacyTeamGroupId: stage.teamGroupId,
      actorTeamGroupId: user.teamGroupId,
    });

    if (!canAccessStage) {
      return NextResponse.json({ message: "项目评审阶段不存在" }, { status: 404 });
    }
  }

  return NextResponse.json({ stage: serializeProjectReviewStage(stage) });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ stageId: string }> },
) {
  const { error } = await authorizeProjectStageWriteRequest(request);
  if (error) {
    return error;
  }

  const { stageId } = await params;
  const parsedBody = await parseProjectStageBody(request);
  if (parsedBody.error) {
    return parsedBody.error;
  }

  const { name, stageType, description, requiredMaterials, isOpen, startAt, deadline, teamGroupId, teamGroupIds } =
    parsedBody.data;

  const teamGroupError = await validateTeamGroupsExist(teamGroupIds);
  if (teamGroupError) {
    return teamGroupError;
  }

  try {
    const stage = await prisma.projectReviewStage.update({
      where: { id: stageId },
      data: {
        name,
        type: stageType,
        description: encodeProjectStageDescription({
          description,
          requiredMaterials,
          allowedTeamGroupIds: teamGroupIds,
        }),
        isOpen,
        startAt,
        deadline,
        teamGroupId,
      },
      include: projectReviewStageInclude,
    });

    return NextResponse.json({ stage: serializeProjectReviewStage(stage) });
  } catch (error) {
    return mapProjectStageWriteError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ stageId: string }> },
) {
  const { error } = await authorizeProjectStageWriteRequest(request);
  if (error) {
    return error;
  }

  const { stageId } = await params;

  try {
    await prisma.projectReviewStage.delete({
      where: { id: stageId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return mapProjectStageWriteError(error);
  }
}
