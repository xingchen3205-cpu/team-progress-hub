import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeProjectMaterialSubmission } from "@/lib/api-serializers";
import { createNotifications, getUserIdsByRoles } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { verifyProjectMaterialUploadToken } from "@/lib/project-material-upload-token";
import {
  buildProjectMaterialVisibilityWhere,
  canTeamGroupAccessProjectStage,
  canUploadProjectMaterial,
  parseProjectStageDescription,
  type ProjectMaterialRequirementKey,
  validateProjectMaterialUploadMeta,
} from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

const buildProjectMaterialUploadFolder = ({
  teamGroupId,
  stageId,
}: {
  teamGroupId: string;
  stageId: string;
}) => `project-materials/${teamGroupId}/${stageId}`;

const isScopedProjectMaterialFilePath = ({
  filePath,
  teamGroupId,
  stageId,
}: {
  filePath: string;
  teamGroupId: string;
  stageId: string;
}) => filePath.startsWith(`${buildProjectMaterialUploadFolder({ teamGroupId, stageId })}/`);

const authorizeProjectMaterialsRequest = async (request: NextRequest) => {
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

const authorizeProjectMaterialSubmissionRequest = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: NextResponse.json({ message: "未登录" }, { status: 401 }) };
  }

  if (!canUploadProjectMaterial({ role: user.role, teamGroupId: user.teamGroupId })) {
    return { error: NextResponse.json({ message: "无权限上传项目材料" }, { status: 403 }) };
  }

  return { user };
};

const projectMaterialSubmissionInclude = {
  stage: {
    select: { id: true, name: true, type: true, isOpen: true, deadline: true },
  },
  teamGroup: {
    select: { id: true, name: true },
  },
  submitter: {
    select: { id: true, name: true, avatar: true, role: true },
  },
  approver: {
    select: { id: true, name: true, avatar: true, role: true },
  },
  rejecter: {
    select: { id: true, name: true, avatar: true, role: true },
  },
} as const;

type ProjectMaterialSubmissionWithInclude = Prisma.ProjectMaterialSubmissionGetPayload<{
  include: typeof projectMaterialSubmissionInclude;
}>;

const parseProjectMaterialSubmissionBody = async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (
    !body ||
    typeof body.stageId !== "string" ||
    typeof body.materialKind !== "string" ||
    typeof body.title !== "string" ||
    typeof body.fileName !== "string" ||
    typeof body.filePath !== "string" ||
    typeof body.fileSize !== "number" ||
    typeof body.mimeType !== "string" ||
    typeof body.uploadToken !== "string"
  ) {
    return { error: NextResponse.json({ message: "项目材料信息无效" }, { status: 400 }) };
  }

  const stageId = body.stageId.trim();
  const materialKind = body.materialKind.trim() as ProjectMaterialRequirementKey;
  const title = body.title.trim();
  const fileName = body.fileName.trim();
  const filePath = body.filePath.trim();
  const fileSize = body.fileSize;
  const mimeType = body.mimeType.trim() || "application/octet-stream";
  const uploadToken = body.uploadToken.trim();

  if (
    !stageId ||
    !materialKind ||
    !title ||
    !fileName ||
    !filePath ||
    !uploadToken ||
    !Number.isFinite(fileSize) ||
    fileSize <= 0
  ) {
    return { error: NextResponse.json({ message: "项目材料信息无效" }, { status: 400 }) };
  }

  return {
    data: {
      stageId,
      materialKind,
      title,
      fileName,
      filePath,
      fileSize,
      mimeType,
      uploadToken,
    },
  };
};

const cleanupScopedProjectMaterialFile = async ({
  filePath,
  teamGroupId,
  stageId,
}: {
  filePath: string;
  teamGroupId: string;
  stageId: string;
}) => {
  if (isScopedProjectMaterialFilePath({ filePath, teamGroupId, stageId })) {
    const referencedSubmissionCount = await prisma.projectMaterialSubmission
      .count({ where: { filePath } })
      .catch((error) => {
        console.error("Project material cleanup reference check failed", error);
        return 1;
      });

    if (referencedSubmissionCount === 0) {
      await deleteStoredFile(filePath).catch(() => null);
    }
  }
};

const doesUploadTokenMatchSubmission = (
  payload: NonNullable<ReturnType<typeof verifyProjectMaterialUploadToken>>,
  submission: {
    userId: string;
    teamGroupId: string;
    stageId: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    materialKind: ProjectMaterialRequirementKey;
  },
) =>
  payload.userId === submission.userId &&
  payload.teamGroupId === submission.teamGroupId &&
  payload.stageId === submission.stageId &&
  payload.materialKind === submission.materialKind &&
  payload.filePath === submission.filePath &&
  payload.fileName === submission.fileName &&
  payload.fileSize === submission.fileSize &&
  payload.mimeType === submission.mimeType;

const validateStageForProjectMaterialSubmission = (
  stage: {
    isOpen: boolean;
    startAt: Date | null;
    deadline: Date | null;
    teamGroupId: string | null;
    type: "online_review" | "roadshow";
    description: string | null;
  } | null,
  user: { teamGroupId: string | null },
  materialKind: ProjectMaterialRequirementKey,
) => {
  if (!stage || !stage.isOpen) {
    return NextResponse.json({ message: "项目评审阶段未开放" }, { status: 409 });
  }

  const stageMeta = parseProjectStageDescription(stage.description, stage.type);
  if (
    !canTeamGroupAccessProjectStage({
      allowedTeamGroupIds: stageMeta.allowedTeamGroupIds,
      legacyTeamGroupId: stage.teamGroupId,
      actorTeamGroupId: user.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权限上传该阶段项目材料" }, { status: 403 });
  }

  const now = new Date();
  if ((stage.startAt && stage.startAt > now) || (stage.deadline && stage.deadline < now)) {
    return NextResponse.json({ message: "当前不在项目材料提交时间范围内" }, { status: 409 });
  }

  if (!stageMeta.requiredMaterials.includes(materialKind)) {
    return NextResponse.json({ message: "该阶段未要求上传此类材料" }, { status: 400 });
  }

  return null;
};

const mapProjectMaterialSubmissionError = async (
  error: unknown,
  cleanupUploadedFile: () => Promise<void>,
) => {
  await cleanupUploadedFile();

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return NextResponse.json({ message: "项目材料关联数据不存在" }, { status: 400 });
    }
  }

  throw error;
};

export async function GET(request: NextRequest) {
  const { user, error } = await authorizeProjectMaterialsRequest(request);
  if (error) {
    return error;
  }

  const submissions = await prisma.projectMaterialSubmission.findMany({
    where: buildProjectMaterialVisibilityWhere(user),
    orderBy: { createdAt: "desc" },
    include: projectMaterialSubmissionInclude,
  });

  return NextResponse.json({
    materials: submissions.map(serializeProjectMaterialSubmission),
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await authorizeProjectMaterialSubmissionRequest(request);
  if (error) {
    return error;
  }

  const parsedBody = await parseProjectMaterialSubmissionBody(request);
  if (parsedBody.error) {
    return parsedBody.error;
  }

  const userTeamGroupId = user.teamGroupId;
  if (!userTeamGroupId) {
    return NextResponse.json({ message: "无权限上传项目材料" }, { status: 403 });
  }

  const { stageId, materialKind, title, fileName, filePath, fileSize, mimeType, uploadToken } = parsedBody.data;

  if (!isScopedProjectMaterialFilePath({ filePath, teamGroupId: userTeamGroupId, stageId })) {
    return NextResponse.json({ message: "项目材料文件路径无效" }, { status: 400 });
  }

  const uploadTokenPayload = verifyProjectMaterialUploadToken(uploadToken);
  if (
    !uploadTokenPayload ||
    !doesUploadTokenMatchSubmission(uploadTokenPayload, {
      userId: user.id,
      teamGroupId: userTeamGroupId,
      stageId,
      filePath,
      fileName,
      fileSize,
      mimeType,
      materialKind,
    })
  ) {
    return NextResponse.json({ message: "项目材料上传凭证无效或已过期" }, { status: 400 });
  }

  const cleanupUploadedFile = () =>
    cleanupScopedProjectMaterialFile({ filePath, teamGroupId: userTeamGroupId, stageId });

  const validationError = validateProjectMaterialUploadMeta({ fileName, fileSize, materialKind });
  if (validationError) {
    await cleanupUploadedFile();
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const stage = await prisma.projectReviewStage
    .findUnique({
      where: { id: stageId },
      select: {
        isOpen: true,
        startAt: true,
        deadline: true,
        teamGroupId: true,
        type: true,
        description: true,
      },
    })
    .catch(async (error) => {
      await cleanupUploadedFile();
      throw error;
    });

  const stageError = validateStageForProjectMaterialSubmission(stage, user, materialKind);
  if (stageError) {
    await cleanupUploadedFile();
    return stageError;
  }

  let material: ProjectMaterialSubmissionWithInclude;
  try {
    material = await prisma.projectMaterialSubmission.create({
      data: {
        stageId,
        title,
        fileName,
        filePath,
        fileSize,
        mimeType,
        status: "pending",
        submittedById: user.id,
        teamGroupId: userTeamGroupId,
      },
      include: projectMaterialSubmissionInclude,
    });
  } catch (error) {
    return mapProjectMaterialSubmissionError(error, cleanupUploadedFile);
  }

  const reviewerIds = await getUserIdsByRoles({
    roles: ["teacher"],
    excludeUserIds: [user.id],
    teamGroupId: userTeamGroupId,
  }).catch((error) => {
    console.error("Project material reviewer lookup failed", error);
    return [];
  });

  if (reviewerIds.length > 0) {
    await createNotifications({
      userIds: reviewerIds,
      senderId: user.id,
      title: "项目材料待审批",
      detail: `${user.name} 提交了项目材料「${title}」，请及时审批。`,
      type: "document_review",
      targetTab: "project",
      relatedId: material.id,
      email: { noticeType: "项目材料审批", actionLabel: "进入系统处理" },
      emailTeamGroupId: userTeamGroupId,
    }).catch((error) => {
      console.error("Project material review notification failed", error);
    });
  }

  return NextResponse.json(
    { material: serializeProjectMaterialSubmission(material) },
    { status: 201 },
  );
}
