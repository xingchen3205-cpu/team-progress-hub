import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { competitionAiDisabledMessage, isCompetitionAiEnabled } from "@/lib/competition-ai";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { TrainingJudgeFeedback } from "@/lib/training-ai-judge";

const dimensionLabels = {
  questionResponse: "问题回应",
  keyPointCoverage: "要点覆盖",
  logicalStructure: "逻辑结构",
  evidenceQuality: "事实依据",
  expressionAccuracy: "表达准确性",
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!isCompetitionAiEnabled()) {
    return NextResponse.json({ message: competitionAiDisabledMessage }, { status: 503 });
  }

  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { sessionId } = await params;
  const session = await prisma.aiTrainingSession.findFirst({
    where: { id: sessionId, createdById: user.id },
    include: { turns: { include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } } } },
  });
  if (!session) return NextResponse.json({ message: "训练会话不存在" }, { status: 404 });
  if (session.summaryJson) return NextResponse.json({ summary: JSON.parse(session.summaryJson) });

  const feedbackRows = session.turns
    .map((turn) => turn.attempts[0])
    .filter(Boolean)
    .map((attempt) => JSON.parse(attempt.feedbackJson) as TrainingJudgeFeedback);
  if (feedbackRows.length === 0) {
    return NextResponse.json({ message: "请至少完成一轮评分后再结束训练" }, { status: 409 });
  }

  const dimensionTotals = Object.keys(dimensionLabels).reduce<Record<string, number>>((totals, key) => {
    totals[key] = feedbackRows.reduce(
      (sum, feedback) => sum + feedback.dimensions[key as keyof TrainingJudgeFeedback["dimensions"]],
      0,
    );
    return totals;
  }, {});
  const sortedDimensions = Object.entries(dimensionTotals).sort((left, right) => right[1] - left[1]);
  const summary = {
    averageScore: Math.round(feedbackRows.reduce((sum, feedback) => sum + feedback.score, 0) / feedbackRows.length),
    strongestDimension: dimensionLabels[sortedDimensions[0][0] as keyof typeof dimensionLabels],
    weakestDimension: dimensionLabels[sortedDimensions.at(-1)![0] as keyof typeof dimensionLabels],
    completedTurnCount: feedbackRows.length,
  };
  await prisma.aiTrainingSession.update({
    where: { id: session.id },
    data: { status: "completed", completedAt: new Date(), summaryJson: JSON.stringify(summary) },
  });
  return NextResponse.json({ summary });
}
