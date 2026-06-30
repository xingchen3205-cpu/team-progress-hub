import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import {
  encodeTeacherTrainingSubmissionAttachmentFile,
  getTeacherTrainingSubmissionAttachmentObjectKeyPrefix,
  validateTeacherTrainingSubmissionAttachmentMeta,
} from "@/lib/teacher-training-submission-attachments";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { isTeacherTrainingTaskReleased } from "@/lib/teacher-training";
import { buildStoredObjectKey } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        taskId?: string;
        participantId?: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
      }
    | null;
  const taskId = body?.taskId?.trim() || "";
  const participantId = body?.participantId?.trim() || "";
  const fileName = body?.fileName?.trim() || "";
  const fileSize = Number(body?.fileSize ?? 0);
  const mimeType = body?.mimeType?.trim() || "application/octet-stream";

  if (!taskId || !participantId || !fileName || !fileSize) {
    return NextResponse.json({ message: "附件上传信息不完整" }, { status: 400 });
  }

  const validationError = validateTeacherTrainingSubmissionAttachmentMeta({
    fileName,
    fileSize,
    mimeType,
  });
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const task = await prisma.teacherTrainingTask.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      cohort: {
        deletedAt: null,
      },
    },
    select: {
      cohortId: true,
      releaseMode: true,
      releaseAt: true,
      courseSession: {
        select: {
          courseDate: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  });
  if (!task) {
    return NextResponse.json({ message: "省培任务不存在" }, { status: 404 });
  }

  const canManageCohort = await hasTeacherTrainingCohortManageAccess(user, task.cohortId);
  if (!canManageCohort && !isTeacherTrainingTaskReleased(task)) {
    return NextResponse.json({ message: "该任务尚未开放提交，请按发布时间再上传附件" }, { status: 403 });
  }
  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      cohortId: task.cohortId,
      ...(canManageCohort ? {} : { accountUserId: user.id }),
    },
    select: { id: true },
  });
  if (!participant) {
    return NextResponse.json({ message: "任务和参训教师不属于同一班次或当前账号无权提交" }, { status: 400 });
  }

  const { objectKey } = buildStoredObjectKey({
    fileName,
    folder: getTeacherTrainingSubmissionAttachmentObjectKeyPrefix({
      cohortId: task.cohortId,
      participantId,
      taskId,
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
    attachment: encodeTeacherTrainingSubmissionAttachmentFile({
      fileName,
      filePath: objectKey,
      fileSize,
      mimeType,
    }),
  });
}
