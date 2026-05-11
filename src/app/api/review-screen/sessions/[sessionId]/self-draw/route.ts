import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
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
  const user = await getSessionUser(request);
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
  if (!user) {
    return NextResponse.json({ message: "请使用管理员账号打开大屏后再操作" }, { status: 401 });
  }
  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
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

  const now = new Date();
  let pickedOrderIndex = targetOrder.orderIndex;

  const updatedProjectOrderOrError = await prisma.$transaction(async (tx) => {
    const freshSession = await tx.reviewDisplaySession.findUnique({
      where: { id: sessionId },
      include: {
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

    if (!freshSession || freshSession.currentPackageId !== packageId) {
      throw new Error("请先在大屏上抽取上台项目，再抽取路演顺序");
    }
    if (freshSession.status !== "waiting" || freshSession.screenPhase !== "draw" || freshSession.startedAt) {
      throw new Error("本轮已开始，不能继续自助抽签");
    }

    const freshTargetOrder = freshSession.projectOrders.find((order) => order.packageId === packageId);
    if (!freshTargetOrder || freshTargetOrder.selfDrawnAt) {
      throw new Error("该项目已完成抽签");
    }

    const pendingOrders = freshSession.projectOrders.filter((order) => !order.selfDrawnAt);
    const availableOrderIndexes = pendingOrders.map((order) => order.orderIndex);
    if (new Set(availableOrderIndexes).size !== availableOrderIndexes.length) {
      throw new Error("路演顺序数据异常，请重新生成抽签顺序");
    }

    pickedOrderIndex = availableOrderIndexes[randomInt(availableOrderIndexes.length)] ?? freshTargetOrder.orderIndex;
    const pickedSlot = pendingOrders.find((order) => order.orderIndex === pickedOrderIndex) ?? freshTargetOrder;
    const beforeOrder = toOrderAuditRows(freshSession.projectOrders);

    if (pickedSlot.packageId !== packageId) {
      await tx.reviewDisplayProjectOrder.update({
        where: {
          sessionId_packageId: {
            sessionId,
            packageId,
          },
        },
        data: {
          orderIndex: -1 - freshSession.projectOrders.length - freshTargetOrder.orderIndex,
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
          orderIndex: freshTargetOrder.orderIndex,
          groupName: freshTargetOrder.groupName,
          groupIndex: freshTargetOrder.groupIndex,
          groupSlotIndex: freshTargetOrder.groupSlotIndex,
        },
      });
    }

    await tx.reviewDisplayProjectOrder.update({
      where: {
        sessionId_packageId: {
          sessionId,
          packageId,
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
      operator: user,
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
        triggeredBy: "admin_screen",
        method: "screen_self_draw",
        drawnPackageId: packageId,
        pickedOrderIndex,
        projectCount: rows.length,
      },
    });

    return rows;
  }).catch((error: unknown) =>
    error instanceof Error ? error : new Error("抽签失败，请刷新后重试"),
  );

  if (updatedProjectOrderOrError instanceof Error) {
    return NextResponse.json({ message: updatedProjectOrderOrError.message }, { status: 409 });
  }
  const updatedProjectOrder = updatedProjectOrderOrError;

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
