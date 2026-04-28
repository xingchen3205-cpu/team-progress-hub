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
  const body = (await request.json().catch(() => null)) as { packageIds?: string[] } | null;
  const packageIds = Array.isArray(body?.packageIds)
    ? body.packageIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim())
    : [];

  if (packageIds.length === 0) {
    return NextResponse.json({ message: "请提供路演顺序" }, { status: 400 });
  }

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

  if (session.status !== "waiting" || session.screenPhase !== "draw" || session.startedAt) {
    return NextResponse.json({ message: "本轮已开始，不能调整路演顺序" }, { status: 409 });
  }

  const stagePackages = session.reviewPackage.projectReviewStageId
    ? await prisma.expertReviewPackage.findMany({
        where: {
          projectReviewStageId: session.reviewPackage.projectReviewStageId,
          status: "configured",
        },
        select: {
          id: true,
          targetName: true,
          roundLabel: true,
          assignments: {
            select: {
              id: true,
              expertUserId: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [
        {
          ...session.reviewPackage,
          roundLabel: "",
          assignments: await prisma.expertReviewAssignment.findMany({
            where: { packageId: session.reviewPackage.id },
            select: {
              id: true,
              expertUserId: true,
            },
          }),
        },
      ];

  const packageById = new Map(stagePackages.map((stagePackage) => [stagePackage.id, stagePackage]));
  const uniquePackageIds = [...new Set(packageIds)];
  const expectedPackageIds = new Set(stagePackages.map((stagePackage) => stagePackage.id));
  const isSamePackageSet =
    uniquePackageIds.length === expectedPackageIds.size &&
    uniquePackageIds.every((packageId) => expectedPackageIds.has(packageId));

  if (!isSamePackageSet) {
    return NextResponse.json({ message: "路演顺序与本轮项目不匹配" }, { status: 400 });
  }

  const orderedPackages = uniquePackageIds
    .map((packageId) => packageById.get(packageId))
    .filter((stagePackage): stagePackage is (typeof stagePackages)[number] => Boolean(stagePackage));
  const firstPackage = orderedPackages[0] ?? null;

  const updatedSession = await prisma.$transaction(async (tx) => {
    await tx.reviewDisplayProjectOrder.deleteMany({
      where: { sessionId },
    });

    await tx.reviewDisplayProjectOrder.createMany({
      data: orderedPackages.map((stagePackage, index) => ({
        sessionId,
        packageId: stagePackage.id,
        orderIndex: index,
      })),
    });

    if (firstPackage) {
      const assignmentByExpertId = new Map(
        firstPackage.assignments.map((assignment) => [assignment.expertUserId, assignment.id]),
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
    }

    return tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: {
        currentPackageId: firstPackage?.id ?? session.packageId,
        screenPhase: "draw",
        phaseStartedAt: null,
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
    projectOrder: orderedPackages.map((stagePackage, index) => ({
      orderIndex: index,
      packageId: stagePackage.id,
      targetName: stagePackage.targetName,
      roundLabel: stagePackage.roundLabel ?? "",
      revealedAt: null,
    })),
  });
}
