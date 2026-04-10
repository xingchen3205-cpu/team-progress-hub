import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeTrainingQuestion } from "@/lib/api-serializers";
import { buildTeamScopedResourceWhere } from "@/lib/team-scope";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const questions = await prisma.trainingQuestion.findMany({
    where: buildTeamScopedResourceWhere({
      actor: user,
      ownerField: "createdById",
    }),
    orderBy: [{ createdAt: "desc" }],
    include: {
      createdBy: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({ questions: questions.map(serializeTrainingQuestion) });
}

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
        category?: string;
        question?: string;
        answerPoints?: string;
      }
    | null;

  const category = body?.category?.trim() || "综合答辩";
  const question = body?.question?.trim();
  const answerPoints = body?.answerPoints?.trim() || "待补充标准回答要点。";

  if (!question) {
    return NextResponse.json({ message: "请填写题目内容" }, { status: 400 });
  }

  const createdQuestion = await prisma.trainingQuestion.create({
    data: {
      category,
      question,
      answerPoints,
      createdById: user.id,
      teamGroupId: hasGlobalAdminPrivileges(user.role) ? null : user.teamGroupId,
    },
    include: {
      createdBy: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({ question: serializeTrainingQuestion(createdQuestion) }, { status: 201 });
}
