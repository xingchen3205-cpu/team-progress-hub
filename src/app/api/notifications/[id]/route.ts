import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeNotification } from "@/lib/api-serializers";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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

  const { id } = await params;
  const notification = await prisma.notification.findUnique({
    where: { id },
  });

  if (!notification || notification.userId !== user.id) {
    return NextResponse.json({ message: "消息不存在" }, { status: 404 });
  }

  const updatedNotification = await prisma.notification.update({
    where: { id },
    data: {
      isRead: true,
      readAt: notification.isRead ? notification.readAt : new Date(),
    },
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

  return NextResponse.json({ notification: serializeNotification(updatedNotification) });
}
