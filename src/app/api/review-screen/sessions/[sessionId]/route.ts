import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pickReviewScreenDisplaySettings } from "@/lib/review-screen-display-settings";
import {
  buildAnonymousReviewScreenSeats,
  calculateReviewScreenFinalScore,
  formatScoreCents,
  getPhaseLabel,
  getPhaseRemainingSeconds,
  getReviewScreenTimelineState,
  hashReviewScreenToken,
  isExcludedReviewSeatStatus,
  type ReviewScreenPhase,
  type ReviewScreenSeatStatus,
} from "@/lib/review-screen-session";

const parseDroppedSeatReasons = (value?: string | null): Array<{ seatNo: number; reason: string }> => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<{ seatNo?: unknown; reason?: unknown }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) =>
      typeof item.seatNo === "number" && typeof item.reason === "string"
        ? [{ seatNo: item.seatNo, reason: item.reason }]
        : [],
    );
  } catch {
    return [];
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const wantsAdminView = request.nextUrl.searchParams.get("viewer") === "admin";

  if (!token) {
    return NextResponse.json({ message: "缺少访问令牌" }, { status: 401 });
  }

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      reviewPackage: {
        select: {
          id: true,
          projectReviewStageId: true,
          targetName: true,
          roundLabel: true,
          overview: true,
          status: true,
          startAt: true,
          deadline: true,
          dropHighestCount: true,
          dropLowestCount: true,
          assignments: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              expertUserId: true,
              status: true,
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
        },
      },
      projectOrders: {
        orderBy: { orderIndex: "asc" },
        select: {
          packageId: true,
          orderIndex: true,
          groupName: true,
          groupIndex: true,
          groupSlotIndex: true,
          selfDrawnAt: true,
          revealedAt: true,
          finalScoreCents: true,
          finalScoreText: true,
          effectiveSeatCount: true,
          submittedSeatCount: true,
          droppedSeatNos: true,
          dropHighestCount: true,
          dropLowestCount: true,
          scoreLockedAt: true,
          reviewPackage: {
            select: {
              id: true,
              projectReviewStageId: true,
              targetName: true,
              roundLabel: true,
              overview: true,
              status: true,
              startAt: true,
              deadline: true,
              dropHighestCount: true,
              dropLowestCount: true,
              assignments: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  expertUserId: true,
                  status: true,
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
      },
    },
  });

  if (!session || session.tokenHash !== hashReviewScreenToken(token)) {
    return NextResponse.json({ message: "链接无效" }, { status: 404 });
  }

  if (session.reviewPackage.status !== "configured") {
    return NextResponse.json({ message: "评审配置已取消，链接已失效" }, { status: 410 });
  }

  const viewerUser = wantsAdminView ? await getSessionUser(request) : null;
  const adminCanSeeScores =
    wantsAdminView && Boolean(viewerUser && ["admin", "school_admin"].includes(viewerUser.role));
  const screenDisplay = pickReviewScreenDisplaySettings(session);
  const canShowRankingOnScreen = adminCanSeeScores || screenDisplay.showRankingOnScreen;

  const now = new Date();
  if (session.tokenExpiresAt.getTime() <= now.getTime()) {
    return NextResponse.json({ message: "链接已过期" }, { status: 410 });
  }

  const seats = session.seats.map((seat) => ({
    id: seat.id,
    assignmentId: seat.assignmentId,
    expertUserId: seat.expertUserId,
    seatNo: seat.seatNo,
    displayName: seat.displayName,
    status: seat.status,
    voidedAt: seat.voidedAt?.toISOString() ?? null,
  }));

  const projectOrderPackages = session.projectOrders.length > 0
    ? session.projectOrders.map((order) => order.reviewPackage)
    : session.reviewPackage.projectReviewStageId
      ? await prisma.expertReviewPackage.findMany({
          where: {
            projectReviewStageId: session.reviewPackage.projectReviewStageId,
            status: "configured",
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            projectReviewStageId: true,
            targetName: true,
            roundLabel: true,
            overview: true,
            status: true,
            startAt: true,
            deadline: true,
            dropHighestCount: true,
            dropLowestCount: true,
            assignments: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                expertUserId: true,
                status: true,
                score: {
                  select: {
                    totalScore: true,
                    submittedAt: true,
                  },
                },
              },
            },
          },
      })
      : [session.reviewPackage];

  const projectOrderRowsByPackageId = new Map(
    (session.projectOrders ?? []).map((order) => [order.packageId, order]),
  );

  const projectResults = projectOrderPackages.map((projectPackage) => {
    const assignmentsByExpertId = new Map(
      projectPackage.assignments.map((assignment) => [assignment.expertUserId, assignment]),
    );
    const projectSeats = seats.flatMap((seat) => {
      const assignment = assignmentsByExpertId.get(seat.expertUserId);
      if (!assignment) {
        return [];
      }
      const derivedStatus: ReviewScreenSeatStatus =
        isExcludedReviewSeatStatus(seat.status)
          ? seat.status
          : assignment.score
            ? "submitted"
            : assignment.status === "closed_by_admin" ||
                assignment.status === "timeout" ||
                assignment.status === "excluded"
              ? assignment.status
            : "pending";

      return [
        {
          ...seat,
          assignmentId: assignment.id,
          reviewPackage: projectPackage,
          status: derivedStatus,
          totalScoreCents: assignment.score?.totalScore ?? null,
          submittedAt: assignment.score?.submittedAt?.toISOString() ?? null,
        },
      ];
    });

    const liveFinalScore = calculateReviewScreenFinalScore(
      projectSeats.map((seat, index: number) => ({
        seatNo: index + 1,
        status: seat.status,
        totalScoreCents: seat.totalScoreCents,
      })),
      {
        dropHighestCount: projectPackage.dropHighestCount,
        dropLowestCount: projectPackage.dropLowestCount,
      },
    );
    const lockedOrder = projectOrderRowsByPackageId.get(projectPackage.id);
    const droppedSeatReasons = parseDroppedSeatReasons(lockedOrder?.droppedSeatNos);
    const lockedFinalScore =
      typeof lockedOrder?.finalScoreCents === "number" && lockedOrder.scoreLockedAt
        ? {
            ready: true,
            effectiveSeatCount: lockedOrder.effectiveSeatCount ?? liveFinalScore.effectiveSeatCount,
            submittedSeatCount: lockedOrder.submittedSeatCount ?? liveFinalScore.submittedSeatCount,
            waitingSeatNos: [] as number[],
            droppedSeatNos: droppedSeatReasons.length
              ? droppedSeatReasons.map((item) => item.seatNo).sort((a, b) => a - b)
              : liveFinalScore.droppedSeatNos,
            droppedSeatReasons,
            validScoreTexts: liveFinalScore.validScoreTexts ?? [],
            finalScoreText: lockedOrder.finalScoreText ?? formatScoreCents(lockedOrder.finalScoreCents),
            finalScoreCents: lockedOrder.finalScoreCents,
            dropHighestCount: lockedOrder.dropHighestCount ?? projectPackage.dropHighestCount,
            dropLowestCount: lockedOrder.dropLowestCount ?? projectPackage.dropLowestCount,
            scoreLockedAt: lockedOrder.scoreLockedAt.toISOString(),
          }
        : {
            ...liveFinalScore,
            ready: adminCanSeeScores ? liveFinalScore.ready : false,
            finalScoreText: adminCanSeeScores ? liveFinalScore.finalScoreText : null,
            finalScoreCents: adminCanSeeScores ? liveFinalScore.finalScoreCents : null,
            dropHighestCount: projectPackage.dropHighestCount,
            dropLowestCount: projectPackage.dropLowestCount,
            scoreLockedAt: null,
          };

    const anonymousSeats = buildAnonymousReviewScreenSeats(
      projectSeats.map((seat) => ({
        assignmentId: seat.assignmentId,
        expertUserId: "hidden",
        expertName: null,
        status: seat.status,
        totalScoreCents: seat.totalScoreCents,
      })),
    );
    const visibleSeats =
      adminCanSeeScores || screenDisplay.showScoresOnScreen
        ? anonymousSeats
        : anonymousSeats.map((seat) => ({ ...seat, scoreText: null }));
    const visibleFinalScore =
      adminCanSeeScores || screenDisplay.showFinalScoreOnScreen
        ? lockedFinalScore
        : { ...lockedFinalScore, validScoreTexts: [] };

    return {
      reviewPackage: {
        id: projectPackage.id,
        targetName: projectPackage.targetName,
        roundLabel: projectPackage.roundLabel ?? "项目路演评审",
        overview: projectPackage.overview ?? "",
        deadline: projectPackage.deadline?.toISOString() ?? null,
      },
      seats: visibleSeats,
      finalScore: visibleFinalScore,
    };
  });

  // Determine active project: use currentPackageId if available, otherwise fallback
  const screenPhase: ReviewScreenPhase = session.screenPhase ?? "draw";
  const canSelfDrawOnScreen = screenDisplay.selfDrawEnabled && screenPhase === "draw";
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
        dropHighestCount: session.reviewPackage.dropHighestCount,
        dropLowestCount: session.reviewPackage.dropLowestCount,
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
    if (adminCanSeeScores || (screenDisplay.showFinalScoreOnScreen && isRevealed)) return project;
    return {
      ...project,
      finalScore: {
        ready: false,
        finalScoreText: null,
        effectiveSeatCount: project.finalScore.effectiveSeatCount,
        submittedSeatCount: project.finalScore.submittedSeatCount,
        waitingSeatNos: project.finalScore.waitingSeatNos,
        droppedSeatNos: project.finalScore.droppedSeatNos,
        droppedSeatReasons: project.finalScore.droppedSeatReasons ?? [],
        validScoreTexts: project.finalScore.validScoreTexts ?? [],
        dropHighestCount: project.finalScore.dropHighestCount,
        dropLowestCount: project.finalScore.dropLowestCount,
        scoreLockedAt: null,
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
        dropHighestCount: session.reviewPackage.dropHighestCount,
        dropLowestCount: session.reviewPackage.dropLowestCount,
      },
    );
  const projectOrder = projectOrderPackages.map((projectPackage, index) => {
    const order = projectOrderRowsByPackageId.get(projectPackage.id);
    return {
      orderIndex: order?.orderIndex ?? index,
      packageId: projectPackage.id,
      targetName: projectPackage.targetName ?? "",
      roundLabel: projectPackage.roundLabel ?? "",
      groupName: order?.groupName ?? "第一组",
      groupIndex: order?.groupIndex ?? 0,
      groupSlotIndex: order?.groupSlotIndex ?? index,
      selfDrawnAt: order?.selfDrawnAt?.toISOString() ?? null,
      revealedAt: order?.revealedAt?.toISOString() ?? null,
    };
  });

  const currentProjectIndex = projectOrder.findIndex(
    (o) => o.packageId === currentPackageId,
  );

  const phaseLabel =
    screenPhase === "draw" && !screenDisplay.selfDrawEnabled
      ? "待开始"
      : getPhaseLabel(screenPhase);

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
      dropHighestCount: session.reviewPackage.dropHighestCount,
      dropLowestCount: session.reviewPackage.dropLowestCount,
      screenDisplay,
      startedAt: session.startedAt?.toISOString() ?? null,
      phaseStartedAt: session.phaseStartedAt?.toISOString() ?? null,
      revealStartedAt: session.revealStartedAt?.toISOString() ?? null,
      timeline,
      phaseLabel,
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
    adminCanSeeScores,
    canShowRankingOnScreen,
    canSelfDrawOnScreen,
    serverTime: now.toISOString(),
  });
}
