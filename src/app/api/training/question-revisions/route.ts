import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canReviewTrainingRevision } from "@/lib/training-ai-workflow";

const serializeRequest = (item: any) => ({
  id: item.id,
  questionId: item.questionId,
  question: item.question.question,
  attemptId: item.attemptId,
  submittedById: item.submittedById,
  submittedByName: item.submittedBy.name,
  teamGroupId: item.teamGroupId,
  status: item.status,
  originalAnswerPoints: item.originalAnswerPoints,
  proposedAnswerPoints: item.proposedAnswerPoints,
  reason: item.reason,
  reviewedByName: item.reviewedBy?.name ?? null,
  reviewComment: item.reviewComment,
  reviewedAt: item.reviewedAt?.toISOString() ?? null,
  createdAt: item.createdAt.toISOString(),
});

const includeRequest = {
  question: { select: { question: true, createdById: true } },
  submittedBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
} as const;

const teamReviewerRoles: Role[] = ["teacher", "leader"];

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const reviewerRoles = ["admin", "school_admin", "teacher", "leader"];
  const reviewerWhere =
    user.role === "admin" || user.role === "school_admin"
      ? {}
      : reviewerRoles.includes(user.role) && user.teamGroupId
        ? { teamGroupId: user.teamGroupId }
        : { question: { createdById: user.id } };
  const rows = await prisma.trainingQuestionRevisionRequest.findMany({
    where: { OR: [{ submittedById: user.id }, reviewerWhere] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: includeRequest,
  });
  return NextResponse.json({
    requests: rows.map((item) => ({
      ...serializeRequest(item),
      canReview:
        item.status === "pending" &&
        canReviewTrainingRevision(user, {
          submittedById: item.submittedById,
          questionCreatedById: item.question.createdById,
          teamGroupId: item.teamGroupId,
        }),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { questionId?: string; attemptId?: string; proposedAnswerPoints?: string; reason?: string }
    | null;
  const questionId = body?.questionId?.trim();
  const attemptId = body?.attemptId?.trim();
  const proposedAnswerPoints = body?.proposedAnswerPoints?.trim() ?? "";
  const reason = body?.reason?.trim() ?? "";
  if (!questionId || !attemptId) return NextResponse.json({ message: "修订申请信息不完整" }, { status: 400 });
  if (proposedAnswerPoints.length < 5 || proposedAnswerPoints.length > 5000) {
    return NextResponse.json({ message: "建议回答要点应为 5 至 5000 个字" }, { status: 400 });
  }
  if (reason.length < 5 || reason.length > 1000) {
    return NextResponse.json({ message: "修订说明应为 5 至 1000 个字" }, { status: 400 });
  }

  const attempt = await prisma.aiTrainingAttempt.findFirst({
    where: { id: attemptId, turn: { session: { createdById: user.id }, questionId } },
    include: { turn: { include: { question: true } } },
  });
  const question = attempt?.turn.question;
  if (!attempt || !question) return NextResponse.json({ message: "评分记录不存在或无权提交修订" }, { status: 404 });
  if (question.answerPoints.trim() === proposedAnswerPoints) {
    return NextResponse.json({ message: "建议要点与当前题库内容一致，无需提交" }, { status: 409 });
  }
  const duplicate = await prisma.trainingQuestionRevisionRequest.findFirst({
    where: { questionId, submittedById: user.id, status: "pending" },
  });
  if (duplicate) return NextResponse.json({ message: "该题已有待审核修订申请" }, { status: 409 });

  const created = await prisma.trainingQuestionRevisionRequest.create({
    data: {
      questionId,
      attemptId,
      submittedById: user.id,
      teamGroupId: question.teamGroupId,
      status: "pending",
      originalAnswerPoints: question.answerPoints,
      proposedAnswerPoints,
      reason,
    },
    include: includeRequest,
  });

  const reviewers = await prisma.user.findMany({
    where: {
      OR: [
        { id: question.createdById },
        { role: { in: ["admin", "school_admin"] } },
        ...(question.teamGroupId
          ? [{ teamGroupId: question.teamGroupId, role: { in: teamReviewerRoles } }]
          : []),
      ],
      NOT: { id: user.id },
    },
    select: { id: true },
  });
  void createNotifications({
    userIds: reviewers.map((reviewer) => reviewer.id),
    title: "答辩题库修订待审核",
    detail: `${user.name} 提交了题目「${question.question.slice(0, 32)}」的回答要点修订申请。`,
    type: "training_question_revision_request",
    targetTab: "training",
    relatedId: created.id,
    senderId: user.id,
  }).catch((error) => console.error("Training revision notification failed", error));

  return NextResponse.json({ request: serializeRequest(created) }, { status: 201 });
}
