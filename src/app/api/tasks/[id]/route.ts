import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeTask, taskPriorityValueToDb } from "@/lib/api-serializers";
import { canAccessTask, canAssignTaskToUser } from "@/lib/task-access";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const currentTask = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: {
        select: { id: true, role: true, teamGroupId: true, approvalStatus: true },
      },
      creator: {
        select: { id: true, role: true, teamGroupId: true, approvalStatus: true },
      },
    },
  });

  if (!currentTask) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  if (!canAccessTask(user, currentTask)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
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

  const editableByRole = user.role === "admin" || user.role === "teacher" || user.role === "leader";
  const isCreator = currentTask.creatorId === user.id;
  const isAssignee = currentTask.assigneeId === user.id;
  const hasContentChanges = Boolean(
    body?.title?.trim() || body?.assigneeId?.trim() || body?.dueDate || body?.priority,
  );

  if (!editableByRole && hasContentChanges && !isCreator) {
    return NextResponse.json({ message: "只能编辑自己创建的任务" }, { status: 403 });
  }

  if (!editableByRole && body?.status && !isCreator && !isAssignee) {
    return NextResponse.json({ message: "只能调整自己负责或创建的任务状态" }, { status: 403 });
  }

  if (body?.assigneeId?.trim()) {
    const nextAssignee = await prisma.user.findUnique({
      where: { id: body.assigneeId.trim() },
      select: {
        id: true,
        role: true,
        teamGroupId: true,
        approvalStatus: true,
      },
    });

    if (!nextAssignee || !canAssignTaskToUser(user, nextAssignee)) {
      return NextResponse.json({ message: "无权限把任务指派给该成员" }, { status: 403 });
    }
  }

  if (!editableByRole && !isCreator) {
    if (!body?.status || hasContentChanges) {
      return NextResponse.json({ message: "无权限" }, { status: 403 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: body.status,
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
        select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
      },
      creator: {
        select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
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

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: {
        select: { teamGroupId: true },
      },
      creator: {
        select: { teamGroupId: true },
      },
    },
  });
  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  if (!canAccessTask(user, task)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const canDelete = user.role === "admin" || user.role === "teacher" || task.creatorId === user.id;
  if (!canDelete) {
    return NextResponse.json({ message: "只能删除自己创建的任务" }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
