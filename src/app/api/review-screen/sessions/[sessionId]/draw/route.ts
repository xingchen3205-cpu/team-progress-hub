import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildRoadshowProjectOrderRows } from "@/lib/roadshow-screen-groups";
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
  const body = (await request.json().catch(() => null)) as { roadshowGroupSizes?: number[] } | null;

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      reviewPackage: {
        select: {
          id: true,
          projectReviewStageId: true,
          targetName: true,
          roundLabel: true,
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
    return NextResponse.json({ message: "本轮已开始，不能重新抽签" }, { status: 409 });
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
          assignments: await prisma.expertReviewAssignment.findMany({
            where: { packageId: session.reviewPackage.id },
            select: {
              id: true,
              expertUserId: true,
            },
          }),
        },
      ];

  if (stagePackages.length === 0) {
    return NextResponse.json({ message: "没有可抽签的项目" }, { status: 400 });
  }

  const shuffled = shuffleArray(stagePackages);
  let projectOrderRows: ReturnType<typeof buildRoadshowProjectOrderRows<typeof shuffled[number]>>;
  try {
    projectOrderRows = buildRoadshowProjectOrderRows(shuffled, body?.roadshowGroupSizes);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "路演分组设置无效" },
      { status: 400 },
    );
  }
  const firstPackageId = projectOrderRows[0]?.project.id ?? null;

  const updatedSession = await prisma.$transaction(async (tx) => {
    await tx.reviewDisplayProjectOrder.deleteMany({
      where: { sessionId },
    });

    await tx.reviewDisplayProjectOrder.createMany({
      data: projectOrderRows.map((row) => ({
        sessionId,
        packageId: row.project.id,
        orderIndex: row.orderIndex,
        groupName: row.groupName,
        groupIndex: row.groupIndex,
        groupSlotIndex: row.groupSlotIndex,
      })),
    });

    const firstPackage = projectOrderRows[0]?.project;
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
    projectOrder: projectOrderRows.map((row) => ({
      orderIndex: row.orderIndex,
      packageId: row.project.id,
      targetName: row.project.targetName,
      roundLabel: row.project.roundLabel ?? "",
      groupName: row.groupName,
      groupIndex: row.groupIndex,
      groupSlotIndex: row.groupSlotIndex,
      revealedAt: null,
    })),
  });
}
