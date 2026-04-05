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

  if (target.id === user.id) {
    return NextResponse.json({ message: "不能删除当前登录账号" }, { status: 400 });
  }

  const unfinishedTaskCount = await prisma.task.count({
    where: {
      assigneeId: target.id,
      status: {
        in: ["todo", "doing"],
      },
    },
  });

  if (unfinishedTaskCount > 0) {
    return NextResponse.json(
      { message: "该成员有未完成任务，无法删除，请先处理或转移任务。" },
      { status: 409 },
    );
  }

  const fallbackOwner =
    (await prisma.user.findFirst({
      where: {
        id: {
          not: target.id,
        },
        role: "leader",
      },
      orderBy: {
        createdAt: "asc",
      },
    })) ??
    (await prisma.user.findFirst({
      where: {
        id: {
          not: target.id,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }));

  if (!fallbackOwner) {
    return NextResponse.json({ message: "系统中缺少可接管关联数据的账号，暂时无法删除。" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.task.updateMany({
      where: {
        assigneeId: target.id,
      },
      data: {
        assigneeId: fallbackOwner.id,
      },
    }),
    prisma.task.updateMany({
      where: {
        creatorId: target.id,
      },
      data: {
        creatorId: fallbackOwner.id,
      },
    }),
    prisma.announcement.updateMany({
      where: {
        authorId: target.id,
      },
      data: {
        authorId: fallbackOwner.id,
      },
    }),
    prisma.document.updateMany({
      where: {
        ownerId: target.id,
      },
      data: {
        ownerId: fallbackOwner.id,
      },
    }),
    prisma.documentVersion.updateMany({
      where: {
        uploaderId: target.id,
      },
      data: {
        uploaderId: fallbackOwner.id,
      },
    }),
    prisma.report.deleteMany({
      where: {
        userId: target.id,
      },
    }),
    prisma.user.delete({
      where: {
        id: target.id,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
