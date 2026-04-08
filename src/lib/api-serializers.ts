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
  TaskAttachment,
  TaskPriority,
  TaskStatus,
  TrainingQuestion,
  TrainingSession,
  User,
} from "@prisma/client";

import { formatBeijingDateTime, formatBeijingTimeOnly } from "@/lib/date";
import { approvalStatusLabels, roleLabels } from "@/lib/permissions";

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

export const taskStatusLabels: Record<TaskStatus, "todo" | "doing" | "review" | "archived"> = {
  todo: "todo",
  doing: "doing",
  review: "review",
  archived: "archived",
  done: "archived",
};

export const formatDateTime = formatBeijingDateTime;
export const formatTimeOnly = formatBeijingTimeOnly;

export const serializeUser = (
  user: Pick<
    User,
    | "id"
    | "name"
    | "username"
    | "email"
    | "role"
    | "avatar"
    | "responsibility"
    | "approvalStatus"
    | "approvedAt"
  > & {
    avatarImagePath?: string | null;
    teamGroupId?: string | null;
    approvedBy?: Pick<User, "id" | "name" | "role"> | null;
    teamGroup?: { id: string; name: string } | null;
  },
) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email ?? "",
  role: user.role,
  avatar: user.avatar,
  avatarUrl: user.avatarImagePath ? `/api/avatar/${user.id}` : null,
  teamGroupId: user.teamGroup?.id ?? user.teamGroupId ?? null,
  teamGroupName: user.teamGroup?.name ?? null,
  responsibility: user.responsibility ?? "",
  roleLabel: roleLabels[user.role as Role],
  approvalStatus: user.approvalStatus,
  approvalStatusLabel: approvalStatusLabels[user.approvalStatus],
  approvedAt: user.approvedAt?.toISOString() ?? null,
  approvedBy: user.approvedBy
    ? {
        id: user.approvedBy.id,
        name: user.approvedBy.name,
        roleLabel: roleLabels[user.approvedBy.role],
      }
    : null,
  profile: {
    name: user.name,
    avatar: user.avatar,
    avatarUrl: user.avatarImagePath ? `/api/avatar/${user.id}` : null,
    roleLabel: roleLabels[user.role as Role],
  },
});

export const serializeTask = (
  task: Task & {
    assignee?: Pick<User, "id" | "name" | "avatar" | "role"> | null;
    creator?: Pick<User, "id" | "name" | "avatar" | "role">;
    reviewer?: Pick<User, "id" | "name" | "avatar" | "role"> | null;
    teamGroup?: { id: string; name: string } | null;
    attachments?: Array<TaskAttachment & { uploader?: Pick<User, "id" | "name"> | null }>;
  },
) => ({
  id: task.id,
  title: task.title,
  status: taskStatusLabels[task.status],
  statusKey: task.status,
  assigneeId: task.assigneeId,
  creatorId: task.creatorId,
  reviewerId: task.reviewerId,
  teamGroupId: task.teamGroupId,
  teamGroupName: task.teamGroup?.name ?? null,
  dueDate: formatDateTime(task.dueDate),
  priority:
    task.status === "doing"
      ? "进行中"
      : task.status === "review"
        ? "待验收"
        : task.status === "archived" || task.status === "done"
          ? "已归档"
        : taskPriorityLabels[task.priority],
  assignee: task.assignee
    ? {
        id: task.assignee.id,
        name: task.assignee.name,
        avatar: task.assignee.avatar,
        roleLabel: roleLabels[task.assignee.role],
      }
    : null,
  creator: task.creator
    ? {
        id: task.creator.id,
        name: task.creator.name,
        avatar: task.creator.avatar,
        roleLabel: roleLabels[task.creator.role],
      }
    : null,
  reviewer: task.reviewer
    ? {
        id: task.reviewer.id,
        name: task.reviewer.name,
        avatar: task.reviewer.avatar,
        roleLabel: roleLabels[task.reviewer.role],
      }
    : null,
  completionNote: task.completionNote ?? "",
  rejectionReason: task.rejectionReason ?? "",
  acceptedAt: task.acceptedAt ? formatDateTime(task.acceptedAt) : null,
  submittedAt: task.submittedAt ? formatDateTime(task.submittedAt) : null,
  archivedAt: task.archivedAt ? formatDateTime(task.archivedAt) : null,
  attachments:
    task.attachments?.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      uploadedAt: formatDateTime(attachment.uploadedAt),
      uploaderId: attachment.uploaderId,
      uploaderName: attachment.uploader?.name ?? "团队成员",
      downloadUrl: `/api/tasks/${task.id}/attachments/${attachment.id}`,
    })) ?? [],
  createdAt: formatDateTime(task.createdAt),
});

export const serializeReport = (
  report: Report & {
    user: Pick<User, "id" | "name" | "avatar" | "role"> & {
      teamGroupId?: string | null;
      teamGroup?: { id: string; name: string } | null;
    };
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
  teamGroupId: report.user.teamGroup?.id ?? report.user.teamGroupId ?? null,
  teamGroupName: report.user.teamGroup?.name ?? null,
  user: {
    id: report.user.id,
    name: report.user.name,
    avatar: report.user.avatar,
    roleLabel: roleLabels[report.user.role],
    teamGroupName: report.user.teamGroup?.name ?? null,
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

export const serializeNotification = (notification: Notification) => {
  const typedNotification = notification as Notification & {
    user?: Pick<User, "id" | "name" | "avatar" | "role">;
    sender?: Pick<User, "id" | "name" | "avatar" | "role"> | null;
  };

  return {
    id: notification.id,
    documentId: notification.documentId,
    title: notification.title,
    detail: notification.detail,
    type: notification.type,
    targetTab: notification.targetTab,
    relatedId: notification.relatedId,
    isRead: notification.isRead,
    readAt: notification.readAt ? formatDateTime(notification.readAt) : null,
    createdAt: formatDateTime(notification.createdAt),
    recipient: typedNotification.user
      ? {
          id: typedNotification.user.id,
          name: typedNotification.user.name,
          avatar: typedNotification.user.avatar,
          roleLabel: roleLabels[typedNotification.user.role],
        }
      : null,
    sender: typedNotification.sender
      ? {
          id: typedNotification.sender.id,
          name: typedNotification.sender.name,
          avatar: typedNotification.sender.avatar,
          roleLabel: roleLabels[typedNotification.sender.role],
        }
      : null,
  };
};

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
            return (JSON.parse(feedback.attachments) as Array<string | { id?: string; fileName?: string }>)
              .map((item, index) => {
                if (typeof item === "string") {
                  return {
                    id: `${feedback.id}-legacy-${index}`,
                    fileName: item,
                    fileSize: 0,
                    mimeType: "",
                    downloadUrl: null,
                  };
                }

                if (item && typeof item === "object") {
                  return {
                    id: item.id || `${feedback.id}-legacy-${index}`,
                    fileName: item.fileName || "历史附件",
                    fileSize: 0,
                    mimeType: "",
                    downloadUrl: null,
                  };
                }

                return null;
              })
              .filter((item): item is NonNullable<typeof item> => Boolean(item));
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
    createdAt: formatDateTime(document.createdAt),
    versions: serializedVersions,
  };
};

export const serializeTrainingQuestion = (
  question: TrainingQuestion & {
    createdBy: Pick<User, "id" | "name">;
  },
) => ({
  id: question.id,
  category: question.category,
  question: question.question,
  answerPoints: question.answerPoints,
  createdById: question.createdById,
  createdByName: question.createdBy.name,
  createdAt: formatDateTime(question.createdAt),
  updatedAt: formatDateTime(question.updatedAt),
});

export const serializeTrainingSession = (
  session: TrainingSession & {
    createdBy: Pick<User, "name">;
  },
) => ({
  id: session.id,
  title: session.title ?? "模拟答辩训练",
  durationSeconds: session.durationSeconds,
  overtimeSeconds: session.overtimeSeconds,
  qaTotal: session.qaTotal,
  qaHit: session.qaHit,
  qaHitRate: session.qaTotal > 0 ? Math.round((session.qaHit / session.qaTotal) * 100) : 0,
  notes: session.notes ?? "",
  createdByName: session.createdBy.name,
  createdAt: formatDateTime(session.createdAt),
});
