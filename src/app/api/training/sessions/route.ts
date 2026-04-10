import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeTrainingSession } from "@/lib/api-serializers";
import { buildTeamScopedResourceWhere } from "@/lib/team-scope";

const toSafeInteger = (value: unknown, fallback = 0) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.round(numberValue));
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const visibilityWhere = buildTeamScopedResourceWhere({
    actor: user,
    ownerField: "createdById",
  });

  const [sessions, questionCount, aggregate] = await Promise.all([
    prisma.trainingSession.findMany({
      where: visibilityWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        createdBy: {
          select: { name: true },
        },
      },
    }),
    prisma.trainingQuestion.count({
      where: visibilityWhere,
    }),
    prisma.trainingSession.aggregate({
      where: visibilityWhere,
      _count: { id: true },
      _sum: {
        overtimeSeconds: true,
        qaTotal: true,
        qaHit: true,
      },
    }),
  ]);

  const sessionCount = aggregate._count.id;
  const overtimeSeconds = aggregate._sum.overtimeSeconds ?? 0;
  const qaTotal = aggregate._sum.qaTotal ?? 0;
  const qaHit = aggregate._sum.qaHit ?? 0;

  return NextResponse.json({
    sessions: sessions.map(serializeTrainingSession),
    stats: {
      questionCount,
      sessionCount,
      averageOvertimeSeconds: sessionCount > 0 ? Math.round(overtimeSeconds / sessionCount) : 0,
      qaHitRate: qaTotal > 0 ? Math.round((qaHit / qaTotal) * 100) : 0,
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        durationSeconds?: number;
        overtimeSeconds?: number;
        qaTotal?: number;
        qaHit?: number;
        notes?: string;
      }
    | null;

  const durationSeconds = toSafeInteger(body?.durationSeconds);
  const overtimeSeconds = toSafeInteger(body?.overtimeSeconds);
  const qaTotal = toSafeInteger(body?.qaTotal);
  const qaHit = toSafeInteger(body?.qaHit);
  const title = body?.title?.trim() || "模拟答辩训练";
  const notes = body?.notes?.trim() || null;

  if (durationSeconds <= 0) {
    return NextResponse.json({ message: "请先完成一次有效训练" }, { status: 400 });
  }

  if (qaHit > qaTotal) {
    return NextResponse.json({ message: "命中题数不能大于抽查题数" }, { status: 400 });
  }

  const session = await prisma.trainingSession.create({
    data: {
      title,
      durationSeconds,
      overtimeSeconds,
      qaTotal,
      qaHit,
      notes,
      createdById: user.id,
      teamGroupId: hasGlobalAdminPrivileges(user.role) ? null : user.teamGroupId,
    },
    include: {
      createdBy: {
        select: { name: true },
      },
    },
  });

  return NextResponse.json({ session: serializeTrainingSession(session) }, { status: 201 });
}
