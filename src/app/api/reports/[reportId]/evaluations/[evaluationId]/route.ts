import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  REPORT_EVALUATION_REVOKE_WINDOW_MS,
  buildReportEvaluationCountUpdate,
  canRevokeReportEvaluation,
} from "@/lib/report-evaluations";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string; evaluationId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { reportId, evaluationId } = await params;

  const evaluation = await prisma.reportEvaluation.findUnique({
    where: { id: evaluationId },
    include: {
      report: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!evaluation || evaluation.reportId !== reportId) {
    return NextResponse.json({ message: "评价不存在" }, { status: 404 });
  }

  if (evaluation.type === "praise") {
    return NextResponse.json({ message: "点赞提交后不能撤回" }, { status: 403 });
  }

  if (
    !canRevokeReportEvaluation({
      actorId: user.id,
      evaluatorId: evaluation.evaluatorId,
      createdAt: evaluation.createdAt,
      revokedAt: evaluation.revokedAt,
    })
  ) {
    return NextResponse.json(
      { message: `只有评价人本人可以在 ${REPORT_EVALUATION_REVOKE_WINDOW_MS / 60000} 分钟内撤回评价` },
      { status: 403 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.reportEvaluation.update({
      where: { id: evaluationId },
      data: {
        revokedAt: new Date(),
      },
    });

    await tx.report.update({
      where: { id: evaluation.reportId },
      data: buildReportEvaluationCountUpdate(evaluation.type, "decrement"),
    });
  });

  return NextResponse.json({ success: true });
}
