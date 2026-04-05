import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { canManageUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/api-serializers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (user.role === "member") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json({ message: "成员不存在" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        account?: string;
        role?: "指导教师" | "项目负责人" | "团队成员";
        responsibility?: string;
      }
    | null;

  const roleMap = {
    指导教师: "teacher",
    项目负责人: "leader",
    团队成员: "member",
  } as const;

  const nextRole = body?.role ? roleMap[body.role] : target.role;

  if (!canManageUser(user.role, target.role, nextRole)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const member = await prisma.user.update({
    where: { id },
    data: {
      name: body?.name?.trim() || undefined,
      email: body?.account?.trim() || undefined,
      role: nextRole,
      responsibility: body?.responsibility?.trim() || undefined,
      avatar: body?.name?.trim()?.slice(0, 1) || undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      responsibility: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ member: serializeUser(member) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (user.role === "member") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ message: "成员不存在" }, { status: 404 });
  }

  if (!canManageUser(user.role, target.role)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
