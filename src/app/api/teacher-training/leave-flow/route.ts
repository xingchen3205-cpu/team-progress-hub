import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  parseTeacherTrainingLeaveSteps,
  serializeTeacherTrainingLeaveFlow,
  serializeTeacherTrainingLeaveSteps,
  type TeacherTrainingLeaveFlowStep,
} from "@/lib/teacher-training";

const normalizeApprovalSteps = (steps: unknown): TeacherTrainingLeaveFlowStep[] => {
  const parsedSteps = parseTeacherTrainingLeaveSteps(JSON.stringify(Array.isArray(steps) ? steps : []));

  return parsedSteps.map((step, index) => ({
    ...step,
    key: step.key || `step-${index + 1}`,
    name: step.name || (index === 0 ? "请假审批" : `补充审批 ${index + 1}`),
    requiredCount: Math.max(1, step.requiredCount),
  }));
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return NextResponse.json({ message: "只有系统管理员可以统一配置省培请假流程" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        approvalSteps?: unknown;
        isEnabled?: boolean;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const approvalSteps = normalizeApprovalSteps(body?.approvalSteps);

  if (!cohortId || approvalSteps.length === 0) {
    return NextResponse.json({ message: "请先选择班次并配置至少一个审批步骤" }, { status: 400 });
  }
  if (approvalSteps.some((step) => step.approverIds.length === 0)) {
    return NextResponse.json({ message: "每个审批步骤至少选择一名审批人" }, { status: 400 });
  }
  if (approvalSteps.some((step) => step.requiredCount > step.approverIds.length)) {
    return NextResponse.json({ message: "每步通过人数不能超过已选审批人数" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: { id: cohortId, deletedAt: null },
    select: { id: true },
  });
  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }

  const approverIds = Array.from(new Set(approvalSteps.flatMap((step) => step.approverIds)));
  const approverCount = await prisma.user.count({
    where: {
      id: {
        in: approverIds,
      },
      approvalStatus: "approved",
      OR: [
        {
          role: {
            in: ["admin", "school_admin"],
          },
        },
        {
          teacherTrainingManagedCohorts: {
            some: {
              cohortId,
            },
          },
        },
      ],
    },
  });
  if (approverCount !== approverIds.length) {
    return NextResponse.json({ message: "审批人必须是已启用的管理员、当前班次省培负责人或班主任" }, { status: 400 });
  }

  const leaveFlow = await prisma.teacherTrainingLeaveFlow.upsert({
    where: { cohortId },
    update: {
      approvalSteps: serializeTeacherTrainingLeaveSteps(approvalSteps),
      isEnabled: body?.isEnabled ?? true,
    },
    create: {
      cohortId,
      approvalSteps: serializeTeacherTrainingLeaveSteps(approvalSteps),
      isEnabled: body?.isEnabled ?? true,
      createdById: user.id,
    },
  });

  return NextResponse.json({ leaveFlow: serializeTeacherTrainingLeaveFlow(leaveFlow) });
}
