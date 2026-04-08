import type { Role } from "@prisma/client";

export type TaskReviewerCandidate = {
  id: string;
  role: Role;
};

export type TaskDispatchReminderTarget = {
  status: "todo" | "doing" | "review" | "archived" | "done";
  assigneeId?: string | null;
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

export const buildTaskWorkflowSteps = (task: TaskWorkflowTarget): TaskWorkflowStep[] => {
  const hasAssignee = Boolean(task.assigneeId);
  const assigneeName = task.assigneeName?.trim() || "处理人";
  const reviewerName = task.reviewerName?.trim() || "验收人";
  const isArchived = task.status === "archived" || task.status === "done";
  const assignedLabel = hasAssignee ? "接取" : "分配";

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
      helper: hasAssignee ? `${assigneeName}${task.status === "todo" ? "待接取" : "已接取"}` : "待负责人/教师分配",
    },
    {
      key: "processing",
      label: "处理",
      state: task.status === "doing" ? "current" : task.status === "todo" ? "pending" : "done",
      helper:
        task.status === "review" || isArchived
          ? `${assigneeName}已提交验收`
          : task.status === "doing"
            ? `${assigneeName}处理中`
            : "等待处理",
    },
    {
      key: "review",
      label: "验收",
      state: task.status === "review" ? "current" : isArchived ? "done" : "pending",
      helper: isArchived ? "已确认归档" : `${reviewerName}确认闭环`,
    },
  ];
};
