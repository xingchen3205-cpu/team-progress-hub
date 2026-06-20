import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const teamScope = request.nextUrl.searchParams.get("scope") === "team";
  const canReadTeam = ["admin", "school_admin", "teacher", "leader"].includes(user.role);
  const sessions = await prisma.aiTrainingSession.findMany({
    where:
      teamScope && canReadTeam && user.teamGroupId
        ? { teamGroupId: user.teamGroupId }
        : { createdById: user.id },
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { createdBy: { select: { name: true } }, _count: { select: { turns: true } } },
  });

  return NextResponse.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      summary: session.summaryJson ? JSON.parse(session.summaryJson) : null,
      createdByName: session.createdBy.name,
      turnCount: session._count.turns,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const session = await prisma.aiTrainingSession.create({
    data: { createdById: user.id, teamGroupId: user.teamGroupId },
  });
  return NextResponse.json({ session: { id: session.id, status: session.status } }, { status: 201 });
}
