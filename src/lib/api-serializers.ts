import type {
  Announcement,
  Document,
  DocumentCategory,
  DocumentStatus,
  DocumentVersion,
  Event,
  ExpertAttachment,
  ExpertFeedback,
  ExpertReviewPackage,
  Notification,
  ProjectMaterialSubmission,
  ProjectReviewStage,
  Report,
  ReportEvaluation,
  ReportEvaluationType,
  Role,
  Task,
  TaskAssignment,
  TaskAttachment,
  TaskPriority,
  TaskStatus,
  TeamGroup,
  TrainingQuestion,
  TrainingSession,
  User,
} from "@prisma/client";

import { formatBeijingDateTime, formatBeijingTimeOnly } from "@/lib/date";
import { approvalStatusLabels, roleLabels } from "@/lib/permissions";
import { getProjectMaterialStatusLabel, parseProjectStageDescription } from "@/lib/project-materials";

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
    emailVerifiedAt?: Date | null;
    college?: string | null;
    className?: string | null;
    studentId?: string | null;
    employeeId?: string | null;
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
  emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  college: user.college ?? "",
  className: user.className ?? "",
  studentId: user.studentId ?? "",
  employeeId: user.employeeId ?? "",
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
    assignments?: Array<
      TaskAssignment & {
        assignee: Pick<User, "id" | "name" | "avatar" | "role">;
      }
    >;
    attachments?: Array<TaskAttachment & { uploader?: Pick<User, "id" | "name"> | null }>;
  },
) => {
  const assignments =
    task.assignments?.map((assignment) => ({
      id: assignment.id,
      assigneeId: assignment.assigneeId,
      acceptedAt: assignment.acceptedAt ? formatDateTime(assignment.acceptedAt) : null,
      submittedAt: assignment.submittedAt ? formatDateTime(assignment.submittedAt) : null,
      archivedAt: assignment.archivedAt ? formatDateTime(assignment.archivedAt) : null,
      rejectedAt: assignment.rejectedAt ? formatDateTime(assignment.rejectedAt) : null,
      rejectionReason: assignment.rejectionReason ?? "",
      completionNote: assignment.completionNote ?? "",
      assignee: {
        id: assignment.assignee.id,
        name: assignment.assignee.name,
        avatar: assignment.assignee.avatar,
        roleLabel: roleLabels[assignment.assignee.role],
      },
    })) ?? [];
  const acceptedCount = assignments.filter((assignment) => Boolean(assignment.acceptedAt)).length;
  const submittedCount = assignments.filter((assignment) => Boolean(assignment.submittedAt)).length;

  return {
  id: task.id,
  title: task.title,
  status: taskStatusLabels[task.status],
  statusKey: task.status,
  assigneeId: task.assigneeId,
  assigneeIds: assignments.map((assignment) => assignment.assigneeId),
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
  assignments,
  assignmentSummary: {
    total: assignments.length,
    accepted: acceptedCount,
    submitted: submittedCount,
  },
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
  };
};

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
  praiseCount: report.praiseCount,
  improveCount: report.improveCount,
  commentCount: report.commentCount,
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

export const serializeReportEvaluation = (
  evaluation: ReportEvaluation & {
    evaluator: Pick<User, "id" | "name" | "avatar" | "role"> & {
      avatarImagePath?: string | null;
    };
    report?: Pick<Report, "id" | "date" | "summary" | "submittedAt" | "userId"> | null;
  },
) => ({
  id: evaluation.id,
  reportId: evaluation.reportId,
  evaluatorId: evaluation.evaluatorId,
  evaluatorRole: evaluation.evaluatorRole,
  evaluatorRoleLabel: roleLabels[evaluation.evaluatorRole as Role],
  type: evaluation.type as ReportEvaluationType,
  content: evaluation.content ?? "",
  isRead: evaluation.isRead,
  createdAt: formatDateTime(evaluation.createdAt),
  updatedAt: formatDateTime(evaluation.updatedAt),
  revokedAt: evaluation.revokedAt ? formatDateTime(evaluation.revokedAt) : null,
  evaluator: {
    id: evaluation.evaluator.id,
    name: evaluation.evaluator.name,
    avatar: evaluation.evaluator.avatar,
    avatarUrl: evaluation.evaluator.avatarImagePath ? `/api/avatar/${evaluation.evaluator.id}` : null,
    roleLabel: roleLabels[evaluation.evaluator.role as Role],
  },
  report: evaluation.report
    ? {
        id: evaluation.report.id,
        date: evaluation.report.date,
        summary: evaluation.report.summary,
        submittedAt: formatTimeOnly(evaluation.report.submittedAt),
        userId: evaluation.report.userId,
      }
    : null,
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
    user?: Pick<User, "id" | "name" | "avatar" | "role" | "email">;
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
    emailStatus: notification.emailStatus,
    emailError: notification.emailError,
    emailSentAt: notification.emailSentAt ? formatDateTime(notification.emailSentAt) : null,
    createdAt: formatDateTime(notification.createdAt),
    recipient: typedNotification.user
      ? {
          id: typedNotification.user.id,
          name: typedNotification.user.name,
          email: typedNotification.user.email,
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
    teamGroup?: Pick<TeamGroup, "id" | "name"> | null;
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
  teamGroupId: feedback.teamGroupId,
  teamGroupName: feedback.teamGroup?.name ?? null,
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
    owner: Pick<User, "id" | "name"> & {
      teamGroupId?: string | null;
      teamGroup?: Pick<TeamGroup, "id" | "name"> | null;
    };
    teamGroup?: Pick<TeamGroup, "id" | "name"> | null;
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
    teamGroupId: document.teamGroupId ?? document.owner.teamGroupId ?? null,
    teamGroupName: document.teamGroup?.name ?? document.owner.teamGroup?.name ?? null,
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

type ProjectReviewStageWithRelations = ProjectReviewStage & {
  creator?: Pick<User, "id" | "name" | "avatar" | "role"> | null;
  teamGroup?: Pick<TeamGroup, "id" | "name"> | null;
  packages?: Array<
    Pick<ExpertReviewPackage, "id" | "status" | "deadline"> & {
      assignments?: Array<{
        id: string;
        score?: {
          lockedAt: Date | null;
        } | null;
      }>;
    }
  >;
  _count?: {
    submissions?: number;
  };
};

type ProjectMaterialSubmissionWithRelations = ProjectMaterialSubmission & {
  stage: Pick<ProjectReviewStage, "id" | "name" | "type" | "isOpen" | "deadline">;
  teamGroup: Pick<TeamGroup, "id" | "name">;
  submitter: Pick<User, "id" | "name" | "avatar" | "role">;
  approver?: Pick<User, "id" | "name" | "avatar" | "role"> | null;
  rejecter?: Pick<User, "id" | "name" | "avatar" | "role"> | null;
};

const serializeProjectMaterialUser = (
  user?: Pick<User, "id" | "name" | "avatar" | "role"> | null,
) =>
  user
    ? {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        roleLabel: roleLabels[user.role],
      }
    : null;

export const serializeProjectReviewStage = (stage: ProjectReviewStageWithRelations) => {
  const stageMeta = parseProjectStageDescription(stage.description, stage.type);
  const hasStageMeta = stage.description?.startsWith("__PROJECT_STAGE_META__:");
  const activePackages = stage.packages ?? [];
  const configuredPackageCount = activePackages.filter((reviewPackage) => reviewPackage.status === "configured").length;
  const archivedPackageCount = activePackages.filter((reviewPackage) => reviewPackage.status === "archived").length;
  const expertAssignmentCount = activePackages.reduce(
    (total, reviewPackage) => total + (reviewPackage.assignments?.length ?? 0),
    0,
  );
  const hasLockedScore = activePackages.some((reviewPackage) =>
    reviewPackage.assignments?.some((assignment) => Boolean(assignment.score?.lockedAt)),
  );
  const nearestReviewDeadline = activePackages
    .map((reviewPackage) => reviewPackage.deadline)
    .filter((deadline): deadline is Date => Boolean(deadline))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;

  return {
    id: stage.id,
    name: stage.name,
    type: stage.type,
    typeLabel: stage.type === "online_review" ? "网络评审" : "项目路演",
    description: stageMeta.description,
    ...(hasStageMeta
      ? {
          requiredMaterials: stageMeta.requiredMaterials,
          allowedTeamGroupIds: stageMeta.allowedTeamGroupIds,
        }
      : {}),
    isOpen: stage.isOpen,
    startAt: stage.startAt?.toISOString() ?? null,
    deadline: stage.deadline?.toISOString() ?? null,
    createdAt: stage.createdAt.toISOString(),
    updatedAt: stage.updatedAt.toISOString(),
    creator: serializeProjectMaterialUser(stage.creator),
    teamGroup: stage.teamGroup
      ? {
          id: stage.teamGroup.id,
          name: stage.teamGroup.name,
        }
      : null,
    submissionCount: stage._count?.submissions ?? 0,
    reviewConfig: {
      status:
        archivedPackageCount > 0 || hasLockedScore
          ? "archived"
          : configuredPackageCount > 0
            ? "configured"
            : "unconfigured",
      statusLabel:
        archivedPackageCount > 0 || hasLockedScore
          ? "已归档"
          : configuredPackageCount > 0
            ? "已配置"
            : "未配置",
      packageCount: activePackages.length,
      expertAssignmentCount,
      deadline: nearestReviewDeadline?.toISOString() ?? null,
    },
  };
};

export const serializeProjectMaterialSubmission = (
  submission: ProjectMaterialSubmissionWithRelations,
) => ({
  id: submission.id,
  stageId: submission.stageId,
  stageName: submission.stage.name,
  stageType: submission.stage.type,
  teamGroupId: submission.teamGroupId,
  teamGroupName: submission.teamGroup.name,
  title: submission.title,
  fileName: submission.fileName,
  filePath: submission.filePath,
  fileSize: submission.fileSize,
  mimeType: submission.mimeType,
  status: submission.status,
  statusLabel: getProjectMaterialStatusLabel(submission.status),
  rejectReason: submission.rejectReason ?? "",
  submittedAt: submission.createdAt.toISOString(),
  updatedAt: submission.updatedAt.toISOString(),
  approvedAt: submission.approvedAt?.toISOString() ?? null,
  rejectedAt: submission.rejectedAt?.toISOString() ?? null,
  submitter: serializeProjectMaterialUser(submission.submitter),
  approver: serializeProjectMaterialUser(submission.approver),
  rejecter: serializeProjectMaterialUser(submission.rejecter),
});
