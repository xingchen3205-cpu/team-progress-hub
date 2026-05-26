import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildTeamScopedResourceWhere } from "@/lib/team-scope";
import { generateTrainingJudgeFeedback, type TrainingJudgeTurn } from "@/lib/training-ai-judge";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        questionId?: string;
        currentPrompt?: string;
        transcript?: string;
        previousTurns?: TrainingJudgeTurn[];
      }
    | null;

  const questionId = body?.questionId?.trim();
  const transcript = body?.transcript?.trim();
  if (!questionId) {
    return NextResponse.json({ message: "请选择要训练的题目" }, { status: 400 });
  }
  if (!transcript) {
    return NextResponse.json({ message: "请先输入回答内容，或完成语音回答并确认转写内容" }, { status: 400 });
  }

  try {
    const question = await prisma.trainingQuestion.findFirst({
      where: {
        id: questionId,
        ...buildTeamScopedResourceWhere({
          actor: user,
          ownerField: "createdById",
        }),
      },
      select: {
        category: true,
        question: true,
        answerPoints: true,
      },
    });

    if (!question) {
      return NextResponse.json({ message: "题目不存在或无权训练" }, { status: 404 });
    }

    const result = await generateTrainingJudgeFeedback({
      userId: user.id,
      sourceQuestion: question,
      currentPrompt: body?.currentPrompt?.trim() || question.question,
      transcript,
      previousTurns: Array.isArray(body?.previousTurns) ? body.previousTurns : [],
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "AI 模拟评委暂时不可用" },
      { status },
    );
  }
}
