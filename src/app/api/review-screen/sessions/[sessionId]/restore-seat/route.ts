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
  const body = (await request.json().catch(() => null)) as { seatId?: string } | null;
  const seatId = body?.seatId?.trim();

  if (!seatId) {
    return NextResponse.json({ message: "请选择要恢复的专家席位" }, { status: 400 });
  }

  const seat = await prisma.reviewDisplaySeat.findFirst({
    where: { id: seatId, sessionId },
    select: {
      id: true,
      status: true,
    },
  });

  if (!seat) {
    return NextResponse.json({ message: "专家席位不存在" }, { status: 404 });
  }

  if (seat.status !== "voided" && seat.status !== "excluded") {
    return NextResponse.json({ message: "该专家席位无需恢复" }, { status: 409 });
  }

  const updatedSeat = await prisma.reviewDisplaySeat.update({
    where: { id: seat.id },
    data: {
      status: "pending",
      voidedAt: null,
      voidedById: null,
      voidReason: null,
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
