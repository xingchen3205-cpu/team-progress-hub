import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import {
  isTeacherTrainingTaskPastDue,
  isTeacherTrainingTaskReleased,
  parseTeacherTrainingParticipantExtraInfo,
} from "@/lib/teacher-training";
import { prisma } from "@/lib/prisma";
import { HeadObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import {
  decodeTeacherTrainingSubmissionAttachmentFile,
  getTeacherTrainingSubmissionAttachmentObjectKeyPrefix,
  teacherTrainingSubmissionAttachmentMaxSize,
  teacherTrainingSubmissionAttachmentMaxSizeLabel,
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
  const attachment = body?.attachment?.trim() || "";

  if (!taskId || !participantId) {
    return NextResponse.json({ message: "请选择任务和参训教师" }, { status: 400 });
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
      taskType: true,
      requireAttachment: true,
      releaseMode: true,
      releaseAt: true,
      dueDate: true,
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
    select: { cohortId: true, groupName: true, extraInfo: true },
  });

  if (!participant || task.cohortId !== participant.cohortId) {
    return NextResponse.json({ message: "任务和参训教师不属于同一班次或当前账号无权提交" }, { status: 400 });
  }
  const groupName = participant.groupName?.trim() || "";
  if (task.taskType === "group" && !groupName) {
    return NextResponse.json({ message: "你尚未分组，请联系班主任后再提交小组任务" }, { status: 400 });
  }
  if (task.taskType === "group" && !parseTeacherTrainingParticipantExtraInfo(participant.extraInfo).isGroupLeader) {
    return NextResponse.json({ message: "小组任务仅限本组组长提交或替换附件" }, { status: 403 });
  }

  // 截止时间校验（后端强制，不只靠前端）。管理员不受限；被驳回(rejected)的记录即使超期仍可重新提交，
  // 其它情况（首次提交或替换有效汇报）超期一律拒绝。
  const groupParticipantIdsForDue =
    task.taskType === "group"
      ? (
          await prisma.teacherTrainingParticipant.findMany({
            where: { cohortId: task.cohortId, groupName },
            select: { id: true },
          })
        ).map((item) => item.id)
      : [participantId];
  if (!canManageCohort && isTeacherTrainingTaskPastDue(task.dueDate)) {
    const dueExisting = await prisma.teacherTrainingSubmission.findFirst({
      where: { taskId, participantId: { in: groupParticipantIdsForDue } },
      select: { status: true },
    });
    if (!dueExisting || dueExisting.status !== "rejected") {
      return NextResponse.json({ message: "任务已截止，无法提交或替换附件。" }, { status: 403 });
    }
  }

  const attachmentFile = attachment ? decodeTeacherTrainingSubmissionAttachmentFile(attachment) : null;
  if (!attachmentFile) {
    return NextResponse.json({ message: "请上传 Word 或 PDF 汇报附件" }, { status: 400 });
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
    return NextResponse.json(
      { message: `真实附件大小不能超过 ${teacherTrainingSubmissionAttachmentMaxSizeLabel}，请重新上传` },
      { status: 400 },
    );
  }

  const content = `汇报附件：${attachmentFile.fileName}`;
  let previousAttachmentFilePath: string | null = null;
  let submission;
  try {
    submission = await prisma.$transaction(async (tx) => {
      const existingSubmission = await tx.teacherTrainingSubmission.findFirst({
        where: { taskId, participantId: { in: groupParticipantIdsForDue } },
        select: { attachment: true, participantId: true },
      });
      previousAttachmentFilePath =
        decodeTeacherTrainingSubmissionAttachmentFile(existingSubmission?.attachment)?.filePath ?? null;

      return tx.teacherTrainingSubmission.upsert({
        where: {
          taskId_participantId: {
            taskId,
            participantId: existingSubmission?.participantId ?? participantId,
          },
        },
        // 重新提交视为新的有效汇报：恢复 submitted，并清空旧的 AI/人工评分与驳回信息，等待重新审核。
        update: {
          content,
          attachment: attachment || null,
          status: "submitted",
          submittedById: user.id,
          submittedAt: new Date(),
          aiScore: null,
          aiComment: null,
          aiReviewedAt: null,
          finalScore: null,
          finalComment: null,
          finalReviewedById: null,
          finalReviewedAt: null,
        },
        create: {
          taskId,
          participantId,
          content,
          attachment: attachment || null,
          status: "submitted",
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
