import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";

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
import { pickTaskDispatchRecipientIds } from "@/lib/task-workflow";

const taskInclude = {
  assignee: {
    select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
  },
  creator: {
    select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
  },
  reviewer: {
    select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
  },
  teamGroup: {
    select: { id: true, name: true },
  },
  attachments: {
    orderBy: { uploadedAt: "desc" as const },
    include: {
      uploader: {
        select: { id: true, name: true },
      },
    },
  },
};

const getTeamReviewerCandidates = async ({
  teamGroupId,
  excludeUserIds = [],
}: {
  teamGroupId?: string | null;
  excludeUserIds?: string[];
}) => {
  if (!teamGroupId) {
    return [];
  }

  const reviewers = await prisma.user.findMany({
    where: {
      teamGroupId,
      role: {
        in: ["teacher", "leader"] satisfies Role[],
      },
      approvalStatus: "approved",
      id: {
        notIn: excludeUserIds,
      },
    },
    select: { id: true, role: true },
  });

  return reviewers;
};

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
      ...taskInclude,
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
        teamGroupId?: string;
        dueDate?: string;
        priority?: "高优先级" | "中优先级" | "低优先级";
        notifyAssignee?: boolean;
      }
    | null;

  const title = body?.title?.trim();
  const assigneeId = body?.assigneeId?.trim() || null;
  const dueDate = body?.dueDate ? parseLocalDateTime(body.dueDate) : null;
  const priority = body?.priority ? taskPriorityValueToDb[body.priority] : null;
  const notifyAssignee = Boolean(body?.notifyAssignee);
  const requestedTeamGroupId = body?.teamGroupId?.trim() || null;

  if (!title || !dueDate || !priority) {
    return NextResponse.json({ message: "工单信息不完整" }, { status: 400 });
  }

  const assignee = assigneeId
    ? await prisma.user.findUnique({
        where: { id: assigneeId },
        select: {
          id: true,
          role: true,
          teamGroupId: true,
          approvalStatus: true,
        },
      })
    : null;

  if (assigneeId && (!assignee || !canAssignTaskToUser(user, assignee))) {
    return NextResponse.json({ message: "无权限给该成员创建工单" }, { status: 403 });
  }

  if (user.role === "member" && assigneeId && assigneeId !== user.id) {
    return NextResponse.json({ message: "团队成员只能把工单指派给自己或提交待分配工单" }, { status: 403 });
  }

  const teamGroupId =
    user.role === "admin"
      ? assignee?.teamGroupId || requestedTeamGroupId || user.teamGroupId || null
      : assignee?.teamGroupId || user.teamGroupId || null;

  if (!teamGroupId && !assigneeId) {
    return NextResponse.json({ message: "请先选择处理人，或将账号加入队伍后再发布待分配工单" }, { status: 400 });
  }

  const reviewerId = user.role === "teacher" || user.role === "leader" || user.role === "admin" ? user.id : null;
  const autoAccepted = Boolean(assignee && (assignee.id === user.id || assignee.role === "leader"));

  const task = await prisma.task.create({
    data: {
      title,
      assigneeId,
      creatorId: user.id,
      reviewerId,
      teamGroupId,
      dueDate,
      priority,
      status: autoAccepted ? "doing" : "todo",
      acceptedAt: autoAccepted ? new Date() : null,
    },
    include: taskInclude,
  });

  if (notifyAssignee && task.assigneeId && task.assigneeId !== user.id) {
    await createNotifications({
      userIds: [task.assigneeId],
      title: `工单提醒：${task.title}`,
      detail: `${user.name} 指派你处理工单「${task.title}」，请在任务看板查看并推进。`,
      type: "task_assign",
      targetTab: "board",
      relatedId: task.id,
      senderId: user.id,
      email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
    });
  }

  if (notifyAssignee && (!task.assigneeId || user.role === "member")) {
    const reviewerCandidates = await getTeamReviewerCandidates({
      teamGroupId: task.teamGroupId,
      excludeUserIds: [user.id, task.assigneeId ?? ""],
    });
    const reviewerIds = pickTaskDispatchRecipientIds({
      candidates: reviewerCandidates,
    });

    if (reviewerIds.length > 0) {
      await createNotifications({
        userIds: reviewerIds,
        title: `待分配工单：${task.title}`,
        detail: `${user.name} 提交了待分配工单「${task.title}」，请进入任务看板分配处理人。`,
        type: "task_submit",
        targetTab: "board",
        relatedId: task.id,
        senderId: user.id,
        email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
      });
    }
  }

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}
