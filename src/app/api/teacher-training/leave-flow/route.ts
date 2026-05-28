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
    name: step.name || `第${index + 1}步审批`,
    requiredCount: Math.min(Math.max(1, step.requiredCount), step.approverIds.length),
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

  const cohort = await prisma.teacherTrainingCohort.findUnique({
    where: { id: cohortId },
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
      role: {
        in: ["admin", "school_admin"],
      },
      approvalStatus: "approved",
    },
  });
  if (approverCount !== approverIds.length) {
    return NextResponse.json({ message: "审批人必须是已启用的系统管理员或校级管理员" }, { status: 400 });
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
