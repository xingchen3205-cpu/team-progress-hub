import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseTeacherTrainingLeaveSteps, serializeTeacherTrainingLeaveRequest } from "@/lib/teacher-training";

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
        sessionLabel?: string;
        reason?: string;
      }
    | null;
  const participantId = body?.participantId?.trim();
  const startDate = body?.startDate?.trim();
  const endDate = body?.endDate?.trim() || startDate;
  const reason = body?.reason?.trim();

  if (!participantId || !startDate || !endDate || !reason) {
    return NextResponse.json({ message: "请填写请假日期和原因" }, { status: 400 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      accountUserId: user.id,
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

  const leaveRequest = await prisma.teacherTrainingLeaveRequest.create({
    data: {
      cohortId: participant.cohortId,
      participantId: participant.id,
      submittedById: user.id,
      startDate,
      endDate,
      sessionLabel: body?.sessionLabel?.trim() || "请假",
      reason,
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
  });

  return NextResponse.json({ leaveRequest: serializeTeacherTrainingLeaveRequest(leaveRequest) }, { status: 201 });
}
