import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const serializeGroup = (group: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  _count: { members: number };
}) => ({
  id: group.id,
  name: group.name,
  description: group.description,
  memberCount: group._count.members,
  createdAt: group.createdAt.toISOString(),
});

const assertAdmin = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: NextResponse.json({ message: "未登录" }, { status: 401 }) };
  }

  if (user.role !== "admin") {
    return { error: NextResponse.json({ message: "无权限" }, { status: 403 }) };
  }

  return { user };
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await assertAdmin(request);
  if (error) {
    return error;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        description?: string;
      }
    | null;

  const name = body?.name?.trim();
  const description = body?.description?.trim() || null;

  if (!name) {
    return NextResponse.json({ message: "请输入分组名称" }, { status: 400 });
  }

  if (name.length > 30) {
    return NextResponse.json({ message: "分组名称不能超过 30 个字" }, { status: 400 });
  }

  try {
    const group = await prisma.teamGroup.update({
      where: { id },
      data: {
        name,
        description,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    return NextResponse.json({ group: serializeGroup(group) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ message: "分组不存在" }, { status: 404 });
    }

    if (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
      (error instanceof Error && /UNIQUE constraint failed: TeamGroup\.name/i.test(error.message))
    ) {
      return NextResponse.json({ message: "分组名称已存在" }, { status: 409 });
    }

    return NextResponse.json({ message: "更新分组失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await assertAdmin(request);
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    await prisma.$transaction([
      prisma.user.updateMany({
        where: {
          teamGroupId: id,
        },
        data: {
          teamGroupId: null,
        },
      }),
      prisma.teamGroup.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ message: "分组不存在" }, { status: 404 });
    }

    return NextResponse.json({ message: "删除分组失败，请稍后重试" }, { status: 500 });
  }
}
