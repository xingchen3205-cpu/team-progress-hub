import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole, assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTeamScopedResource } from "@/lib/team-scope";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, authorId: true, teamGroupId: true },
  });

  if (!announcement) {
    return NextResponse.json({ message: "公告不存在" }, { status: 404 });
  }

  if (!canAccessTeamScopedResource(user, { ownerId: announcement.authorId, teamGroupId: announcement.teamGroupId })) {
    return NextResponse.json({ message: "无权限删除该公告" }, { status: 403 });
  }

  await prisma.announcement.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
