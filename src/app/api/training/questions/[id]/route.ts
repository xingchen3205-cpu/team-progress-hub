import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole, assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeTrainingQuestion } from "@/lib/api-serializers";

const canManageTrainingQuestion = (
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>,
  createdById: string,
) => {
  if (["admin", "teacher", "leader"].includes(user.role)) {
    return true;
  }

  return user.id === createdById;
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
    select: { createdById: true },
  });

  if (!existingQuestion) {
    return NextResponse.json({ message: "题目不存在" }, { status: 404 });
  }

  if (!canManageTrainingQuestion(user, existingQuestion.createdById)) {
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
    },
  });

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
    select: { createdById: true },
  });

  if (!existingQuestion) {
    return NextResponse.json({ message: "题目不存在" }, { status: 404 });
  }

  if (user.role === "member" && user.id !== existingQuestion.createdById) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  try {
    assertRole(user.role, ["admin", "teacher", "leader", "member"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  await prisma.trainingQuestion.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
