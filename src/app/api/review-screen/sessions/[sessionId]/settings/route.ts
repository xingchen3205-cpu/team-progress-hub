import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  normalizeReviewScreenDisplaySettings,
  pickReviewScreenDisplaySettings,
} from "@/lib/review-screen-display-settings";

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
        presentationSeconds?: unknown;
        qaSeconds?: unknown;
        scoringSeconds?: unknown;
        screenDisplay?: Partial<{
          scoringEnabled: unknown;
          showScoresOnScreen: unknown;
          showFinalScoreOnScreen: unknown;
          showRankingOnScreen: unknown;
          selfDrawEnabled: unknown;
        }>;
      }
    | null;

  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      tokenExpiresAt: true,
      presentationSeconds: true,
      qaSeconds: true,
      scoringSeconds: true,
      scoringEnabled: true,
      showScoresOnScreen: true,
      showFinalScoreOnScreen: true,
      showRankingOnScreen: true,
      selfDrawEnabled: true,
    },
  });

  if (!session) {
    return NextResponse.json({ message: "大屏会话不存在" }, { status: 404 });
  }

  if (session.tokenExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "大屏链接已过期" }, { status: 409 });
  }

  const updated = await prisma.reviewDisplaySession.update({
    where: { id: sessionId },
    data: {
      presentationSeconds: normalizeSeconds(body?.presentationSeconds, session.presentationSeconds ?? 480, 60, 1800),
      qaSeconds: normalizeSeconds(body?.qaSeconds, session.qaSeconds ?? 420, 60, 1800),
      scoringSeconds: normalizeSeconds(body?.scoringSeconds, session.scoringSeconds ?? 60, 10, 600),
      ...normalizeReviewScreenDisplaySettings(body?.screenDisplay, pickReviewScreenDisplaySettings(session)),
    },
    select: {
      id: true,
      presentationSeconds: true,
      qaSeconds: true,
      scoringSeconds: true,
      scoringEnabled: true,
      showScoresOnScreen: true,
      showFinalScoreOnScreen: true,
      showRankingOnScreen: true,
      selfDrawEnabled: true,
    },
  });

  return NextResponse.json({
    session: {
      ...updated,
      screenDisplay: pickReviewScreenDisplaySettings(updated),
    },
  });
}
