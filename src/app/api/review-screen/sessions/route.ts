import { NextRequest, NextResponse } from "next/server";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildRoadshowProjectOrderRows } from "@/lib/roadshow-screen-groups";
import {
  normalizeReviewScreenDisplaySettings,
  pickReviewScreenDisplaySettings,
} from "@/lib/review-screen-display-settings";
import { buildReviewDisplaySeatSeeds, createReviewScreenToken } from "@/lib/review-screen-session";

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(numericValue)));
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const packageId = request.nextUrl.searchParams.get("packageId")?.trim();
  const sessions = await prisma.reviewDisplaySession.findMany({
    where: packageId ? { packageId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      packageId: true,
      startsAt: true,
      tokenExpiresAt: true,
      countdownSeconds: true,
      dropHighestCount: true,
      dropLowestCount: true,
      scoringEnabled: true,
      showScoresOnScreen: true,
      showFinalScoreOnScreen: true,
      showRankingOnScreen: true,
      selfDrawEnabled: true,
      status: true,
      startedAt: true,
      createdAt: true,
      seats: {
        orderBy: { seatNo: "asc" },
        select: {
          id: true,
          seatNo: true,
          displayName: true,
          status: true,
          voidedAt: true,
        },
      },
      reviewPackage: {
        select: {
          targetName: true,
          roundLabel: true,
          status: true,
          deadline: true,
          dropHighestCount: true,
          dropLowestCount: true,
        },
      },
    },
  });

  return NextResponse.json({
    sessions: sessions.map((session) => ({
      ...session,
      startsAt: session.startsAt?.toISOString() ?? null,
      tokenExpiresAt: session.tokenExpiresAt.toISOString(),
      startedAt: session.startedAt?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
      screenDisplay: pickReviewScreenDisplaySettings(session),
      reviewPackage: {
        ...session.reviewPackage,
        deadline: session.reviewPackage.deadline?.toISOString() ?? null,
      },
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        packageId?: string;
        countdownSeconds?: number;
        presentationSeconds?: number;
        qaSeconds?: number;
        scoringSeconds?: number;
        roadshowGroupSizes?: number[];
        packageIds?: string[];
        screenDisplay?: Partial<{
          scoringEnabled: unknown;
          showScoresOnScreen: unknown;
          showFinalScoreOnScreen: unknown;
          showRankingOnScreen: unknown;
          selfDrawEnabled: unknown;
        }>;
      }
    | null;
  const packageId = body?.packageId?.trim();

  if (!packageId) {
    return NextResponse.json({ message: "请选择路演评审项目" }, { status: 400 });
  }

  const reviewPackage = await prisma.expertReviewPackage.findUnique({
    where: { id: packageId },
    include: {
      projectReviewStage: {
        select: {
          id: true,
          type: true,
          startAt: true,
          deadline: true,
        },
      },
      materials: { select: { id: true } },
      assignments: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          expertUserId: true,
          score: {
            select: {
              totalScore: true,
            },
          },
        },
      },
    },
  });

  if (!reviewPackage) {
    return NextResponse.json({ message: "评审项目不存在" }, { status: 404 });
  }

  if (reviewPackage.status !== "configured") {
    return NextResponse.json({ message: "评审配置已取消，不能生成大屏链接" }, { status: 409 });
  }

  const projectReviewStageType = reviewPackage.projectReviewStage?.type ??
    (reviewPackage.materials.length === 0 ? "roadshow" : "online_review");

  if (projectReviewStageType !== "roadshow") {
    return NextResponse.json({ message: "只有项目路演评审可以生成现场大屏链接" }, { status: 400 });
  }

  const stageReviewPackages = reviewPackage.projectReviewStageId
    ? await prisma.expertReviewPackage.findMany({
        where: {
          projectReviewStageId: reviewPackage.projectReviewStageId,
          status: "configured",
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          projectReviewStage: {
            select: {
              id: true,
              type: true,
              startAt: true,
              deadline: true,
            },
          },
          materials: { select: { id: true } },
          assignments: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              expertUserId: true,
              score: {
                select: {
                  totalScore: true,
                },
              },
            },
          },
        },
      })
    : [reviewPackage];
  const requestedPackageIds = Array.isArray(body?.packageIds)
    ? body.packageIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim())
    : [];
  const stagePackageById = new Map(stageReviewPackages.map((stagePackage) => [stagePackage.id, stagePackage]));
  const orderedStageReviewPackages = requestedPackageIds.length
    ? [...new Set(requestedPackageIds)]
        .map((stagePackageId) => stagePackageById.get(stagePackageId))
        .filter((stagePackage): stagePackage is (typeof stageReviewPackages)[number] => Boolean(stagePackage))
    : stageReviewPackages;
  const requestedPackageSetIsValid =
    requestedPackageIds.length === 0 ||
    (orderedStageReviewPackages.length === stageReviewPackages.length &&
      orderedStageReviewPackages.every((stagePackage) => stagePackageById.has(stagePackage.id)));

  if (!requestedPackageSetIsValid) {
    return NextResponse.json({ message: "路演顺序与本轮项目不匹配" }, { status: 400 });
  }

  const stageAssignments = orderedStageReviewPackages.flatMap((stagePackage) =>
    stagePackage.assignments.map((assignment) => ({
      ...assignment,
      packageId: stagePackage.id,
    })),
  );

  if (stageAssignments.length === 0) {
    return NextResponse.json({ message: "请先为本轮路演分配评审专家" }, { status: 400 });
  }

  const now = new Date();
  const startsAt =
    stageReviewPackages
      .map((stagePackage) => stagePackage.startAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => left.getTime() - right.getTime())[0] ??
    reviewPackage.startAt ??
    now;
  const defaultTokenExpiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const configuredTokenExpiresAt =
    stageReviewPackages
      .map((stagePackage) => stagePackage.deadline)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ??
    reviewPackage.deadline;
  const tokenExpiresAt =
    configuredTokenExpiresAt && configuredTokenExpiresAt.getTime() > now.getTime()
      ? configuredTokenExpiresAt
      : defaultTokenExpiresAt;

  const countdownSeconds = clampInteger(body?.countdownSeconds, 60, 10, 600);
  const presentationSeconds = clampInteger(body?.presentationSeconds, 480, 60, 1800);
  const qaSeconds = clampInteger(body?.qaSeconds, 420, 60, 1800);
  const scoringSeconds = clampInteger(body?.scoringSeconds, 60, 10, 600);
  const screenDisplay = normalizeReviewScreenDisplaySettings(body?.screenDisplay);
  let projectOrderRows: ReturnType<typeof buildRoadshowProjectOrderRows<typeof orderedStageReviewPackages[number]>>;
  try {
    projectOrderRows = buildRoadshowProjectOrderRows(orderedStageReviewPackages, body?.roadshowGroupSizes);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "路演分组设置无效" },
      { status: 400 },
    );
  }
  const { token, tokenHash } = createReviewScreenToken();

  const { session, seats } = await prisma.$transaction(async (tx) => {
    const firstPackageId = projectOrderRows[0]?.project.id ?? stageReviewPackages[0]?.id ?? reviewPackage.id;
    const createdSession = await tx.reviewDisplaySession.create({
      data: {
        packageId: reviewPackage.id,
        currentPackageId: firstPackageId,
        tokenHash,
        startsAt,
        tokenExpiresAt,
        countdownSeconds,
        dropHighestCount: reviewPackage.dropHighestCount,
        dropLowestCount: reviewPackage.dropLowestCount,
        presentationSeconds,
        qaSeconds,
        scoringSeconds,
        ...screenDisplay,
        createdById: user.id,
      },
      select: {
        id: true,
        packageId: true,
        startsAt: true,
        tokenExpiresAt: true,
        countdownSeconds: true,
        presentationSeconds: true,
        qaSeconds: true,
        scoringSeconds: true,
        scoringEnabled: true,
        showScoresOnScreen: true,
        showFinalScoreOnScreen: true,
        showRankingOnScreen: true,
        selfDrawEnabled: true,
        dropHighestCount: true,
        dropLowestCount: true,
        status: true,
        screenPhase: true,
        currentPackageId: true,
      },
    });

    await tx.reviewDisplayProjectOrder.createMany({
      data: projectOrderRows.map((row) => ({
        sessionId: createdSession.id,
        packageId: row.project.id,
        orderIndex: row.orderIndex,
        groupName: row.groupName,
        groupIndex: row.groupIndex,
        groupSlotIndex: row.groupSlotIndex,
        selfDrawnAt: screenDisplay.selfDrawEnabled ? null : now,
      })),
    });

    await tx.reviewDisplaySeat.createMany({
      data: buildReviewDisplaySeatSeeds(stageAssignments).map((seat) => ({
        sessionId: createdSession.id,
        assignmentId: seat.assignmentId,
        expertUserId: seat.expertUserId,
        seatNo: seat.seatNo,
        displayName: seat.displayName,
        status: seat.status,
      })),
    });

    const createdSeats = await tx.reviewDisplaySeat.findMany({
      where: { sessionId: createdSession.id },
      orderBy: { seatNo: "asc" },
      select: {
        id: true,
        seatNo: true,
        displayName: true,
        status: true,
        voidedAt: true,
      },
    });

    await createAuditLogEntry({
      tx,
      operator: user,
      action: "review_screen_session.token_generated",
      objectType: "review_screen_session",
      objectId: createdSession.id,
      teamGroupId: reviewPackage.teamGroupId,
      beforeState: null,
      afterState: {
        packageId: reviewPackage.id,
        projectReviewStageId: reviewPackage.projectReviewStageId,
        tokenExpiresAt,
        projectCount: projectOrderRows.length,
        seatCount: createdSeats.length,
      },
    });

    return { session: createdSession, seats: createdSeats };
  });

  const screenUrl = new URL(`/review-screen/session/${session.id}`, request.nextUrl.origin);
  screenUrl.searchParams.set("token", token);

  return NextResponse.json(
    {
      session: {
        ...session,
        startsAt: session.startsAt?.toISOString() ?? null,
        tokenExpiresAt: session.tokenExpiresAt.toISOString(),
        projectReviewStageType: "roadshow",
        screenDisplay: pickReviewScreenDisplaySettings(session),
      },
      seats: seats.map((seat) => ({
        ...seat,
        voidedAt: seat.voidedAt?.toISOString() ?? null,
      })),
      screenUrl: screenUrl.toString(),
      packageIds: stageReviewPackages.map((stagePackage) => stagePackage.id),
      projectOrder: projectOrderRows.map((row) => ({
        orderIndex: row.orderIndex,
        packageId: row.project.id,
        targetName: row.project.targetName,
        roundLabel: row.project.roundLabel ?? "",
        groupName: row.groupName,
        groupIndex: row.groupIndex,
        groupSlotIndex: row.groupSlotIndex,
        selfDrawnAt: screenDisplay.selfDrawEnabled ? null : now.toISOString(),
        revealedAt: null,
      })),
      projectReviewStageId: reviewPackage.projectReviewStageId,
      projectReviewStageType: "roadshow",
    },
    { status: 201 },
  );
}
