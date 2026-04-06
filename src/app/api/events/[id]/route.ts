import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { serializeEvent } from "@/lib/api-serializers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (user.role !== "teacher" && user.role !== "admin") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        dateTime?: string;
        type?: string;
        description?: string;
      }
    | null;

  const event = await prisma.event.update({
    where: { id },
    data: {
      title: body?.title?.trim() || undefined,
      dateTime: body?.dateTime ? parseLocalDateTime(body.dateTime) || undefined : undefined,
      type: body?.type?.trim() || undefined,
      description: body?.description?.trim() || undefined,
    },
  });

  return NextResponse.json({ event: serializeEvent(event) });
}
