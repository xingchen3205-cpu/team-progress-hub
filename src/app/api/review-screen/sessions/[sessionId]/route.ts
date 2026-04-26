import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  buildAnonymousReviewScreenSeats,
  calculateReviewScreenFinalScore,
  getReviewScreenTimelineState,
  hashReviewScreenToken,
  type ReviewScreenSeatStatus,
} from "@/lib/review-screen-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const token = request.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ message: "缺少访问令牌" }, { status: 401 });
  }

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      reviewPackage: {
        select: {
          id: true,
          targetName: true,
          roundLabel: true,
          overview: true,
          status: true,
          startAt: true,
          deadline: true,
        },
      },
      seats: {
        orderBy: { seatNo: "asc" },
        select: {
          id: true,
          assignmentId: true,
          expertUserId: true,
          seatNo: true,
          displayName: true,
          status: true,
          voidedAt: true,
          assignment: {
            select: {
              score: {
                select: {
                  totalScore: true,
                  submittedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.tokenHash !== hashReviewScreenToken(token)) {
    return NextResponse.json({ message: "链接无效" }, { status: 404 });
  }

  if (session.reviewPackage.status !== "configured") {
    return NextResponse.json({ message: "评审配置已取消，链接已失效" }, { status: 410 });
  }

  const now = new Date();
  if (session.tokenExpiresAt.getTime() <= now.getTime()) {
    return NextResponse.json({ message: "链接已过期" }, { status: 410 });
  }

  const seats = session.seats.map((seat) => {
    const derivedStatus: ReviewScreenSeatStatus =
      seat.status === "voided"
        ? "voided"
        : seat.assignment.score
          ? "submitted"
          : "pending";

    return {
      id: seat.id,
      assignmentId: seat.assignmentId,
      expertUserId: seat.expertUserId,
      seatNo: seat.seatNo,
      displayName: seat.displayName,
      status: derivedStatus,
      totalScoreCents: seat.assignment.score?.totalScore ?? null,
      submittedAt: seat.assignment.score?.submittedAt?.toISOString() ?? null,
      voidedAt: seat.voidedAt?.toISOString() ?? null,
    };
  });
  const finalScore = calculateReviewScreenFinalScore(
    seats.map((seat) => ({
      seatNo: seat.seatNo,
      status: seat.status,
      totalScoreCents: seat.totalScoreCents,
    })),
    {
      dropHighestCount: session.dropHighestCount,
      dropLowestCount: session.dropLowestCount,
    },
  );
  const timeline = getReviewScreenTimelineState({
    status: session.status,
    startedAt: session.startedAt,
    countdownSeconds: session.countdownSeconds,
    now,
    hasFinalScore: finalScore.ready,
  });

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      startsAt: session.startsAt?.toISOString() ?? session.reviewPackage.startAt?.toISOString() ?? null,
      tokenExpiresAt: session.tokenExpiresAt.toISOString(),
      countdownSeconds: session.countdownSeconds,
      dropHighestCount: session.dropHighestCount,
      dropLowestCount: session.dropLowestCount,
      startedAt: session.startedAt?.toISOString() ?? null,
      timeline,
    },
    reviewPackage: {
      id: session.reviewPackage.id,
      targetName: session.reviewPackage.targetName,
      roundLabel: session.reviewPackage.roundLabel ?? "项目路演评审",
      overview: session.reviewPackage.overview ?? "",
      deadline: session.reviewPackage.deadline?.toISOString() ?? null,
    },
    seats: buildAnonymousReviewScreenSeats(
      seats.map((seat) => ({
        assignmentId: seat.assignmentId,
        expertUserId: "hidden",
        expertName: null,
        status: seat.status,
        totalScoreCents: seat.totalScoreCents,
      })),
    ),
    finalScore,
    serverTime: now.toISOString(),
  });
}
