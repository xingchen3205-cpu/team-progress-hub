import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeAnnouncement } from "@/lib/api-serializers";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const announcements = await prisma.announcement.findMany({
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
    assertRole(user.role, ["teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { title?: string; detail?: string }
    | null;

  const title = body?.title?.trim();
  const detail = body?.detail?.trim();

  if (!title || !detail) {
    return NextResponse.json({ message: "公告信息不完整" }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      detail,
      authorId: user.id,
    },
    include: {
      author: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  return NextResponse.json(
    { announcement: serializeAnnouncement(announcement) },
    { status: 201 },
  );
}
