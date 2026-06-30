import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { isTeacherTrainingTaskReleased } from "@/lib/teacher-training";
import { prisma } from "@/lib/prisma";
import { HeadObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import {
  decodeTeacherTrainingSubmissionAttachmentFile,
  getTeacherTrainingSubmissionAttachmentObjectKeyPrefix,
  teacherTrainingSubmissionAttachmentMaxSize,
  validateTeacherTrainingSubmissionAttachmentMeta,
} from "@/lib/teacher-training-submission-attachments";
import { deleteStoredFile } from "@/lib/uploads";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        taskId?: string;
        participantId?: string;
        content?: string;
        attachment?: string;
        status?: string;
      }
    | null;
  const taskId = body?.taskId?.trim();
  const participantId = body?.participantId?.trim();
  const content = body?.content?.trim();
  const attachment = body?.attachment?.trim() || "";

  if (!taskId || !participantId || !content) {
    return NextResponse.json({ message: "请填写任务、参训教师和汇报内容" }, { status: 400 });
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
      requireAttachment: true,
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
    return NextResponse.json({ message: "该任务尚未开放提交，请按发布时间再填写" }, { status: 403 });
  }
  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      cohort: {
        deletedAt: null,
      },
      ...(canManageCohort ? {} : { accountUserId: user.id }),
    },
    select: { cohortId: true },
  });

  if (!participant || task.cohortId !== participant.cohortId) {
    return NextResponse.json({ message: "任务和参训教师不属于同一班次或当前账号无权提交" }, { status: 400 });
  }

  const attachmentFile = attachment ? decodeTeacherTrainingSubmissionAttachmentFile(attachment) : null;
  if (attachment) {
    if (!attachmentFile) {
      return NextResponse.json({ message: "请通过上传控件上传 Word 或 PDF 附件" }, { status: 400 });
    }

    const expectedObjectKeyPrefix = getTeacherTrainingSubmissionAttachmentObjectKeyPrefix({
      cohortId: task.cohortId,
      participantId,
      taskId,
    });
    if (!attachmentFile.filePath.startsWith(expectedObjectKeyPrefix)) {
      return NextResponse.json({ message: "附件路径与当前任务不匹配，请重新上传附件" }, { status: 400 });
    }

    const validationError = validateTeacherTrainingSubmissionAttachmentMeta({
      fileName: attachmentFile.fileName,
      fileSize: attachmentFile.fileSize,
      mimeType: attachmentFile.mimeType,
    });
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    let actualFileSize = 0;
    try {
      const head = await r2Client.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET,
          Key: attachmentFile.filePath,
        }),
      );
      actualFileSize = Number(head.ContentLength ?? 0);
    } catch {
      return NextResponse.json({ message: "附件文件不存在或已丢失，请重新上传" }, { status: 400 });
    }

    if (!actualFileSize) {
      await deleteStoredFile(attachmentFile.filePath).catch(() => undefined);
      return NextResponse.json({ message: "附件文件为空，请重新上传" }, { status: 400 });
    }

    if (actualFileSize > teacherTrainingSubmissionAttachmentMaxSize) {
      await deleteStoredFile(attachmentFile.filePath).catch(() => undefined);
      return NextResponse.json({ message: "真实附件大小不能超过 20MB，请重新上传" }, { status: 400 });
    }
  }
  if (task.requireAttachment && !attachmentFile) {
    return NextResponse.json({ message: "该任务要求上传 Word/PDF 附件，请先选择并上传附件" }, { status: 400 });
  }

  let previousAttachmentFilePath: string | null = null;
  let submission;
  try {
    submission = await prisma.$transaction(async (tx) => {
      const existingSubmission = await tx.teacherTrainingSubmission.findUnique({
        where: {
          taskId_participantId: {
            taskId,
            participantId,
          },
        },
        select: { attachment: true },
      });
      previousAttachmentFilePath =
        decodeTeacherTrainingSubmissionAttachmentFile(existingSubmission?.attachment)?.filePath ?? null;

      return tx.teacherTrainingSubmission.upsert({
        where: {
          taskId_participantId: {
            taskId,
            participantId,
          },
        },
        update: {
          content,
          attachment: attachment || null,
          status: body?.status?.trim() || "submitted",
          submittedById: user.id,
          submittedAt: new Date(),
        },
        create: {
          taskId,
          participantId,
          content,
          attachment: attachment || null,
          status: body?.status?.trim() || "submitted",
          submittedById: user.id,
        },
      });
    });
  } catch (error) {
    console.error("Teacher training submission save failed", error);
    if (attachmentFile) {
      await deleteStoredFile(attachmentFile.filePath).catch(() => undefined);
    }
    return NextResponse.json({ message: "任务汇报保存失败，请稍后重试" }, { status: 500 });
  }

  if (previousAttachmentFilePath && previousAttachmentFilePath !== attachmentFile?.filePath) {
    await deleteStoredFile(previousAttachmentFilePath).catch(() => undefined);
  }

  return NextResponse.json({ submission });
}
