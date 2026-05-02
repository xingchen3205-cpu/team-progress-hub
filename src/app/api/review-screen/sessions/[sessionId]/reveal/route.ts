import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateReviewScreenFinalScore } from "@/lib/review-screen-session";
import { validateReviewScoreRule } from "@/lib/review-score-rules";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { sessionId } = await params;

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      reviewPackage: {
        select: {
          projectReviewStageId: true,
        },
      },
      seats: {
        orderBy: { seatNo: "asc" },
        select: {
          seatNo: true,
          expertUserId: true,
          status: true,
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ message: "大屏会话不存在" }, { status: 404 });
  }

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  const currentPackageId = session.currentPackageId ?? session.packageId;
  const currentReviewPackage = await prisma.expertReviewPackage.findUnique({
    where: { id: currentPackageId },
    select: {
      id: true,
      dropHighestCount: true,
      dropLowestCount: true,
      assignments: {
        select: {
          expertUserId: true,
          score: { select: { totalScore: true } },
        },
      },
    },
  });
  if (!currentReviewPackage) {
    return NextResponse.json({ message: "当前路演项目不存在" }, { status: 404 });
  }
  const assignmentsByExpertId = new Map(
    currentReviewPackage.assignments.map((assignment) => [assignment.expertUserId, assignment]),
  );
  const currentSeats = session.seats.flatMap((seat) => {
    const assignment = assignmentsByExpertId.get(seat.expertUserId);
    if (!assignment) {
      return [];
    }

    return [
      {
        seatNo: seat.seatNo,
        status: seat.status,
        totalScoreCents: assignment.score?.totalScore ?? null,
      },
    ];
  });

  const finalScore = calculateReviewScreenFinalScore(
    currentSeats.map((seat) => ({
      seatNo: seat.seatNo,
      status:
        seat.status === "voided"
          ? "voided"
          : typeof seat.totalScoreCents === "number"
            ? "submitted"
            : "pending",
      totalScoreCents: seat.totalScoreCents,
    })),
    {
      dropHighestCount: currentReviewPackage.dropHighestCount,
      dropLowestCount: currentReviewPackage.dropLowestCount,
    },
  );

  if (!finalScore.ready) {
    return NextResponse.json(
      { message: "还有专家未提交评分，不能揭晓分数", waitingSeatNos: finalScore.waitingSeatNos },
      { status: 409 },
    );
  }

  const scoreRuleError = validateReviewScoreRule({
    expertCount: finalScore.effectiveSeatCount,
    dropHighestCount: currentReviewPackage.dropHighestCount,
    dropLowestCount: currentReviewPackage.dropLowestCount,
  });
  if (scoreRuleError) {
    return NextResponse.json({ message: scoreRuleError }, { status: 409 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const lockedAt = new Date();
    await tx.reviewDisplayProjectOrder.updateMany({
      where: { sessionId, packageId: currentPackageId },
      data: {
        revealedAt: lockedAt,
        finalScoreCents: finalScore.finalScoreCents,
        finalScoreText: finalScore.finalScoreText,
        effectiveSeatCount: finalScore.effectiveSeatCount,
        submittedSeatCount: finalScore.submittedSeatCount,
        droppedSeatNos: JSON.stringify(finalScore.droppedSeatReasons ?? []),
        dropHighestCount: currentReviewPackage.dropHighestCount,
        dropLowestCount: currentReviewPackage.dropLowestCount,
        scoreLockedAt: lockedAt,
      },
    });

    return tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: {
        screenPhase: "reveal",
        phaseStartedAt: lockedAt,
        revealStartedAt: lockedAt,
        status: "revealed",
      },
      select: {
        id: true,
        screenPhase: true,
        phaseStartedAt: true,
        revealStartedAt: true,
        status: true,
      },
    });
  });

  return NextResponse.json({
    session: {
      ...updated,
      phaseStartedAt: updated.phaseStartedAt?.toISOString() ?? null,
      revealStartedAt: updated.revealStartedAt?.toISOString() ?? null,
    },
    finalScore: {
      finalScoreText: finalScore.finalScoreText,
      finalScoreCents: finalScore.finalScoreCents,
      effectiveSeatCount: finalScore.effectiveSeatCount,
      submittedSeatCount: finalScore.submittedSeatCount,
      droppedSeatNos: finalScore.droppedSeatNos,
      droppedSeatReasons: finalScore.droppedSeatReasons ?? [],
      validScoreTexts: finalScore.validScoreTexts ?? [],
      dropHighestCount: currentReviewPackage.dropHighestCount,
      dropLowestCount: currentReviewPackage.dropLowestCount,
    },
  });
}
