import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";

import { createAuditLogEntry } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { hashReviewScreenToken } from "@/lib/review-screen-session";

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
  if (!token) {
    return NextResponse.json({ message: "缺少访问令牌" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { packageId?: string } | null;
  const packageId = body?.packageId?.trim();
  if (!packageId) {
    return NextResponse.json({ message: "请选择要抽签的项目" }, { status: 400 });
  }

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
          teamGroupId: true,
        },
      },
      projectOrders: {
        orderBy: [{ selfDrawnAt: "asc" }, { groupIndex: "asc" }, { groupSlotIndex: "asc" }, { createdAt: "asc" }],
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

  if (!session || session.tokenHash !== hashReviewScreenToken(token)) {
    return NextResponse.json({ message: "链接无效" }, { status: 404 });
  }

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  if (!session.selfDrawEnabled) {
    return NextResponse.json({ message: "管理员未开启项目自助抽签" }, { status: 409 });
  }

  if (session.status !== "waiting" || session.screenPhase !== "draw" || session.startedAt) {
    return NextResponse.json({ message: "本轮已开始，不能继续自助抽签" }, { status: 409 });
  }

  const targetOrder = session.projectOrders.find((order) => order.packageId === packageId);
  if (!targetOrder) {
    return NextResponse.json({ message: "项目不在本轮路演顺序中" }, { status: 400 });
  }
  if (targetOrder.selfDrawnAt) {
    return NextResponse.json({ message: "该项目已完成抽签" }, { status: 409 });
  }
  if (session.currentPackageId !== packageId) {
    return NextResponse.json({ message: "请先在大屏上抽取上台项目，再抽取路演顺序" }, { status: 409 });
  }

  const remainingSlots = session.projectOrders.filter((order) => !order.selfDrawnAt);
  const remainingOrderIndexes = remainingSlots.map((order) => order.orderIndex);
  const pickedSlot = remainingSlots[randomInt(remainingSlots.length)] ?? targetOrder;
  const pickedOrderIndex = remainingOrderIndexes.includes(pickedSlot.orderIndex) ? pickedSlot.orderIndex : targetOrder.orderIndex;
  const restSlots = remainingSlots.filter((order) => order.packageId !== pickedSlot.packageId);
  const now = new Date();
  const undrawnOrders = session.projectOrders.filter((order) => !order.selfDrawnAt && order.packageId !== packageId);
  const beforeOrder = toOrderAuditRows(session.projectOrders);

  const updatedProjectOrder = await prisma.$transaction(async (tx) => {
    await tx.reviewDisplayProjectOrder.update({
      where: {
        sessionId_packageId: {
          sessionId,
          packageId,
        },
      },
      data: {
        orderIndex: pickedSlot.orderIndex,
        groupName: pickedSlot.groupName,
        groupIndex: pickedSlot.groupIndex,
        groupSlotIndex: pickedSlot.groupSlotIndex,
        selfDrawnAt: now,
      },
    });

    await Promise.all(
      undrawnOrders.map((order, index) =>
        tx.reviewDisplayProjectOrder.update({
          where: {
            sessionId_packageId: {
              sessionId,
              packageId: order.packageId,
            },
          },
          data: {
            orderIndex: restSlots[index]?.orderIndex ?? order.orderIndex,
            groupName: restSlots[index]?.groupName ?? order.groupName,
            groupIndex: restSlots[index]?.groupIndex ?? order.groupIndex,
            groupSlotIndex: restSlots[index]?.groupSlotIndex ?? order.groupSlotIndex,
          },
        }),
      ),
    );

    const rows = await tx.reviewDisplayProjectOrder.findMany({
      where: { sessionId },
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
    });

    const nextCurrentPackageId = rows.some((order) => !order.selfDrawnAt)
      ? null
      : rows[0]?.packageId ?? null;
    await tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: { currentPackageId: nextCurrentPackageId },
    });

    await createAuditLogEntry({
      tx,
      operator: session.creator,
      action: "review_screen_session.self_drawn",
      objectType: "review_screen_session",
      objectId: sessionId,
      teamGroupId: session.reviewPackage.teamGroupId,
      beforeState: {
        currentPackageId: session.currentPackageId,
        projectOrder: beforeOrder,
      },
      afterState: {
        currentPackageId: nextCurrentPackageId,
        projectOrder: toOrderAuditRows(rows),
      },
      metadata: {
        triggeredBy: "screen_token",
        method: "screen_self_draw",
        drawnPackageId: packageId,
        pickedOrderIndex,
        projectCount: rows.length,
      },
    });

    return rows;
  });
  const nextCurrentPackageId = updatedProjectOrder.some((order) => !order.selfDrawnAt)
    ? null
    : updatedProjectOrder[0]?.packageId ?? null;

  return NextResponse.json({
    drawnPackageId: packageId,
    pickedOrderIndex,
    remainingCount: updatedProjectOrder.filter((order) => !order.selfDrawnAt).length,
    session: {
      currentPackageId: nextCurrentPackageId,
    },
    projectOrder: updatedProjectOrder.map((order) => ({
      orderIndex: order.orderIndex,
      packageId: order.packageId,
      targetName: order.reviewPackage.targetName,
      roundLabel: order.reviewPackage.roundLabel ?? "",
      groupName: order.groupName,
      groupIndex: order.groupIndex,
      groupSlotIndex: order.groupSlotIndex,
      selfDrawnAt: order.selfDrawnAt?.toISOString() ?? null,
      revealedAt: order.revealedAt?.toISOString() ?? null,
    })),
  });
}
