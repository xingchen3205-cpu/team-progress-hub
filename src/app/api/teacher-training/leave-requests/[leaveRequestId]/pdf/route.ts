import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition } from "@/lib/downloads";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { buildTeacherTrainingLeaveRequestPdf } from "@/lib/teacher-training-leave-pdf";
import { serializeTeacherTrainingLeaveRequest } from "@/lib/teacher-training";

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
    },
    include: {
      cohort: {
        select: {
          title: true,
        },
      },
      participant: {
        select: {
          name: true,
          organization: true,
          accountUserId: true,
        },
      },
      approvals: {
        orderBy: [{ stepIndex: "asc" }, { reviewedAt: "asc" }],
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
  if (!leaveRequest) {
    return NextResponse.json({ message: "请假申请不存在" }, { status: 404 });
  }
  const canReadManagedCohort = await hasTeacherTrainingCohortManageAccess(user, leaveRequest.cohortId);
  const canReadOwnRequest = leaveRequest.participant.accountUserId === user.id;
  if (!canReadManagedCohort && !canReadOwnRequest) {
    return NextResponse.json({ message: "无权限导出省培请假单" }, { status: 403 });
  }

  const serialized = serializeTeacherTrainingLeaveRequest(leaveRequest);
  const pdf = buildTeacherTrainingLeaveRequestPdf({
    cohortTitle: leaveRequest.cohort.title,
    participantName: leaveRequest.participant.name,
    organization: leaveRequest.participant.organization ?? "",
    leaveRequest: serialized,
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
