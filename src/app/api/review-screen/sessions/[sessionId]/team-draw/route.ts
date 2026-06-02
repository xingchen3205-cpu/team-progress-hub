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

const serializeProjectOrder = (
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
) =>
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const token = request.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ message: "缺少团队抽签令牌" }, { status: 401 });
  }

  const tokenHash = hashReviewScreenToken(token);
  const now = new Date();
  let pickedOrderIndex = 0;

  const result = await prisma.$transaction(async (tx) => {
    const drawToken = await tx.reviewDisplayTeamDrawToken.findUnique({
      where: { tokenHash },
      include: {
        reviewPackage: {
          select: {
            id: true,
            targetName: true,
            roundLabel: true,
          },
        },
        session: {
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
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!drawToken || drawToken.sessionId !== sessionId) {
      throw new Error("团队抽签链接无效");
    }
    if (drawToken.tokenExpiresAt.getTime() <= now.getTime()) {
      throw new Error("团队抽签链接已过期");
    }
    if (drawToken.usedAt) {
      throw new Error("该团队已完成抽签");
    }

    const { session } = drawToken;
    if (!session.teamDrawEnabled) {
      throw new Error("管理员未开启团队线上抽签");
    }
    if (session.tokenExpiresAt.getTime() <= now.getTime()) {
      throw new Error("大屏会话已过期");
    }
    if (session.status !== "waiting" || session.screenPhase !== "draw" || session.startedAt) {
      throw new Error("本轮已开始，不能继续团队抽签");
    }

    const targetOrder = session.projectOrders.find((order) => order.packageId === drawToken.packageId);
    if (!targetOrder) {
      throw new Error("项目不在本轮路演顺序中");
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

    pickedOrderIndex = availableOrderIndexes[randomInt(availableOrderIndexes.length)] ?? targetOrder.orderIndex;
    const pickedSlot = pendingOrders.find((order) => order.orderIndex === pickedOrderIndex) ?? targetOrder;
    const beforeOrder = toOrderAuditRows(session.projectOrders);

    if (pickedSlot.packageId !== drawToken.packageId) {
      await tx.reviewDisplayProjectOrder.update({
        where: {
          sessionId_packageId: {
            sessionId,
            packageId: drawToken.packageId,
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
          packageId: drawToken.packageId,
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

    await tx.reviewDisplayTeamDrawToken.update({
      where: { id: drawToken.id },
      data: { usedAt: now },
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
      teamGroupId: session.reviewPackage.teamGroupId,
      beforeState: {
        projectOrder: beforeOrder,
        tokenUsedAt: null,
      },
      afterState: {
        currentPackageId: nextCurrentPackageId,
        projectOrder: toOrderAuditRows(rows),
        tokenUsedAt: now.toISOString(),
      },
      metadata: {
        triggeredBy: "team_link",
        method: "team_wechat_link",
        drawnPackageId: drawToken.packageId,
        pickedOrderIndex,
        projectCount: rows.length,
      },
    });

    const confirmedOrder = rows.find((order) => order.packageId === drawToken.packageId);
    return {
      drawnPackageId: drawToken.packageId,
      targetName: drawToken.reviewPackage.targetName,
      roundLabel: drawToken.reviewPackage.roundLabel ?? "",
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
