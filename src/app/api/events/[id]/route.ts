import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { assertMainWorkspaceRole, assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeEvent } from "@/lib/api-serializers";
import { canAccessTeamScopedResource } from "@/lib/team-scope";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        dateTime?: string;
        type?: string;
        description?: string;
      }
    | null;

  const currentEvent = await prisma.event.findUnique({
    where: { id },
    select: { id: true, creatorId: true, teamGroupId: true },
  });

  if (!currentEvent) {
    return NextResponse.json({ message: "节点不存在" }, { status: 404 });
  }

  if (!canAccessTeamScopedResource(user, { ownerId: currentEvent.creatorId, teamGroupId: currentEvent.teamGroupId })) {
    return NextResponse.json({ message: "无权限编辑该节点" }, { status: 403 });
  }

  const event = await prisma.event.update({
    where: { id },
    data: {
      title: body?.title?.trim() || undefined,
      dateTime: body?.dateTime ? parseLocalDateTime(body.dateTime) || undefined : undefined,
      type: body?.type?.trim() || undefined,
      description: body?.description?.trim() || undefined,
    },
  });

  return NextResponse.json({ event: serializeEvent(event) });
}
