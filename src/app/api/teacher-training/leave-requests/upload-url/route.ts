import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import {
  encodeTeacherTrainingLeaveAttachmentFile,
  getTeacherTrainingLeaveAttachmentObjectKeyPrefix,
  validateTeacherTrainingLeaveAttachmentMeta,
} from "@/lib/teacher-training-leave-attachments";
import { buildStoredObjectKey } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        participantId?: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
      }
    | null;
  const participantId = body?.participantId?.trim() || "";
  const fileName = body?.fileName?.trim() || "";
  const fileSize = Number(body?.fileSize ?? 0);
  const mimeType = body?.mimeType?.trim() || "application/octet-stream";

  if (!participantId || !fileName || !fileSize) {
    return NextResponse.json({ message: "附件上传信息不完整" }, { status: 400 });
  }

  const validationError = validateTeacherTrainingLeaveAttachmentMeta({ fileName, fileSize, mimeType });
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      accountUserId: user.id,
      cohort: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
      cohortId: true,
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "参训教师身份不匹配" }, { status: 404 });
  }

  const { objectKey } = buildStoredObjectKey({
    fileName,
    folder: getTeacherTrainingLeaveAttachmentObjectKeyPrefix({
      cohortId: participant.cohortId,
      participantId: participant.id,
    }).replace(/\/$/, ""),
  });
  const uploadUrl = await getSignedUrl(
    r2Client,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      ContentType: mimeType,
      ContentLength: fileSize,
    }),
    { expiresIn: 60 * 10 },
  );

  return NextResponse.json({
    uploadUrl,
    objectKey,
    contentType: mimeType,
    attachment: encodeTeacherTrainingLeaveAttachmentFile({
      fileName,
      filePath: objectKey,
      fileSize,
      mimeType,
    }),
  });
}
