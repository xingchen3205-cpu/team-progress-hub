import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  buildAnonymousReviewScreenSeats,
  calculateReviewScreenFinalScore,
  getPhaseLabel,
  getPhaseRemainingSeconds,
  getReviewScreenTimelineState,
  hashReviewScreenToken,
  type ReviewScreenPhase,
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
              reviewPackage: {
                select: {
                  id: true,
                  targetName: true,
                  roundLabel: true,
                  overview: true,
                  deadline: true,
                },
              },
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
      projectOrders: {
        orderBy: { orderIndex: "asc" },
        select: {
          packageId: true,
          orderIndex: true,
          revealedAt: true,
          reviewPackage: {
            select: {
              id: true,
              targetName: true,
              roundLabel: true,
              overview: true,
              deadline: true,
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
      reviewPackage: seat.assignment.reviewPackage,
      seatNo: seat.seatNo,
      displayName: seat.displayName,
      status: derivedStatus,
      totalScoreCents: seat.assignment.score?.totalScore ?? null,
      submittedAt: seat.assignment.score?.submittedAt?.toISOString() ?? null,
      voidedAt: seat.voidedAt?.toISOString() ?? null,
    };
  });

  const projectResults = Array.from(
    seats.reduce<
      Map<
        string,
        {
          reviewPackage: typeof seats[number]["reviewPackage"];
          seats: typeof seats;
        }
      >
    >((groups, seat) => {
      const existing = groups.get(seat.reviewPackage.id);
      if (existing) {
        existing.seats.push(seat);
        return groups;
      }

      groups.set(seat.reviewPackage.id, {
        reviewPackage: seat.reviewPackage,
        seats: [seat],
      });
      return groups;
    }, new Map()).values(),
  ).map((project) => {
    const finalScore = calculateReviewScreenFinalScore(
      project.seats.map((seat, index: number) => ({
        seatNo: index + 1,
        status: seat.status,
        totalScoreCents: seat.totalScoreCents,
      })),
      {
        dropHighestCount: session.dropHighestCount,
        dropLowestCount: session.dropLowestCount,
      },
    );

    return {
      reviewPackage: {
        id: project.reviewPackage.id,
        targetName: project.reviewPackage.targetName,
        roundLabel: project.reviewPackage.roundLabel ?? "项目路演评审",
        overview: project.reviewPackage.overview ?? "",
        deadline: project.reviewPackage.deadline?.toISOString() ?? null,
      },
      seats: buildAnonymousReviewScreenSeats(
        project.seats.map((seat) => ({
          assignmentId: seat.assignmentId,
          expertUserId: "hidden",
          expertName: null,
          status: seat.status,
          totalScoreCents: seat.totalScoreCents,
        })),
      ),
      finalScore,
    };
  });

  // Determine active project: use currentPackageId if available, otherwise fallback
  const screenPhase: ReviewScreenPhase = session.screenPhase ?? "draw";
  const currentPackageId = session.currentPackageId ?? session.reviewPackage.id;

  const activeProjectResult =
    projectResults.find((project) => project.reviewPackage.id === currentPackageId) ??
    projectResults.find((project) => !project.finalScore.ready) ??
    projectResults.find((project) => project.reviewPackage.id === session.reviewPackage.id) ??
    projectResults[0] ??
    null;

  const activeFinalScore = activeProjectResult?.finalScore ??
    calculateReviewScreenFinalScore(
      [],
      {
        dropHighestCount: session.dropHighestCount,
        dropLowestCount: session.dropLowestCount,
      },
    );

  const phaseRemainingSeconds = getPhaseRemainingSeconds({
    phase: screenPhase,
    phaseStartedAt: session.phaseStartedAt,
    config: {
      presentationSeconds: session.presentationSeconds ?? 480,
      qaSeconds: session.qaSeconds ?? 420,
      scoringSeconds: session.scoringSeconds ?? session.countdownSeconds ?? 60,
      countdownSeconds: session.countdownSeconds,
    },
    now,
  });

  const timeline = getReviewScreenTimelineState({
    status: session.status,
    startedAt: session.startedAt,
    countdownSeconds: session.countdownSeconds,
    now,
    hasFinalScore: activeFinalScore.ready,
  });

  const revealedPackageIds = new Set(
    (session.projectOrders ?? [])
      .filter((o) => o.revealedAt != null)
      .map((o) => o.packageId),
  );

  // Mask final scores before reveal
  const isRevealPhase = screenPhase === "reveal";

  const maskedProjectResults = projectResults.map((project) => {
    const isRevealed =
      revealedPackageIds.has(project.reviewPackage.id) ||
      (isRevealPhase && project.reviewPackage.id === currentPackageId);
    if (isRevealed) return project;
    return {
      ...project,
      finalScore: {
        ready: false,
        finalScoreText: null,
        effectiveSeatCount: project.finalScore.effectiveSeatCount,
        submittedSeatCount: project.finalScore.submittedSeatCount,
        waitingSeatNos: project.finalScore.waitingSeatNos,
        droppedSeatNos: project.finalScore.droppedSeatNos,
      },
    };
  });

  const activeProjectMasked = maskedProjectResults.find(
    (project) => project.reviewPackage.id === currentPackageId,
  ) ?? activeProjectResult;

  const maskedActiveFinalScore = activeProjectMasked?.finalScore ??
    calculateReviewScreenFinalScore(
      [],
      {
        dropHighestCount: session.dropHighestCount,
        dropLowestCount: session.dropLowestCount,
      },
    );

  const projectOrder = (session.projectOrders ?? []).map((order) => ({
    orderIndex: order.orderIndex,
    packageId: order.packageId,
    targetName: order.reviewPackage?.targetName ?? "",
    roundLabel: order.reviewPackage?.roundLabel ?? "",
    revealedAt: order.revealedAt?.toISOString() ?? null,
  }));

  const currentProjectIndex = projectOrder.findIndex(
    (o) => o.packageId === currentPackageId,
  );

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      screenPhase,
      startsAt: session.startsAt?.toISOString() ?? session.reviewPackage.startAt?.toISOString() ?? null,
      tokenExpiresAt: session.tokenExpiresAt.toISOString(),
      countdownSeconds: session.countdownSeconds,
      presentationSeconds: session.presentationSeconds ?? 480,
      qaSeconds: session.qaSeconds ?? 420,
      scoringSeconds: session.scoringSeconds ?? session.countdownSeconds ?? 60,
      dropHighestCount: session.dropHighestCount,
      dropLowestCount: session.dropLowestCount,
      startedAt: session.startedAt?.toISOString() ?? null,
      phaseStartedAt: session.phaseStartedAt?.toISOString() ?? null,
      revealStartedAt: session.revealStartedAt?.toISOString() ?? null,
      timeline,
      phaseLabel: getPhaseLabel(screenPhase),
      phaseRemainingSeconds,
      currentPackageId,
      currentProjectIndex: currentProjectIndex >= 0 ? currentProjectIndex : 0,
      totalProjectCount: projectOrder.length,
    },
    reviewPackage: {
      id: activeProjectResult?.reviewPackage.id ?? session.reviewPackage.id,
      targetName: activeProjectResult?.reviewPackage.targetName ?? session.reviewPackage.targetName,
      roundLabel: activeProjectResult?.reviewPackage.roundLabel ?? session.reviewPackage.roundLabel ?? "项目路演评审",
      overview: activeProjectResult?.reviewPackage.overview ?? session.reviewPackage.overview ?? "",
      deadline: activeProjectResult?.reviewPackage.deadline ?? session.reviewPackage.deadline?.toISOString() ?? null,
    },
    seats: activeProjectResult?.seats ?? [],
    finalScore: maskedActiveFinalScore,
    projectResults: maskedProjectResults,
    projectOrder,
    serverTime: now.toISOString(),
  });
}
