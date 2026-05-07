import { NextRequest, NextResponse } from "next/server";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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
  const body = (await request.json().catch(() => null)) as { seatId?: string; reason?: string } | null;
  const seatId = body?.seatId?.trim();
  const reason = body?.reason?.trim() ?? "";

  if (!seatId) {
    return NextResponse.json({ message: "请选择要作废的专家席位" }, { status: 400 });
  }

  if (!reason) {
    return NextResponse.json({ message: "排除专家席位必须填写原因" }, { status: 400 });
  }

  const seat = await prisma.reviewDisplaySeat.findFirst({
    where: { id: seatId, sessionId },
    include: {
      session: {
        select: {
          reviewPackage: {
            select: {
              projectReviewStageId: true,
            },
          },
        },
      },
      assignment: {
        select: {
          packageId: true,
          score: { select: { id: true } },
        },
      },
    },
  });

  if (!seat) {
    return NextResponse.json({ message: "专家席位不存在" }, { status: 404 });
  }

  const stageScopedScore = await prisma.expertReviewAssignment.findFirst({
    where: {
      expertUserId: seat.expertUserId,
      reviewPackage: seat.session.reviewPackage.projectReviewStageId
        ? {
            projectReviewStageId: seat.session.reviewPackage.projectReviewStageId,
            status: "configured",
          }
        : {
            id: seat.assignment.packageId,
          },
      score: { isNot: null },
    },
    select: { id: true },
  });

  if (seat.assignment.score || stageScopedScore) {
    return NextResponse.json({ message: "该专家已有项目评分，不能排除整轮席位" }, { status: 409 });
  }

  const updatedSeat = await prisma.$transaction(async (tx) => {
    const excludedSeat = await tx.reviewDisplaySeat.update({
      where: { id: seat.id },
      data: {
        status: "excluded",
        voidedAt: new Date(),
        voidedById: user.id,
        voidReason: reason,
      },
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
      action: "review_display_seat.excluded",
      objectType: "review_display_seat",
      objectId: seat.id,
      beforeState: {
        status: seat.status,
        voidedAt: seat.voidedAt,
        voidedById: seat.voidedById,
        voidReason: seat.voidReason,
      },
      afterState: {
        status: "excluded",
        voidedAt: excludedSeat.voidedAt,
        voidedById: user.id,
        voidReason: reason,
      },
      reason,
    });

    return excludedSeat;
  });

  return NextResponse.json({
    seat: {
      ...updatedSeat,
      voidedAt: updatedSeat.voidedAt?.toISOString() ?? null,
    },
  });
}
