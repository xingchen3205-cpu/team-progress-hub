import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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
        presentationSeconds?: unknown;
        qaSeconds?: unknown;
        scoringSeconds?: unknown;
      }
    | null;
  const phase = body?.phase?.trim();

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
    },
  });

  if (!session) {
    return NextResponse.json({ message: "大屏会话不存在" }, { status: 404 });
  }

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  const allowedNextPhases: Record<string, readonly ValidPhase[]> = {
    draw: ["draw", "presentation", "finished"],
    presentation: ["presentation", "qa", "finished"],
    qa: ["qa", "scoring", "finished"],
    scoring: ["scoring", "finished"],
    reveal: ["finished"],
    finished: [],
  };
  if (!allowedNextPhases[session.screenPhase]?.includes(phase)) {
    return NextResponse.json({ message: "请按路演、答辩、评分的顺序切换阶段" }, { status: 409 });
  }

  const updatedSession = await prisma.reviewDisplaySession.update({
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
