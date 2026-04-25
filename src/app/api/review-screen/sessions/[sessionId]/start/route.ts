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
  const body = (await request.json().catch(() => null)) as { countdownSeconds?: number } | null;
  const countdownSeconds = typeof body?.countdownSeconds === "number"
    ? Math.min(600, Math.max(10, Math.trunc(body.countdownSeconds)))
    : undefined;
  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    select: { id: true, tokenExpiresAt: true },
  });

  if (!session) {
    return NextResponse.json({ message: "大屏会话不存在" }, { status: 404 });
  }

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  const updatedSession = await prisma.reviewDisplaySession.update({
    where: { id: session.id },
    data: {
      status: "scoring",
      startedAt: new Date(),
      ...(countdownSeconds ? { countdownSeconds } : {}),
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      countdownSeconds: true,
    },
  });

  return NextResponse.json({
    session: {
      ...updatedSession,
      startedAt: updatedSession.startedAt?.toISOString() ?? null,
    },
  });
}
