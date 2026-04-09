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
import { inferTaskTeamGroupId } from "@/lib/task-team-group";
import { deriveTaskStatusFromAssignments, pickTaskDispatchRecipientIds } from "@/lib/task-workflow";

const taskInclude = {
  assignee: {
    select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
  },
  assignments: {
    orderBy: [{ createdAt: "asc" as const }, { assigneeId: "asc" as const }],
    include: {
      assignee: {
        select: { id: true, name: true, avatar: true, role: true, teamGroupId: true },
      },
    },
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

const normalizeAssigneeIds = (body: { assigneeId?: string | null; assigneeIds?: string[] | null } | null) => {
  const candidates = Array.isArray(body?.assigneeIds) ? body?.assigneeIds : body?.assigneeId ? [body.assigneeId] : [];
  return Array.from(
    new Set(
      candidates
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
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

  const normalizedTasks = await Promise.all(
    tasks.map(async (task) => {
      const inferredTeamGroupId = inferTaskTeamGroupId(task);
      if (!task.teamGroupId && inferredTeamGroupId) {
        return prisma.task.update({
          where: { id: task.id },
          data: { teamGroupId: inferredTeamGroupId },
          include: taskInclude,
        });
      }

      return task;
    }),
  );

  return NextResponse.json({ tasks: normalizedTasks.map(serializeTask) });
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
        assigneeIds?: string[];
        teamGroupId?: string;
        dueDate?: string;
        priority?: "高优先级" | "中优先级" | "低优先级";
        notifyAssignee?: boolean;
      }
    | null;

  const title = body?.title?.trim();
  const assigneeIds = normalizeAssigneeIds(body);
  const dueDate = body?.dueDate ? parseLocalDateTime(body.dueDate) : null;
  const priority = body?.priority ? taskPriorityValueToDb[body.priority] : null;
  const notifyAssignee = Boolean(body?.notifyAssignee);
  const requestedTeamGroupId = body?.teamGroupId?.trim() || null;

  if (!title || !dueDate || !priority) {
    return NextResponse.json({ message: "工单信息不完整" }, { status: 400 });
  }

  const assignees = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: {
          id: true,
          role: true,
          teamGroupId: true,
          approvalStatus: true,
        },
      })
    : [];
  const assigneesById = new Map(assignees.map((assignee) => [assignee.id, assignee]));

  if (assignees.length !== assigneeIds.length) {
    return NextResponse.json({ message: "部分处理人不存在" }, { status: 404 });
  }

  const hasForbiddenAssignee = assignees.some((assignee) => !canAssignTaskToUser(user, assignee));
  if (hasForbiddenAssignee) {
    return NextResponse.json({ message: "无权限给所选成员创建工单" }, { status: 403 });
  }

  if (user.role === "member" && assigneeIds.some((assigneeId) => assigneeId !== user.id)) {
    return NextResponse.json({ message: "团队成员只能把工单指派给自己或提交待分配工单" }, { status: 403 });
  }

  const firstAssignee = assigneeIds[0] ? assigneesById.get(assigneeIds[0]) ?? null : null;
  const teamGroupId =
    user.role === "admin"
      ? firstAssignee?.teamGroupId || requestedTeamGroupId || user.teamGroupId || null
      : firstAssignee?.teamGroupId || user.teamGroupId || null;

  if (!teamGroupId && assigneeIds.length === 0) {
    return NextResponse.json({ message: "请先选择处理人，或将账号加入队伍后再发布待分配工单" }, { status: 400 });
  }

  const reviewerId = user.role === "teacher" || user.role === "leader" || user.role === "admin" ? user.id : null;
  const now = new Date();
  const autoAcceptedIds = new Set(
    assignees.filter((assignee) => assignee.id === user.id || assignee.role === "leader").map((assignee) => assignee.id),
  );
  const derivedStatus = deriveTaskStatusFromAssignments({
    assigneeIds,
    acceptedAtValues: assigneeIds.map((assigneeId) => (autoAcceptedIds.has(assigneeId) ? now : null)),
    submittedAtValues: assigneeIds.map(() => null),
  });

  const task = await prisma.task.create({
    data: {
      title,
      assigneeId: assigneeIds[0] ?? null,
      creatorId: user.id,
      reviewerId,
      teamGroupId,
      dueDate,
      priority,
      status: derivedStatus,
      acceptedAt: autoAcceptedIds.size > 0 ? now : null,
      assignments:
        assigneeIds.length > 0
          ? {
              create: assigneeIds.map((assigneeId) => ({
                assigneeId,
                acceptedAt: autoAcceptedIds.has(assigneeId) ? now : null,
              })),
            }
          : undefined,
    },
    include: taskInclude,
  });

  const reminderAssigneeIds = assigneeIds.filter((assigneeId) => assigneeId !== user.id);

  if (notifyAssignee && reminderAssigneeIds.length > 0) {
    await createNotifications({
      userIds: reminderAssigneeIds,
      title: `工单提醒：${task.title}`,
      detail:
        reminderAssigneeIds.length > 1
          ? `${user.name} 指派你参与处理工单「${task.title}」，全部执行人完成后将统一提交验收。`
          : `${user.name} 指派你处理工单「${task.title}」，请在任务中心查看并推进。`,
      type: "task_assign",
      targetTab: "board",
      relatedId: task.id,
      senderId: user.id,
      email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
      emailTeamGroupId: task.teamGroupId ?? null,
    });
  }

  if (notifyAssignee && (assigneeIds.length === 0 || user.role === "member")) {
    const reviewerCandidates = await getTeamReviewerCandidates({
      teamGroupId: task.teamGroupId,
      excludeUserIds: [user.id, ...assigneeIds],
    });
    const reviewerIds = pickTaskDispatchRecipientIds({
      candidates: reviewerCandidates,
    });

    if (reviewerIds.length > 0) {
      await createNotifications({
        userIds: reviewerIds,
        title: `待分配工单：${task.title}`,
        detail: `${user.name} 提交了待分配工单「${task.title}」，请进入任务中心分配处理人。`,
        type: "task_submit",
        targetTab: "board",
        relatedId: task.id,
        senderId: user.id,
        email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
        emailTeamGroupId: task.teamGroupId ?? null,
      });
    }
  }

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}
