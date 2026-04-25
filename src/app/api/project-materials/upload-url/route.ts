import { NextRequest, NextResponse } from "next/server";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getSessionUser } from "@/lib/auth";
import { createProjectMaterialUploadToken } from "@/lib/project-material-upload-token";
import {
  canUploadProjectMaterial,
  parseProjectStageDescription,
  type ProjectMaterialRequirementKey,
  validateProjectMaterialUploadMeta,
} from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import { buildStoredObjectKey } from "@/lib/uploads";

export const runtime = "nodejs";

const buildProjectMaterialUploadFolder = ({
  teamGroupId,
  stageId,
}: {
  teamGroupId: string;
  stageId: string;
}) => `project-materials/${teamGroupId}/${stageId}`;

const authorizeProjectMaterialUploadRequest = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: NextResponse.json({ message: "未登录" }, { status: 401 }) };
  }

  if (!canUploadProjectMaterial({ role: user.role, teamGroupId: user.teamGroupId })) {
    return { error: NextResponse.json({ message: "无权限上传项目材料" }, { status: 403 }) };
  }

  return { user };
};

const parseProjectMaterialUploadUrlBody = async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (
    !body ||
    typeof body.stageId !== "string" ||
    typeof body.materialKind !== "string" ||
    typeof body.fileName !== "string" ||
    typeof body.fileSize !== "number" ||
    typeof body.mimeType !== "string"
  ) {
    return { error: NextResponse.json({ message: "项目材料上传信息无效" }, { status: 400 }) };
  }

  const stageId = body.stageId.trim();
  const materialKind = body.materialKind.trim() as ProjectMaterialRequirementKey;
  const fileName = body.fileName.trim();
  const fileSize = body.fileSize;
  const mimeType = body.mimeType.trim() || "application/octet-stream";

  if (!stageId || !materialKind || !fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
    return { error: NextResponse.json({ message: "项目材料上传信息无效" }, { status: 400 }) };
  }

  return {
    data: {
      stageId,
      materialKind,
      fileName,
      fileSize,
      mimeType,
    },
  };
};

const validateStageForProjectMaterialUpload = (
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

  if (stage.teamGroupId && stage.teamGroupId !== user.teamGroupId) {
    return NextResponse.json({ message: "无权限上传该阶段项目材料" }, { status: 403 });
  }

  const now = new Date();
  if ((stage.startAt && stage.startAt > now) || (stage.deadline && stage.deadline < now)) {
    return NextResponse.json({ message: "当前不在项目材料提交时间范围内" }, { status: 409 });
  }

  const stageMeta = parseProjectStageDescription(stage.description, stage.type);
  if (!stageMeta.requiredMaterials.includes(materialKind)) {
    return NextResponse.json({ message: "该阶段未要求上传此类材料" }, { status: 400 });
  }

  return null;
};

export async function POST(request: NextRequest) {
  const { user, error } = await authorizeProjectMaterialUploadRequest(request);
  if (error) {
    return error;
  }

  const parsedBody = await parseProjectMaterialUploadUrlBody(request);
  if (parsedBody.error) {
    return parsedBody.error;
  }

  const { stageId, materialKind, fileName, fileSize, mimeType } = parsedBody.data;
  const userTeamGroupId = user.teamGroupId;
  if (!userTeamGroupId) {
    return NextResponse.json({ message: "无权限上传项目材料" }, { status: 403 });
  }

  const validationError = validateProjectMaterialUploadMeta({ fileName, fileSize, materialKind });
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const stage = await prisma.projectReviewStage.findUnique({
    where: { id: stageId },
    select: {
      isOpen: true,
      startAt: true,
      deadline: true,
      teamGroupId: true,
      type: true,
      description: true,
    },
  });

  const stageError = validateStageForProjectMaterialUpload(stage, user, materialKind);
  if (stageError) {
    return stageError;
  }

  const { objectKey } = buildStoredObjectKey({
    fileName,
    folder: buildProjectMaterialUploadFolder({ teamGroupId: userTeamGroupId, stageId }),
  });
  const uploadToken = createProjectMaterialUploadToken({
    userId: user.id,
    teamGroupId: userTeamGroupId,
    stageId,
    materialKind,
    filePath: objectKey,
    fileName,
    fileSize,
    mimeType,
  });

  const uploadUrl = await getSignedUrl(
    r2Client,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      ContentType: mimeType,
    }),
    { expiresIn: 60 * 10 },
  );

  return NextResponse.json({
    uploadUrl,
    objectKey,
    uploadToken,
    contentType: mimeType,
  });
}
