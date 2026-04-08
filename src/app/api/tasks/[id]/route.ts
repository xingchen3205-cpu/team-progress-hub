import { NextRequest, NextResponse } from "next/server";
import type { Role, TaskStatus } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { createNotifications } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeTask, taskPriorityValueToDb } from "@/lib/api-serializers";
import { canAccessTask, canAssignTaskToUser, canReviewTask } from "@/lib/task-access";
import { canRemindTaskDispatch, pickTaskDispatchRecipientIds } from "@/lib/task-workflow";
import { deleteStoredFile } from "@/lib/uploads";

const taskInclude = {
  assignee: {
    select: { id: true, name: true, avatar: true, role: true, teamGroupId: true, approvalStatus: true },
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

const getTask = (id: string) =>
  prisma.task.findUnique({
    where: { id },
    include: taskInclude,
  });

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

const getTeamReviewerIds = async ({
  teamGroupId,
  excludeUserIds = [],
}: {
  teamGroupId?: string | null;
  excludeUserIds?: string[];
}) => {
  const candidates = await getTeamReviewerCandidates({ teamGroupId, excludeUserIds });
  return pickTaskDispatchRecipientIds({ candidates });
};

const normalizeStatus = (status?: string | null): TaskStatus | undefined => {
  if (!status) {
    return undefined;
  }

  if (status === "done") {
    return "archived";
  }

  if (["todo", "doing", "review", "archived"].includes(status)) {
    return status as TaskStatus;
  }

  return undefined;
};

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
  const currentTask = await getTask(id);

  if (!currentTask) {
    return NextResponse.json({ message: "工单不存在" }, { status: 404 });
  }

  if (!canAccessTask(user, currentTask)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        action?: "accept" | "submit" | "confirm" | "reject" | "remind_dispatch";
        title?: string;
        assigneeId?: string | null;
        dueDate?: string;
        priority?: "高优先级" | "中优先级" | "低优先级";
        status?: "todo" | "doing" | "review" | "archived" | "done";
        completionNote?: string;
        rejectionReason?: string;
      }
    | null;

  if (!body) {
    return NextResponse.json({ message: "请求内容为空" }, { status: 400 });
  }

  const isReviewer = canReviewTask(user, currentTask);
  const isAssignee = currentTask.assigneeId === user.id;
  const isCreator = currentTask.creatorId === user.id;
  const editableByRole = user.role === "admin" || user.role === "teacher" || user.role === "leader";

  if (body.action === "remind_dispatch") {
    if (!canRemindTaskDispatch(currentTask)) {
      return NextResponse.json({ message: "只有待分配工单可以提醒分配" }, { status: 400 });
    }

    if (!isCreator && user.role !== "admin" && user.role !== "teacher" && user.role !== "leader") {
      return NextResponse.json({ message: "只有提报人或本队教师/负责人可以提醒分配" }, { status: 403 });
    }

    const reviewerIds = await getTeamReviewerIds({
      teamGroupId: currentTask.teamGroupId,
      excludeUserIds: [user.id],
    });

    if (reviewerIds.length === 0) {
      return NextResponse.json({ message: "当前队伍暂无可提醒的项目负责人或指导教师" }, { status: 404 });
    }

    const delivery = await createNotifications({
      userIds: reviewerIds,
      title: `待分配工单：${currentTask.title}`,
      detail: `${user.name} 提醒你分配工单「${currentTask.title}」，请进入任务看板选择处理人。`,
      type: "task_submit",
      targetTab: "board",
      relatedId: currentTask.id,
      senderId: user.id,
      email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
    });

    return NextResponse.json({ success: true, delivery });
  }

  if (body.action === "accept") {
    if (!isAssignee || currentTask.status !== "todo") {
      return NextResponse.json({ message: "只有当前处理人可以接取待接取工单" }, { status: 403 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "doing",
        acceptedAt: new Date(),
      },
      include: taskInclude,
    });

    return NextResponse.json({ task: serializeTask(task) });
  }

  if (body.action === "submit") {
    if (!isAssignee || currentTask.status !== "doing") {
      return NextResponse.json({ message: "只有当前处理人可以提交处理中工单" }, { status: 403 });
    }

    if (currentTask.attachments.length === 0) {
      return NextResponse.json({ message: "请先上传完成凭证，再提交验收" }, { status: 400 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "review",
        submittedAt: new Date(),
        completionNote: body.completionNote?.trim() || currentTask.completionNote,
      },
      include: taskInclude,
    });

    const reviewerIds = currentTask.reviewerId
      ? [currentTask.reviewerId]
      : await getTeamReviewerIds({
          teamGroupId: currentTask.teamGroupId,
          excludeUserIds: [user.id],
        });

    if (reviewerIds.length > 0) {
      await createNotifications({
        userIds: reviewerIds,
        title: `工单待验收：${currentTask.title}`,
        detail: `${user.name} 已提交工单「${currentTask.title}」的完成凭证，请进入任务看板验收闭环。`,
        type: "task_review",
        targetTab: "board",
        relatedId: currentTask.id,
        senderId: user.id,
        email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
      });
    }

    return NextResponse.json({ task: serializeTask(task) });
  }

  if (body.action === "confirm") {
    if (!isReviewer || currentTask.status !== "review") {
      return NextResponse.json({ message: "只有本队指导教师或项目负责人可以确认待验收工单" }, { status: 403 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "archived",
        archivedAt: new Date(),
      },
      include: taskInclude,
    });

    if (currentTask.assigneeId && currentTask.assigneeId !== user.id) {
      await createNotifications({
        userIds: [currentTask.assigneeId],
        title: `工单已归档：${currentTask.title}`,
        detail: `${user.name} 已确认工单「${currentTask.title}」完成，工单已归档备查。`,
        type: "task_confirm",
        targetTab: "board",
        relatedId: currentTask.id,
        senderId: user.id,
        email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
      });
    }

    return NextResponse.json({ task: serializeTask(task) });
  }

  if (body.action === "reject") {
    if (!isReviewer || currentTask.status !== "review") {
      return NextResponse.json({ message: "只有本队指导教师或项目负责人可以驳回待验收工单" }, { status: 403 });
    }

    const rejectionReason = body.rejectionReason?.trim();
    if (!rejectionReason) {
      return NextResponse.json({ message: "请填写驳回原因" }, { status: 400 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "doing",
        rejectedAt: new Date(),
        rejectionReason,
      },
      include: taskInclude,
    });

    if (currentTask.assigneeId && currentTask.assigneeId !== user.id) {
      await createNotifications({
        userIds: [currentTask.assigneeId],
        title: `工单被驳回：${currentTask.title}`,
        detail: `${user.name} 驳回了工单「${currentTask.title}」：${rejectionReason}`,
        type: "task_reject",
        targetTab: "board",
        relatedId: currentTask.id,
        senderId: user.id,
        email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
      });
    }

    return NextResponse.json({ task: serializeTask(task) });
  }

  const hasContentChanges = Boolean(
    body.title?.trim() ||
      body.assigneeId !== undefined ||
      body.dueDate ||
      body.priority ||
      body.status,
  );

  if (!hasContentChanges) {
    return NextResponse.json({ message: "没有需要更新的内容" }, { status: 400 });
  }

  if (!editableByRole && !isCreator && !isAssignee) {
    return NextResponse.json({ message: "只能编辑自己创建或负责的工单" }, { status: 403 });
  }

  const data: {
    title?: string;
    assigneeId?: string | null;
    reviewerId?: string | null;
    dueDate?: Date;
    priority?: "high" | "medium" | "low";
    status?: TaskStatus;
    acceptedAt?: Date | null;
    submittedAt?: Date | null;
    archivedAt?: Date | null;
  } = {};

  if (body.title?.trim()) {
    data.title = body.title.trim();
  }

  if (body.dueDate) {
    const dueDate = parseLocalDateTime(body.dueDate);
    if (!dueDate) {
      return NextResponse.json({ message: "截止时间格式不正确" }, { status: 400 });
    }
    data.dueDate = dueDate;
  }

  if (body.priority) {
    data.priority = taskPriorityValueToDb[body.priority];
  }

  if (body.assigneeId !== undefined) {
    if (!editableByRole && !isCreator) {
      return NextResponse.json({ message: "无权限重新分配工单" }, { status: 403 });
    }

    const nextAssigneeId = body.assigneeId?.trim() || null;
    if (nextAssigneeId) {
      const nextAssignee = await prisma.user.findUnique({
        where: { id: nextAssigneeId },
        select: {
          id: true,
          role: true,
          teamGroupId: true,
          approvalStatus: true,
        },
      });

      if (!nextAssignee || !canAssignTaskToUser(user, nextAssignee)) {
        return NextResponse.json({ message: "无权限把工单指派给该成员" }, { status: 403 });
      }

      data.assigneeId = nextAssignee.id;
      data.reviewerId = editableByRole ? user.id : currentTask.reviewerId;
      data.status = nextAssignee.id === user.id || nextAssignee.role === "leader" ? "doing" : "todo";
      data.acceptedAt = data.status === "doing" ? new Date() : null;
      data.submittedAt = null;
      data.archivedAt = null;
    } else {
      data.assigneeId = null;
      data.status = "todo";
      data.acceptedAt = null;
      data.submittedAt = null;
      data.archivedAt = null;
    }
  }

  const nextStatus = normalizeStatus(body.status);
  if (nextStatus) {
    if (nextStatus === "review") {
      if (!isAssignee || currentTask.status !== "doing") {
        return NextResponse.json({ message: "只有处理人可以提交工单验收" }, { status: 403 });
      }
      if (currentTask.attachments.length === 0) {
        return NextResponse.json({ message: "请先上传完成凭证，再提交验收" }, { status: 400 });
      }
      data.status = "review";
      data.submittedAt = new Date();
    } else if (nextStatus === "archived") {
      if (!isReviewer) {
        return NextResponse.json({ message: "只有本队指导教师或项目负责人可以确认归档" }, { status: 403 });
      }
      data.status = "archived";
      data.archivedAt = new Date();
    } else if (nextStatus === "doing") {
      if (!isAssignee && !editableByRole) {
        return NextResponse.json({ message: "只有处理人或分配人可以推进工单" }, { status: 403 });
      }
      data.status = "doing";
      data.acceptedAt = currentTask.acceptedAt ?? new Date();
    } else if (nextStatus === "todo") {
      if (!editableByRole && !isCreator) {
        return NextResponse.json({ message: "无权限回退工单状态" }, { status: 403 });
      }
      data.status = "todo";
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: taskInclude,
  });

  if (data.assigneeId && data.assigneeId !== currentTask.assigneeId && data.assigneeId !== user.id) {
    await createNotifications({
      userIds: [data.assigneeId],
      title: `工单分配：${task.title}`,
      detail: `${user.name} 将工单「${task.title}」分配给你，请进入任务看板处理。`,
      type: "task_assign",
      targetTab: "board",
      relatedId: task.id,
      senderId: user.id,
      email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
    });
  }

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
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ message: "工单不存在" }, { status: 404 });
  }

  if (!canAccessTask(user, task)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const canDelete =
    user.role === "admin" ||
    user.role === "teacher" ||
    user.role === "leader" ||
    task.creatorId === user.id;
  if (!canDelete) {
    return NextResponse.json({ message: "只能删除自己创建的工单" }, { status: 403 });
  }

  const attachments = task.attachments.map((attachment) => attachment.filePath);
  await prisma.task.delete({ where: { id } });
  await Promise.allSettled(attachments.map((filePath) => deleteStoredFile(filePath)));

  return NextResponse.json({ success: true });
}
