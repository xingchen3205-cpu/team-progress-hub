import type {
  Announcement,
  Document,
  DocumentCategory,
  DocumentStatus,
  DocumentVersion,
  Event,
  ExpertFeedback,
  Report,
  Role,
  Task,
  TaskPriority,
  TaskStatus,
  User,
} from "@prisma/client";

import { roleLabels } from "@/lib/permissions";

export const categoryLabels: Record<DocumentCategory, "计划书" | "PPT" | "答辩材料" | "证明附件"> = {
  plan: "计划书",
  ppt: "PPT",
  defense: "答辩材料",
  proof: "证明附件",
};

export const categoryValueToDb = {
  计划书: "plan",
  PPT: "ppt",
  答辩材料: "defense",
  证明附件: "proof",
} as const;

export const statusLabels: Record<DocumentStatus, "待审核" | "已审核" | "需修改"> = {
  pending: "待审核",
  approved: "已审核",
  revision: "需修改",
};

export const statusValueToDb = {
  待审核: "pending",
  已审核: "approved",
  需修改: "revision",
} as const;

export const taskPriorityLabels: Record<TaskPriority, "高优先级" | "中优先级" | "低优先级"> = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
};

export const taskPriorityValueToDb = {
  高优先级: "high",
  中优先级: "medium",
  低优先级: "low",
} as const;

export const taskStatusLabels: Record<TaskStatus, "todo" | "doing" | "done"> = {
  todo: "todo",
  doing: "doing",
  done: "done",
};

export const formatDateTime = (value: Date | string) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const formatTimeOnly = (value: Date | string) => {
  const date = new Date(value);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const serializeUser = (user: Pick<User, "id" | "name" | "email" | "role" | "avatar" | "responsibility">) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  responsibility: user.responsibility ?? "",
  roleLabel: roleLabels[user.role as Role],
  profile: {
    name: user.name,
    avatar: user.avatar,
    roleLabel: roleLabels[user.role as Role],
  },
});

export const serializeTask = (
  task: Task & {
    assignee: Pick<User, "id" | "name" | "avatar" | "role">;
  },
) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  assigneeId: task.assigneeId,
  dueDate: formatDateTime(task.dueDate),
  priority:
    task.status === "doing"
      ? "进行中"
      : task.status === "done"
        ? "已完成"
        : taskPriorityLabels[task.priority],
  assignee: {
    id: task.assignee.id,
    name: task.assignee.name,
    avatar: task.assignee.avatar,
    roleLabel: roleLabels[task.assignee.role],
  },
  createdAt: task.createdAt.toISOString(),
});

export const serializeReport = (
  report: Report & {
    user: Pick<User, "id" | "name" | "avatar" | "role">;
  },
) => ({
  id: report.id,
  memberId: report.userId,
  userId: report.userId,
  date: report.date,
  submittedAt: formatTimeOnly(report.submittedAt),
  summary: report.summary,
  nextPlan: report.nextPlan,
  attachment: report.attachment || "未上传附件",
  user: {
    id: report.user.id,
    name: report.user.name,
    avatar: report.user.avatar,
    roleLabel: roleLabels[report.user.role],
  },
});

export const serializeAnnouncement = (
  announcement: Announcement & {
    author: Pick<User, "id" | "name" | "avatar">;
  },
) => ({
  id: announcement.id,
  title: announcement.title,
  detail: announcement.detail,
  createdAt: announcement.createdAt.toISOString(),
  author: announcement.author,
});

export const serializeEvent = (event: Event) => ({
  id: event.id,
  title: event.title,
  dateTime: event.dateTime.toISOString(),
  type: event.type,
  description: event.description,
  createdAt: event.createdAt.toISOString(),
});

export const serializeExpertFeedback = (feedback: ExpertFeedback) => ({
  id: feedback.id,
  date: feedback.date,
  expert: feedback.expert,
  topic: feedback.topic,
  format: feedback.format,
  summary: feedback.summary,
  nextAction: feedback.nextAction,
  attachments: (() => {
    try {
      return JSON.parse(feedback.attachments) as string[];
    } catch {
      return [];
    }
  })(),
  createdAt: feedback.createdAt.toISOString(),
});

export const serializeDocumentVersion = (
  version: DocumentVersion & {
    uploader: Pick<User, "name">;
  },
) => ({
  id: version.id,
  version: version.version,
  uploadedAt: formatDateTime(version.uploadedAt),
  uploader: version.uploader.name,
  note: version.note,
  uploaderId: version.uploaderId,
  fileName: version.fileName,
  fileSize: version.fileSize,
  mimeType: version.mimeType,
  downloadUrl: `/api/documents/${version.documentId}/download?versionId=${version.id}`,
});

export const serializeDocument = (
  document: Document & {
    owner: Pick<User, "id" | "name">;
    versions: Array<
      DocumentVersion & {
        uploader: Pick<User, "name">;
      }
    >;
  },
) => {
  const serializedVersions = document.versions.map(serializeDocumentVersion);
  const currentVersionEntry =
    serializedVersions.find((item) => item.version === document.currentVersion) ??
    serializedVersions[0];

  return {
    id: document.id,
    name: document.name,
    category: categoryLabels[document.category],
    ownerId: document.ownerId,
    ownerName: document.owner.name,
    status: statusLabels[document.status],
    comment: document.comment ?? "",
    currentVersion: document.currentVersion,
    currentFileName: currentVersionEntry?.fileName,
    currentFileSize: currentVersionEntry?.fileSize,
    currentMimeType: currentVersionEntry?.mimeType,
    downloadUrl: currentVersionEntry?.downloadUrl ?? null,
    createdAt: document.createdAt.toISOString(),
    versions: serializedVersions,
  };
};
