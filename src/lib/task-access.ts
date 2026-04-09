import type { Prisma, Role, UserApprovalStatus } from "@prisma/client";

type TaskActor = {
  id: string;
  role: Role;
  teamGroupId?: string | null;
};

type TaskUser = {
  id: string;
  role: Role;
  teamGroupId?: string | null;
  approvalStatus?: UserApprovalStatus;
};

type TaskRecord = {
  creatorId: string;
  assigneeId?: string | null;
  reviewerId?: string | null;
  teamGroupId?: string | null;
  assignments?: Array<{
    assigneeId: string;
    assignee?: {
      teamGroupId?: string | null;
    } | null;
  }>;
  creator?: {
    teamGroupId?: string | null;
  } | null;
  assignee?: {
    teamGroupId?: string | null;
  } | null;
  reviewer?: {
    teamGroupId?: string | null;
  } | null;
};

export const getTaskVisibilityWhere = (actor: TaskActor): Prisma.TaskWhereInput => {
  if (actor.role === "admin") {
    return {};
  }

  if (!actor.teamGroupId) {
    return {
      OR: [{ creatorId: actor.id }, { assigneeId: actor.id }, { reviewerId: actor.id }, { assignments: { some: { assigneeId: actor.id } } }],
    };
  }

  return {
    OR: [
      { creatorId: actor.id },
      { assigneeId: actor.id },
      { reviewerId: actor.id },
      { assignments: { some: { assigneeId: actor.id } } },
      { teamGroupId: actor.teamGroupId },
      { creator: { teamGroupId: actor.teamGroupId } },
      { assignee: { teamGroupId: actor.teamGroupId } },
      { reviewer: { teamGroupId: actor.teamGroupId } },
      { assignments: { some: { assignee: { teamGroupId: actor.teamGroupId } } } },
    ],
  };
};

export const canAccessTask = (actor: TaskActor, task: TaskRecord) => {
  if (actor.role === "admin") {
    return true;
  }

  if (
    task.creatorId === actor.id ||
    task.assigneeId === actor.id ||
    task.reviewerId === actor.id ||
    task.assignments?.some((assignment) => assignment.assigneeId === actor.id)
  ) {
    return true;
  }

  if (!actor.teamGroupId) {
    return false;
  }

  return (
    task.teamGroupId === actor.teamGroupId ||
    task.creator?.teamGroupId === actor.teamGroupId ||
    task.assignee?.teamGroupId === actor.teamGroupId ||
    task.reviewer?.teamGroupId === actor.teamGroupId ||
    task.assignments?.some((assignment) => assignment.assignee?.teamGroupId === actor.teamGroupId)
  );
};

export const canAssignTaskToUser = (actor: TaskActor, target: TaskUser) => {
  if (target.approvalStatus && target.approvalStatus !== "approved") {
    return false;
  }

  if (target.role === "expert") {
    return false;
  }

  if (actor.role === "admin") {
    return true;
  }

  if (target.id === actor.id) {
    return true;
  }

  if (actor.role === "member") {
    return false;
  }

  return Boolean(actor.teamGroupId && target.teamGroupId === actor.teamGroupId);
};

export const canReviewTask = (actor: TaskActor, task: TaskRecord) => {
  if (actor.role === "admin") {
    return true;
  }

  if (actor.role !== "teacher" && actor.role !== "leader") {
    return false;
  }

  if (task.reviewerId === actor.id) {
    return true;
  }

  return Boolean(actor.teamGroupId && task.teamGroupId === actor.teamGroupId);
};
