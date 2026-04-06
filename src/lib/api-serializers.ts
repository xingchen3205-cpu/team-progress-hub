import type {
  Announcement,
  Document,
  DocumentCategory,
  DocumentStatus,
  DocumentVersion,
  Event,
  ExpertAttachment,
  ExpertFeedback,
  Notification,
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

export const statusLabels: Record<
  DocumentStatus,
  "待负责人审批" | "待教师终审" | "终审通过" | "负责人打回" | "教师打回"
> = {
  pending: "待负责人审批",
  leader_approved: "待教师终审",
  approved: "终审通过",
  leader_revision: "负责人打回",
  revision: "教师打回",
};

export const statusValueToDb = {
  待负责人审批: "pending",
  待教师终审: "leader_approved",
  终审通过: "approved",
  负责人打回: "leader_revision",
  教师打回: "revision",
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

export const serializeUser = (
  user: Pick<User, "id" | "name" | "username" | "email" | "role" | "avatar" | "responsibility">,
) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email ?? "",
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

export const serializeNotification = (notification: Notification) => ({
  id: notification.id,
  documentId: notification.documentId,
  title: notification.title,
  detail: notification.detail,
  type: notification.type,
  targetTab: notification.targetTab,
  relatedId: notification.relatedId,
  isRead: notification.isRead,
  createdAt: formatDateTime(notification.createdAt),
});

export const serializeEvent = (event: Event) => ({
  id: event.id,
  title: event.title,
  dateTime: event.dateTime.toISOString(),
  type: event.type,
  description: event.description,
  createdAt: event.createdAt.toISOString(),
});

export const serializeExpertFeedback = (
  feedback: ExpertFeedback & {
    attachmentFiles?: ExpertAttachment[];
  },
) => ({
  id: feedback.id,
  date: feedback.date,
  expert: feedback.expert,
  topic: feedback.topic,
  format: feedback.format,
  summary: feedback.summary,
  nextAction: feedback.nextAction,
  attachments:
    feedback.attachmentFiles && feedback.attachmentFiles.length > 0
      ? feedback.attachmentFiles.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          downloadUrl: `/api/experts/${feedback.id}/download?attachmentId=${attachment.id}`,
        }))
      : (() => {
          try {
            return (JSON.parse(feedback.attachments) as string[]).map((item, index) => ({
              id: `${feedback.id}-legacy-${index}`,
              fileName: item,
              fileSize: 0,
              mimeType: "",
              downloadUrl: null,
            }));
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
    statusKey: document.status,
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
