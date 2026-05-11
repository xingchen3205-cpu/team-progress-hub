import { NextRequest, NextResponse } from "next/server";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildRoadshowProjectOrderRows } from "@/lib/roadshow-screen-groups";

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
  const body = (await request.json().catch(() => null)) as
    | { packageIds?: string[]; roadshowGroupSizes?: number[] }
    | null;
  const packageIds = Array.isArray(body?.packageIds)
    ? body.packageIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim())
    : [];

  if (packageIds.length === 0) {
    return NextResponse.json({ message: "请提供路演顺序" }, { status: 400 });
  }

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      reviewPackage: {
        select: {
          id: true,
          teamGroupId: true,
          projectReviewStageId: true,
          targetName: true,
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

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  if (session.status !== "waiting" || session.screenPhase !== "draw" || session.startedAt) {
    return NextResponse.json({ message: "本轮已开始，不能调整路演顺序" }, { status: 409 });
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
          roundLabel: "",
          assignments: await prisma.expertReviewAssignment.findMany({
            where: { packageId: session.reviewPackage.id },
            select: {
              id: true,
              expertUserId: true,
            },
          }),
        },
      ];

  const packageById = new Map(stagePackages.map((stagePackage) => [stagePackage.id, stagePackage]));
  const uniquePackageIds = [...new Set(packageIds)];
  const expectedPackageIds = new Set(stagePackages.map((stagePackage) => stagePackage.id));
  const isSamePackageSet =
    uniquePackageIds.length === expectedPackageIds.size &&
    uniquePackageIds.every((packageId) => expectedPackageIds.has(packageId));

  if (!isSamePackageSet) {
    return NextResponse.json({ message: "路演顺序与本轮项目不匹配" }, { status: 400 });
  }

  const orderedPackages = uniquePackageIds
    .map((packageId) => packageById.get(packageId))
    .filter((stagePackage): stagePackage is (typeof stagePackages)[number] => Boolean(stagePackage));
  let projectOrderRows: ReturnType<typeof buildRoadshowProjectOrderRows<typeof orderedPackages[number]>>;
  try {
    projectOrderRows = buildRoadshowProjectOrderRows(orderedPackages, body?.roadshowGroupSizes);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "路演分组设置无效" },
      { status: 400 },
    );
  }
  const firstPackage = projectOrderRows[0]?.project ?? null;
  const orderedAt = new Date();
  const beforeOrder = toOrderAuditRows(session.projectOrders);
  const afterOrder = projectOrderRows.map((row) => ({
    packageId: row.project.id,
    orderIndex: row.orderIndex,
    groupName: row.groupName,
    groupIndex: row.groupIndex,
    groupSlotIndex: row.groupSlotIndex,
    targetName: row.project.targetName,
    roundLabel: row.project.roundLabel ?? null,
    selfDrawnAt: orderedAt.toISOString(),
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
        selfDrawnAt: orderedAt,
      })),
    });

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
      operator: user,
      action: "review_screen_session.order_updated",
      objectType: "review_screen_session",
      objectId: sessionId,
      teamGroupId: session.reviewPackage.teamGroupId,
      beforeState: {
        currentPackageId: session.currentPackageId,
        projectOrder: beforeOrder,
      },
      afterState: {
        currentPackageId: firstPackage?.id ?? session.packageId,
        projectOrder: afterOrder,
      },
      metadata: {
        method: "manual_order",
        projectCount: projectOrderRows.length,
        roadshowGroupSizes: body?.roadshowGroupSizes ?? null,
      },
    });

    return tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: {
        currentPackageId: firstPackage?.id ?? session.packageId,
        screenPhase: "draw",
        phaseStartedAt: null,
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
      selfDrawnAt: orderedAt.toISOString(),
      revealedAt: null,
    })),
  });
}
