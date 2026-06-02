import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { hashReviewScreenToken } from "@/lib/review-screen-session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const normalizedToken = token?.trim();

  if (!normalizedToken) {
    return NextResponse.json({ message: "缺少团队抽签令牌" }, { status: 401 });
  }

  const drawToken = await prisma.reviewDisplayTeamDrawToken.findUnique({
    where: { tokenHash: hashReviewScreenToken(normalizedToken) },
    include: {
      reviewPackage: {
        select: {
          id: true,
          targetName: true,
          roundLabel: true,
        },
      },
      session: {
        select: {
          id: true,
          status: true,
          screenPhase: true,
          startedAt: true,
          tokenExpiresAt: true,
          teamDrawEnabled: true,
        },
      },
    },
  });

  if (!drawToken) {
    return NextResponse.json({ message: "团队抽签链接无效" }, { status: 404 });
  }

  const projectOrder = await prisma.reviewDisplayProjectOrder.findUnique({
    where: {
      sessionId_packageId: {
        sessionId: drawToken.sessionId,
        packageId: drawToken.packageId,
      },
    },
    select: {
      orderIndex: true,
      selfDrawnAt: true,
    },
  });

  const now = new Date();
  const expired =
    drawToken.tokenExpiresAt.getTime() <= now.getTime() ||
    drawToken.session.tokenExpiresAt.getTime() <= now.getTime();

  return NextResponse.json({
    sessionId: drawToken.sessionId,
    packageId: drawToken.packageId,
    targetName: drawToken.reviewPackage.targetName,
    roundLabel: drawToken.reviewPackage.roundLabel ?? "项目路演评审",
    tokenExpiresAt: drawToken.tokenExpiresAt.toISOString(),
    usedAt: drawToken.usedAt?.toISOString() ?? null,
    expired,
    canDraw:
      !expired &&
      !drawToken.usedAt &&
      drawToken.session.teamDrawEnabled &&
      drawToken.session.status === "waiting" &&
      drawToken.session.screenPhase === "draw" &&
      !drawToken.session.startedAt &&
      !projectOrder?.selfDrawnAt,
    orderIndex: projectOrder?.selfDrawnAt ? projectOrder.orderIndex : null,
    selfDrawnAt: projectOrder?.selfDrawnAt?.toISOString() ?? null,
  });
}
