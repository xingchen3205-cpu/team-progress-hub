import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { assertMainWorkspaceRole, assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  serializeTask,
  taskPriorityValueToDb,
} from "@/lib/api-serializers";

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

  const tasks = await prisma.task.findMany({
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      assignee: {
        select: { id: true, name: true, avatar: true, role: true },
      },
    },
  });

  return NextResponse.json({ tasks: tasks.map(serializeTask) });
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
    assertRole(user.role, ["admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        assigneeId?: string;
        dueDate?: string;
        priority?: "高优先级" | "中优先级" | "低优先级";
      }
    | null;

  const title = body?.title?.trim();
  const assigneeId = body?.assigneeId?.trim();
  const dueDate = body?.dueDate ? parseLocalDateTime(body.dueDate) : null;
  const priority = body?.priority ? taskPriorityValueToDb[body.priority] : null;

  if (!title || !assigneeId || !dueDate || !priority) {
    return NextResponse.json({ message: "任务信息不完整" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      title,
      assigneeId,
      creatorId: user.id,
      dueDate,
      priority,
      status: "todo",
    },
    include: {
      assignee: {
        select: { id: true, name: true, avatar: true, role: true },
      },
    },
  });

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}
