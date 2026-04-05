import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { serializeTask, taskPriorityValueToDb } from "@/lib/api-serializers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const currentTask = await prisma.task.findUnique({ where: { id } });

  if (!currentTask) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        assigneeId?: string;
        dueDate?: string;
        priority?: "高优先级" | "中优先级" | "低优先级";
        status?: "todo" | "doing" | "done";
      }
    | null;

  if (user.role === "member") {
    if (currentTask.assigneeId !== user.id || !body?.status) {
      return NextResponse.json({ message: "无权限" }, { status: 403 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: body.status,
      },
      include: {
        assignee: {
          select: { id: true, name: true, avatar: true, role: true },
        },
      },
    });

    return NextResponse.json({ task: serializeTask(task) });
  }

  const nextDueDate = body?.dueDate ? parseLocalDateTime(body.dueDate) : undefined;
  const nextPriority = body?.priority ? taskPriorityValueToDb[body.priority] : undefined;

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: body?.title?.trim() || undefined,
      assigneeId: body?.assigneeId?.trim() || undefined,
      dueDate: nextDueDate || undefined,
      priority: nextPriority,
      status: body?.status,
    },
    include: {
      assignee: {
        select: { id: true, name: true, avatar: true, role: true },
      },
    },
  });

  return NextResponse.json({ task: serializeTask(task) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (user.role !== "teacher") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.task.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
