import type { Role } from "@prisma/client";

export type TaskReviewerCandidate = {
  id: string;
  role: Role;
};

export type TaskDispatchReminderTarget = {
  status: "todo" | "doing" | "review" | "archived" | "done";
  assigneeId?: string | null;
};

export const pickTaskDispatchRecipientIds = ({
  candidates,
  excludeUserIds = [],
}: {
  candidates: TaskReviewerCandidate[];
  excludeUserIds?: string[];
}) => {
  const excluded = new Set(excludeUserIds.filter(Boolean));
  const eligibleCandidates = candidates.filter((candidate) => !excluded.has(candidate.id));
  const leaders = eligibleCandidates.filter((candidate) => candidate.role === "leader");

  if (leaders.length > 0) {
    return leaders.map((leader) => leader.id);
  }

  return eligibleCandidates
    .filter((candidate) => candidate.role === "teacher")
    .map((teacher) => teacher.id);
};

export const canRemindTaskDispatch = (task: TaskDispatchReminderTarget) =>
  task.status === "todo" && !task.assigneeId;
