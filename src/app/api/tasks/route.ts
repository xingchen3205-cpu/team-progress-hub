import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { createNotifications } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  serializeTask,
  taskPriorityValueToDb,
} from "@/lib/api-serializers";
import { canAssignTaskToUser, getTaskVisibilityWhere } from "@/lib/task-access";

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
    where: getTaskVisibilityWhere(user),
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      assignee: {
        select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
      },
      creator: {
        select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
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

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        assigneeId?: string;
        dueDate?: string;
        priority?: "高优先级" | "中优先级" | "低优先级";
        notifyAssignee?: boolean;
      }
    | null;

  const title = body?.title?.trim();
  const assigneeId = body?.assigneeId?.trim();
  const dueDate = body?.dueDate ? parseLocalDateTime(body.dueDate) : null;
  const priority = body?.priority ? taskPriorityValueToDb[body.priority] : null;
  const notifyAssignee = Boolean(body?.notifyAssignee);

  if (!title || !assigneeId || !dueDate || !priority) {
    return NextResponse.json({ message: "任务信息不完整" }, { status: 400 });
  }

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: {
      id: true,
      role: true,
      teamGroupId: true,
      approvalStatus: true,
    },
  });

  if (!assignee || !canAssignTaskToUser(user, assignee)) {
    return NextResponse.json({ message: "无权限给该成员创建任务" }, { status: 403 });
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
        select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
      },
      creator: {
        select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
      },
    },
  });

  if (notifyAssignee && task.assigneeId !== user.id) {
    await createNotifications({
      userIds: [task.assigneeId],
      title: `任务提醒：${task.title}`,
      detail: `${user.name} 指派你处理任务「${task.title}」，请在任务看板查看并推进。`,
      type: "task_assign",
      targetTab: "board",
      relatedId: task.id,
      senderId: user.id,
      email: true,
    });
  }

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}
