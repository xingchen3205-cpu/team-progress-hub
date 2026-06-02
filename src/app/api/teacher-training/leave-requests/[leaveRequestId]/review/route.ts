import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { parseTeacherTrainingLeaveSteps, serializeTeacherTrainingLeaveRequest } from "@/lib/teacher-training";

type RouteContext = {
  params: Promise<{
    leaveRequestId: string;
  }>;
};

const buildDateRange = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [startDate];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const notifyLeaveReviewChange = async ({
  leaveRequestId,
  participantName,
  submittedById,
  senderId,
  previousStepIndex,
  reviewedStepIndex,
  reviewStatus,
  approvalSteps,
}: {
  leaveRequestId: string;
  participantName: string;
  submittedById: string;
  senderId: string;
  previousStepIndex: number;
  reviewedStepIndex: number;
  reviewStatus: "pending" | "approved" | "rejected";
  approvalSteps: ReturnType<typeof parseTeacherTrainingLeaveSteps>;
}) => {
  if (reviewStatus === "rejected") {
    await createNotifications({
      userIds: [submittedById],
      title: "省培请假审批未通过",
      detail: `${participantName} 的省培请假申请已被驳回，请查看审批意见。`,
      type: "teacher_training_leave_result",
      targetTab: "teacherTraining",
      relatedId: leaveRequestId,
      senderId,
      email: { noticeType: "省培请假结果", actionLabel: "查看请假申请", includeAdmins: true },
    });
    return;
  }

  if (reviewStatus === "approved") {
    await createNotifications({
      userIds: [submittedById],
      title: "省培请假审批已通过",
      detail: `${participantName} 的省培请假申请已全部审批通过，可导出请假单。`,
      type: "teacher_training_leave_result",
      targetTab: "teacherTraining",
      relatedId: leaveRequestId,
      senderId,
      email: { noticeType: "省培请假结果", actionLabel: "查看请假申请", includeAdmins: true },
    });
    return;
  }

  if (reviewedStepIndex <= previousStepIndex) {
    return;
  }

  const nextStep = approvalSteps[reviewedStepIndex];
  if (!nextStep) {
    return;
  }

  await createNotifications({
    userIds: nextStep.approverIds,
    title: "省培请假待审批",
    detail: `${participantName} 的省培请假申请已流转至「${nextStep.name}」，请及时审批。`,
    type: "teacher_training_leave_review",
    targetTab: "teacherTraining",
    relatedId: leaveRequestId,
    senderId,
    email: { noticeType: "省培请假审批", actionLabel: "进入省培处理", includeAdmins: true },
  });
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { leaveRequestId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        decision?: "approve" | "reject";
        comment?: string;
      }
    | null;
  const decision = body?.decision === "reject" ? "reject" : "approve";

  const leaveRequest = await prisma.teacherTrainingLeaveRequest.findFirst({
    where: {
      id: leaveRequestId,
      cohort: {
        deletedAt: null,
      },
    },
    include: {
      participant: {
        select: {
          id: true,
          name: true,
          organization: true,
        },
      },
      approvals: true,
    },
  });
  if (!leaveRequest) {
    return NextResponse.json({ message: "请假申请不存在" }, { status: 404 });
  }
  if (leaveRequest.status !== "pending") {
    return NextResponse.json({ message: "该请假申请已结束审批" }, { status: 400 });
  }

  const approvalSteps = parseTeacherTrainingLeaveSteps(leaveRequest.approvalStepsSnapshot);
  const currentStep = approvalSteps[leaveRequest.currentStepIndex];
  if (!currentStep) {
    return NextResponse.json({ message: "请假流程配置异常" }, { status: 400 });
  }
  if (!currentStep.approverIds.includes(user.id)) {
    return NextResponse.json({ message: "当前步骤未配置你为审批人" }, { status: 403 });
  }

  const reviewedRequest = await prisma.$transaction(async (tx) => {
    await tx.teacherTrainingLeaveApproval.upsert({
      where: {
        leaveRequestId_stepKey_approverId: {
          leaveRequestId,
          stepKey: currentStep.key,
          approverId: user.id,
        },
      },
      update: {
        decision,
        comment: body?.comment?.trim() || null,
        reviewedAt: new Date(),
      },
      create: {
        leaveRequestId,
        stepKey: currentStep.key,
        stepName: currentStep.name,
        stepIndex: leaveRequest.currentStepIndex,
        approverId: user.id,
        decision,
        comment: body?.comment?.trim() || null,
      },
    });

    if (decision === "reject") {
      return tx.teacherTrainingLeaveRequest.update({
        where: { id: leaveRequestId },
        data: {
          status: "rejected",
          completedAt: new Date(),
        },
        include: {
          participant: { select: { name: true, organization: true } },
          approvals: {
            orderBy: [{ stepIndex: "asc" }, { reviewedAt: "asc" }],
            include: { approver: { select: { name: true } } },
          },
        },
      });
    }

    const approvedCount = await tx.teacherTrainingLeaveApproval.count({
      where: {
        leaveRequestId,
        stepKey: currentStep.key,
        decision: "approve",
      },
    });
    const requiredCount = currentStep.requiredCount;
    if (approvedCount < requiredCount) {
      return tx.teacherTrainingLeaveRequest.findUniqueOrThrow({
        where: { id: leaveRequestId },
        include: {
          participant: { select: { name: true, organization: true } },
          approvals: {
            orderBy: [{ stepIndex: "asc" }, { reviewedAt: "asc" }],
            include: { approver: { select: { name: true } } },
          },
        },
      });
    }

    const nextStepIndex = leaveRequest.currentStepIndex + 1;
    if (approvalSteps[nextStepIndex]) {
      return tx.teacherTrainingLeaveRequest.update({
        where: { id: leaveRequestId },
        data: {
          currentStepIndex: nextStepIndex,
        },
        include: {
          participant: { select: { name: true, organization: true } },
          approvals: {
            orderBy: [{ stepIndex: "asc" }, { reviewedAt: "asc" }],
            include: { approver: { select: { name: true } } },
          },
        },
      });
    }

    const approvedRequest = await tx.teacherTrainingLeaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: "approved",
        currentStepIndex: approvalSteps.length,
        completedAt: new Date(),
      },
      include: {
        participant: { select: { name: true, organization: true } },
        approvals: {
          orderBy: [{ stepIndex: "asc" }, { reviewedAt: "asc" }],
          include: { approver: { select: { name: true } } },
        },
      },
    });

    await Promise.all(
      buildDateRange(leaveRequest.startDate, leaveRequest.endDate).map((sessionDate) =>
        tx.teacherTrainingAttendance.upsert({
          where: {
            participantId_sessionDate_sessionLabel: {
              participantId: leaveRequest.participantId,
              sessionDate,
              sessionLabel: leaveRequest.sessionLabel || "请假",
            },
          },
          update: {
            status: "leave",
            note: leaveRequest.reason,
            markedById: user.id,
            markedAt: new Date(),
          },
          create: {
            cohortId: leaveRequest.cohortId,
            participantId: leaveRequest.participantId,
            sessionDate,
            sessionLabel: leaveRequest.sessionLabel || "请假",
            status: "leave",
            note: leaveRequest.reason,
            markedById: user.id,
          },
        }),
      ),
    );

    return approvedRequest;
  });

  await notifyLeaveReviewChange({
    leaveRequestId,
    participantName: leaveRequest.participant.name,
    submittedById: leaveRequest.submittedById,
    senderId: user.id,
    previousStepIndex: leaveRequest.currentStepIndex,
    reviewedStepIndex: reviewedRequest.currentStepIndex,
    reviewStatus: reviewedRequest.status as "pending" | "approved" | "rejected",
    approvalSteps,
  }).catch((error) => {
    console.error("Teacher training leave review notification failed", error);
    void prisma.auditLog.create({
      data: {
        operatorId: user.id,
        operatorRole: user.role,
        action: "teacher_training.notification.failed",
        objectType: "teacher_training_leave_request",
        objectId: leaveRequestId,
        metadata: JSON.stringify({ stage: "review", message: error instanceof Error ? error.message : String(error) }),
      },
    }).catch(() => undefined);
  });

  return NextResponse.json({ leaveRequest: serializeTeacherTrainingLeaveRequest(reviewedRequest) });
}
