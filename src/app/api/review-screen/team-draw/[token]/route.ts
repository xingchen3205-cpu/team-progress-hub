import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashReviewScreenToken } from "@/lib/review-screen-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const sessionId = token?.trim();
  const screenToken = request.nextUrl.searchParams.get("token")?.trim();
  const user = await getSessionUser(request);

  if (!sessionId || !screenToken) {
    return NextResponse.json({ message: "缺少团队抽签入口参数" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ message: "请先登录团队账号" }, { status: 401 });
  }
  if (!user.teamGroupId) {
    return NextResponse.json({ message: "当前账号未绑定参赛团队，不能抽签" }, { status: 403 });
  }

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      tokenHash: true,
      status: true,
      screenPhase: true,
      startedAt: true,
      tokenExpiresAt: true,
      teamDrawEnabled: true,
    },
  });

  if (!session || session.tokenHash !== hashReviewScreenToken(screenToken)) {
    return NextResponse.json({ message: "团队抽签入口无效" }, { status: 404 });
  }

  const projectOrder = await prisma.reviewDisplayProjectOrder.findFirst({
    where: {
      sessionId,
      reviewPackage: {
        teamGroupId: user.teamGroupId,
      },
    },
    select: {
      packageId: true,
      orderIndex: true,
      selfDrawnAt: true,
      reviewPackage: {
        select: {
          targetName: true,
          roundLabel: true,
        },
      },
    },
  });

  if (!projectOrder) {
    return NextResponse.json({ message: "当前团队不在本轮抽签名单中" }, { status: 403 });
  }

  const now = new Date();
  const expired = session.tokenExpiresAt.getTime() <= now.getTime();

  return NextResponse.json({
    sessionId: session.id,
    packageId: projectOrder.packageId,
    targetName: projectOrder.reviewPackage.targetName,
    roundLabel: projectOrder.reviewPackage.roundLabel ?? "项目路演评审",
    tokenExpiresAt: session.tokenExpiresAt.toISOString(),
    usedAt: projectOrder.selfDrawnAt?.toISOString() ?? null,
    expired,
    canDraw:
      !expired &&
      session.teamDrawEnabled &&
      session.status === "waiting" &&
      session.screenPhase === "draw" &&
      !session.startedAt &&
      !projectOrder.selfDrawnAt,
    orderIndex: projectOrder.selfDrawnAt ? projectOrder.orderIndex : null,
    selfDrawnAt: projectOrder.selfDrawnAt?.toISOString() ?? null,
  });
}
