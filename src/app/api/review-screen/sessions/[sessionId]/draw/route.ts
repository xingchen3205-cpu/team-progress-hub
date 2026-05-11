import { NextRequest, NextResponse } from "next/server";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildRoadshowProjectOrderRows } from "@/lib/roadshow-screen-groups";
import { hashReviewScreenToken, shuffleArray } from "@/lib/review-screen-session";

type OrderAuditRow = {
  packageId: string;
  orderIndex: number;
  groupName: string | null;
  groupIndex: number;
  groupSlotIndex: number;
  targetName: string;
  roundLabel: string | null;
  selfDrawnAt: string | null;
  revealedAt: string | null;
};

const toOrderAuditRows = (
  rows: Array<{
    packageId: string;
    orderIndex: number;
    groupName: string | null;
    groupIndex: number;
    groupSlotIndex: number;
    selfDrawnAt: Date | null;
    revealedAt: Date | null;
    reviewPackage: {
      targetName: string;
      roundLabel: string | null;
    };
  }>,
): OrderAuditRow[] =>
  rows.map((row) => ({
    packageId: row.packageId,
    orderIndex: row.orderIndex,
    groupName: row.groupName,
    groupIndex: row.groupIndex,
    groupSlotIndex: row.groupSlotIndex,
    targetName: row.reviewPackage.targetName,
    roundLabel: row.reviewPackage.roundLabel,
    selfDrawnAt: row.selfDrawnAt?.toISOString() ?? null,
    revealedAt: row.revealedAt?.toISOString() ?? null,
  }));

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const user = await getSessionUser(request);
  const body = (await request.json().catch(() => null)) as { roadshowGroupSizes?: number[] } | null;

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      creator: {
        select: {
          id: true,
          role: true,
        },
      },
      reviewPackage: {
        select: {
          id: true,
          teamGroupId: true,
          projectReviewStageId: true,
          targetName: true,
          roundLabel: true,
        },
      },
      projectOrders: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: {
          packageId: true,
          orderIndex: true,
          groupName: true,
          groupIndex: true,
          groupSlotIndex: true,
          selfDrawnAt: true,
          revealedAt: true,
          reviewPackage: {
            select: {
              targetName: true,
              roundLabel: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ message: "大屏会话不存在" }, { status: 404 });
  }

  const tokenAuthorized = Boolean(token && session.tokenHash === hashReviewScreenToken(token));
  if (!tokenAuthorized) {
    return NextResponse.json({ message: "链接无效" }, { status: 404 });
  }
  if (!user) {
    return NextResponse.json({ message: "请使用管理员账号打开大屏后再操作" }, { status: 401 });
  }
  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  const operator = user;

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  if (session.status !== "waiting" || session.screenPhase !== "draw" || session.startedAt) {
    return NextResponse.json({ message: "本轮已开始，不能重新抽签" }, { status: 409 });
  }

  const stagePackages = session.reviewPackage.projectReviewStageId
    ? await prisma.expertReviewPackage.findMany({
        where: {
          projectReviewStageId: session.reviewPackage.projectReviewStageId,
          status: "configured",
        },
        select: {
          id: true,
          targetName: true,
          roundLabel: true,
          assignments: {
            select: {
              id: true,
              expertUserId: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [
        {
          ...session.reviewPackage,
          assignments: await prisma.expertReviewAssignment.findMany({
            where: { packageId: session.reviewPackage.id },
            select: {
              id: true,
              expertUserId: true,
            },
          }),
        },
      ];

  if (stagePackages.length === 0) {
    return NextResponse.json({ message: "没有可抽签的项目" }, { status: 400 });
  }

  const shuffled = shuffleArray(stagePackages);
  const sameAsOriginalOrder =
    shuffled.length > 1 && shuffled.every((project, index) => project.id === stagePackages[index]?.id);
  const randomizedStagePackages = sameAsOriginalOrder ? [...shuffled.slice(1), shuffled[0]] : shuffled;
  let projectOrderRows: ReturnType<typeof buildRoadshowProjectOrderRows<typeof randomizedStagePackages[number]>>;
  try {
    projectOrderRows = buildRoadshowProjectOrderRows(randomizedStagePackages, body?.roadshowGroupSizes);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "路演分组设置无效" },
      { status: 400 },
    );
  }
  const firstPackageId = projectOrderRows[0]?.project.id ?? null;
  const drawnAt = new Date();
  const beforeOrder = toOrderAuditRows(session.projectOrders);
  const afterOrder = projectOrderRows.map((row) => ({
    packageId: row.project.id,
    orderIndex: row.orderIndex,
    groupName: row.groupName,
    groupIndex: row.groupIndex,
    groupSlotIndex: row.groupSlotIndex,
    targetName: row.project.targetName,
    roundLabel: row.project.roundLabel ?? null,
    selfDrawnAt: drawnAt.toISOString(),
    revealedAt: null,
  }));

  const updatedSession = await prisma.$transaction(async (tx) => {
    await tx.reviewDisplayProjectOrder.deleteMany({
      where: { sessionId },
    });

    await tx.reviewDisplayProjectOrder.createMany({
      data: projectOrderRows.map((row) => ({
        sessionId,
        packageId: row.project.id,
        orderIndex: row.orderIndex,
        groupName: row.groupName,
        groupIndex: row.groupIndex,
        groupSlotIndex: row.groupSlotIndex,
        selfDrawnAt: drawnAt,
      })),
    });

    const firstPackage = projectOrderRows[0]?.project;
    if (firstPackage) {
      const assignmentByExpertId = new Map(
        firstPackage.assignments.map((assignment) => [assignment.expertUserId, assignment.id]),
      );
      const seats = await tx.reviewDisplaySeat.findMany({
        where: { sessionId },
        select: {
          id: true,
          expertUserId: true,
        },
      });

      await Promise.all(
        seats.flatMap((seat) => {
          const assignmentId = assignmentByExpertId.get(seat.expertUserId);
          return assignmentId
            ? [
                tx.reviewDisplaySeat.update({
                  where: { id: seat.id },
                  data: { assignmentId },
                }),
              ]
            : [];
        }),
      );
    }

    await createAuditLogEntry({
      tx,
      operator,
      action: "review_screen_session.random_drawn",
      objectType: "review_screen_session",
      objectId: sessionId,
      teamGroupId: session.reviewPackage.teamGroupId,
      beforeState: {
        currentPackageId: session.currentPackageId,
        projectOrder: beforeOrder,
      },
      afterState: {
        currentPackageId: firstPackageId,
        projectOrder: afterOrder,
      },
      metadata: {
        method: "crypto.randomInt Fisher-Yates",
        projectCount: projectOrderRows.length,
        originalOrderAvoided: sameAsOriginalOrder,
        roadshowGroupSizes: body?.roadshowGroupSizes ?? null,
      },
    });

    return tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: {
        screenPhase: "draw",
        currentPackageId: firstPackageId,
        phaseStartedAt: new Date(),
        revealStartedAt: null,
      },
      select: {
        id: true,
        screenPhase: true,
        currentPackageId: true,
        phaseStartedAt: true,
      },
    });
  });

  return NextResponse.json({
    session: {
      ...updatedSession,
      phaseStartedAt: updatedSession.phaseStartedAt?.toISOString() ?? null,
    },
    projectOrder: projectOrderRows.map((row) => ({
      orderIndex: row.orderIndex,
      packageId: row.project.id,
      targetName: row.project.targetName,
      roundLabel: row.project.roundLabel ?? "",
      groupName: row.groupName,
      groupIndex: row.groupIndex,
      groupSlotIndex: row.groupSlotIndex,
      selfDrawnAt: drawnAt.toISOString(),
      revealedAt: null,
    })),
  });
}
