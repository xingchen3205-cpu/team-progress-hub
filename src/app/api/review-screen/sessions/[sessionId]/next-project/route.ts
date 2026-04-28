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
  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      projectOrders: {
        orderBy: { orderIndex: "asc" },
        select: {
          packageId: true,
          orderIndex: true,
          reviewPackage: {
            select: {
              targetName: true,
              assignments: {
                select: {
                  id: true,
                  expertUserId: true,
                },
              },
            },
          },
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

  if (!session.projectOrders || session.projectOrders.length === 0) {
    return NextResponse.json({ message: "请先生成路演顺序" }, { status: 400 });
  }

  const currentIndex = session.projectOrders.findIndex(
    (o: { packageId: string }) => o.packageId === session.currentPackageId,
  );
  const nextIndex = currentIndex + 1;

  if (nextIndex >= session.projectOrders.length) {
    const updated = await prisma.reviewDisplaySession.update({
      where: { id: sessionId },
      data: {
        screenPhase: "finished",
        phaseStartedAt: new Date(),
        status: "closed",
        endedAt: new Date(),
      },
      select: {
        id: true,
        screenPhase: true,
        currentPackageId: true,
        phaseStartedAt: true,
      },
    });
    return NextResponse.json({
      session: {
        ...updated,
        phaseStartedAt: updated.phaseStartedAt?.toISOString() ?? null,
      },
      hasNext: false,
    });
  }

  const nextPackage = session.projectOrders[nextIndex];

  const updated = await prisma.$transaction(async (tx) => {
    const assignmentByExpertId = new Map(
      nextPackage.reviewPackage.assignments.map((assignment) => [assignment.expertUserId, assignment.id]),
    );
    const seats = await tx.reviewDisplaySeat.findMany({
      where: { sessionId },
      select: {
        id: true,
        expertUserId: true,
      },
    });

    await Promise.all(
      seats.flatMap((seat) => {
        const assignmentId = assignmentByExpertId.get(seat.expertUserId);
        return assignmentId
          ? [
              tx.reviewDisplaySeat.update({
                where: { id: seat.id },
                data: { assignmentId },
              }),
            ]
          : [];
      }),
    );

    return tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: {
        currentPackageId: nextPackage.packageId,
        screenPhase: "presentation",
        phaseStartedAt: new Date(),
        revealStartedAt: null,
        status: "waiting",
        startedAt: null,
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
      ...updated,
      phaseStartedAt: updated.phaseStartedAt?.toISOString() ?? null,
    },
    hasNext: true,
    nextProject: {
      packageId: nextPackage.packageId,
      targetName: nextPackage.reviewPackage?.targetName ?? "",
      orderIndex: nextPackage.orderIndex,
    },
  });
}
