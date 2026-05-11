import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";

import { createAuditLogEntry } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { hashReviewScreenToken } from "@/lib/review-screen-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const user = await getSessionUser(request);
  if (!token) {
    return NextResponse.json({ message: "缺少访问令牌" }, { status: 401 });
  }

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    include: {
      creator: {
        select: {
          id: true,
          role: true,
        },
      },
      reviewPackage: {
        select: {
          teamGroupId: true,
        },
      },
      projectOrders: {
        orderBy: [{ groupIndex: "asc" }, { groupSlotIndex: "asc" }, { createdAt: "asc" }],
        select: {
          packageId: true,
          orderIndex: true,
          groupName: true,
          groupIndex: true,
          groupSlotIndex: true,
          selfDrawnAt: true,
          reviewPackage: {
            select: {
              targetName: true,
              roundLabel: true,
            },
          },
        },
      },
    },
  });

  if (!session || session.tokenHash !== hashReviewScreenToken(token)) {
    return NextResponse.json({ message: "链接无效" }, { status: 404 });
  }
  if (!user) {
    return NextResponse.json({ message: "请使用管理员账号打开大屏后再操作" }, { status: 401 });
  }
  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  if (!session.selfDrawEnabled) {
    return NextResponse.json({ message: "管理员未开启项目自助抽签" }, { status: 409 });
  }

  if (session.status !== "waiting" || session.screenPhase !== "draw" || session.startedAt) {
    return NextResponse.json({ message: "本轮已开始，不能继续抽取上台项目" }, { status: 409 });
  }

  const pendingProjects = session.projectOrders.filter((order) => !order.selfDrawnAt);
  if (!pendingProjects.length) {
    return NextResponse.json({ message: "全部项目已完成抽签" }, { status: 409 });
  }

  const existingCandidate = pendingProjects.find((project) => project.packageId === session.currentPackageId);
  if (existingCandidate) {
    return NextResponse.json({
      candidate: {
        packageId: existingCandidate.packageId,
        targetName: existingCandidate.reviewPackage.targetName,
        roundLabel: existingCandidate.reviewPackage.roundLabel ?? "",
        orderIndex: existingCandidate.orderIndex,
        groupName: existingCandidate.groupName,
        groupIndex: existingCandidate.groupIndex,
        groupSlotIndex: existingCandidate.groupSlotIndex,
      },
      session: {
        currentPackageId: existingCandidate.packageId,
      },
      remainingCount: pendingProjects.length,
    });
  }

  const pickedProject = pendingProjects[randomInt(pendingProjects.length)];
  const updatedSession = await prisma.$transaction(async (tx) => {
    const row = await tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: { currentPackageId: pickedProject.packageId },
      select: {
        currentPackageId: true,
      },
    });

    await createAuditLogEntry({
      tx,
      operator: user,
      action: "review_screen_session.self_draw_candidate_selected",
      objectType: "review_screen_session",
      objectId: sessionId,
      teamGroupId: session.reviewPackage.teamGroupId,
      beforeState: {
        currentPackageId: session.currentPackageId,
        pendingPackageIds: pendingProjects.map((project) => project.packageId),
      },
      afterState: {
        currentPackageId: pickedProject.packageId,
        remainingPendingPackageIds: pendingProjects
          .filter((project) => project.packageId !== pickedProject.packageId)
          .map((project) => project.packageId),
      },
      metadata: {
        triggeredBy: "admin_screen",
        method: "screen_self_draw_candidate",
        pickedPackageId: pickedProject.packageId,
        pendingCount: pendingProjects.length,
      },
    });

    return row;
  });

  return NextResponse.json({
    candidate: {
      packageId: pickedProject.packageId,
      targetName: pickedProject.reviewPackage.targetName,
      roundLabel: pickedProject.reviewPackage.roundLabel ?? "",
      orderIndex: pickedProject.orderIndex,
      groupName: pickedProject.groupName,
      groupIndex: pickedProject.groupIndex,
      groupSlotIndex: pickedProject.groupSlotIndex,
    },
    session: {
      currentPackageId: updatedSession.currentPackageId,
    },
    remainingCount: pendingProjects.length,
  });
}
