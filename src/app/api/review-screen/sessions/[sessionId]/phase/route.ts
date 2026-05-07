import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { closeUnsubmittedReviewAssignments } from "@/lib/review-audit";

const validPhases = ["draw", "presentation", "qa", "scoring", "finished"] as const;
type ValidPhase = typeof validPhases[number];

const isValidPhase = (phase?: string): phase is ValidPhase =>
  Boolean(phase && validPhases.includes(phase as ValidPhase));

const normalizeSeconds = (value: unknown, fallback: number, min: number, max: number) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(seconds)));
};

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
  const body = (await request.json().catch(() => null)) as
    | {
        phase?: string;
        force?: unknown;
        presentationSeconds?: unknown;
        qaSeconds?: unknown;
        scoringSeconds?: unknown;
      }
    | null;
  const phase = body?.phase?.trim();
  const forceFinish = body?.force === true;

  if (!isValidPhase(phase)) {
    return NextResponse.json({ message: "无效的阶段" }, { status: 400 });
  }

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      tokenExpiresAt: true,
      currentPackageId: true,
      packageId: true,
      screenPhase: true,
      presentationSeconds: true,
      qaSeconds: true,
      scoringSeconds: true,
      scoringEnabled: true,
      projectOrders: {
        orderBy: { orderIndex: "asc" },
        select: {
          packageId: true,
          scoreLockedAt: true,
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

  const currentPackageId = session.currentPackageId ?? session.packageId;
  const currentProjectIndex = session.projectOrders.findIndex((project) => project.packageId === currentPackageId);
  const currentProjectOrder = session.projectOrders.find((project) => project.packageId === currentPackageId);
  const hasNextProject =
    currentProjectIndex >= 0 && currentProjectIndex + 1 < session.projectOrders.length;
  const canFinishCurrentRound =
    session.screenPhase === "reveal" ||
    session.screenPhase === "scoring" ||
    (session.screenPhase === "qa" && !session.scoringEnabled);

  if (phase === "finished") {
    if (hasNextProject && !forceFinish) {
      return NextResponse.json({ message: "还有后续项目，请先切换到下一项目" }, { status: 409 });
    }
    if (!canFinishCurrentRound && !forceFinish) {
      return NextResponse.json({ message: "请先完成当前项目流程后再结束本轮" }, { status: 409 });
    }
  }

  const allowedNextPhases: Record<string, readonly ValidPhase[]> = {
    draw: ["draw", "presentation"],
    presentation: ["presentation", "qa"],
    qa: ["qa", "scoring"],
    scoring: ["scoring"],
    reveal: ["finished"],
    finished: [],
  };
  if (phase !== "finished" && !allowedNextPhases[session.screenPhase]?.includes(phase)) {
    return NextResponse.json({ message: "请按路演、答辩、评分的顺序切换阶段" }, { status: 409 });
  }

  if (phase === "scoring" && !session.scoringEnabled) {
    return NextResponse.json({ message: "本轮未启用评分环节" }, { status: 409 });
  }

  const updatedSession = await prisma.$transaction(async (tx) => {
    if (phase === "finished" && session.screenPhase === "scoring" && !currentProjectOrder?.scoreLockedAt) {
      await closeUnsubmittedReviewAssignments({
        tx,
        packageId: currentPackageId,
        operator: user,
        status: "closed_by_admin",
        reason: "管理员结束本轮时关闭未提交专家任务",
      });
    }

    return tx.reviewDisplaySession.update({
      where: { id: sessionId },
      data: {
        screenPhase: phase,
        phaseStartedAt: new Date(),
        presentationSeconds: normalizeSeconds(body?.presentationSeconds, session.presentationSeconds ?? 480, 60, 1800),
        qaSeconds: normalizeSeconds(body?.qaSeconds, session.qaSeconds ?? 420, 60, 1800),
        scoringSeconds: normalizeSeconds(body?.scoringSeconds, session.scoringSeconds ?? 60, 10, 600),
        ...(phase === "scoring" ? { status: "scoring", startedAt: new Date() } : {}),
        ...(phase === "finished" ? { status: "closed", endedAt: new Date() } : {}),
      },
      select: {
        id: true,
        screenPhase: true,
        phaseStartedAt: true,
        revealStartedAt: true,
        status: true,
        startedAt: true,
        endedAt: true,
      },
    });
  });

  return NextResponse.json({
    session: {
      ...updatedSession,
      phaseStartedAt: updatedSession.phaseStartedAt?.toISOString() ?? null,
      revealStartedAt: updatedSession.revealStartedAt?.toISOString() ?? null,
      startedAt: updatedSession.startedAt?.toISOString() ?? null,
      endedAt: updatedSession.endedAt?.toISOString() ?? null,
    },
  });
}
