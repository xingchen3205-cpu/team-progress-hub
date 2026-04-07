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
  assigneeId: string;
  creator?: {
    teamGroupId?: string | null;
  } | null;
  assignee?: {
    teamGroupId?: string | null;
  } | null;
};

export const getTaskVisibilityWhere = (actor: TaskActor): Prisma.TaskWhereInput => {
  if (actor.role === "admin") {
    return {};
  }

  if (!actor.teamGroupId) {
    return {
      OR: [{ creatorId: actor.id }, { assigneeId: actor.id }],
    };
  }

  return {
    OR: [
      { creatorId: actor.id },
      { assigneeId: actor.id },
      { creator: { teamGroupId: actor.teamGroupId } },
      { assignee: { teamGroupId: actor.teamGroupId } },
    ],
  };
};

export const canAccessTask = (actor: TaskActor, task: TaskRecord) => {
  if (actor.role === "admin") {
    return true;
  }

  if (task.creatorId === actor.id || task.assigneeId === actor.id) {
    return true;
  }

  if (!actor.teamGroupId) {
    return false;
  }

  return task.creator?.teamGroupId === actor.teamGroupId || task.assignee?.teamGroupId === actor.teamGroupId;
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
