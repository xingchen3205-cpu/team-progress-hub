import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { HeadObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import {
  decodeTeacherTrainingLeaveAttachmentFile,
  getTeacherTrainingLeaveAttachmentObjectKeyPrefix,
  teacherTrainingLeaveAttachmentMaxSize,
  validateTeacherTrainingLeaveAttachmentMeta,
} from "@/lib/teacher-training-leave-attachments";
import {
  parseTeacherTrainingLeaveSteps,
  serializeTeacherTrainingLeaveRequest,
  validateTeacherTrainingLeaveRange,
} from "@/lib/teacher-training";
import { deleteStoredFile } from "@/lib/uploads";

const formatLeavePeriod = ({
  startDate,
  endDate,
  startTime,
  endTime,
}: {
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
}) => {
  const start = startTime ? `${startDate} ${startTime}` : startDate;
  const end = endTime ? `${endDate} ${endTime}` : endDate;

  return start === end ? start : `${start} 至 ${end}`;
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        participantId?: string;
        startDate?: string;
        endDate?: string;
        startTime?: string;
        endTime?: string;
        sessionLabel?: string;
        reason?: string;
        attachment?: string;
      }
    | null;
  const participantId = body?.participantId?.trim();
  const startDate = body?.startDate?.trim();
  const endDate = body?.endDate?.trim() || startDate;
  const startTime = body?.startTime?.trim() || null;
  const endTime = body?.endTime?.trim() || null;
  const reason = body?.reason?.trim();
  const attachment = body?.attachment?.trim() || "";

  if (!participantId || !startDate || !endDate || !startTime || !endTime || !reason) {
    return NextResponse.json({ message: "请填写请假日期、时间和原因" }, { status: 400 });
  }
  const leaveRangeError = validateTeacherTrainingLeaveRange({ startDate, endDate, startTime, endTime });
  if (leaveRangeError) {
    return NextResponse.json({ message: leaveRangeError }, { status: 400 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      accountUserId: user.id,
      cohort: {
        deletedAt: null,
      },
    },
    include: {
      cohort: {
        include: {
          leaveFlow: true,
        },
      },
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "参训教师身份不匹配" }, { status: 404 });
  }

  const approvalSteps = parseTeacherTrainingLeaveSteps(participant.cohort.leaveFlow?.approvalSteps);
  if (!participant.cohort.leaveFlow?.isEnabled || approvalSteps.length === 0) {
    return NextResponse.json({ message: "管理员尚未配置请假审批流程" }, { status: 400 });
  }

  const uploadedAttachment = decodeTeacherTrainingLeaveAttachmentFile(attachment);
  if (attachment && !uploadedAttachment) {
    return NextResponse.json({ message: "请假附件信息无效，请重新上传" }, { status: 400 });
  }
  if (uploadedAttachment) {
    const validationError = validateTeacherTrainingLeaveAttachmentMeta({
      fileName: uploadedAttachment.fileName,
      fileSize: uploadedAttachment.fileSize,
      mimeType: uploadedAttachment.mimeType,
    });
    if (validationError) {
      await deleteStoredFile(uploadedAttachment.filePath).catch(() => undefined);
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    const expectedPrefix = getTeacherTrainingLeaveAttachmentObjectKeyPrefix({
      cohortId: participant.cohortId,
      participantId: participant.id,
    });
    if (!uploadedAttachment.filePath.startsWith(expectedPrefix)) {
      await deleteStoredFile(uploadedAttachment.filePath).catch(() => undefined);
      return NextResponse.json({ message: "请假附件和当前申请不匹配，请重新上传" }, { status: 400 });
    }

    const head = await r2Client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: uploadedAttachment.filePath,
      }),
    ).catch(() => null);
    if (!head) {
      return NextResponse.json({ message: "请假附件上传未完成，请重新上传" }, { status: 400 });
    }
    if (Number(head.ContentLength ?? 0) > teacherTrainingLeaveAttachmentMaxSize) {
      await deleteStoredFile(uploadedAttachment.filePath).catch(() => undefined);
      return NextResponse.json({ message: "请假附件超过 20MB，请重新上传" }, { status: 400 });
    }
  }

  const leaveRequest = await prisma.teacherTrainingLeaveRequest.create({
    data: {
      cohortId: participant.cohortId,
      participantId: participant.id,
      submittedById: user.id,
      startDate,
      endDate,
      startTime,
      endTime,
      sessionLabel: body?.sessionLabel?.trim() || "请假",
      reason,
      attachment: uploadedAttachment ? attachment : null,
      status: "pending",
      currentStepIndex: 0,
      approvalStepsSnapshot: JSON.stringify(approvalSteps),
    },
    include: {
      participant: {
        select: {
          name: true,
          organization: true,
        },
      },
      approvals: {
        include: {
          approver: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  }).catch(async (error) => {
    if (uploadedAttachment) {
      await deleteStoredFile(uploadedAttachment.filePath).catch(() => undefined);
    }
    throw error;
  });

  await createNotifications({
    userIds: approvalSteps[0]?.approverIds ?? [],
    title: "省培请假待审批",
    detail: `${participant.name} 提交了 ${formatLeavePeriod({ startDate, endDate, startTime, endTime })} 的请假申请，请及时审批。`,
    type: "teacher_training_leave_review",
    targetTab: "teacherTraining",
    relatedId: leaveRequest.id,
    senderId: user.id,
    email: { noticeType: "省培请假审批", actionLabel: "进入省培处理", includeAdmins: true },
  }).catch((error) => {
    console.error("Teacher training leave submit notification failed", error);
    void prisma.auditLog.create({
      data: {
        operatorId: user.id,
        operatorRole: user.role,
        action: "teacher_training.notification.failed",
        objectType: "teacher_training_leave_request",
        objectId: leaveRequest.id,
        metadata: JSON.stringify({ stage: "submit", message: error instanceof Error ? error.message : String(error) }),
      },
    }).catch(() => undefined);
  });

  return NextResponse.json({ leaveRequest: serializeTeacherTrainingLeaveRequest(leaveRequest) }, { status: 201 });
}
