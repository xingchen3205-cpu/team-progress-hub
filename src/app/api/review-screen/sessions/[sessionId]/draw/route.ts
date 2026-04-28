import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { shuffleArray } from "@/lib/review-screen-session";

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

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      reviewPackage: {
        select: {
          id: true,
          projectReviewStageId: true,
          targetName: true,
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ message: "大屏会话不存在" }, { status: 404 });
  }

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  const stagePackages = session.reviewPackage.projectReviewStageId
    ? await prisma.expertReviewPackage.findMany({
        where: {
          projectReviewStageId: session.reviewPackage.projectReviewStageId,
          status: "configured",
        },
        select: { id: true, targetName: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [session.reviewPackage];

  if (stagePackages.length === 0) {
    return NextResponse.json({ message: "没有可抽签的项目" }, { status: 400 });
  }

  const shuffled = shuffleArray(stagePackages);
  const firstPackageId = shuffled[0]?.id ?? null;

  const updatedSession = await prisma.$transaction(async (tx) => {
    await tx.reviewDisplayProjectOrder.deleteMany({
      where: { sessionId },
    });

    await tx.reviewDisplayProjectOrder.createMany({
      data: shuffled.map((pkg, index) => ({
        sessionId,
        packageId: pkg.id,
        orderIndex: index,
      })),
    });

    return tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: {
        screenPhase: "draw",
        currentPackageId: firstPackageId,
        phaseStartedAt: new Date(),
        revealStartedAt: null,
      },
      select: {
        id: true,
        screenPhase: true,
        currentPackageId: true,
        phaseStartedAt: true,
      },
    });
  });

  return NextResponse.json({
    session: {
      ...updatedSession,
      phaseStartedAt: updatedSession.phaseStartedAt?.toISOString() ?? null,
    },
    drawOrder: shuffled.map((pkg, index) => ({
      orderIndex: index,
      packageId: pkg.id,
      targetName: pkg.targetName,
    })),
  });
}
