import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildTeamScopedResourceWhere } from "@/lib/team-scope";
import { generateTrainingJudgeFeedback, type TrainingJudgeFeedback } from "@/lib/training-ai-judge";
import { normalizeTrainingAnswer, validateTrainingTurnNumber } from "@/lib/training-ai-workflow";

const parseFeedback = (value: string) => JSON.parse(value) as TrainingJudgeFeedback;

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { sessionId?: string; questionId?: string; currentPrompt?: string; transcript?: string; turnNumber?: number }
    | null;

  try {
    const sessionId = body?.sessionId?.trim();
    const questionId = body?.questionId?.trim();
    if (!sessionId) return NextResponse.json({ message: "训练会话不存在" }, { status: 400 });
    if (!questionId) return NextResponse.json({ message: "请选择要训练的题目" }, { status: 400 });

    if (!body?.transcript?.trim()) {
      return NextResponse.json({ message: "请先输入回答内容，或完成语音回答并确认转写内容" }, { status: 400 });
    }
    const transcript = normalizeTrainingAnswer(body.transcript);
    const turnNumber = validateTrainingTurnNumber(body?.turnNumber);
    const session = await prisma.aiTrainingSession.findFirst({
      where: { id: sessionId, createdById: user.id, status: "active" },
      include: {
        turns: {
          orderBy: { turnNumber: "asc" },
          include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
        },
      },
    });
    if (!session) return NextResponse.json({ message: "训练会话不存在或已经结束" }, { status: 404 });

    const question = await prisma.trainingQuestion.findFirst({
      where: {
        id: questionId,
        ...buildTeamScopedResourceWhere({ actor: user, ownerField: "createdById" }),
      },
      select: { category: true, question: true, answerPoints: true },
    });
    if (!question) return NextResponse.json({ message: "题目不存在或无权训练" }, { status: 404 });

    const prompt = body?.currentPrompt?.trim() || question.question;
    const answerHash = createHash("sha256").update(transcript).digest("hex");
    const turn = await prisma.aiTrainingTurn.upsert({
      where: { sessionId_turnNumber: { sessionId, turnNumber } },
      create: {
        sessionId,
        questionId,
        turnNumber,
        prompt,
        questionText: question.question,
        answerPointsSnapshot: question.answerPoints,
      },
      update: {},
      include: { attempts: { orderBy: { attemptNumber: "desc" } } },
    });

    const existingAttempt = turn.attempts.find((attempt) => attempt.answerHash === answerHash);
    if (existingAttempt) {
      return NextResponse.json({
        sessionId,
        turn: { id: turn.id, turnNumber: turn.turnNumber },
        attempt: { id: existingAttempt.id, attemptNumber: existingAttempt.attemptNumber },
        feedback: parseFeedback(existingAttempt.feedbackJson),
      });
    }

    const previousTurns = session.turns
      .filter((item) => item.turnNumber < turnNumber)
      .map((item) => ({
        prompt: item.prompt,
        transcript: item.attempts[0]?.answerText ?? "",
        summary: item.attempts[0] ? parseFeedback(item.attempts[0].feedbackJson).summary : undefined,
      }))
      .filter((item) => item.transcript);
    const result = await generateTrainingJudgeFeedback({
      userId: user.id,
      sourceQuestion: question,
      currentPrompt: prompt,
      transcript,
      previousTurns,
    });

    const attempt = await prisma.aiTrainingAttempt.create({
      data: {
        turnId: turn.id,
        attemptNumber: (turn.attempts[0]?.attemptNumber ?? 0) + 1,
        answerText: transcript,
        answerHash,
        score: result.feedback.score,
        feedbackJson: JSON.stringify(result.feedback),
      },
    });

    return NextResponse.json({
      sessionId,
      turn: { id: turn.id, turnNumber: turn.turnNumber },
      attempt: { id: attempt.id, attemptNumber: attempt.attemptNumber },
      feedback: result.feedback,
      permission: result.permission,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 400;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "AI 模拟评委暂时不可用" },
      { status },
    );
  }
}
