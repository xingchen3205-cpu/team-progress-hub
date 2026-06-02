import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition } from "@/lib/downloads";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { buildTeacherTrainingLeaveRequestPdf } from "@/lib/teacher-training-leave-pdf";
import {
  parseTeacherTrainingParticipantExtraInfo,
  serializeTeacherTrainingLeaveRequest,
  teacherTrainingRoleTitleLabels,
} from "@/lib/teacher-training";

type RouteContext = {
  params: Promise<{
    leaveRequestId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { leaveRequestId } = await context.params;
  const leaveRequest = await prisma.teacherTrainingLeaveRequest.findFirst({
    where: {
      id: leaveRequestId,
      cohort: {
        deletedAt: null,
      },
    },
    include: {
      cohort: {
        select: {
          title: true,
          startDate: true,
          endDate: true,
          managers: {
            select: {
              userId: true,
              title: true,
            },
          },
        },
      },
      participant: {
        select: {
          name: true,
          organization: true,
          extraInfo: true,
          accountUserId: true,
        },
      },
      approvals: {
        orderBy: [{ stepIndex: "asc" }, { reviewedAt: "asc" }],
        include: {
          approver: {
            select: {
              name: true,
              role: true,
            },
          },
        },
      },
    },
  });
  if (!leaveRequest) {
    return NextResponse.json({ message: "请假申请不存在" }, { status: 404 });
  }
  const canReadManagedCohort = await hasTeacherTrainingCohortManageAccess(user, leaveRequest.cohortId);
  const canReadOwnRequest = leaveRequest.participant.accountUserId === user.id;
  if (!canReadManagedCohort && !canReadOwnRequest) {
    return NextResponse.json({ message: "无权限导出省培请假单" }, { status: 403 });
  }
  if (leaveRequest.status !== "approved") {
    return NextResponse.json({ message: "请假申请全部审批通过后才能导出PDF请假单" }, { status: 400 });
  }

  const leaveSequence = await prisma.teacherTrainingLeaveRequest.count({
    where: {
      cohortId: leaveRequest.cohortId,
      OR: [
        {
          submittedAt: {
            lt: leaveRequest.submittedAt,
          },
        },
        {
          submittedAt: leaveRequest.submittedAt,
          id: {
            lte: leaveRequest.id,
          },
        },
      ],
    },
  });
  const serialized = serializeTeacherTrainingLeaveRequest(leaveRequest);
  const participantExtra = parseTeacherTrainingParticipantExtraInfo(leaveRequest.participant.extraInfo);
  const managerTitleByUserId = new Map(leaveRequest.cohort.managers.map((manager) => [manager.userId, manager.title]));
  const approverTitleByUserId = new Map(
    leaveRequest.approvals.map((approval) => [
      approval.approverId,
      managerTitleByUserId.get(approval.approverId) ?? teacherTrainingRoleTitleLabels[approval.approver?.role ?? ""] ?? "审批人",
    ]),
  );
  const leaveRequestForPdf = {
    ...serialized,
    approvals: serialized.approvals.map((approval) => ({
      ...approval,
      approverTitle: approverTitleByUserId.get(approval.approverId) ?? "审批人",
    })),
  };
  const pdf = buildTeacherTrainingLeaveRequestPdf({
    cohortTitle: leaveRequest.cohort.title,
    cohortStartDate: leaveRequest.cohort.startDate,
    leaveSequence,
    participantName: leaveRequest.participant.name,
    participantTitle: participantExtra.title,
    organization: leaveRequest.participant.organization ?? "",
    leaveRequest: leaveRequestForPdf,
  });
  const fileName = `${leaveRequest.participant.name}-省培请假单-${leaveRequest.startDate}.pdf`;

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildAttachmentDisposition(fileName),
      "Cache-Control": "no-store",
    },
  });
}
