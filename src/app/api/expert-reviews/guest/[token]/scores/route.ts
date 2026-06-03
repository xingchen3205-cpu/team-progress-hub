import { NextRequest, NextResponse } from "next/server";

import { hashExpertReviewGuestToken } from "@/lib/expert-review-guest-token";
import { getExpertReviewLockState, getExpertReviewWindowState } from "@/lib/expert-review";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, expertActionRateLimits, rateLimitExceededResponse } from "@/lib/security";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const normalizedToken = token?.trim();
  const now = new Date();

  if (!normalizedToken) {
    return NextResponse.json({ message: "缺少专家评分链接" }, { status: 401 });
  }

  const guestToken = await prisma.expertReviewGuestToken.findFirst({
    where: {
      tokenHash: hashExpertReviewGuestToken(normalizedToken),
      revokedAt: null,
      tokenExpiresAt: { gt: now },
    },
    select: {
      id: true,
      expertUserId: true,
      projectReviewStageId: true,
    },
  });

  if (!guestToken) {
    return NextResponse.json({ message: "专家评分链接无效或已过期" }, { status: 404 });
  }

  const rateLimit = checkRateLimit(request, expertActionRateLimits.scoreSubmit, guestToken.id);
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit, "评分提交过于频繁，请稍后再试");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        assignmentId?: string;
        score?: number;
        commentTotal?: string;
      }
    | null;
  const assignmentId = body?.assignmentId?.trim();
  if (!assignmentId) {
    return NextResponse.json({ message: "评分信息不完整" }, { status: 400 });
  }

  const score = Number(body?.score);
  const scaledScore = Math.round(score * 100);
  const hasValidPrecision =
    Number.isInteger(score * 100) || Math.abs(score * 100 - scaledScore) < 1e-6;
  if (!Number.isFinite(score) || score < 0 || score > 100 || !hasValidPrecision) {
    return NextResponse.json({ message: "分数需为 0.00-100.00，最多保留两位小数" }, { status: 400 });
  }

  const assignment = await prisma.expertReviewAssignment.findFirst({
    where: {
      id: assignmentId,
      expertUserId: guestToken.expertUserId,
      reviewPackage: {
        projectReviewStageId: guestToken.projectReviewStageId,
      },
    },
    select: {
      id: true,
      status: true,
      score: {
        select: {
          id: true,
        },
      },
      reviewPackage: {
        select: {
          id: true,
          targetName: true,
          roundLabel: true,
          status: true,
          startAt: true,
          deadline: true,
          projectReviewStage: {
            select: {
              startAt: true,
              deadline: true,
            },
          },
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "当前专家无权限提交该项目评分" }, { status: 403 });
  }
  if (assignment.reviewPackage.status !== "configured") {
    return NextResponse.json({ message: "评审配置已取消，不能提交评分" }, { status: 409 });
  }
  if (assignment.score) {
    return NextResponse.json({ message: "评分已提交，不能修改" }, { status: 409 });
  }
  if (assignment.status === "closed_by_admin") {
    return NextResponse.json({ message: "本项目评分已由管理员关闭，无需提交" }, { status: 409 });
  }
  if (assignment.status === "timeout") {
    return NextResponse.json({ message: "本项目评分已超时关闭，不能提交" }, { status: 409 });
  }
  if (assignment.status === "excluded") {
    return NextResponse.json({ message: "该专家席位已被排除，不能提交评分" }, { status: 409 });
  }

  const startAt = assignment.reviewPackage.startAt ?? assignment.reviewPackage.projectReviewStage?.startAt ?? null;
  const deadline = assignment.reviewPackage.deadline ?? assignment.reviewPackage.projectReviewStage?.deadline ?? null;
  const reviewWindowState = getExpertReviewWindowState({ startAt, deadline, lockedAt: null });
  if (reviewWindowState.key === "not_started") {
    return NextResponse.json({ message: "评审尚未开始，请在管理员设置的评审时间内提交" }, { status: 409 });
  }
  if (getExpertReviewLockState({ deadline, lockedAt: null })) {
    await prisma.expertReviewAssignment.update({
      where: { id: assignment.id },
      data: { status: "locked" },
    });
    return NextResponse.json({ message: "评审已截止，当前记录已锁定" }, { status: 409 });
  }

  const submittedAt = new Date();
  const commentTotal = body?.commentTotal?.trim() ?? "";
  const result = await prisma.$transaction(async (tx) => {
    const createdScore = await tx.expertReviewScore.create({
      data: {
        assignmentId: assignment.id,
        reviewerId: guestToken.expertUserId,
        scorePersonalGrowth: 0,
        scoreInnovation: 0,
        scoreIndustry: 0,
        scoreTeamwork: 0,
        totalScore: scaledScore,
        commentTotal,
        submittedAt,
        lockedAt: submittedAt,
      },
      select: {
        id: true,
        totalScore: true,
        commentTotal: true,
        submittedAt: true,
        lockedAt: true,
      },
    });

    await tx.expertReviewAssignment.update({
      where: { id: assignment.id },
      data: { status: "submitted" },
    });
    await tx.expertReviewGuestToken.update({
      where: { id: guestToken.id },
      data: { lastUsedAt: submittedAt },
    });

    return createdScore;
  }).catch((error: unknown) =>
    error instanceof Error ? error : new Error("评分提交失败，请刷新后重试"),
  );

  if (result instanceof Error) {
    return NextResponse.json({ message: result.message }, { status: 409 });
  }

  return NextResponse.json({
    assignmentId: assignment.id,
    targetName: assignment.reviewPackage.targetName,
    roundLabel: assignment.reviewPackage.roundLabel ?? "",
    score: {
      id: result.id,
      totalScore: result.totalScore,
      scoreText: (result.totalScore / 100).toFixed(2),
      commentTotal: result.commentTotal,
      submittedAt: result.submittedAt.toISOString(),
      lockedAt: result.lockedAt?.toISOString() ?? null,
    },
  });
}
