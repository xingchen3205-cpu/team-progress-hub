import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { assertMainWorkspaceRole, assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeEvent } from "@/lib/api-serializers";

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

  const events = await prisma.event.findMany({
    orderBy: { dateTime: "asc" },
  });

  return NextResponse.json({ events: events.map(serializeEvent) });
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
    assertRole(user.role, ["admin", "teacher"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        dateTime?: string;
        type?: string;
        description?: string;
      }
    | null;

  const title = body?.title?.trim();
  const dateTime = body?.dateTime ? parseLocalDateTime(body.dateTime) : null;
  const type = body?.type?.trim();
  const description = body?.description?.trim();

  if (!title || !dateTime || !type || !description) {
    return NextResponse.json({ message: "节点信息不完整" }, { status: 400 });
  }

  const event = await prisma.event.create({
    data: {
      title,
      dateTime,
      type,
      description,
    },
  });

  return NextResponse.json({ event: serializeEvent(event) }, { status: 201 });
}
