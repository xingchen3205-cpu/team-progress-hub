import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { assertMainWorkspaceRole, assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeAnnouncement } from "@/lib/api-serializers";
import { buildTeamScopedResourceWhere } from "@/lib/team-scope";

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

  const announcements = await prisma.announcement.findMany({
    where: buildTeamScopedResourceWhere({
      actor: user,
      ownerField: "authorId",
    }),
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  return NextResponse.json({
    announcements: announcements.map(serializeAnnouncement),
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

  try {
    assertRole(user.role, ["admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { title?: string; detail?: string; notifyTeam?: boolean }
    | null;

  const title = body?.title?.trim();
  const detail = body?.detail?.trim();
  const notifyTeam = Boolean(body?.notifyTeam);

  if (!title || !detail) {
    return NextResponse.json({ message: "公告信息不完整" }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      detail,
      authorId: user.id,
      teamGroupId: user.role === "admin" ? null : user.teamGroupId,
    },
    include: {
      author: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  if (notifyTeam) {
    const targetRoles =
      user.role === "admin"
        ? (["teacher", "leader", "member"] as const)
        : user.role === "teacher"
          ? (["leader", "member"] as const)
          : (["member"] as const);

    const recipients = await prisma.user.findMany({
      where: {
        approvalStatus: "approved",
        role: {
          in: [...targetRoles],
        },
        id: {
          not: user.id,
        },
        ...(user.role === "admin"
          ? {}
          : user.teamGroupId
            ? { teamGroupId: user.teamGroupId }
            : { id: "__no_team_group_recipients__" }),
      },
      select: {
        id: true,
      },
    });

    await createNotifications({
      userIds: recipients.map((recipient) => recipient.id),
      title: `公告提醒：${announcement.title}`,
      detail: announcement.detail,
      type: "announcement",
      targetTab: "overview",
      relatedId: announcement.id,
      senderId: user.id,
      email: true,
      emailTeamGroupId: announcement.teamGroupId ?? null,
    });
  }

  return NextResponse.json(
    { announcement: serializeAnnouncement(announcement) },
    { status: 201 },
  );
}
