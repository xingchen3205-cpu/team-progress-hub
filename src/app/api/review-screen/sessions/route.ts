import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
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
        dropHighestCount?: number;
        dropLowestCount?: number;
        presentationSeconds?: number;
        qaSeconds?: number;
        scoringSeconds?: number;
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
  const stageAssignments = stageReviewPackages.flatMap((stagePackage) =>
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
  const dropHighestCount = clampInteger(body?.dropHighestCount, 1, 0, 5);
  const dropLowestCount = clampInteger(body?.dropLowestCount, 1, 0, 5);
  const presentationSeconds = clampInteger(body?.presentationSeconds, 480, 60, 1800);
  const qaSeconds = clampInteger(body?.qaSeconds, 420, 60, 1800);
  const scoringSeconds = clampInteger(body?.scoringSeconds, 60, 10, 600);
  const { token, tokenHash } = createReviewScreenToken();

  const { session, seats } = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.reviewDisplaySession.create({
      data: {
        packageId: reviewPackage.id,
        tokenHash,
        startsAt,
        tokenExpiresAt,
        countdownSeconds,
        dropHighestCount,
        dropLowestCount,
        presentationSeconds,
        qaSeconds,
        scoringSeconds,
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
        dropHighestCount: true,
        dropLowestCount: true,
        status: true,
        screenPhase: true,
        currentPackageId: true,
      },
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
      },
      seats: seats.map((seat) => ({
        ...seat,
        voidedAt: seat.voidedAt?.toISOString() ?? null,
      })),
      screenUrl: screenUrl.toString(),
      packageIds: stageReviewPackages.map((stagePackage) => stagePackage.id),
      projectReviewStageId: reviewPackage.projectReviewStageId,
      projectReviewStageType: "roadshow",
    },
    { status: 201 },
  );
}
