import { NextRequest, NextResponse } from "next/server";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { trainingQuestionObjectType, trainingQuestionRevisionAction } from "@/lib/training-question-revisions";
import { canReviewTrainingRevision, canTransitionTrainingRevision } from "@/lib/training-ai-workflow";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { requestId } = await params;
  const body = (await request.json().catch(() => null)) as
    | { action?: "withdrawn" | "approved" | "rejected"; reviewComment?: string }
    | null;
  const action = body?.action;
  const reviewComment = body?.reviewComment?.trim() ?? "";
  if (!action) return NextResponse.json({ message: "请选择处理结果" }, { status: 400 });

  const existing = await prisma.trainingQuestionRevisionRequest.findUnique({
    where: { id: requestId },
    include: { question: { select: { id: true, question: true, answerPoints: true, createdById: true } } },
  });
  if (!existing) return NextResponse.json({ message: "修订申请不存在" }, { status: 404 });
  if (!canTransitionTrainingRevision(existing.status, action)) {
    return NextResponse.json({ message: "该修订申请已处理" }, { status: 409 });
  }

  if (action === "withdrawn") {
    if (existing.submittedById !== user.id) return NextResponse.json({ message: "无权撤回该申请" }, { status: 403 });
    await prisma.trainingQuestionRevisionRequest.update({ where: { id: requestId }, data: { status: "withdrawn" } });
    return NextResponse.json({ status: "withdrawn" });
  }

  if (
    !canReviewTrainingRevision(user, {
      submittedById: existing.submittedById,
      questionCreatedById: existing.question.createdById,
      teamGroupId: existing.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权审核该申请" }, { status: 403 });
  }
  if (reviewComment.length < 2 || reviewComment.length > 1000) {
    return NextResponse.json({ message: "请填写 2 至 1000 个字的审核意见" }, { status: 400 });
  }
  if (action === "approved" && existing.question.answerPoints !== existing.originalAnswerPoints) {
    return NextResponse.json({ message: "题库要点已发生变化，请申请人依据最新内容重新提交" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    if (action === "approved") {
      await tx.trainingQuestion.update({
        where: { id: existing.questionId },
        data: { answerPoints: existing.proposedAnswerPoints },
      });
      await createAuditLogEntry({
        tx,
        operator: { id: user.id, role: user.role },
        action: trainingQuestionRevisionAction,
        objectType: trainingQuestionObjectType,
        objectId: existing.questionId,
        teamGroupId: existing.teamGroupId,
        beforeState: { answerPoints: existing.originalAnswerPoints },
        afterState: { answerPoints: existing.proposedAnswerPoints },
        metadata: { revisionRequestId: existing.id, reviewComment },
      });
    }
    await tx.trainingQuestionRevisionRequest.update({
      where: { id: requestId },
      data: { status: action, reviewedById: user.id, reviewComment, reviewedAt: new Date() },
    });
  });

  void createNotifications({
    userIds: [existing.submittedById],
    title: action === "approved" ? "答辩题库修订已通过" : "答辩题库修订未通过",
    detail: `${user.name} 已处理题目「${existing.question.question.slice(0, 32)}」的修订申请。审核意见：${reviewComment}`,
    type: "training_question_revision_result",
    targetTab: "training",
    relatedId: existing.id,
    senderId: user.id,
  }).catch((error) => console.error("Training revision result notification failed", error));

  return NextResponse.json({ status: action });
}
