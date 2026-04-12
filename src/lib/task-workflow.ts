import type { Role } from "@prisma/client";

export type TaskReviewerCandidate = {
  id: string;
  role: Role;
};

export type TaskDispatchReminderTarget = {
  status: "todo" | "doing" | "review" | "archived" | "done";
  assigneeId?: string | null;
  assigneeCount?: number;
  acceptedCount?: number;
  submittedCount?: number;
};

export type TaskWorkflowStep = {
  key: "submitted" | "assigned" | "processing" | "review";
  label: string;
  state: "done" | "current" | "pending";
  helper: string;
};

export type TaskWorkflowTarget = TaskDispatchReminderTarget & {
  assigneeName?: string | null;
  reviewerName?: string | null;
};

export type TaskAssignmentProgress = {
  total: number;
  accepted: number;
  submitted: number;
};

export type TaskAssignmentLifecycleInput = {
  assigneeIds: string[];
  acceptedAtValues?: Array<string | Date | null | undefined>;
  submittedAtValues?: Array<string | Date | null | undefined>;
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

export const getTaskReminderActionLabel = (task: TaskDispatchReminderTarget) =>
  canRemindTaskDispatch(task) ? "提醒分配" : "提醒";

export const summarizeTaskAssignments = ({
  assigneeIds,
  acceptedAtValues = [],
  submittedAtValues = [],
}: TaskAssignmentLifecycleInput): TaskAssignmentProgress => ({
  total: assigneeIds.length,
  accepted: acceptedAtValues.filter(Boolean).length,
  submitted: submittedAtValues.filter(Boolean).length,
});

export const deriveTaskStatusFromAssignments = (input: TaskAssignmentLifecycleInput) => {
  const summary = summarizeTaskAssignments(input);

  if (summary.total === 0) {
    return "todo" as const;
  }

  if (summary.submitted === summary.total) {
    return "review" as const;
  }

  if (summary.accepted > 0 || summary.submitted > 0) {
    return "doing" as const;
  }

  return "todo" as const;
};

export const getTaskAcceptedTimeLabel = ({
  status,
  assigneeId,
  acceptedAt,
  assigneeCount = assigneeId ? 1 : 0,
  acceptedCount,
}: TaskDispatchReminderTarget & {
  acceptedAt?: string | null;
}) => {
  const effectiveAcceptedCount = acceptedCount ?? (acceptedAt ? 1 : 0);

  if (assigneeCount > 1) {
    if (effectiveAcceptedCount <= 0) {
      return `0/${assigneeCount} 人已接取`;
    }

    return `${Math.min(effectiveAcceptedCount, assigneeCount)}/${assigneeCount} 人已接取`;
  }

  if (acceptedAt) {
    return acceptedAt;
  }

  if (!assigneeId) {
    return "待分配";
  }

  return status === "todo" ? "待接取" : "已接取（时间未记录）";
};

export const getTaskReviewerLabel = ({
  status,
  reviewerName,
}: Pick<TaskDispatchReminderTarget, "status"> & {
  reviewerName?: string | null;
}) => {
  const nextReviewerName = reviewerName?.trim();
  if (nextReviewerName) {
    return nextReviewerName;
  }

  return status === "archived" || status === "done" ? "已归档（验收人未记录）" : "待本队教师/负责人确认";
};

export const buildTaskWorkflowSteps = (task: TaskWorkflowTarget): TaskWorkflowStep[] => {
  const hasAssignee = Boolean(task.assigneeId);
  const assigneeCount = task.assigneeCount ?? (hasAssignee ? 1 : 0);
  const acceptedCount = task.acceptedCount ?? (task.status === "todo" ? 0 : assigneeCount);
  const submittedCount =
    task.submittedCount ?? (task.status === "review" || task.status === "archived" || task.status === "done" ? assigneeCount : 0);
  const assigneeName = task.assigneeName?.trim() || "处理人";
  const reviewerName = task.reviewerName?.trim() || "验收人";
  const isArchived = task.status === "archived" || task.status === "done";
  const assignedLabel = hasAssignee ? "接取" : "分配";
  const acceptedHelper =
    assigneeCount > 1
      ? `${Math.min(acceptedCount, assigneeCount)}/${assigneeCount} 人已接取`
      : `${assigneeName}${task.status === "todo" ? "待接取" : "已接取"}`;
  const processingHelper =
    assigneeCount > 1
      ? task.status === "review" || isArchived
        ? `${Math.min(submittedCount, assigneeCount)}/${assigneeCount} 人已提交验收`
        : task.status === "doing"
          ? `${Math.min(submittedCount, assigneeCount)}/${assigneeCount} 人已提交，待全部完成`
          : "等待处理"
      : task.status === "review" || isArchived
        ? `${assigneeName}已提交验收`
        : task.status === "doing"
          ? `${assigneeName}处理中`
          : "等待处理";

  return [
    {
      key: "submitted",
      label: "提报",
      state: "done",
      helper: "工单已创建",
    },
    {
      key: "assigned",
      label: assignedLabel,
      state: task.status === "todo" ? "current" : "done",
      helper: hasAssignee ? acceptedHelper : "待负责人/教师分配",
    },
    {
      key: "processing",
      label: "处理",
      state: task.status === "doing" ? "current" : task.status === "todo" ? "pending" : "done",
      helper: processingHelper,
    },
    {
      key: "review",
      label: "验收",
      state: task.status === "review" ? "current" : isArchived ? "done" : "pending",
      helper: isArchived ? "已确认归档" : `${reviewerName}确认闭环`,
    },
  ];
};
