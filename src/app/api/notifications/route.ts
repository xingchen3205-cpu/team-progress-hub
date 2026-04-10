import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeNotification } from "@/lib/api-serializers";
import {
  assertMainWorkspaceRole,
  assertRole,
  canViewTeamMember,
} from "@/lib/permissions";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

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

  const scope = request.nextUrl.searchParams.get("scope");

  if (scope === "sent") {
    try {
      assertRole(user.role, ["admin", "school_admin", "teacher"]);
    } catch {
      return NextResponse.json({ message: "无权限" }, { status: 403 });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        senderId: user.id,
        type: "directive",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 30,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({
      notifications: notifications.map(serializeNotification),
    });
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          avatar: true,
          role: true,
        },
      },
    },
  });

  return NextResponse.json({
    notifications: notifications.map(serializeNotification),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
    assertRole(user.role, ["admin", "school_admin", "teacher"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        userId?: string;
        title?: string;
        detail?: string;
        targetTab?: string | null;
      }
    | null;

  const userId = body?.userId?.trim();
  const title = body?.title?.trim();
  const detail = body?.detail?.trim();
  const targetTab = body?.targetTab?.trim() || null;

  if (!userId || !title || !detail) {
    return NextResponse.json({ message: "提醒内容不完整" }, { status: 400 });
  }

  if (userId === user.id) {
    return NextResponse.json({ message: "无需给当前登录账号发送提醒" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      role: true,
      approvalStatus: true,
      teamGroupId: true,
    },
  });

  if (!targetUser || targetUser.approvalStatus !== "approved") {
    return NextResponse.json({ message: "目标成员不存在或尚未通过审核" }, { status: 404 });
  }

  if (targetUser.role === "admin") {
    return NextResponse.json({ message: "系统管理员账号无需接收此类提醒" }, { status: 403 });
  }

  if (!canViewTeamMember(user.role, user.id, targetUser.role, targetUser.id)) {
    return NextResponse.json({ message: "无权限给该成员发送提醒" }, { status: 403 });
  }

  const delivery = await createNotifications({
    userIds: [targetUser.id],
    title,
    detail,
    type: "directive",
    targetTab: targetTab ?? undefined,
    relatedId: null,
    senderId: user.id,
    email: true,
    emailTeamGroupId: targetUser.teamGroupId ?? null,
  });

  return NextResponse.json({ success: true, delivery }, { status: 201 });
}
