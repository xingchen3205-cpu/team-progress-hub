import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
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

type ProjectOrderRow = {
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
    teamGroupId: string | null;
  };
};

const toOrderAuditRows = (rows: ProjectOrderRow[]): OrderAuditRow[] =>
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

const serializeProjectOrder = (rows: ProjectOrderRow[]) =>
  rows.map((order) => ({
    orderIndex: order.orderIndex,
    packageId: order.packageId,
    targetName: order.reviewPackage.targetName,
    roundLabel: order.reviewPackage.roundLabel ?? "",
    groupName: order.groupName,
    groupIndex: order.groupIndex,
    groupSlotIndex: order.groupSlotIndex,
    selfDrawnAt: order.selfDrawnAt?.toISOString() ?? null,
    revealedAt: order.revealedAt?.toISOString() ?? null,
  }));

const parseTeamDrawQueue = (value: string | null | undefined) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => Number.isInteger(item) && item >= 0)
      : [];
  } catch {
    return [];
  }
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const user = await getSessionUser(request);

  if (!token) {
    return NextResponse.json({ message: "缺少团队抽签入口参数" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ message: "请先登录团队账号" }, { status: 401 });
  }
  if (!user.teamGroupId) {
    return NextResponse.json({ message: "当前账号未绑定参赛团队，不能抽签" }, { status: 403 });
  }

  const now = new Date();
  let pickedOrderIndex = 0;

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.reviewDisplaySession.findUnique({
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
                teamGroupId: true,
              },
            },
          },
        },
      },
    });

    if (!session || session.tokenHash !== hashReviewScreenToken(token)) {
      throw new Error("团队抽签入口无效");
    }
    if (!session.teamDrawEnabled) {
      throw new Error("管理员未开启团队线上抽签");
    }
    if (session.tokenExpiresAt.getTime() <= now.getTime()) {
      throw new Error("大屏会话已过期");
    }
    if (session.status !== "waiting" || session.screenPhase !== "draw" || session.startedAt) {
      throw new Error("本轮已开始，不能继续团队抽签");
    }

    const targetOrder = session.projectOrders.find((order) => order.reviewPackage.teamGroupId === user.teamGroupId);
    if (!targetOrder) {
      throw new Error("当前团队不在本轮抽签名单中");
    }
    if (targetOrder.selfDrawnAt) {
      throw new Error("该团队已完成抽签");
    }

    const pendingOrders = session.projectOrders.filter((order) => !order.selfDrawnAt);
    const availableOrderIndexes = pendingOrders.map((order) => order.orderIndex);
    if (!availableOrderIndexes.length) {
      throw new Error("全部团队已完成抽签");
    }
    if (new Set(availableOrderIndexes).size !== availableOrderIndexes.length) {
      throw new Error("路演顺序数据异常，请重新生成抽签顺序");
    }

    const drawnCount = session.projectOrders.length - pendingOrders.length;
    const availableOrderIndexSet = new Set(availableOrderIndexes);
    const queuedOrderIndexes = parseTeamDrawQueue(session.teamDrawQueue).filter((orderIndex) =>
      availableOrderIndexSet.has(orderIndex),
    );
    pickedOrderIndex =
      queuedOrderIndexes[0] ??
      availableOrderIndexes[randomInt(availableOrderIndexes.length)] ??
      targetOrder.orderIndex;
    const pickedSlot = pendingOrders.find((order) => order.orderIndex === pickedOrderIndex) ?? targetOrder;
    const beforeOrder = toOrderAuditRows(session.projectOrders);

    if (pickedSlot.packageId !== targetOrder.packageId) {
      await tx.reviewDisplayProjectOrder.update({
        where: {
          sessionId_packageId: {
            sessionId,
            packageId: targetOrder.packageId,
          },
        },
        data: {
          orderIndex: -1 - session.projectOrders.length - targetOrder.orderIndex,
        },
      });

      await tx.reviewDisplayProjectOrder.update({
        where: {
          sessionId_packageId: {
            sessionId,
            packageId: pickedSlot.packageId,
          },
        },
        data: {
          orderIndex: targetOrder.orderIndex,
          groupName: targetOrder.groupName,
          groupIndex: targetOrder.groupIndex,
          groupSlotIndex: targetOrder.groupSlotIndex,
        },
      });
    }

    await tx.reviewDisplayProjectOrder.update({
      where: {
        sessionId_packageId: {
          sessionId,
          packageId: targetOrder.packageId,
        },
      },
      data: {
        orderIndex: pickedOrderIndex,
        groupName: pickedSlot.groupName,
        groupIndex: pickedSlot.groupIndex,
        groupSlotIndex: pickedSlot.groupSlotIndex,
        selfDrawnAt: now,
      },
    });

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
            teamGroupId: true,
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
      action: "review_screen_session.team_drawn",
      objectType: "review_screen_session",
      objectId: sessionId,
      teamGroupId: user.teamGroupId,
      beforeState: {
        projectOrder: beforeOrder,
        usedAt: null,
      },
      afterState: {
        currentPackageId: nextCurrentPackageId,
        projectOrder: toOrderAuditRows(rows),
        usedAt: now.toISOString(),
      },
      metadata: {
        triggeredBy: "team_link",
        method: "team_login_first_come",
        drawnByUserId: user.id,
        drawnTeamGroupId: user.teamGroupId,
        drawnPackageId: targetOrder.packageId,
        drawnCount,
        pickedOrderIndex,
        projectCount: rows.length,
      },
    });

    const confirmedOrder = rows.find((order) => order.packageId === targetOrder.packageId);
    return {
      drawnPackageId: targetOrder.packageId,
      targetName: targetOrder.reviewPackage.targetName,
      roundLabel: targetOrder.reviewPackage.roundLabel ?? "",
      pickedOrderIndex,
      remainingCount: rows.filter((order) => !order.selfDrawnAt).length,
      session: {
        currentPackageId: nextCurrentPackageId,
      },
      confirmedOrder: confirmedOrder
        ? {
            orderIndex: confirmedOrder.orderIndex,
            packageId: confirmedOrder.packageId,
            targetName: confirmedOrder.reviewPackage.targetName,
            roundLabel: confirmedOrder.reviewPackage.roundLabel ?? "",
            groupName: confirmedOrder.groupName,
            groupIndex: confirmedOrder.groupIndex,
            groupSlotIndex: confirmedOrder.groupSlotIndex,
            selfDrawnAt: confirmedOrder.selfDrawnAt?.toISOString() ?? null,
            revealedAt: confirmedOrder.revealedAt?.toISOString() ?? null,
          }
        : null,
      projectOrder: serializeProjectOrder(rows),
    };
  }).catch((error: unknown) =>
    error instanceof Error ? error : new Error("团队抽签失败，请刷新后重试"),
  );

  if (result instanceof Error) {
    return NextResponse.json({ message: result.message }, { status: 409 });
  }

  return NextResponse.json(result);
}
