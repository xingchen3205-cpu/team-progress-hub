import { NextRequest, NextResponse } from "next/server";
import type { Role, TaskAssignment, TaskStatus } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/date";
import { createNotifications } from "@/lib/notifications";
import { assertMainWorkspaceRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/api-serializers";
import { canAccessTask, canAssignTaskToUser, canReviewTask } from "@/lib/task-access";
import { inferTaskTeamGroupId } from "@/lib/task-team-group";
import { deriveTaskStatusFromAssignments, pickTaskDispatchRecipientIds } from "@/lib/task-workflow";
import { deleteStoredFile } from "@/lib/uploads";

const taskInclude = {
  assignee: {
    select: { id: true, name: true, avatar: true, role: true, teamGroupId: true, approvalStatus: true },
  },
  assignments: {
    orderBy: [{ createdAt: "asc" as const }, { assigneeId: "asc" as const }],
    include: {
      assignee: {
        select: { id: true, name: true, avatar: true, role: true, teamGroupId: true, approvalStatus: true },
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

type TaskWithRelations = Awaited<ReturnType<typeof getTask>>;

const getTask = (id: string) =>
  prisma.task.findUnique({
    where: { id },
    include: taskInclude,
  });

const hydrateLegacyTaskTeamGroup = async (task: NonNullable<TaskWithRelations>) => {
  const inferredTeamGroupId = inferTaskTeamGroupId(task);
  if (task.teamGroupId || !inferredTeamGroupId) {
    return task;
  }

  return (
    (await prisma.task.update({
      where: { id: task.id },
      data: { teamGroupId: inferredTeamGroupId },
      include: taskInclude,
    })) ?? task
  );
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

const normalizeAssigneeIds = (body: { assigneeId?: string | null; assigneeIds?: string[] | null } | null) => {
  const candidates = Array.isArray(body?.assigneeIds) ? body.assigneeIds : body?.assigneeId ? [body.assigneeId] : [];
  return Array.from(
    new Set(
      candidates
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
};

const getLifecycleFieldsFromAssignments = (
  assignments: Array<Pick<TaskAssignment, "assigneeId" | "acceptedAt" | "submittedAt">>,
) => {
  const assigneeIds = assignments.map((assignment) => assignment.assigneeId);
  const acceptedAtValues = assignments.map((assignment) => assignment.acceptedAt);
  const submittedAtValues = assignments.map((assignment) => assignment.submittedAt);
  const status = deriveTaskStatusFromAssignments({
    assigneeIds,
    acceptedAtValues,
    submittedAtValues,
  });
  const acceptedAtCandidates = acceptedAtValues.filter((value): value is Date => Boolean(value));
  const submittedAtCandidates = submittedAtValues.filter((value): value is Date => Boolean(value));

  return {
    assigneeId: assigneeIds[0] ?? null,
    status,
    acceptedAt:
      acceptedAtCandidates.length > 0
        ? new Date(Math.min(...acceptedAtCandidates.map((value) => value.getTime())))
        : null,
    submittedAt:
      status === "review" && submittedAtCandidates.length > 0
        ? new Date(Math.max(...submittedAtCandidates.map((value) => value.getTime())))
        : null,
    archivedAt: null,
  };
};

const hydrateLegacyTaskAssignments = async (task: NonNullable<TaskWithRelations>) => {
  if (task.assignments.length > 0 || !task.assigneeId) {
    return task;
  }

  await prisma.taskAssignment.upsert({
    where: {
      taskId_assigneeId: {
        taskId: task.id,
        assigneeId: task.assigneeId,
      },
    },
    update: {},
    create: {
      taskId: task.id,
      assigneeId: task.assigneeId,
      acceptedAt: task.acceptedAt,
      submittedAt: task.submittedAt,
      archivedAt: task.archivedAt,
      rejectedAt: task.rejectedAt,
      rejectionReason: task.rejectionReason,
      completionNote: task.completionNote,
    },
  });

  return (await getTask(task.id)) ?? task;
};

export async function GET(
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
  const fetchedTask = await getTask(id);
  const task = fetchedTask
    ? await hydrateLegacyTaskTeamGroup(await hydrateLegacyTaskAssignments(fetchedTask))
    : null;

  if (!task) {
    return NextResponse.json({ message: "工单不存在" }, { status: 404 });
  }

  if (!canAccessTask(user, task)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ task: serializeTask(task) });
}

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
  const fetchedTask = await getTask(id);

  if (!fetchedTask) {
    return NextResponse.json({ message: "工单不存在" }, { status: 404 });
  }

  const currentTask = await hydrateLegacyTaskTeamGroup(await hydrateLegacyTaskAssignments(fetchedTask));

  if (!canAccessTask(user, currentTask)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        action?: "accept" | "submit" | "confirm" | "reject" | "remind_dispatch";
        title?: string;
        assigneeId?: string | null;
        assigneeIds?: string[] | null;
        teamGroupId?: string | null;
        dueDate?: string;
        status?: "todo" | "doing" | "review" | "archived" | "done";
        completionNote?: string;
        rejectionReason?: string;
      }
    | null;

  if (!body) {
    return NextResponse.json({ message: "请求内容为空" }, { status: 400 });
  }

  const currentAssignment =
    currentTask.assignments.find((assignment) => assignment.assigneeId === user.id) ??
    (currentTask.assigneeId === user.id
      ? {
          id: `legacy-${currentTask.id}`,
          assigneeId: user.id,
          acceptedAt: currentTask.acceptedAt,
          submittedAt: currentTask.submittedAt,
          archivedAt: currentTask.archivedAt,
          rejectedAt: currentTask.rejectedAt,
          rejectionReason: currentTask.rejectionReason,
          completionNote: currentTask.completionNote,
          createdAt: currentTask.createdAt,
          assignee: currentTask.assignee!,
        }
      : null);
  const isReviewer = canReviewTask(user, currentTask);
  const isAssignee = Boolean(currentAssignment);
  const isCreator = currentTask.creatorId === user.id;
  const editableByRole = hasGlobalAdminPrivileges(user.role) || user.role === "teacher" || user.role === "leader";

  if (body.action === "remind_dispatch") {
    if (!(currentTask.status === "todo" && currentTask.assignments.length === 0 && !currentTask.assigneeId)) {
      return NextResponse.json({ message: "只有待分配工单可以提醒分配" }, { status: 400 });
    }

    if (!isCreator && !hasGlobalAdminPrivileges(user.role) && user.role !== "teacher" && user.role !== "leader") {
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
      detail: `${user.name} 提醒你分配工单「${currentTask.title}」，请进入任务中心选择处理人。`,
      type: "task_submit",
      targetTab: "board",
      relatedId: currentTask.id,
      senderId: user.id,
      email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
      emailTeamGroupId: currentTask.teamGroupId ?? null,
    });

    return NextResponse.json({ success: true, delivery });
  }

  if (body.action === "accept") {
    if (!isAssignee || !currentAssignment) {
      return NextResponse.json({ message: "只有被分配的处理人可以接取工单" }, { status: 403 });
    }

    if (currentTask.status !== "todo" && currentTask.status !== "doing") {
      return NextResponse.json({ message: "当前工单无需接取" }, { status: 400 });
    }

    const acceptedAt = currentAssignment.acceptedAt ?? new Date();
    await prisma.taskAssignment.updateMany({
      where: {
        taskId: currentTask.id,
        assigneeId: user.id,
      },
      data: {
        acceptedAt,
      },
    });

    const updatedTask = await getTask(currentTask.id);
    if (!updatedTask) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    const lifecycle = getLifecycleFieldsFromAssignments(updatedTask.assignments);
    const task = await prisma.task.update({
      where: { id: currentTask.id },
      data: {
        assigneeId: lifecycle.assigneeId,
        status: lifecycle.status,
        acceptedAt: lifecycle.acceptedAt,
        submittedAt: lifecycle.submittedAt,
      },
      include: taskInclude,
    });

    return NextResponse.json({ task: serializeTask(task) });
  }

  if (body.action === "submit") {
    if (!isAssignee || !currentAssignment) {
      return NextResponse.json({ message: "只有被分配的处理人可以提交工单" }, { status: 403 });
    }

    if (currentTask.status !== "doing" && currentTask.status !== "todo") {
      return NextResponse.json({ message: "当前工单无法提交验收" }, { status: 400 });
    }

    const now = new Date();
    await prisma.taskAssignment.updateMany({
      where: {
        taskId: currentTask.id,
        assigneeId: user.id,
      },
      data: {
        acceptedAt: currentAssignment.acceptedAt ?? now,
        submittedAt: now,
        completionNote: body.completionNote?.trim() || currentAssignment.completionNote || null,
        rejectedAt: null,
        rejectionReason: null,
      },
    });

    const submittedTask = await getTask(currentTask.id);
    if (!submittedTask) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    const lifecycle = getLifecycleFieldsFromAssignments(submittedTask.assignments);
    const task = await prisma.task.update({
      where: { id: currentTask.id },
      data: {
        assigneeId: lifecycle.assigneeId,
        status: lifecycle.status,
        acceptedAt: lifecycle.acceptedAt,
        submittedAt: lifecycle.submittedAt,
        completionNote:
          lifecycle.status === "review" && body.completionNote?.trim()
            ? body.completionNote.trim()
            : currentTask.completionNote,
        rejectedAt: null,
        rejectionReason: null,
      },
      include: taskInclude,
    });

    if (task.status === "review") {
      const reviewerIds = task.reviewerId
        ? [task.reviewerId]
        : await getTeamReviewerIds({
            teamGroupId: task.teamGroupId,
            excludeUserIds: [user.id],
          });

      if (reviewerIds.length > 0) {
        await createNotifications({
          userIds: reviewerIds,
          title: `工单待验收：${task.title}`,
          detail:
            task.assignments.length > 1
              ? `${user.name} 完成了多人协同工单「${task.title}」的最后一项提交，请进入任务中心统一验收。`
              : `${user.name} 已提交工单「${task.title}」的完成情况，请进入任务中心验收闭环。`,
          type: "task_review",
          targetTab: "board",
          relatedId: task.id,
          senderId: user.id,
          email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
          emailTeamGroupId: task.teamGroupId ?? null,
        });
      }
    }

    return NextResponse.json({ task: serializeTask(task) });
  }

  if (body.action === "confirm") {
    if (!isReviewer || currentTask.status !== "review") {
      return NextResponse.json({ message: "只有本队指导教师或项目负责人可以确认待验收工单" }, { status: 403 });
    }

    const archivedAt = new Date();
    await prisma.taskAssignment.updateMany({
      where: { taskId: currentTask.id },
      data: {
        archivedAt,
      },
    });

    const task = await prisma.task.update({
      where: { id: currentTask.id },
      data: {
        reviewerId: currentTask.reviewerId ?? user.id,
        status: "archived",
        archivedAt,
      },
      include: taskInclude,
    });

    const assigneeIds = task.assignments.map((assignment) => assignment.assigneeId).filter((assigneeId) => assigneeId !== user.id);
    if (assigneeIds.length > 0) {
      await createNotifications({
        userIds: assigneeIds,
        title: `工单已归档：${task.title}`,
        detail: `${user.name} 已确认工单「${task.title}」完成，工单已归档备查。`,
        type: "task_confirm",
        targetTab: "board",
        relatedId: task.id,
        senderId: user.id,
        email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
        emailTeamGroupId: task.teamGroupId ?? null,
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

    const rejectedAt = new Date();
    await prisma.taskAssignment.updateMany({
      where: { taskId: currentTask.id },
      data: {
        submittedAt: null,
        rejectedAt,
        rejectionReason,
      },
    });

    const task = await prisma.task.update({
      where: { id: currentTask.id },
      data: {
        reviewerId: currentTask.reviewerId ?? user.id,
        status: "doing",
        submittedAt: null,
        rejectedAt,
        rejectionReason,
      },
      include: taskInclude,
    });

    const assigneeIds = task.assignments.map((assignment) => assignment.assigneeId).filter((assigneeId) => assigneeId !== user.id);
    if (assigneeIds.length > 0) {
      await createNotifications({
        userIds: assigneeIds,
        title: `工单被驳回：${task.title}`,
        detail: `${user.name} 驳回了工单「${task.title}」：${rejectionReason}`,
        type: "task_reject",
        targetTab: "board",
        relatedId: task.id,
        senderId: user.id,
        email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
        emailTeamGroupId: task.teamGroupId ?? null,
      });
    }

    return NextResponse.json({ task: serializeTask(task) });
  }

  const hasAssigneeChange = body.assigneeId !== undefined || body.assigneeIds !== undefined;
  const nextAssigneeIds = hasAssigneeChange ? normalizeAssigneeIds(body) : currentTask.assignments.map((assignment) => assignment.assigneeId);
  const hasContentChanges = Boolean(body.title?.trim() || body.dueDate || body.status || hasAssigneeChange);

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
    teamGroupId?: string | null;
    dueDate?: Date;
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

  if (hasAssigneeChange) {
    if (!editableByRole && !isCreator) {
      return NextResponse.json({ message: "无权限重新分配工单" }, { status: 403 });
    }

    const assignees = nextAssigneeIds.length
      ? await prisma.user.findMany({
          where: { id: { in: nextAssigneeIds } },
          select: {
            id: true,
            role: true,
            teamGroupId: true,
            approvalStatus: true,
          },
        })
      : [];

    if (assignees.length !== nextAssigneeIds.length) {
      return NextResponse.json({ message: "部分处理人不存在" }, { status: 404 });
    }

    if (assignees.some((assignee) => !canAssignTaskToUser(user, assignee))) {
      return NextResponse.json({ message: "无权限把工单指派给所选成员" }, { status: 403 });
    }

    if (user.role === "member" && nextAssigneeIds.some((assigneeId) => assigneeId !== user.id)) {
      return NextResponse.json({ message: "团队成员只能把工单指派给自己或保留待分配" }, { status: 403 });
    }

    const existingAssignments = currentTask.assignments;
    const existingByAssigneeId = new Map(existingAssignments.map((assignment) => [assignment.assigneeId, assignment]));
    const removedAssigneeIds = existingAssignments
      .map((assignment) => assignment.assigneeId)
      .filter((assigneeId) => !nextAssigneeIds.includes(assigneeId));
    const addedAssigneeIds = nextAssigneeIds.filter((assigneeId) => !existingByAssigneeId.has(assigneeId));
    const now = new Date();
    const autoAcceptedIds = new Set(addedAssigneeIds.filter((assigneeId) => assigneeId === user.id));

    await prisma.$transaction([
      prisma.taskAssignment.deleteMany({
        where: {
          taskId: currentTask.id,
          assigneeId: {
            in: removedAssigneeIds.length > 0 ? removedAssigneeIds : ["__none__"],
          },
        },
      }),
      ...(addedAssigneeIds.length > 0
        ? [
            prisma.taskAssignment.createMany({
              data: addedAssigneeIds.map((assigneeId) => ({
                taskId: currentTask.id,
                assigneeId,
                acceptedAt: autoAcceptedIds.has(assigneeId) ? now : null,
              })),
            }),
          ]
        : []),
    ]);

    const refreshedTask = await getTask(currentTask.id);
    if (!refreshedTask) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    const lifecycle = getLifecycleFieldsFromAssignments(refreshedTask.assignments);
    data.assigneeId = lifecycle.assigneeId;
    data.status = lifecycle.status;
    data.acceptedAt = lifecycle.acceptedAt;
    data.submittedAt = lifecycle.submittedAt;
    data.archivedAt = null;
    data.reviewerId = editableByRole ? currentTask.reviewerId ?? user.id : currentTask.reviewerId;
    data.teamGroupId =
      hasGlobalAdminPrivileges(user.role)
        ? refreshedTask.assignments[0]?.assignee.teamGroupId ?? body.teamGroupId?.trim() ?? currentTask.teamGroupId
        : refreshedTask.assignments[0]?.assignee.teamGroupId ?? currentTask.teamGroupId;

    const task = await prisma.task.update({
      where: { id: currentTask.id },
      data,
      include: taskInclude,
    });

    const addedReminderIds = addedAssigneeIds.filter((assigneeId) => assigneeId !== user.id);
    if (addedReminderIds.length > 0) {
      await createNotifications({
        userIds: addedReminderIds,
        title: `工单分配：${task.title}`,
        detail:
          addedReminderIds.length > 1
            ? `${user.name} 将工单「${task.title}」分配给你们协同处理，请全部完成后统一进入验收。`
            : `${user.name} 将工单「${task.title}」分配给你，请进入任务中心处理。`,
        type: "task_assign",
        targetTab: "board",
        relatedId: task.id,
        senderId: user.id,
        email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
        emailTeamGroupId: task.teamGroupId ?? null,
      });
    }

    return NextResponse.json({ task: serializeTask(task) });
  }

  const nextStatus = normalizeStatus(body.status);
  if (nextStatus) {
    if (nextStatus === "review") {
      return NextResponse.json({ message: "请由执行人提交验收，不支持直接修改到待验收" }, { status: 400 });
    }
    if (nextStatus === "archived") {
      return NextResponse.json({ message: "请通过确认归档完成闭环" }, { status: 400 });
    }
    if (nextStatus === "doing") {
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
      data.acceptedAt = null;
      data.submittedAt = null;
    }
  }

  const task = await prisma.task.update({
    where: { id: currentTask.id },
    data,
    include: taskInclude,
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
  const fetchedTask = await getTask(id);
  const task = fetchedTask ? await hydrateLegacyTaskTeamGroup(fetchedTask) : null;
  if (!task) {
    return NextResponse.json({ message: "工单不存在" }, { status: 404 });
  }

  if (!canAccessTask(user, task)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const canDelete =
    hasGlobalAdminPrivileges(user.role) ||
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
