import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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
    | { title?: string; detail?: string }
    | null;
  const title = body?.title?.trim();
  const detail = body?.detail?.trim();

  if (!title || !detail) {
    return NextResponse.json({ message: "请填写 Bug 标题和问题描述" }, { status: 400 });
  }

  const admins = await prisma.user.findMany({
    where: {
      role: "admin",
      approvalStatus: "approved",
    },
    select: { id: true },
  });

  const delivery = await createNotifications({
    userIds: admins.map((admin) => admin.id),
    title: `Bug 反馈：${title}`,
    detail: `${detail}\n\n反馈人：${user.name}`,
    type: "bug_feedback",
    targetTab: "overview",
    senderId: user.id,
  });

  return NextResponse.json({ success: true, delivery }, { status: 201 });
}
