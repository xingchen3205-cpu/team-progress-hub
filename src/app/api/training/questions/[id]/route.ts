import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole, assertRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeTrainingQuestion } from "@/lib/api-serializers";
import { createNotifications } from "@/lib/notifications";

const canManageTrainingQuestion = (
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>,
  question: { createdById: string; teamGroupId?: string | null },
) => {
  if (hasGlobalAdminPrivileges(user.role) || user.id === question.createdById) {
    return true;
  }

  return (
    ["teacher", "leader"].includes(user.role) &&
    Boolean(user.teamGroupId && question.teamGroupId === user.teamGroupId)
  );
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;
  const existingQuestion = await prisma.trainingQuestion.findUnique({
    where: { id },
    select: {
      answerPoints: true,
      category: true,
      createdById: true,
      question: true,
      teamGroupId: true,
    },
  });

  if (!existingQuestion) {
    return NextResponse.json({ message: "题目不存在" }, { status: 404 });
  }

  if (!canManageTrainingQuestion(user, existingQuestion)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        category?: string;
        question?: string;
        answerPoints?: string;
      }
    | null;

  const category = body?.category?.trim();
  const question = body?.question?.trim();
  const answerPoints = body?.answerPoints?.trim();

  if (!category || !question || !answerPoints) {
    return NextResponse.json({ message: "题目信息不完整" }, { status: 400 });
  }

  const updatedQuestion = await prisma.trainingQuestion.update({
    where: { id },
    data: { category, question, answerPoints },
    include: {
      createdBy: {
        select: { id: true, name: true },
      },
      teamGroup: {
        select: { id: true, name: true },
      },
    },
  });

  const changedFields = [
    existingQuestion.category !== category ? "分类" : null,
    existingQuestion.question !== question ? "问题" : null,
    existingQuestion.answerPoints !== answerPoints ? "答案要点" : null,
  ].filter(Boolean);

  if (existingQuestion.createdById !== user.id && changedFields.length > 0) {
    const questionTitle = question.length > 32 ? `${question.slice(0, 32)}...` : question;

    await createNotifications({
      userIds: [existingQuestion.createdById],
      title: "题库答案已被修订",
      detail: `${user.name} 修订了你录入的题目「${questionTitle}」的${changedFields.join("、")}，系统已替换为最新版本，请进入题库查看。`,
      type: "training_question_revision",
      targetTab: "training",
      relatedId: id,
      senderId: user.id,
    });
  }

  return NextResponse.json({ question: serializeTrainingQuestion(updatedQuestion) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;
  const existingQuestion = await prisma.trainingQuestion.findUnique({
    where: { id },
    select: { createdById: true, teamGroupId: true },
  });

  if (!existingQuestion) {
    return NextResponse.json({ message: "题目不存在" }, { status: 404 });
  }

  if (!canManageTrainingQuestion(user, existingQuestion)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader", "member"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  await prisma.trainingQuestion.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
