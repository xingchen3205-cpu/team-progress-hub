import { NextRequest, NextResponse } from "next/server";

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

  if (!seatId) {
    return NextResponse.json({ message: "请选择要作废的专家席位" }, { status: 400 });
  }

  const seat = await prisma.reviewDisplaySeat.findFirst({
    where: { id: seatId, sessionId },
    include: {
      assignment: {
        select: {
          score: { select: { id: true } },
        },
      },
    },
  });

  if (!seat) {
    return NextResponse.json({ message: "专家席位不存在" }, { status: 404 });
  }

  if (seat.assignment.score) {
    return NextResponse.json({ message: "该专家已提交评分，不能作废席位" }, { status: 409 });
  }

  const updatedSeat = await prisma.reviewDisplaySeat.update({
    where: { id: seat.id },
    data: {
      status: "voided",
      voidedAt: new Date(),
      voidedById: user.id,
      voidReason: body?.reason?.trim() || null,
    },
    select: {
      id: true,
      seatNo: true,
      displayName: true,
      status: true,
      voidedAt: true,
    },
  });

  return NextResponse.json({
    seat: {
      ...updatedSeat,
      voidedAt: updatedSeat.voidedAt?.toISOString() ?? null,
    },
  });
}
