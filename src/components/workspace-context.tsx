"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  BellPlus,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  Eye,
  FileCheck,
  FileText,
  FolderOpen,
  HelpCircle,
  Home,
  KanbanSquare,
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
  Timer,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";

import type {
  Announcement,
  BoardTask,
  DocumentItem,
  EventItem,
  ExpertItem,
  ExpertReviewAssignmentItem,
  NotificationItem,
  ReportEntry,
  RoleKey,
  TeamGroupItem,
  TeamMember,
  TeamRoleLabel,
  TrainingQuestionItem,
  TrainingSessionItem,
  TrainingStats,
} from "@/data/demo-data";
import {
  boardColumns,
  documentCategories,
  roleLabels,
} from "@/data/demo-data";
import { WorkspaceAssistant } from "@/components/assistant/workspace-assistant";
import type { AiPermissionState } from "@/components/assistant/assistant-types";
import { PdfPreview } from "@/components/pdf-preview";
import {
  formatBeijingDateTimeInput,
  formatBeijingDateTimeShort,
  formatBeijingFriendlyDate,
  getBeijingDateTimeInputAtHour,
  toIsoDateKey,
} from "@/lib/date";
import {
  buildReportDateOptions,
  getReportAttachmentNote,
  getVisibleReportMembers,
  isReportDateKey,
} from "@/lib/report-history";
import { EMAIL_RULE_HINT, USERNAME_RULE_HINT, validateRequiredEmail, validateUsername } from "@/lib/account-policy";
import { getNotificationEmailStatusMeta } from "@/lib/notification-email-status";
import { buildTeamManagementConfirmation } from "@/lib/team-confirmation";
import {
  documentCenterAcceptAttribute,
  documentAcceptAttribute,
  MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
  validateUploadMeta,
} from "@/lib/file-policy";
import {
  expertReviewAcceptAttributes,
  expertReviewCategoryCaps,
  expertReviewFieldHints,
  expertReviewFieldLabels,
  getExpertReviewGradeChoices,
  getExpertReviewGradeFromScore,
  mapExpertReviewGradeToScore,
  expertReviewMaterialLabels,
} from "@/lib/expert-review";
import {
  canTriggerDocumentReminder,
  getDocumentReminderLabel,
  getDocumentReminderRecipientIds,
} from "@/lib/document-reminder";
import type { TrainingQuestionImportCandidate } from "@/lib/training-import";
import {
  buildTaskWorkflowSteps,
  getTaskAcceptedTimeLabel,
  getTaskReminderActionLabel,
  getTaskReviewerLabel,
} from "@/lib/task-workflow";
import { requestJson } from "@/lib/request-json";

export * from "lucide-react";
export * from "@/data/demo-data";
export * from "@/components/assistant/workspace-assistant";
export * from "@/components/assistant/assistant-types";
export * from "@/components/pdf-preview";
export * from "@/lib/date";
export * from "@/lib/report-history";
export * from "@/lib/account-policy";
export * from "@/lib/notification-email-status";
export * from "@/lib/team-confirmation";
export * from "@/lib/file-policy";
export * from "@/lib/expert-review";
export * from "@/lib/document-reminder";
export * from "@/lib/training-import";
export * from "@/lib/task-workflow";
export * from "@/lib/request-json";

export type BoardStatus = (typeof boardColumns)[number]["id"];
export type BoardStatusFilter = BoardStatus | "all";

export type TabKey =
  | "overview"
  | "timeline"
  | "board"
  | "training"
  | "reports"
  | "experts"
  | "review"
  | "documents"
  | "project"
  | "team"
  | "assistant"
  | "profile";

export type WorkspaceResourceKey =
  | "announcements"
  | "events"
  | "tasks"
  | "experts"
  | "documents"
  | "projectStages"
  | "projectMaterials"
  | "team"
  | "trainingQuestions"
  | "trainingSessions"
  | "reviewAssignments"
  | "reports";

export type TabItem = {
  key: TabKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type TaskDraft = {
  title: string;
  assigneeIds: string[];
  teamGroupId: string;
  dueDate: string;
  priority: "高优先级" | "中优先级" | "低优先级";
  notifyAssignee: boolean;
};

export type TaskCompletionDraft = {
  note: string;
  file: File | null;
};

export type TrainingQuestionDraft = {
  category: string;
  customCategory: string;
  question: string;
  answerPoints: string;
};

export type TrainingQuestionImportRow = TrainingQuestionDraft & {
  id: string;
  selected: boolean;
};

export type TrainingTimerPreset = {
  key: "pitch" | "qa" | "full";
  label: string;
  seconds: number;
  description: string;
};

export type EventDraft = {
  title: string;
  dateTime: string;
  type: string;
  description: string;
};

export type ExpertDraft = {
  date: string;
  expert: string;
  topic: string;
  format: string;
  summary: string;
  nextAction: string;
};

export type ExpertDraftErrors = {
  date?: string;
  format?: string;
  expert?: string;
  topic?: string;
  summary?: string;
  nextAction?: string;
  attachments?: string;
  submit?: string;
};

export type AnnouncementDraft = {
  title: string;
  detail: string;
  notifyTeam: boolean;
};

export type ReminderDraft = {
  title: string;
  detail: string;
  targetTab: string;
};

export type ReminderDraftErrors = {
  title?: string;
  detail?: string;
  submit?: string;
};

export type EmailReminderSettingsDraft = {
  taskAssignmentEnabled: boolean;
  taskReviewEnabled: boolean;
  announcementEnabled: boolean;
  directReminderEnabled: boolean;
  documentReviewEnabled: boolean;
  reportSubmitEnabled: boolean;
  dailyReportMissingEnabled: boolean;
  dailyReportHour: number;
};

export type TeamDraft = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: TeamRoleLabel;
  responsibility: string;
  teamGroupId: string;
};

export type BatchExpertDraft = {
  rows: string;
};

export type TeamGroupDraft = {
  name: string;
  description: string;
};

export type ProfileDraft = {
  name: string;
  username: string;
  email: string;
  responsibility: string;
  password: string;
};

export type ReportDraft = {
  summary: string;
  nextPlan: string;
  attachment: string;
};

export type ExpertReviewAssignmentDraft = {
  expertUserId: string;
  expertUserIds: string[];
  targetName: string;
  stageId: string;
  materialSubmissionIds: string[];
  roundLabel: string;
  overview: string;
  deadline: string;
};

export type ExpertReviewMaterialDraft = {
  kind: "plan" | "ppt" | "video";
  name: string;
  file: File | null;
};

export type ExpertReviewScoreDraft = {
  scorePersonalGrowth: string;
  scoreInnovation: string;
  scoreIndustry: string;
  scoreTeamwork: string;
  commentTotal: string;
};

export type DocumentDraft = {
  name: string;
  category: (typeof documentCategories)[number];
  note: string;
  file: File | null;
};

export type CurrentUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: RoleKey;
  avatar: string;
  avatarUrl?: string | null;
  teamGroupId?: string | null;
  teamGroupName?: string | null;
  responsibility: string;
  roleLabel: TeamRoleLabel;
  approvalStatus?: "pending" | "approved";
  approvalStatusLabel?: "待审核" | "已通过";
  profile: {
    name: string;
    avatar: string;
    avatarUrl?: string | null;
    roleLabel: TeamRoleLabel;
  };
};

export type AiPermissionRowItem = {
  userId: string;
  name: string;
  username: string;
  role: RoleKey;
  isEnabled: boolean;
  maxCount: number | null;
  usedCount: number;
  remainingCount: number | null;
  resetAt: string | null;
};

export type AiPermissionDraft = {
  isEnabled: boolean;
  maxCount: string;
};

export type ProjectReviewStageTypeKey = "online_review" | "roadshow";

export type ProjectReviewStageItem = {
  id: string;
  name: string;
  type: ProjectReviewStageTypeKey;
  typeLabel: string;
  description: string | null;
  requiredMaterials?: Array<"plan_pdf" | "ppt_pdf" | "video_20mb">;
  allowedTeamGroupIds?: string[];
  isOpen: boolean;
  startAt: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    name: string;
    avatar: string;
    role: RoleKey;
  } | null;
  teamGroup: {
    id: string;
    name: string;
  } | null;
  submissionCount: number;
};

export type ProjectMaterialStatusKey = "pending" | "approved" | "rejected";

export type ProjectMaterialUser = {
  id: string;
  name: string;
  avatar: string;
  role: RoleKey;
} | null;

export type ProjectMaterialSubmissionItem = {
  id: string;
  stageId: string;
  stageName: string;
  stageType: ProjectReviewStageTypeKey;
  teamGroupId: string;
  teamGroupName: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  status: ProjectMaterialStatusKey;
  statusLabel: string;
  rejectReason: string | null;
  submittedAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  submitter: ProjectMaterialUser;
  approver: ProjectMaterialUser;
  rejecter: ProjectMaterialUser;
};

export type ReportEntryWithDate = ReportEntry & {
  date: string;
  praiseCount?: number;
  improveCount?: number;
  commentCount?: number;
};

export type PreviewAsset = {
  title: string;
  url: string;
  mimeType?: string | null;
  fileName?: string | null;
  mode?: "preview" | "download-fallback";
  downloadUrl?: string | null;
  fallbackMessage?: string;
};

export type TodoCenterItem = {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
  targetTab?: TabKey;
  priority?: "normal" | "warning" | "danger";
  type?: "action" | "notification";
  notificationId?: string;
  documentId?: string | null;
};

export type OverviewDeadlineTone = "danger" | "warning" | "normal";
export type PriorityFocusTagTone =
  | "pending-approval"
  | "pending-review"
  | "pending-action"
  | "pending-view"
  | "clear";

export type PriorityFocusItem = {
  tag: PriorityFocusTagTone;
  text: string;
  targetTab?: TabKey | "notifications";
};

export type OverviewMetric = {
  label: string;
  value: string;
  guide: string;
  isMuted: boolean;
};

export type TimelineNodeTone = "past" | "current" | "future";

export const imagePreviewExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"] as const;
export const wordPreviewExtensions = [".docx"] as const;

export const trainingQuestionCategories = ["商业模式", "技术壁垒", "市场与竞品", "财务数据", "团队分工", "综合答辩", "其他"] as const;

export const defaultTrainingQuestionDraft: TrainingQuestionDraft = {
  category: "商业模式",
  customCategory: "",
  question: "",
  answerPoints: "",
};

export const createTrainingImportRowId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const normalizeTrainingCategory = (draft: Pick<TrainingQuestionDraft, "category" | "customCategory">) =>
  draft.category === "其他" ? draft.customCategory.trim() : draft.category;

export const createTrainingImportRow = (
  values: Partial<TrainingQuestionDraft> & Pick<TrainingQuestionDraft, "question">,
): TrainingQuestionImportRow => {
  const category = values.category?.trim() || "商业模式";
  const knownCategory = trainingQuestionCategories.includes(category as (typeof trainingQuestionCategories)[number]);

  return {
    id: createTrainingImportRowId(),
    selected: true,
    category: knownCategory ? category : "其他",
    customCategory: values.customCategory?.trim() || (knownCategory ? "" : category),
    question: values.question.trim(),
    answerPoints: values.answerPoints?.trim() || "",
  };
};

export const trainingTimerPresets: TrainingTimerPreset[] = [
  {
    key: "pitch",
    label: "5 分钟陈述",
    seconds: 5 * 60,
    description: "适合单独练路演节奏。",
  },
  {
    key: "qa",
    label: "3 分钟问答",
    seconds: 3 * 60,
    description: "适合快速练临场回应。",
  },
  {
    key: "full",
    label: "8 分钟完整训练",
    seconds: 8 * 60,
    description: "5 分钟陈述 + 3 分钟问答。",
  },
];

export const allTabs: TabItem[] = [
  {
    key: "overview",
    label: "首页概览",
    description: "查看倒计时、今日任务摘要、最新公告和关键统计数据。",
    icon: Home,
  },
  {
    key: "timeline",
    label: "时间进度",
    description: "集中查看比赛、答辩、提交等关键时间节点。",
    icon: Timer,
  },
  {
    key: "board",
    label: "任务中心",
    description: "按工单闭环管理提报、分配、处理、验收和归档。",
    icon: KanbanSquare,
  },
  {
    key: "training",
    label: "训练中心",
    description: "沉淀模拟 Q&A 题库、随机抽查、路演计时和训练记录。",
    icon: HelpCircle,
  },
  {
    key: "reports",
    label: "日程汇报",
    description: "按成员与日期查看工作汇报，支持历史记录切换。",
    icon: CalendarDays,
  },
  {
    key: "experts",
    label: "专家意见",
    description: "按时间倒序查看专家反馈与后续落实动作。",
    icon: MessageSquareText,
  },
  {
    key: "project",
    label: "项目管理",
    description: "管理网评、路演等项目材料提交、审批与最终版本归档。",
    icon: FileText,
  },
  {
    key: "review",
    label: "专家评审",
    description: "按职教赛道创业组量表查看评审任务、打分和专家汇总。",
    icon: FileCheck,
  },
  {
    key: "documents",
    label: "资料归档",
    description: "按项目组归档计划书、PPT、答辩材料和证明附件。",
    icon: FolderOpen,
  },
  {
    key: "team",
    label: "团队管理",
    description: "查看成员分工、账号信息和角色配置。",
    icon: Users,
  },
  {
    key: "assistant",
    label: "AI 助手",
    description: "咨询系统使用、赛事流程和材料规范。",
    icon: Bot,
  },
  {
    key: "profile",
    label: "个人信息",
    description: "查看并维护当前登录账号的个人资料。",
    icon: User,
  },
];

export const boardStatusMeta: Record<
  BoardStatus,
  {
    label: string;
    description: string;
    dotClassName: string;
    badgeClassName: string;
    rowAccentClassName: string;
  }
> = {
  todo: {
    label: "待分配 / 待接取",
    description: "等待明确处理人或处理人接取",
    dotClassName: "bg-[#1a6fd4]/35",
    badgeClassName: "border border-white/90 bg-white text-slate-900 shadow-[0_14px_32px_rgba(31,38,135,0.14)]",
    rowAccentClassName: "bg-[#1a6fd4]/35",
  },
  doing: {
    label: "处理中",
    description: "处理人正在推进并补充凭证",
    dotClassName: "bg-[#1a6fd4]",
    badgeClassName: "border border-white/90 bg-white text-[#1a6fd4] shadow-[0_14px_32px_rgba(31,38,135,0.16)]",
    rowAccentClassName: "bg-[#1a6fd4]",
  },
  review: {
    label: "待验收",
    description: "等待负责人或教师确认闭环",
    dotClassName: "bg-[#1a6fd4]/72",
    badgeClassName: "border border-white/90 bg-white text-[#1a6fd4] shadow-[0_14px_32px_rgba(31,38,135,0.16)]",
    rowAccentClassName: "bg-[#1a6fd4]/72",
  },
  archived: {
    label: "已归档",
    description: "已完成闭环，保留备查",
    dotClassName: "bg-[#1a6fd4]/50",
    badgeClassName: "border border-white/90 bg-white text-slate-900/70 shadow-[0_14px_32px_rgba(31,38,135,0.14)]",
    rowAccentClassName: "bg-[#1a6fd4]/50",
  },
};

export const boardStatusOrder: Record<BoardStatus, number> = {
  review: 0,
  doing: 1,
  todo: 2,
  archived: 3,
};

export const getBoardStatusLabel = (task: BoardTask) => {
  const hasAssignments = (task.assignmentSummary?.total ?? task.assignments?.length ?? task.assigneeIds?.length ?? 0) > 0;

  if (task.status === "todo" && !hasAssignments) {
    return "待分配";
  }

  if (task.status === "todo") {
    return "待接取";
  }

  return boardStatusMeta[task.status].label;
};

export const docStatusMeta: Record<
  DocumentStatusKey,
  {
    label: string;
    className: "warning" | "success" | "danger";
  }
> = {
  pending: {
    label: "待负责人审批",
    className: "warning",
  },
  leader_approved: {
    label: "审批通过",
    className: "success",
  },
  approved: {
    label: "终审通过",
    className: "success",
  },
  leader_revision: {
    label: "负责人打回",
    className: "danger",
  },
  revision: {
    label: "教师打回",
    className: "danger",
  },
};

export type DocumentStatusKey = NonNullable<DocumentItem["statusKey"]>;
export type DocumentReviewActionKey =
  | "leaderApprove"
  | "leaderRevision"
  | "teacherApprove"
  | "teacherRevision";
export type DocumentActionButton = {
  key: DocumentReviewActionKey;
  label: string;
};

export type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  successTitle?: string;
  successDetail?: string;
  onConfirm: () => Promise<void> | void;
} | null;

export type SuccessToastState = {
  title: string;
  detail?: string;
} | null;

export type NotificationDeliveryResult = {
  notificationCount: number;
  emailRecipientCount: number;
  emailFailureCount: number;
  emailSkippedReason?: "disabled" | "no-recipient-email" | "setting-disabled";
  emailFailureReason?: "resend-domain-unverified" | "unknown";
};

export type DirectReminderResponse = {
  success: boolean;
  delivery?: NotificationDeliveryResult;
};

export const getReminderDeliveryDetail = (delivery?: NotificationDeliveryResult, fallbackDetail?: string) => {
  if (!delivery) {
    return fallbackDetail ?? "站内提醒已发送。";
  }

  if (delivery.emailRecipientCount > 0 && delivery.emailFailureCount === 0) {
    return `站内提醒已发送，并同步发送了 ${delivery.emailRecipientCount} 封邮件。`;
  }

  if (delivery.emailRecipientCount > 0 && delivery.emailFailureCount > 0) {
    if (delivery.emailFailureReason === "resend-domain-unverified") {
      return "站内提醒已发送；邮件发送失败，Resend 发信域名尚未完成验证。";
    }

    return `站内提醒已发送；${delivery.emailFailureCount} 封邮件发送失败，请稍后重试。`;
  }

  if (delivery.emailSkippedReason === "no-recipient-email") {
    return "站内提醒已发送；对方个人信息里还没有填写邮箱，所以没有发送邮件。";
  }

  if (delivery.emailSkippedReason === "disabled") {
    return "站内提醒已发送；邮件服务暂未配置，所以没有发送邮件。";
  }

  if (delivery.emailSkippedReason === "setting-disabled") {
    return "站内提醒已发送；当前邮件提醒设置已关闭，所以没有发送邮件。";
  }

  return fallbackDetail ?? "站内提醒已发送。";
};

export const getBatchReminderDeliveryDetail = (
  deliveries: Array<NotificationDeliveryResult | undefined>,
  fallbackDetail: string,
) => {
  const validDeliveries = deliveries.filter(
    (delivery): delivery is NotificationDeliveryResult => Boolean(delivery),
  );

  if (validDeliveries.length === 0) {
    return fallbackDetail;
  }

  const emailRecipientCount = validDeliveries.reduce(
    (sum, delivery) => sum + delivery.emailRecipientCount,
    0,
  );
  const emailFailureCount = validDeliveries.reduce((sum, delivery) => sum + delivery.emailFailureCount, 0);
  const skippedNoEmailCount = validDeliveries.filter(
    (delivery) => delivery.emailSkippedReason === "no-recipient-email",
  ).length;

  if (emailRecipientCount > 0 && emailFailureCount === 0) {
    return `站内提醒已发送，并同步发送了 ${emailRecipientCount} 封邮件。`;
  }

  if (emailRecipientCount > 0 && emailFailureCount > 0) {
    if (validDeliveries.some((delivery) => delivery.emailFailureReason === "resend-domain-unverified")) {
      return "站内提醒已发送；邮件发送失败，Resend 发信域名尚未完成验证。";
    }

    return `站内提醒已发送；其中 ${emailFailureCount} 封邮件发送失败，请稍后重试。`;
  }

  if (skippedNoEmailCount > 0) {
    return "站内提醒已发送；部分成员个人信息里没有填写邮箱，所以没有发送邮件。";
  }

  if (validDeliveries.some((delivery) => delivery.emailSkippedReason === "setting-disabled")) {
    return "站内提醒已发送；当前邮件提醒设置已关闭，所以没有发送邮件。";
  }

  return fallbackDetail;
};

export const reviewActionTitles: Record<DocumentReviewActionKey, string> = {
  leaderApprove: "负责人审批通过",
  leaderRevision: "负责人打回",
  teacherApprove: "教师终审通过",
  teacherRevision: "教师打回",
};

export const documentStepLabels = ["成员提交", "负责人审批", "教师终审"] as const;
export type DocumentStepState = "complete" | "current" | "pending";

export const getDocumentWorkflowState = (statusKey: DocumentStatusKey) => {
  switch (statusKey) {
    case "pending":
      return ["complete", "current", "pending"] as const;
    case "leader_approved":
      return ["complete", "complete", "current"] as const;
    case "approved":
      return ["complete", "complete", "complete"] as const;
    case "leader_revision":
      return ["current", "pending", "pending"] as const;
    case "revision":
      return ["complete", "current", "pending"] as const;
    default:
      return ["complete", "pending", "pending"] as const;
  }
};

export const getDocumentStepCaption = (stepState: DocumentStepState) => {
  switch (stepState) {
    case "complete":
      return "已完成";
    case "current":
      return "处理中";
    case "pending":
    default:
      return "等待中";
  }
};

export const taskPriorityStyles: Record<TaskDraft["priority"], string> = {
  高优先级: "depth-emphasis text-[#1a6fd4]",
  中优先级: "depth-emphasis text-[#1a6fd4]/80",
  低优先级: "depth-emphasis text-[#1a6fd4]/65",
};

export const taskWorkflowDotClassNames: Record<"done" | "current" | "pending", string> = {
  done: "bg-[#1a6fd4] text-white shadow-[0_12px_28px_rgba(26,111,212,0.22)]",
  current: "bg-white text-[#1a6fd4] ring-1 ring-white shadow-[0_14px_30px_rgba(31,38,135,0.16)]",
  pending: "bg-white/70 text-slate-900/50 ring-1 ring-white/80",
};

export const surfaceCardClassName = "depth-card rounded-xl p-5";
export const subtleCardClassName = "depth-subtle rounded-xl p-4";
export const fieldClassName =
  "depth-subtle mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#1a6fd4]/55 focus:ring-2 focus:ring-[#1a6fd4]/18";
export const fieldErrorClassName =
  "mt-1.5 w-full rounded-lg border border-[#1a6fd4]/35 bg-white/82 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#1a6fd4]/55 focus:ring-2 focus:ring-[#1a6fd4]/18";
export const textareaClassName = `${fieldClassName} min-h-28`;

export const rolePermissions = {
  admin: {
    visibleTabs: [
      "overview",
      "timeline",
      "board",
      "training",
      "reports",
      "experts",
      "review",
      "documents",
      "project",
      "team",
      "assistant",
      "profile",
    ] as TabKey[],
    canPublishAnnouncement: true,
    canSendDirective: true,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: true,
    canMoveAnyTask: true,
    canSubmitReport: false,
    canViewAllReports: true,
    canUploadExpert: true,
    canDeleteExpert: true,
    canUploadDocument: true,
    canLeaderReviewDocument: true,
    canTeacherReviewDocument: true,
    canDeleteAnyDocument: true,
    canManageTeam: true,
    canManageTeacherAccount: true,
    canEditTimeline: true,
    canResetPassword: true,
  },
  school_admin: {
    visibleTabs: [
      "overview",
      "timeline",
      "board",
      "training",
      "reports",
      "experts",
      "review",
      "documents",
      "project",
      "team",
      "assistant",
      "profile",
    ] as TabKey[],
    canPublishAnnouncement: true,
    canSendDirective: true,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: true,
    canMoveAnyTask: true,
    canSubmitReport: false,
    canViewAllReports: true,
    canUploadExpert: true,
    canDeleteExpert: true,
    canUploadDocument: true,
    canLeaderReviewDocument: true,
    canTeacherReviewDocument: true,
    canDeleteAnyDocument: true,
    canManageTeam: true,
    canManageTeacherAccount: true,
    canEditTimeline: true,
    canResetPassword: true,
  },
  teacher: {
    visibleTabs: ["overview", "timeline", "board", "training", "reports", "experts", "documents", "project", "team", "assistant", "profile"] as TabKey[],
    canPublishAnnouncement: true,
    canSendDirective: true,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: true,
    canMoveAnyTask: true,
    canSubmitReport: false,
    canViewAllReports: true,
    canUploadExpert: true,
    canDeleteExpert: true,
    canUploadDocument: true,
    canLeaderReviewDocument: false,
    canTeacherReviewDocument: true,
    canDeleteAnyDocument: true,
    canManageTeam: true,
    canManageTeacherAccount: true,
    canEditTimeline: true,
    canResetPassword: true,
  },
  leader: {
    visibleTabs: ["overview", "timeline", "board", "training", "reports", "experts", "documents", "project", "team", "assistant", "profile"] as TabKey[],
    canPublishAnnouncement: true,
    canSendDirective: false,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: false,
    canMoveAnyTask: true,
    canSubmitReport: true,
    canViewAllReports: true,
    canUploadExpert: true,
    canDeleteExpert: true,
    canUploadDocument: true,
    canLeaderReviewDocument: true,
    canTeacherReviewDocument: false,
    canDeleteAnyDocument: false,
    canManageTeam: true,
    canManageTeacherAccount: false,
    canEditTimeline: false,
    canResetPassword: false,
  },
  member: {
    visibleTabs: ["overview", "timeline", "board", "training", "reports", "experts", "documents", "project", "team", "assistant", "profile"] as TabKey[],
    canPublishAnnouncement: false,
    canSendDirective: false,
    canCreateTask: true,
    canEditTask: false,
    canDeleteTask: false,
    canMoveAnyTask: false,
    canSubmitReport: true,
    canViewAllReports: false,
    canUploadExpert: false,
    canDeleteExpert: false,
    canUploadDocument: true,
    canLeaderReviewDocument: false,
    canTeacherReviewDocument: false,
    canDeleteAnyDocument: false,
    canManageTeam: false,
    canManageTeacherAccount: false,
    canEditTimeline: false,
    canResetPassword: false,
  },
  expert: {
    visibleTabs: ["review", "profile"] as TabKey[],
    canPublishAnnouncement: false,
    canSendDirective: false,
    canCreateTask: false,
    canEditTask: false,
    canDeleteTask: false,
    canMoveAnyTask: false,
    canSubmitReport: false,
    canViewAllReports: false,
    canUploadExpert: false,
    canDeleteExpert: false,
    canUploadDocument: false,
    canLeaderReviewDocument: false,
    canTeacherReviewDocument: false,
    canDeleteAnyDocument: false,
    canManageTeam: false,
    canManageTeacherAccount: false,
    canEditTimeline: false,
    canResetPassword: false,
  },
} as const;

export const teamRoleToRoleKey: Record<TeamRoleLabel, RoleKey> = {
  系统管理员: "admin",
  校级管理员: "school_admin",
  指导教师: "teacher",
  项目负责人: "leader",
  团队成员: "member",
  评审专家: "expert",
};

export const teamRoleSortOrder: Record<TeamRoleLabel, number> = {
  系统管理员: 0,
  校级管理员: 1,
  指导教师: 2,
  项目负责人: 3,
  团队成员: 4,
  评审专家: 5,
};

export const teamRoleTagClassNames: Record<TeamRoleLabel, string> = {
  系统管理员: "bg-blue-50 text-blue-700 border-blue-200",
  校级管理员: "bg-violet-50 text-violet-700 border-violet-200",
  指导教师: "bg-emerald-50 text-emerald-700 border-emerald-200",
  项目负责人: "bg-amber-50 text-amber-700 border-amber-200",
  团队成员: "bg-slate-100 text-slate-600 border-slate-200",
  评审专家: "bg-rose-50 text-rose-700 border-rose-200",
};

export const formatDateTime = (value: string) => formatBeijingDateTimeShort(value);

export const formatShortDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
};

export const padDatePart = (value: number) => `${value}`.padStart(2, "0");

export const parseDateLikeValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedValue = trimmed.replace(" ", "T");
  const hasExplicitTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalizedValue);
  if (hasExplicitTimeZone) {
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dateTimeMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
  );
  if (dateTimeMatch) {
    const [, year, month, day, hours, minutes, seconds] = dateTimeMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds ?? "0"),
    );
  }

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toDateInputValue = (value: string) => {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = parseDateLikeValue(value);
  if (!parsed) {
    return "";
  }

  return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}-${padDatePart(parsed.getDate())}`;
};

export const toDateTimeInputValue = (value: string) => {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const parsed = parseDateLikeValue(value);
  if (!parsed) {
    return "";
  }

  return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}-${padDatePart(parsed.getDate())}T${padDatePart(parsed.getHours())}:${padDatePart(parsed.getMinutes())}`;
};

export const formatFriendlyDate = (value: Date) => formatBeijingFriendlyDate(value);

export const formatSeconds = (seconds: number) => {
  const normalizedSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;
  return `${minutes}:${`${remainingSeconds}`.padStart(2, "0")}`;
};

export const getCountdown = (target: string) => {
  const difference = Math.max(new Date(target).getTime() - Date.now(), 0);
  const totalSeconds = Math.floor(difference / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

export const getOverviewDeadlineMeta = (
  dueDate: string,
  now: Date,
): { tone: OverviewDeadlineTone; label: string } => {
  const parsedDueDate = parseDateLikeValue(dueDate);
  if (!parsedDueDate) {
    return {
      tone: "normal",
      label: "未设置截止时间",
    };
  }

  const difference = parsedDueDate.getTime() - now.getTime();
  const absoluteMinutes = Math.max(1, Math.floor(Math.abs(difference) / 60000));
  const absoluteHours = Math.max(1, Math.floor(absoluteMinutes / 60));
  const absoluteDays = Math.max(1, Math.floor(absoluteHours / 24));

  const formatRelativeLabel = (prefix: string) => {
    if (absoluteMinutes < 60) {
      return `${prefix} ${absoluteMinutes} 分钟`;
    }

    if (absoluteHours < 24) {
      return `${prefix} ${absoluteHours} 小时`;
    }

    if (absoluteDays <= 2) {
      const remainingHours = absoluteHours % 24;
      if (remainingHours > 0) {
        return `${prefix} ${absoluteDays} 天 ${remainingHours} 小时`;
      }
    }

    return `${prefix} ${absoluteDays} 天`;
  };

  if (difference < 0) {
    return {
      tone: "danger",
      label: formatRelativeLabel("已超期"),
    };
  }

  if (difference <= 24 * 60 * 60 * 1000) {
    return {
      tone: "warning",
      label: formatRelativeLabel("还剩"),
    };
  }

  return {
    tone: "normal",
    label: formatRelativeLabel("还剩"),
  };
};

export const priorityFocusTagMeta: Record<
  PriorityFocusTagTone,
  {
    label: string;
    className: string;
  }
> = {
  "pending-approval": {
    label: "待审批",
    className: "pending-approval",
  },
  "pending-review": {
    label: "待评审",
    className: "pending-review",
  },
  "pending-action": {
    label: "待处理",
    className: "pending-action",
  },
  "pending-view": {
    label: "待查看",
    className: "pending-view",
  },
  clear: {
    label: "无积压",
    className: "clear",
  },
};

export const getTimelinePointStyle = (
  events: EventItem[],
  index: number,
  reservePercent = 10,
  startPercent = 4,
): { left: string } => {
  if (events.length <= 1) {
    return { left: `${startPercent}%` };
  }

  const timestamps = events.map((item) => new Date(item.dateTime).getTime());
  const start = timestamps[0];
  const end = timestamps[timestamps.length - 1];
  const span = Math.max(end - start, 1);
  const usablePercent = 100 - reservePercent - startPercent;
  const ratio = (timestamps[index] - start) / span;

  return {
    left: `${startPercent + usablePercent * ratio}%`,
  };
};

export const getTimelineDateTag = (value: string) => {
  const parsed = parseDateLikeValue(value);
  if (!parsed) {
    return {
      dateLabel: "预计时间",
      timeLabel: "具体时间待定",
    };
  }

  const dateLabel = `预计时间 ${padDatePart(parsed.getMonth() + 1)}/${padDatePart(parsed.getDate())}`;
  const hasSpecificTime = /T\d{2}:\d{2}/.test(value);
  const timeLabel = hasSpecificTime
    ? `具体时间 ${padDatePart(parsed.getHours())}:${padDatePart(parsed.getMinutes())}`
    : "具体时间待定";

  return {
    dateLabel,
    timeLabel,
  };
};

export const getReviewDeadlineMeta = (deadline?: string | null, now = new Date()) => {
  if (!deadline) {
    return {
      tone: "normal" as const,
      label: "未设截止时间",
    };
  }

  const parsedDeadline = parseDateLikeValue(deadline);
  if (!parsedDeadline) {
    return {
      tone: "normal" as const,
      label: "截止时间待定",
    };
  }

  const difference = parsedDeadline.getTime() - now.getTime();
  const absoluteHours = Math.max(1, Math.floor(Math.abs(difference) / (1000 * 60 * 60)));
  const absoluteDays = Math.max(1, Math.floor(absoluteHours / 24));

  if (difference < 0) {
    return {
      tone: "expired" as const,
      label: `已过期 ${absoluteDays} 天`,
    };
  }

  if (difference <= 24 * 60 * 60 * 1000) {
    return {
      tone: "warning" as const,
      label: `还剩 ${absoluteHours} 小时`,
    };
  }

  return {
    tone: "normal" as const,
    label: `还剩 ${absoluteDays} 天`,
  };
};

export const getNearestUpcomingIndex = (events: EventItem[]) => {
  const now = Date.now();
  const nextIndex = events.findIndex((item) => new Date(item.dateTime).getTime() >= now);
  return nextIndex === -1 ? events.length - 1 : nextIndex;
};

export const defaultTaskDraft = (assigneeIds: string[] = [], teamGroupId = ""): TaskDraft => ({
  title: "",
  assigneeIds,
  teamGroupId,
  dueDate: "2026-04-08T18:00",
  priority: "高优先级",
  notifyAssignee: true,
});

export const defaultTaskCompletionDraft: TaskCompletionDraft = {
  note: "",
  file: null,
};

export const defaultAnnouncementDraft: AnnouncementDraft = {
  title: "",
  detail: "",
  notifyTeam: true,
};

export const defaultReminderDraft: ReminderDraft = {
  title: "请及时查看并处理",
  detail: "",
  targetTab: "",
};

export const defaultReminderDraftErrors = (): ReminderDraftErrors => ({});

export const defaultEmailReminderSettingsDraft: EmailReminderSettingsDraft = {
  taskAssignmentEnabled: true,
  taskReviewEnabled: true,
  announcementEnabled: true,
  directReminderEnabled: true,
  documentReviewEnabled: true,
  reportSubmitEnabled: true,
  dailyReportMissingEnabled: true,
  dailyReportHour: 20,
};

export const emailReminderSettingItems: Array<{
  key: keyof Omit<EmailReminderSettingsDraft, "dailyReportHour">;
  title: string;
  description: string;
}> = [
  {
    key: "taskAssignmentEnabled",
    title: "新任务 / 工单指派",
    description: "发布工单、分配处理人、提醒分配时同步邮件。",
  },
  {
    key: "taskReviewEnabled",
    title: "工单验收与返工",
    description: "提交验收、确认归档、驳回返工时同步邮件。",
  },
  {
    key: "announcementEnabled",
    title: "公告同步提醒",
    description: "发布公告并勾选同步提醒时发送邮件。",
  },
  {
    key: "directReminderEnabled",
    title: "站内指令提醒",
    description: "管理员或教师手动发送提醒时同步邮件。",
  },
  {
    key: "documentReviewEnabled",
    title: "文档审批流转",
    description: "文档待审、审批结果、打回修改时同步邮件。",
  },
  {
    key: "reportSubmitEnabled",
    title: "日程汇报提交",
    description: "成员或负责人首次提交当日汇报时同步邮件。",
  },
  {
    key: "dailyReportMissingEnabled",
    title: "每日未提交汇报",
    description: "每天按设置时间提醒未提交汇报的成员。",
  },
];

export const defaultEventDraft: EventDraft = {
  title: "",
  dateTime: "2026-04-15T18:00",
  type: "节点",
  description: "",
};

export const defaultExpertDraft: ExpertDraft = {
  date: toDateInputValue("2026-04-05"),
  expert: "",
  topic: "",
  format: "线上点评",
  summary: "",
  nextAction: "",
};

export const defaultExpertDraftErrors = (): ExpertDraftErrors => ({});

export const defaultTeamDraft: TeamDraft = {
  name: "",
  username: "",
  email: "",
  password: "123456",
  role: "团队成员",
  responsibility: "",
  teamGroupId: "",
};

export const defaultBatchExpertDraft: BatchExpertDraft = {
  rows: "",
};

export const defaultTeamGroupDraft: TeamGroupDraft = {
  name: "",
  description: "",
};

export const defaultProfileDraft = (user?: CurrentUser | null): ProfileDraft => ({
  name: user?.name ?? "",
  username: user?.username ?? "",
  email: user?.email ?? "",
  responsibility: user?.responsibility ?? "",
  password: "",
});

export const defaultReportDraft: ReportDraft = {
  summary: "",
  nextPlan: "",
  attachment: "",
};

export const defaultExpertReviewAssignmentDraft = (
  expertUserId = "",
): ExpertReviewAssignmentDraft => ({
  expertUserId,
  expertUserIds: expertUserId ? [expertUserId] : [],
  targetName: "",
  stageId: "",
  materialSubmissionIds: [],
  roundLabel: "校内专家预审",
  overview: "",
  deadline: getDefaultReviewAssignmentDeadline(),
});

export const getDefaultReviewAssignmentDeadline = () => getBeijingDateTimeInputAtHour(new Date(), 18);

export const defaultExpertReviewMaterialDraft = (): ExpertReviewMaterialDraft => ({
  kind: "plan",
  name: "",
  file: null,
});

export const createExpertReviewScoreDraft = (
  assignment?: ExpertReviewAssignmentItem | null,
): ExpertReviewScoreDraft => ({
  scorePersonalGrowth: getExpertReviewGradeFromScore("scorePersonalGrowth", assignment?.score?.scorePersonalGrowth),
  scoreInnovation: getExpertReviewGradeFromScore("scoreInnovation", assignment?.score?.scoreInnovation),
  scoreIndustry: getExpertReviewGradeFromScore("scoreIndustry", assignment?.score?.scoreIndustry),
  scoreTeamwork: getExpertReviewGradeFromScore("scoreTeamwork", assignment?.score?.scoreTeamwork),
  commentTotal: assignment?.score?.commentTotal ?? "",
});

export const defaultDocumentDraft: DocumentDraft = {
  name: "",
  category: "计划书",
  note: "",
  file: null,
};

export const getDefaultDateKey = () => toIsoDateKey(new Date());

export const getAssetExtension = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const normalized = value.split("?")[0].toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
};

export const isPdfAsset = (asset: PreviewAsset) =>
  asset.mimeType === "application/pdf" ||
  getAssetExtension(asset.fileName) === ".pdf" ||
  getAssetExtension(asset.url) === ".pdf";

export const isImageAsset = (asset: PreviewAsset) =>
  asset.mimeType?.startsWith("image/") ||
  imagePreviewExtensions.includes(getAssetExtension(asset.fileName) as (typeof imagePreviewExtensions)[number]) ||
  imagePreviewExtensions.includes(getAssetExtension(asset.url) as (typeof imagePreviewExtensions)[number]);

export const isTextAsset = (asset: PreviewAsset) =>
  asset.mimeType?.startsWith("text/") ||
  getAssetExtension(asset.fileName) === ".txt" ||
  getAssetExtension(asset.url) === ".txt";

export const isWordAsset = (asset: PreviewAsset) =>
  asset.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  wordPreviewExtensions.includes(getAssetExtension(asset.fileName) as (typeof wordPreviewExtensions)[number]) ||
  wordPreviewExtensions.includes(getAssetExtension(asset.url) as (typeof wordPreviewExtensions)[number]);

export const canPreviewInlineAsset = (asset: Pick<PreviewAsset, "mimeType" | "fileName" | "url">) =>
  isPdfAsset(asset as PreviewAsset) ||
  isImageAsset(asset as PreviewAsset) ||
  isTextAsset(asset as PreviewAsset) ||
  isWordAsset(asset as PreviewAsset);

export const formatFileSize = (fileSize?: number | null) => {
  if (!fileSize || fileSize <= 0) {
    return "未知大小";
  }

  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(fileSize / 1024))} KB`;
};

export const hasPdfSignature = async (file: File) => {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return (
    header.length >= 5 &&
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46 &&
    header[4] === 0x2d
  );
};

export const uploadFileDirectly = ({
  url,
  file,
  contentType,
  onProgress,
}: {
  url: string;
  file: File;
  contentType: string;
  onProgress: (percent: number) => void;
}) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.timeout = 5 * 60 * 1000;
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error("文件直传失败，请稍后重试"));
    };

    xhr.onerror = () => reject(new Error("文件直传失败，请检查网络后重试"));
    xhr.ontimeout = () => reject(new Error("文件上传超时，请稍后重试"));

    xhr.send(file);
  });

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-2">
      <div className="depth-emphasis inline-flex items-center gap-2 px-3 py-2">
        <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      </div>
      {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
  );
}

export function DemoResetNote() {
  return <p className="text-xs leading-6 text-slate-500">当前数据已保存，可跨设备查看</p>;
}

export function Modal({
  title,
  children,
  onClose,
  size = "default",
  panelClassName,
  bodyClassName,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: "default" | "preview";
  panelClassName?: string;
  bodyClassName?: string;
}) {
  const sizeClassName =
    size === "preview" ? "max-w-[min(96vw,1600px)] md:max-h-[92vh]" : "max-w-lg";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/28 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      >
      <div
        className={`depth-card flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl ${sizeClassName} ${panelClassName ?? ""}`.trim()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/55 px-6 pb-4 pt-6">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button className="text-sm text-slate-500" onClick={onClose} type="button">
            关闭
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 ${bodyClassName ?? ""}`.trim()}>{children}</div>
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end sm:gap-3">{children}</div>;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  isLoading = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm leading-7 text-slate-500">{message}</p>
        <ModalActions>
          <ActionButton disabled={isLoading} onClick={onCancel}>
            取消
          </ActionButton>
          <ActionButton
            disabled={isLoading}
            loading={isLoading}
            loadingLabel="提交中..."
            onClick={onConfirm}
            variant={confirmVariant}
          >
            {confirmLabel}
          </ActionButton>
        </ModalActions>
      </div>
    </Modal>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-12 w-12 text-slate-300" />
      <h3 className="mt-4 text-base font-medium text-slate-500">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

export function SuccessToast({ toast }: { toast: SuccessToastState }) {
  if (!toast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed top-5 right-5 z-[80] w-[min(360px,calc(100vw-2rem))]">
      <div className="depth-emphasis px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1a6fd4] shadow-[0_12px_28px_rgba(26,111,212,0.18)]">
            <span className="absolute inset-0 rounded-full bg-[#1a6fd4]/12 animate-ping" />
            <CheckCircle2 className="relative h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
            {toast.detail ? <p className="mt-1 text-sm leading-6 text-slate-500">{toast.detail}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  className: extraClassName,
  disabled,
  loading,
  loadingLabel,
  title,
  variant = "secondary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  title?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const variantClassName =
    variant === "primary"
      ? "depth-button-primary"
      : variant === "danger"
        ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        : "depth-button-secondary text-slate-900 hover:border-white/70 hover:bg-white/70 hover:text-[#1a6fd4]";

  return (
    <button
      className={`inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm shadow-sm transition duration-200 focus-visible:ring-2 focus-visible:ring-[#1a6fd4]/20 focus-visible:outline-none ${variantClassName} ${
        disabled || loading
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100"
          : "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
      } ${extraClassName ?? ""}`}
      disabled={disabled || loading}
      onClick={onClick}
      title={disabled && !loading ? title ?? "无权限" : undefined}
      type="button"
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{loadingLabel ?? "提交中..."}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function UserAvatar({
  name,
  avatar,
  avatarUrl,
  className,
  textClassName,
}: {
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  className: string;
  textClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className={`${className} relative flex items-center justify-center overflow-hidden`}>
      {avatarUrl && !imageFailed ? (
        <Image
          alt={`${name} 的头像`}
          className="object-cover"
          fill
          onError={() => setImageFailed(true)}
          quality={75}
          sizes="64px"
          src={avatarUrl}
        />
      ) : (
        <span className={textClassName ?? "text-sm font-semibold leading-none"}>{avatar}</span>
      )}
    </div>
  );
}

function useWorkspaceController({
  activeTab = "overview",
  targetDocumentId = null,
}: {
  activeTab?: TabKey;
  targetDocumentId?: string | null;
}) {

  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [isBooting, setIsBooting] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const loadedWorkspaceResourcesRef = useRef<Set<string>>(new Set());
  const refreshResourceQueueRef = useRef<Set<WorkspaceResourceKey>>(new Set());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [experts, setExperts] = useState<ExpertItem[]>([]);
  const [reviewAssignments, setReviewAssignments] = useState<ExpertReviewAssignmentItem[]>([]);
  const [trainingQuestions, setTrainingQuestions] = useState<TrainingQuestionItem[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<TrainingSessionItem[]>([]);
  const [trainingStats, setTrainingStats] = useState<TrainingStats>({
    questionCount: 0,
    sessionCount: 0,
    averageOvertimeSeconds: 0,
    qaHitRate: 0,
  });
  const [trainingPanel, setTrainingPanel] = useState<"qa" | "pitch">("qa");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [projectStages, setProjectStages] = useState<ProjectReviewStageItem[]>([]);
  const [projectMaterials, setProjectMaterials] = useState<ProjectMaterialSubmissionItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [sentReminders, setSentReminders] = useState<NotificationItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingTeamMembers, setPendingTeamMembers] = useState<TeamMember[]>([]);
  const [teamGroups, setTeamGroups] = useState<TeamGroupItem[]>([]);
  const [reportEntriesByDay, setReportEntriesByDay] = useState<Record<string, ReportEntryWithDate[]>>({});
  const [reportDates, setReportDates] = useState<string[]>([getDefaultDateKey()]);
  const [selectedDate, setSelectedDate] = useState(getDefaultDateKey());
  const [selectedReportTeamGroupId, setSelectedReportTeamGroupId] = useState("");
  const [reportDeleteTeamGroupId, setReportDeleteTeamGroupId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<string[]>([]);
  const [expandedBoardTaskIds, setExpandedBoardTaskIds] = useState<string[]>([]);
  const [boardStatusFilter, setBoardStatusFilter] = useState<BoardStatusFilter>("all");
  const [boardSearch, setBoardSearch] = useState("");
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sentRemindersOpen, setSentRemindersOpen] = useState(false);
  const [sentRemindersLoading, setSentRemindersLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamRoleFilter, setTeamRoleFilter] = useState<"全部" | TeamRoleLabel>("全部");
  const [teamGroupFilter, setTeamGroupFilter] = useState("全部");
  const [teamAiFilter, setTeamAiFilter] = useState<"全部" | "已开启" | "已关闭">("全部");
  const [teamAccountView, setTeamAccountView] = useState<"team" | "experts">("team");
  const [teamAiSelectedIds, setTeamAiSelectedIds] = useState<string[]>([]);
  const [teamAiPage, setTeamAiPage] = useState(1);
  const [aiBatchQuotaDraft, setAiBatchQuotaDraft] = useState("");
  const [todoAutoOpened, setTodoAutoOpened] = useState(false);
  const [dismissedTodosReady, setDismissedTodosReady] = useState(false);
  const [dismissedTodoIds, setDismissedTodoIds] = useState<string[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    const timerMap = aiPermissionAutoSaveTimersRef.current;
    return () => {
      Object.values(timerMap).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [successToast, setSuccessToast] = useState<SuccessToastState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<PreviewAsset | null>(null);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(defaultTaskDraft([]));
  const [taskCompletionModalOpen, setTaskCompletionModalOpen] = useState(false);
  const [taskCompletionTarget, setTaskCompletionTarget] = useState<BoardTask | null>(null);
  const [taskCompletionDraft, setTaskCompletionDraft] =
    useState<TaskCompletionDraft>(defaultTaskCompletionDraft);
  const [taskRejectModalOpen, setTaskRejectModalOpen] = useState(false);
  const [taskRejectTarget, setTaskRejectTarget] = useState<BoardTask | null>(null);
  const [taskRejectReason, setTaskRejectReason] = useState("");
  const [trainingQuestionDraft, setTrainingQuestionDraft] =
    useState<TrainingQuestionDraft>(defaultTrainingQuestionDraft);
  const [editingTrainingQuestionId, setEditingTrainingQuestionId] = useState<string | null>(null);
  const [questionImportModalOpen, setQuestionImportModalOpen] = useState(false);
  const [questionImportFileName, setQuestionImportFileName] = useState("");
  const [questionImportRows, setQuestionImportRows] = useState<TrainingQuestionImportRow[]>([]);
  const [questionImportError, setQuestionImportError] = useState<string | null>(null);
  const [selectedTrainingQuestionIds, setSelectedTrainingQuestionIds] = useState<string[]>([]);
  const [activeDrillQuestionId, setActiveDrillQuestionId] = useState<string | null>(null);
  const [qaDrillStats, setQaDrillStats] = useState({ total: 0, hit: 0 });
  const [trainingTimerDuration, setTrainingTimerDuration] = useState(8 * 60);
  const [trainingTimerCustomMinutes, setTrainingTimerCustomMinutes] = useState("8");
  const [trainingTimerElapsed, setTrainingTimerElapsed] = useState(0);
  const [trainingTimerRunning, setTrainingTimerRunning] = useState(false);
  const [trainingSessionTitle, setTrainingSessionTitle] = useState("完整答辩模拟");
  const [trainingSessionNotes, setTrainingSessionNotes] = useState("");

  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraft>(defaultAnnouncementDraft);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderTargetMember, setReminderTargetMember] = useState<TeamMember | null>(null);
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft>(defaultReminderDraft);
  const [reminderDraftErrors, setReminderDraftErrors] = useState<ReminderDraftErrors>(defaultReminderDraftErrors);
  const [emailSettingsModalOpen, setEmailSettingsModalOpen] = useState(false);
  const [emailSettingsDraft, setEmailSettingsDraft] = useState<EmailReminderSettingsDraft>(
    defaultEmailReminderSettingsDraft,
  );
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(false);

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft>(defaultEventDraft);

  const [expertModalOpen, setExpertModalOpen] = useState(false);
  const [expertDraft, setExpertDraft] = useState<ExpertDraft>(defaultExpertDraft);
  const [expertFiles, setExpertFiles] = useState<File[]>([]);
  const [expertDraftErrors, setExpertDraftErrors] = useState<ExpertDraftErrors>(defaultExpertDraftErrors);
  const [reviewAssignmentModalOpen, setReviewAssignmentModalOpen] = useState(false);
  const [reviewAssignmentDraft, setReviewAssignmentDraft] = useState<ExpertReviewAssignmentDraft>(
    defaultExpertReviewAssignmentDraft(),
  );
  const [reviewAssignmentEditAssignmentId, setReviewAssignmentEditAssignmentId] = useState<string | null>(null);
  const [reviewMaterialModalOpen, setReviewMaterialModalOpen] = useState(false);
  const [reviewMaterialTargetId, setReviewMaterialTargetId] = useState<string | null>(null);
  const [reviewMaterialDraft, setReviewMaterialDraft] = useState<ExpertReviewMaterialDraft>(
    defaultExpertReviewMaterialDraft(),
  );
  const [reviewMaterialSavingLabel, setReviewMaterialSavingLabel] = useState("上传中...");
  const [reviewMaterialUploadProgress, setReviewMaterialUploadProgress] = useState<number | null>(null);
  const [reviewScoreDrafts, setReviewScoreDrafts] = useState<
    Record<string, ExpertReviewScoreDraft>
  >({});
  const [activeReviewAssignmentId, setActiveReviewAssignmentId] = useState<string | null>(null);
  const [expandedReviewPackageKeys, setExpandedReviewPackageKeys] = useState<string[]>([]);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamDraft, setTeamDraft] = useState<TeamDraft>(defaultTeamDraft);
  const [teamGroupDraft, setTeamGroupDraft] = useState<TeamGroupDraft>(defaultTeamGroupDraft);
  const [editingTeamGroupId, setEditingTeamGroupId] = useState<string | null>(null);
  const [batchExpertModalOpen, setBatchExpertModalOpen] = useState(false);
  const [batchExpertDraft, setBatchExpertDraft] = useState<BatchExpertDraft>(defaultBatchExpertDraft);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(defaultProfileDraft());
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [aiPermissionItems, setAiPermissionItems] = useState<AiPermissionRowItem[]>([]);
  const [aiPermissionDrafts, setAiPermissionDrafts] = useState<Record<string, AiPermissionDraft>>({});
  const [aiPermissionsLoading, setAiPermissionsLoading] = useState(false);
  const [aiPermissionsMessage, setAiPermissionsMessage] = useState<string | null>(null);
  const [aiPermissionSavingId, setAiPermissionSavingId] = useState<string | null>(null);
  const [aiPermissionBatchSaving, setAiPermissionBatchSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const aiPermissionAutoSaveTimersRef = useRef<Record<string, number>>({});
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordTargetMember, setPasswordTargetMember] = useState<TeamMember | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [editingReportDate, setEditingReportDate] = useState<string | null>(null);
  const [reportDraft, setReportDraft] = useState<ReportDraft>(defaultReportDraft);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(defaultDocumentDraft);
  const [documentSavingLabel, setDocumentSavingLabel] = useState("上传中...");
  const [documentUploadProgress, setDocumentUploadProgress] = useState<number | null>(null);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionTargetDocId, setVersionTargetDocId] = useState<string | null>(null);
  const [versionUploadNote, setVersionUploadNote] = useState("");
  const [versionUploadFile, setVersionUploadFile] = useState<File | null>(null);
  const [versionSavingLabel, setVersionSavingLabel] = useState("上传中...");
  const [versionUploadProgress, setVersionUploadProgress] = useState<number | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTargetDocId, setReviewTargetDocId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<DocumentReviewActionKey | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null);
  const [openDocumentViewMenuId, setOpenDocumentViewMenuId] = useState<string | null>(null);
  const [openExpertAttachmentMenuId, setOpenExpertAttachmentMenuId] = useState<string | null>(null);
  const [editingTeamRowId, setEditingTeamRowId] = useState<string | null>(null);
  const [editingTeamRowRole, setEditingTeamRowRole] = useState<TeamRoleLabel | null>(null);
  const [editingTeamRowGroupId, setEditingTeamRowGroupId] = useState<string>("");

  const role = currentUser?.role ?? null;
  const currentRole = role ?? "member";
  const isSystemAdmin = currentRole === "admin";
  const isSchoolAdmin = currentRole === "school_admin";
  const hasGlobalAdminRole = isSystemAdmin || isSchoolAdmin;
  const currentMemberId = currentUser?.id ?? "";
  const permissions = rolePermissions[currentRole];
  const requiresEmailCompletion = Boolean(currentUser && validateRequiredEmail(currentUser.email));
  const visibleTabs = allTabs.filter(
    (item) => permissions.visibleTabs.includes(item.key) && (!requiresEmailCompletion || item.key === "profile"),
  );
  const sidebarTabs = visibleTabs.filter((item) => item.key !== "profile");
  const safeActiveTab =
    visibleTabs.length > 0 && permissions.visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0]?.key ?? "overview";
  const activeTabItem = allTabs.find((item) => item.key === safeActiveTab) ?? allTabs[0];
  const nearestUpcomingIndex = events.length > 0 ? getNearestUpcomingIndex(events) : 0;
  const nearestEvent = events[nearestUpcomingIndex];
  const portalScopeText =
    hasGlobalAdminRole
      ? "全局管理"
      : currentRole === "expert"
        ? "专家评审任务"
        : currentUser?.teamGroupName ?? "未加入项目组";
  const canReviewDocuments =
    hasGlobalAdminRole || permissions.canLeaderReviewDocument || permissions.canTeacherReviewDocument;
  const hasBlockingOverlay =
    taskModalOpen ||
    taskCompletionModalOpen ||
    taskRejectModalOpen ||
    questionImportModalOpen ||
    announcementModalOpen ||
    reminderModalOpen ||
    emailSettingsModalOpen ||
    eventModalOpen ||
    expertModalOpen ||
    reviewAssignmentModalOpen ||
    reviewMaterialModalOpen ||
    teamModalOpen ||
    batchExpertModalOpen ||
    passwordModalOpen ||
    reportModalOpen ||
    documentModalOpen ||
    versionModalOpen ||
    reviewModalOpen ||
    Boolean(previewAsset);

  useEffect(() => {
    setLoadError(null);
    setPreviewAsset(null);
    setSentRemindersOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [safeActiveTab]);

  useEffect(() => {
    if (!requiresEmailCompletion || activeTab === "profile") {
      return;
    }

    router.replace("/workspace?tab=profile");
  }, [activeTab, requiresEmailCompletion, router]);

  useEffect(() => {
    if (!successToast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccessToast(null);
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [successToast]);

  const showSuccessToast = (title: string, detail?: string) => {
    setLoadError(null);
    setSuccessToast({ title, detail });
  };

  const loadAiPermissions = useCallback(async () => {
    if (!hasGlobalAdminRole) {
      return;
    }

    setAiPermissionsLoading(true);
    setAiPermissionsMessage(null);

    try {
      const payload = await requestJson<{ items: AiPermissionRowItem[] }>("/api/admin/ai-permissions");
      setAiPermissionItems(payload.items);
      setAiPermissionDrafts(
        Object.fromEntries(
          payload.items.map((item) => [
            item.userId,
            {
              isEnabled: item.isEnabled,
              maxCount: item.maxCount == null ? "" : String(item.maxCount),
            } satisfies AiPermissionDraft,
          ]),
        ),
      );
    } catch (error) {
      setAiPermissionsMessage(error instanceof Error ? error.message : "AI 权限列表加载失败");
    } finally {
      setAiPermissionsLoading(false);
    }
  }, [hasGlobalAdminRole]);

  const saveAiPermission = async (
    userId: string,
    options?: {
      draft?: AiPermissionDraft;
      resetUsage?: boolean;
      silentSuccess?: boolean;
    },
  ) => {
    const resetUsage = options?.resetUsage ?? false;
    const draft = options?.draft ?? aiPermissionDrafts[userId];
    if (!draft) {
      return false;
    }

    setAiPermissionSavingId(userId);
    setAiPermissionsMessage(null);

    try {
      const payload = await requestJson<{ permission: AiPermissionState }>(`/api/admin/ai-permissions/${userId}`, {
        method: "PUT",
        body: JSON.stringify({
          isEnabled: draft.isEnabled,
          maxCount: draft.maxCount,
          resetUsage,
        }),
      });

      setAiPermissionItems((current) =>
        current.map((item) =>
          item.userId === userId
            ? {
                ...item,
                ...payload.permission,
              }
            : item,
        ),
      );
      setAiPermissionDrafts((current) => ({
        ...current,
        [userId]: {
          isEnabled: payload.permission.isEnabled,
          maxCount: payload.permission.maxCount == null ? "" : String(payload.permission.maxCount),
        },
      }));
      if (!options?.silentSuccess) {
        showSuccessToast(resetUsage ? "AI 次数已重置" : "AI 权限已保存");
      }
      return true;
    } catch (error) {
      setAiPermissionsMessage(error instanceof Error ? error.message : "保存 AI 权限失败");
      return false;
    } finally {
      setAiPermissionSavingId(null);
    }
  };

  const scheduleAiPermissionSave = (userId: string, draft: AiPermissionDraft) => {
    const currentTimer = aiPermissionAutoSaveTimersRef.current[userId];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }

    aiPermissionAutoSaveTimersRef.current[userId] = window.setTimeout(() => {
      delete aiPermissionAutoSaveTimersRef.current[userId];
      void saveAiPermission(userId, {
        draft,
        silentSuccess: true,
      }).then((saved) => {
        if (saved) {
          showSuccessToast("AI 权限已自动保存");
        }
      });
    }, 500);
  };

  const flushAiPermissionSave = (userId: string) => {
    const currentTimer = aiPermissionAutoSaveTimersRef.current[userId];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
      delete aiPermissionAutoSaveTimersRef.current[userId];
    }

    const draft = aiPermissionDrafts[userId];
    if (!draft) {
      return;
    }

    void saveAiPermission(userId, {
      draft,
      silentSuccess: true,
    }).then((saved) => {
      if (saved) {
        showSuccessToast("AI 权限已自动保存");
      }
    });
  };

  const updateAiPermissionDraft = (
    userId: string,
    patch: Partial<AiPermissionDraft>,
    options?: {
      autoSave?: boolean;
    },
  ) => {
    const currentDraft = aiPermissionDrafts[userId] ?? {
      isEnabled: aiPermissionMap.get(userId)?.isEnabled ?? false,
      maxCount: aiPermissionMap.get(userId)?.maxCount == null ? "" : String(aiPermissionMap.get(userId)?.maxCount ?? ""),
    };
    const nextDraft = {
      ...currentDraft,
      ...patch,
    };

    setAiPermissionDrafts((current) => ({
      ...current,
      [userId]: nextDraft,
    }));

    if (options?.autoSave) {
      scheduleAiPermissionSave(userId, nextDraft);
    }
  };

  const runBatchAiPermissionUpdate = async (
    userIds: string[],
    updater: (draft: AiPermissionDraft, item: AiPermissionRowItem | undefined) => AiPermissionDraft,
    options?: {
      resetUsage?: boolean;
      successTitle?: string;
      successDetail?: string;
    },
  ) => {
    if (userIds.length === 0) {
      return;
    }

    setAiPermissionBatchSaving(true);
    setAiPermissionsMessage(null);

    try {
      await Promise.all(
        userIds.map(async (userId) => {
          const item = aiPermissionMap.get(userId);
          const currentDraft = aiPermissionDrafts[userId] ?? {
            isEnabled: item?.isEnabled ?? false,
            maxCount: item?.maxCount == null ? "" : String(item.maxCount),
          };
          const nextDraft = updater(currentDraft, item);

          setAiPermissionDrafts((current) => ({
            ...current,
            [userId]: nextDraft,
          }));

          await saveAiPermission(userId, {
            draft: nextDraft,
            resetUsage: options?.resetUsage,
            silentSuccess: true,
          });
        }),
      );
      setTeamAiSelectedIds([]);
    } finally {
      setAiPermissionBatchSaving(false);
    }
  };

  const confirmBatchAiPermissionUpdate = (
    userIds: string[],
    config: {
      confirmLabel: string;
      message: string;
      successDetail?: string;
      successTitle: string;
      updater: (draft: AiPermissionDraft, item: AiPermissionRowItem | undefined) => AiPermissionDraft;
      resetUsage?: boolean;
    },
  ) => {
    if (userIds.length === 0) {
      return;
    }

    setConfirmDialog({
      open: true,
      title: config.successTitle,
      message: config.message,
      confirmLabel: config.confirmLabel,
      confirmVariant: "primary",
      successTitle: config.successTitle,
      successDetail: config.successDetail,
      onConfirm: async () => {
        await runBatchAiPermissionUpdate(userIds, config.updater, {
          resetUsage: config.resetUsage,
          successTitle: config.successTitle,
          successDetail: config.successDetail,
        });
      },
    });
  };

  const applyReportsPayload = useCallback((reportsPayload: { dates: string[]; reports: ReportEntryWithDate[] }) => {
    const groupedReports = reportsPayload.reports.reduce<Record<string, ReportEntryWithDate[]>>(
      (accumulator, item) => {
        const list = accumulator[item.date] ?? [];
        accumulator[item.date] = [...list, item];
        return accumulator;
      },
      {},
    );

    const nextDates = reportsPayload.dates.length > 0 ? reportsPayload.dates : [getDefaultDateKey()];

    setReportEntriesByDay(groupedReports);
    setReportDates(nextDates);
    setSelectedDate((current) => (isReportDateKey(current) ? current : nextDates[0]));
  }, []);

  const applyReviewAssignments = useCallback((assignments: ExpertReviewAssignmentItem[]) => {
    setReviewAssignments(assignments);
    setReviewScoreDrafts(
      Object.fromEntries(
        assignments.map((assignment) => [assignment.id, createExpertReviewScoreDraft(assignment)]),
      ),
    );
  }, []);

  const applyTeamPayload = useCallback(
    (teamPayload: { members: TeamMember[]; pendingMembers: TeamMember[]; groups?: TeamGroupItem[] }) => {
      setMembers(teamPayload.members);
      setPendingTeamMembers(teamPayload.pendingMembers);
      setTeamGroups(teamPayload.groups ?? []);
      setReviewAssignmentDraft((current) =>
        current.expertUserId
          ? current
          : defaultExpertReviewAssignmentDraft(
              teamPayload.members.find((member) => member.systemRole === "评审专家")?.id ?? "",
            ),
      );
    },
    [],
  );

  const clearNonExpertWorkspaceData = useCallback(() => {
    setAnnouncements([]);
    setEvents([]);
    setTasks([]);
    setExperts([]);
    setTrainingQuestions([]);
    setTrainingSessions([]);
    setTrainingStats({
      questionCount: 0,
      sessionCount: 0,
      averageOvertimeSeconds: 0,
      qaHitRate: 0,
    });
    setDocuments([]);
    setProjectStages([]);
    setProjectMaterials([]);
    setSentReminders([]);
    setMembers([]);
    setPendingTeamMembers([]);
    setTeamGroups([]);
    setReviewAssignmentDraft(defaultExpertReviewAssignmentDraft(""));
    applyReportsPayload({
      dates: [getDefaultDateKey()],
      reports: [],
    });
  }, [applyReportsPayload]);

  const buildReportsRequestUrl = useCallback(
    (role: CurrentUser["role"]) =>
      (role === "admin" || role === "school_admin") && selectedReportTeamGroupId
        ? `/api/reports?teamGroupId=${encodeURIComponent(selectedReportTeamGroupId)}`
        : "/api/reports",
    [selectedReportTeamGroupId],
  );

  const getWorkspaceTabResourceKeys = useCallback(
    (tab: TabKey, role: CurrentUser["role"]): WorkspaceResourceKey[] => {
      if (role === "expert") {
        switch (tab) {
          case "overview":
          case "review":
            return ["reviewAssignments"];
          default:
            return [];
        }
      }

      switch (tab) {
        case "overview":
          return ["announcements", "events", "tasks", "documents", "team", "reviewAssignments", "reports"];
        case "timeline":
          return ["events"];
        case "board":
          return ["tasks", "team"];
        case "training":
          return ["trainingQuestions", "trainingSessions"];
        case "reports":
          return ["team", "reports"];
        case "experts":
          return ["experts"];
        case "review":
          return ["team", "projectStages", "projectMaterials", "reviewAssignments"];
        case "documents":
          return ["documents", "team"];
        case "project":
          return ["projectStages", "projectMaterials", "team"];
        case "team":
          return ["team"];
        case "assistant":
        case "profile":
          return [];
        default:
          return [];
      }
    },
    [],
  );

  const getWorkspaceResourceLoadedKey = useCallback(
    (resourceKey: WorkspaceResourceKey, role: CurrentUser["role"]) =>
      resourceKey === "reports" ? `${resourceKey}:${buildReportsRequestUrl(role)}` : resourceKey,
    [buildReportsRequestUrl],
  );

  const loadWorkspaceResource = useCallback(
    async (resourceKey: WorkspaceResourceKey, role: CurrentUser["role"]) => {
      switch (resourceKey) {
        case "announcements": {
          const payload = await requestJson<{ announcements: Announcement[] }>("/api/announcements");
          setAnnouncements(payload.announcements);
          return;
        }
        case "events": {
          const payload = await requestJson<{ events: EventItem[] }>("/api/events");
          setEvents(payload.events);
          return;
        }
        case "tasks": {
          const payload = await requestJson<{ tasks: BoardTask[] }>("/api/tasks");
          setTasks(payload.tasks);
          return;
        }
        case "experts": {
          const payload = await requestJson<{ experts: ExpertItem[] }>("/api/experts");
          setExperts(payload.experts);
          return;
        }
        case "documents": {
          const payload = await requestJson<{ documents: DocumentItem[] }>("/api/documents");
          setDocuments(payload.documents);
          return;
        }
        case "projectStages": {
          const payload = await requestJson<{ stages: ProjectReviewStageItem[] }>("/api/project-stages");
          setProjectStages(payload.stages);
          return;
        }
        case "projectMaterials": {
          const payload = await requestJson<{ materials: ProjectMaterialSubmissionItem[] }>("/api/project-materials");
          setProjectMaterials(payload.materials);
          return;
        }
        case "team": {
          const payload = await requestJson<{
            members: TeamMember[];
            pendingMembers: TeamMember[];
            groups?: TeamGroupItem[];
          }>("/api/team");
          applyTeamPayload(payload);
          return;
        }
        case "trainingQuestions": {
          const payload = await requestJson<{ questions: TrainingQuestionItem[] }>("/api/training/questions");
          setTrainingQuestions(payload.questions);
          return;
        }
        case "trainingSessions": {
          const payload = await requestJson<{ sessions: TrainingSessionItem[]; stats: TrainingStats }>(
            "/api/training/sessions",
          );
          setTrainingSessions(payload.sessions);
          setTrainingStats(payload.stats);
          return;
        }
        case "reviewAssignments": {
          const canLoadAssignments =
            role === "expert" ||
            role === "admin" ||
            role === "school_admin" ||
            role === "teacher" ||
            role === "leader" ||
            role === "member";

          if (!canLoadAssignments) {
            applyReviewAssignments([]);
            return;
          }

          const payload = await requestJson<{ assignments: ExpertReviewAssignmentItem[] }>(
            "/api/expert-reviews/assignments",
          );
          applyReviewAssignments(payload.assignments);
          return;
        }
        case "reports": {
          const payload = await requestJson<{ dates: string[]; reports: ReportEntryWithDate[] }>(
            buildReportsRequestUrl(role),
          );
          applyReportsPayload(payload);
          return;
        }
        default:
          return;
      }
    },
    [applyReportsPayload, applyReviewAssignments, applyTeamPayload, buildReportsRequestUrl],
  );

  const loadWorkspaceResources = useCallback(
    async (resourceKeys: WorkspaceResourceKey[], role: CurrentUser["role"], options?: { force?: boolean }) => {
      const uniqueKeys = Array.from(new Set(resourceKeys));
      const pendingKeys = uniqueKeys.filter(
        (resourceKey) =>
          options?.force || !loadedWorkspaceResourcesRef.current.has(getWorkspaceResourceLoadedKey(resourceKey, role)),
      );

      if (pendingKeys.length === 0) {
        return;
      }

      await Promise.all(
        pendingKeys.map(async (resourceKey) => {
          await loadWorkspaceResource(resourceKey, role);
          loadedWorkspaceResourcesRef.current.add(getWorkspaceResourceLoadedKey(resourceKey, role));
        }),
      );
    },
    [getWorkspaceResourceLoadedKey, loadWorkspaceResource],
  );

  useEffect(() => {
    let isMounted = true;

    const loadWorkspaceData = async () => {
      setLoadError(null);
      setIsBooting(true);

      try {
        const [mePayload, notificationsPayload] = await Promise.all([
          requestJson<{ user: CurrentUser }>("/api/auth/me"),
          requestJson<{ notifications: NotificationItem[] }>("/api/notifications"),
        ]);

        if (!isMounted) {
          return;
        }

        setCurrentUser(mePayload.user);
        setNotifications(notificationsPayload.notifications);
        loadedWorkspaceResourcesRef.current.add("notifications");
        if (!["admin", "school_admin", "teacher"].includes(mePayload.user.role)) {
          setSentReminders([]);
        }

        if (mePayload.user.role === "expert") {
          clearNonExpertWorkspaceData();
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : "数据加载失败";
        if (message === "未登录") {
          window.location.replace("/login");
          return;
        }

        setLoadError(message);
        setIsBooting(false);
      } finally {
        // Active-tab resources continue loading in the next effect.
      }
    };

    void loadWorkspaceData();

    return () => {
      isMounted = false;
    };
  }, [clearNonExpertWorkspaceData]);

  useEffect(() => {
    const currentUserRole = currentUser?.role;
    if (!currentUserRole) {
      return;
    }

    let isMounted = true;

    const loadActiveTabResources = async () => {
      try {
        const resourceKeys = getWorkspaceTabResourceKeys(safeActiveTab, currentUserRole);
        if (resourceKeys.length > 0) {
          await loadWorkspaceResources(resourceKeys, currentUserRole);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : "工作区数据加载失败";
        if (message === "未登录") {
          window.location.replace("/login");
          return;
        }

        setLoadError(message);
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    };

    void loadActiveTabResources();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.role, getWorkspaceTabResourceKeys, loadWorkspaceResources, safeActiveTab]);

  useEffect(() => {
    const currentUserRole = currentUser?.role;
    if (reloadToken === 0 || !currentUserRole) {
      return;
    }

    let isMounted = true;

    const refreshWorkspaceSilently = async () => {
      try {
        const queuedResourceKeys = Array.from(refreshResourceQueueRef.current);
        refreshResourceQueueRef.current.clear();

        if (!isMounted) {
          return;
        }

        setLoadError(null);
        const resourceKeys =
          queuedResourceKeys.length > 0
            ? queuedResourceKeys
            : getWorkspaceTabResourceKeys(safeActiveTab, currentUserRole);
        if (resourceKeys.length > 0) {
          await loadWorkspaceResources(resourceKeys, currentUserRole, { force: true });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : "工作区数据加载失败";
        if (message === "未登录") {
          window.location.replace("/login");
          return;
        }

        setLoadError(message);
      }
    };

    void refreshWorkspaceSilently();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.role, getWorkspaceTabResourceKeys, loadWorkspaceResources, reloadToken, safeActiveTab]);

  const refreshNotificationsSilently = useCallback(async () => {
    try {
      const payload = await requestJson<{ notifications: NotificationItem[] }>(
        "/api/notifications",
        undefined,
        { cacheTtlMs: 0, force: true },
      );
      setNotifications(payload.notifications);
      loadedWorkspaceResourcesRef.current.add("notifications");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "未登录") {
        window.location.replace("/login");
      }
    }
  }, []);

  useEffect(() => {
    const currentUserRole = currentUser?.role;
    if (!notificationsOpen || !currentUserRole) {
      return;
    }

    void refreshNotificationsSilently();
  }, [currentUser?.role, notificationsOpen, refreshNotificationsSilently]);

  useEffect(() => {
    if (!currentMemberId || requiresEmailCompletion || hasBlockingOverlay) {
      return undefined;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshNotificationsSilently();
      }
    };

    const interval = window.setInterval(refreshIfVisible, 20 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIfVisible();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [currentMemberId, hasBlockingOverlay, refreshNotificationsSilently, requiresEmailCompletion]);

  useEffect(() => {
    if (safeActiveTab !== "team" || !hasGlobalAdminRole || aiPermissionItems.length > 0 || aiPermissionsLoading) {
      return;
    }

    void loadAiPermissions();
  }, [aiPermissionItems.length, aiPermissionsLoading, hasGlobalAdminRole, loadAiPermissions, safeActiveTab]);

  useEffect(() => {
    if (!nearestEvent) {
      setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCountdown(getCountdown(events[getNearestUpcomingIndex(events)].dateTime));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [events, nearestEvent]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!trainingTimerRunning) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setTrainingTimerElapsed((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [trainingTimerRunning]);

  useEffect(() => {
    setProfileDraft(defaultProfileDraft(currentUser));
  }, [currentUser]);

  useEffect(() => {
    if (safeActiveTab !== "documents" || !targetDocumentId) {
      return undefined;
    }

    setExpandedDocs((current) =>
      current.includes(targetDocumentId) ? current : [...current, targetDocumentId],
    );
    setHighlightedDocId(targetDocumentId);

    const scrollTimer = window.setTimeout(() => {
      document
        .getElementById(`doc-${targetDocumentId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);

    const clearHighlightTimer = window.setTimeout(() => {
      setHighlightedDocId((current) => (current === targetDocumentId ? null : current));
    }, 2000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearHighlightTimer);
    };
  }, [documents, safeActiveTab, targetDocumentId]);

  useEffect(() => {
    setMobileSidebarOpen(false);
    setLoadError(null);
    setProfileMenuOpen(false);
  }, [safeActiveTab]);

  useEffect(() => {
    setTeamRoleFilter("全部");
  }, [teamAccountView]);

  useEffect(() => {
    setSelectedTrainingQuestionIds((current) =>
      current.filter((questionId) => trainingQuestions.some((question) => question.id === questionId)),
    );
  }, [trainingQuestions]);

  const membersMap = useMemo(
    () => Object.fromEntries(members.map((item) => [item.id, item])),
    [members],
  );

  const reportEntries = reportEntriesByDay[selectedDate] ?? [];
  const reportEntryMap = new Map<string, ReportEntryWithDate>(
    reportEntries.map((item) => [item.memberId, item]),
  );
  const todayDateKey = getDefaultDateKey();
  const dismissedTodoStorageKey =
    currentUser && todayDateKey ? `workspace-dismissed-todos:${currentUser.id}:${todayDateKey}` : null;
  const todayReportEntries = useMemo(
    () => reportEntriesByDay[todayDateKey] ?? [],
    [reportEntriesByDay, todayDateKey],
  );
  const todayReportEntryMap = useMemo(
    () => new Map<string, ReportEntryWithDate>(todayReportEntries.map((item) => [item.memberId, item])),
    [todayReportEntries],
  );
  const taskAssignableMembers = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const selfAsMember: TeamMember = {
      id: currentUser.id,
      slug: currentUser.username,
      name: currentUser.profile.name,
      account: currentUser.email || currentUser.username,
      accountHidden: false,
      avatar: currentUser.avatar,
      avatarUrl: currentUser.avatarUrl,
      teamGroupId: currentUser.teamGroupId,
      teamGroupName: currentUser.teamGroupName,
      systemRole: currentUser.roleLabel,
      role: currentUser.roleLabel,
      responsibility: currentUser.responsibility,
      progress: "0%",
      approvalStatus: currentUser.approvalStatus,
      approvalStatusLabel: currentUser.approvalStatusLabel,
      canBeManagedByLeader: currentUser.role === "member",
      todayFocus: "",
      completed: "",
      blockers: "",
    };

    const nonExpertMembers = members.filter((item) => item.systemRole !== "评审专家");
    const scopedMembers = nonExpertMembers.some((item) => item.id === currentMemberId)
      ? nonExpertMembers
      : [selfAsMember, ...nonExpertMembers];

    if (currentRole === "member") {
      return scopedMembers.filter((item) => item.id === currentMemberId);
    }

    if (currentRole === "leader") {
      return scopedMembers.filter((item) => item.id === currentMemberId || item.systemRole === "团队成员");
    }

    if (currentRole === "teacher") {
      return scopedMembers.filter((item) =>
        item.id === currentMemberId || item.systemRole === "项目负责人" || item.systemRole === "团队成员",
      );
    }

    return scopedMembers;
  }, [currentMemberId, currentRole, currentUser, members]);

  const defaultAssignableMemberIds =
    currentRole === "member" && currentMemberId ? [currentMemberId] : [];

  const visibleReportMembers = getVisibleReportMembers({
    members,
    currentMemberId,
    viewerRole: currentUser?.role ?? "member",
    viewerTeamGroupId: currentUser?.teamGroupId ?? null,
    selectedTeamGroupId: hasGlobalAdminRole ? selectedReportTeamGroupId : null,
  });
  const reportDateOptions = useMemo(
    () =>
      buildReportDateOptions({
        reportDates,
        selectedDate,
        todayDateKey,
        daysBack: 14,
      }),
    [reportDates, selectedDate, todayDateKey],
  );
  const selectedReportSubmittedCount = reportEntries.length;
  const selectedReportExpectedCount = visibleReportMembers.length;
  const selectedReportMissingCount = Math.max(0, selectedReportExpectedCount - selectedReportSubmittedCount);
  const currentUserSelectedReport = reportEntryMap.get(currentMemberId);
  const selectedDateHasSavedReports = selectedReportSubmittedCount > 0;

  const filteredDocuments = selectedCategory
    ? documents.filter((item) => item.category === selectedCategory)
    : documents;
  const expertMembers = members.filter((member) => member.systemRole === "评审专家");
  const myOpenTasks = tasks.filter(
    (task) =>
      task.status !== "archived" &&
      Boolean(task.assignments?.some((assignment) => assignment.assigneeId === currentMemberId) || task.assigneeId === currentMemberId),
  );
  const pendingLeaderReviewCount = documents.filter((doc) => doc.statusKey === "pending").length;
  const pendingTeacherReviewCount = documents.filter((doc) => doc.statusKey === "leader_approved").length;
  const reportableMembers = members.filter((item) => {
    if (!["项目负责人", "团队成员"].includes(item.systemRole) || !item.teamGroupId) {
      return false;
    }

    if (!hasGlobalAdminRole || !selectedReportTeamGroupId) {
      return true;
    }

    return item.teamGroupId === selectedReportTeamGroupId;
  });
  const reportSubmittedCount = todayReportEntries.length;
  const reportExpectedCount = reportableMembers.length;

  const getMemberName = (memberId: string) => membersMap[memberId]?.name ?? memberId;
  const getTaskAssigneeIds = (task: BoardTask) =>
    task.assigneeIds?.length
      ? task.assigneeIds
      : task.assignments?.length
        ? task.assignments.map((assignment) => assignment.assigneeId)
        : task.assigneeId
          ? [task.assigneeId]
          : [];
  const getTaskAssignments = (task: BoardTask) =>
    task.assignments?.length
      ? task.assignments
      : task.assigneeId
        ? [
            {
              id: `legacy-${task.id}-${task.assigneeId}`,
              assigneeId: task.assigneeId,
              acceptedAt: task.acceptedAt ?? null,
              submittedAt: task.submittedAt ?? null,
              archivedAt: task.archivedAt ?? null,
              rejectedAt: null,
              rejectionReason: task.rejectionReason ?? null,
              completionNote: task.completionNote ?? null,
              assignee: task.assignee ?? {
                id: task.assigneeId,
                name: membersMap[task.assigneeId]?.name ?? "未命名成员",
                avatar: null,
                role: "member" as RoleKey,
              },
            },
          ]
        : [];
  const getCurrentTaskAssignment = (task: BoardTask) =>
    getTaskAssignments(task).find((assignment) => assignment.assigneeId === currentMemberId) ?? null;
  const getTaskAssignmentSummary = (task: BoardTask) => {
    const assignments = getTaskAssignments(task);
    const acceptedCount = assignments.filter((assignment) => Boolean(assignment.acceptedAt)).length;
    const submittedCount = assignments.filter((assignment) => Boolean(assignment.submittedAt)).length;

    return {
      total: assignments.length,
      accepted: acceptedCount,
      submitted: submittedCount,
    };
  };
  const getTaskAssigneeName = (task: BoardTask) => {
    const assignmentNames =
      task.assignments?.map((assignment) => assignment.assignee.name).filter(Boolean) ??
      (task.assigneeId ? [membersMap[task.assigneeId]?.name ?? ""] : []);

    const uniqueNames = Array.from(new Set(assignmentNames.filter(Boolean)));
    if (uniqueNames.length === 0) {
      return "待分配";
    }

    if (uniqueNames.length === 1) {
      return uniqueNames[0];
    }

    return `${uniqueNames[0]}等 ${uniqueNames.length} 人`;
  };

  const todayTaskSummaryTasks = tasks
    .filter((item) => item.status !== "archived")
    .slice(0, 3);

  const canManageMember = (member: TeamMember) => {
    if (!permissions.canManageTeam) {
      return false;
    }
    if (isSystemAdmin) {
      return true;
    }
    if (isSchoolAdmin) {
      return (
        member.systemRole === "指导教师" ||
        member.systemRole === "项目负责人" ||
        member.systemRole === "团队成员" ||
        member.systemRole === "评审专家"
      );
    }
    if (currentRole === "teacher") {
      return (
        member.systemRole === "项目负责人" ||
        member.systemRole === "团队成员" ||
        member.systemRole === "评审专家"
      );
    }
    if (currentRole === "leader") {
      return member.canBeManagedByLeader;
    }
    return false;
  };

  const canResetMemberPassword = (member: TeamMember) => {
    if (!permissions.canResetPassword) {
      return false;
    }

    if (isSystemAdmin) {
      return true;
    }

    if (isSchoolAdmin) {
      return (
        member.systemRole === "指导教师" ||
        member.systemRole === "项目负责人" ||
        member.systemRole === "团队成员" ||
        member.systemRole === "评审专家"
      );
    }

    return (
      member.systemRole === "项目负责人" ||
      member.systemRole === "团队成员" ||
      member.systemRole === "评审专家"
    );
  };

  const canApprovePendingMember = (member: TeamMember) => {
    if (member.approvalStatus !== "pending") {
      return false;
    }

    if (isSystemAdmin || isSchoolAdmin) {
      return ["指导教师", "项目负责人", "团队成员", "评审专家"].includes(member.systemRole);
    }

    if (currentRole === "teacher") {
      return member.systemRole === "项目负责人" || member.systemRole === "团队成员" || member.systemRole === "评审专家";
    }

    if (currentRole === "leader") {
      return member.systemRole === "团队成员";
    }

    return false;
  };

  const availableRoleOptions: TeamRoleLabel[] =
    isSystemAdmin
      ? ["校级管理员", "指导教师", "项目负责人", "团队成员", "评审专家"]
      : isSchoolAdmin
        ? ["指导教师", "项目负责人", "团队成员", "评审专家"]
      : currentRole === "teacher"
        ? ["项目负责人", "团队成员", "评审专家"]
        : ["团队成员"];

  const canViewExpertAccounts = hasGlobalAdminRole || currentRole === "teacher";
  const canViewTeamAccountIdentifiers = hasGlobalAdminRole || currentRole === "teacher";
  const visibleTeamMembers = members.filter((member) => canViewExpertAccounts || member.systemRole !== "评审专家");
  const aiPermissionMap = useMemo(
    () =>
      new Map(
        aiPermissionItems.map((item) => [
          item.userId,
          item,
        ]),
      ),
    [aiPermissionItems],
  );

  const teamAccountRoleLabels = new Set<TeamRoleLabel>(["指导教师", "项目负责人", "团队成员"]);
  const visibleCoreTeamMembers = visibleTeamMembers.filter((member) => teamAccountRoleLabels.has(member.systemRole));
  const visibleExpertAccountMembers = visibleTeamMembers.filter((member) => member.systemRole === "评审专家");
  const activeTeamMembers =
    teamAccountView === "experts" ? visibleExpertAccountMembers : visibleCoreTeamMembers;
  const canUseTeamGroups = hasGlobalAdminRole && teamAccountView === "team";
  const showTeamActions = permissions.canManageTeam || permissions.canSendDirective || permissions.canResetPassword;
  const teamListGridClassName = canUseTeamGroups
    ? "lg:grid-cols-[minmax(0,1.3fr)_160px_180px_120px_minmax(260px,1fr)]"
    : showTeamActions
      ? "lg:grid-cols-[minmax(0,1.4fr)_180px_140px_minmax(280px,1fr)]"
      : "lg:grid-cols-[minmax(0,1.6fr)_180px_140px]";

  const teamFilterOptions = useMemo(() => {
    const roleOptions = [...new Set(activeTeamMembers.map((member) => member.systemRole))] as TeamRoleLabel[];
    if (isSystemAdmin) {
      roleOptions.sort((left, right) => teamRoleSortOrder[left] - teamRoleSortOrder[right]);
    }
    return ["全部", ...roleOptions] as Array<"全部" | TeamRoleLabel>;
  }, [activeTeamMembers, isSystemAdmin]);

  const filteredTeamMembers = activeTeamMembers.filter((member) => {
    const normalizedKeyword = teamSearch.trim().toLowerCase();
    const matchesKeyword =
      !normalizedKeyword ||
      member.name.toLowerCase().includes(normalizedKeyword) ||
      (!member.accountHidden && member.account.toLowerCase().includes(normalizedKeyword));

    const matchesRole = teamRoleFilter === "全部" || member.systemRole === teamRoleFilter;
    const aiPermission = aiPermissionMap.get(member.id);
    const matchesAi =
      !hasGlobalAdminRole ||
      teamAccountView !== "team" ||
      teamAiFilter === "全部" ||
      (teamAiFilter === "已开启" ? aiPermission?.isEnabled : !aiPermission?.isEnabled);
    const matchesGroup =
      !hasGlobalAdminRole ||
      teamAccountView !== "team" ||
      teamGroupFilter === "全部" ||
      (teamGroupFilter === "未分组" ? !member.teamGroupId : member.teamGroupId === teamGroupFilter);
    return matchesKeyword && matchesRole && matchesAi && matchesGroup;
  });
  const sortedTeamMembers = useMemo(() => {
    if (!isSystemAdmin) {
      return filteredTeamMembers;
    }

    return [...filteredTeamMembers].sort((left, right) => {
      const roleOrder = teamRoleSortOrder[left.systemRole] - teamRoleSortOrder[right.systemRole];
      if (roleOrder !== 0) {
        return roleOrder;
      }

      const approvalOrder =
        (left.approvalStatus === "pending" ? 0 : 1) - (right.approvalStatus === "pending" ? 0 : 1);
      if (approvalOrder !== 0) {
        return approvalOrder;
      }

      const groupOrder = (left.teamGroupName ?? "未分组").localeCompare(right.teamGroupName ?? "未分组", "zh-CN");
      if (groupOrder !== 0) {
        return groupOrder;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });
  }, [filteredTeamMembers, isSystemAdmin]);
  const teamPageSize = 20;
  const teamPageCount = Math.max(1, Math.ceil(sortedTeamMembers.length / teamPageSize));
  const displayedTeamMembers = hasGlobalAdminRole
    ? sortedTeamMembers.slice((teamAiPage - 1) * teamPageSize, teamAiPage * teamPageSize)
    : sortedTeamMembers;
  const selectedVisibleAiIds = displayedTeamMembers
    .filter((member) => teamAiSelectedIds.includes(member.id))
    .map((member) => member.id);
  const allVisibleAiSelected = displayedTeamMembers.length > 0 && selectedVisibleAiIds.length === displayedTeamMembers.length;
  const teamAiStats = useMemo(() => {
    const relevantPermissions = activeTeamMembers
      .map((member) => aiPermissionMap.get(member.id))
      .filter((item): item is AiPermissionRowItem => Boolean(item));
    const enabledCount = relevantPermissions.filter((item) => item.isEnabled).length;
    const usedTotal = relevantPermissions.reduce((sum, item) => sum + item.usedCount, 0);
    const quotaTotal = relevantPermissions.some((item) => item.maxCount == null)
      ? null
      : relevantPermissions.reduce((sum, item) => sum + (item.maxCount ?? 0), 0);

    return {
      totalMembers: activeTeamMembers.length,
      enabledCount,
      usedTotal,
      quotaUsed: usedTotal,
      quotaTotal,
    };
  }, [activeTeamMembers, aiPermissionMap]);
  const canBatchCreateExperts = hasGlobalAdminRole || currentRole === "teacher";

  useEffect(() => {
    if (!canViewExpertAccounts && teamAccountView === "experts") {
      setTeamAccountView("team");
    }
  }, [canViewExpertAccounts, teamAccountView]);

  useEffect(() => {
    setTeamAiPage(1);
    setTeamAiSelectedIds([]);
  }, [teamSearch, teamRoleFilter, teamGroupFilter, teamAiFilter, teamAccountView]);

  useEffect(() => {
    if (teamAiPage > teamPageCount) {
      setTeamAiPage(teamPageCount);
    }
  }, [teamAiPage, teamPageCount]);

  const pendingApprovalMembers = pendingTeamMembers.filter((member) => canApprovePendingMember(member));
  const unreadTodoNotifications = notifications.filter((item) => !item.isRead);

  const roleTodoItems = useMemo<TodoCenterItem[]>(() => {
    if (!currentUser) {
      return [];
    }

    const items: TodoCenterItem[] = [];
    const nearestCountdown = nearestEvent ? getCountdown(nearestEvent.dateTime) : null;
    const daysUntilNearest = nearestCountdown?.days ?? null;

    if (nearestEvent && daysUntilNearest !== null && daysUntilNearest <= 14) {
      items.push({
        id: `event-${nearestEvent.id}`,
        title: `关键节点临近：${nearestEvent.title}`,
        detail:
          daysUntilNearest <= 0
            ? `${nearestEvent.type} 已经进入当天，请尽快确认材料、人员和现场安排。`
            : `距离该节点还有 ${daysUntilNearest} 天 ${nearestCountdown?.hours ?? 0} 小时，建议尽快检查准备情况。`,
        actionLabel: "查看时间进度",
        targetTab: "timeline",
        priority: daysUntilNearest <= 3 ? "danger" : "warning",
      });
    }

    if ((currentRole === "member" || currentRole === "leader") && !todayReportEntryMap.has(currentMemberId)) {
      items.push({
        id: `report-${currentMemberId}-${todayDateKey}`,
        title: "今日汇报待提交",
        detail: `今天还没有提交 ${todayDateKey} 的日程汇报，建议先补齐今日完成和明日计划。`,
        actionLabel: "填写日程汇报",
        targetTab: "reports",
        priority: "warning",
      });
    }

    if (currentRole === "member" && myOpenTasks.length > 0) {
      items.push({
        id: `task-${currentMemberId}`,
        title: "我的任务待推进",
        detail: `你当前还有 ${myOpenTasks.length} 项未完成任务，建议先同步状态并推进。`,
        actionLabel: "查看任务中心",
        targetTab: "board",
      });
    }

    if (["leader", "teacher", "admin"].includes(currentRole)) {
      const openTaskCount = tasks.filter((task) => task.status !== "archived").length;
      items.push({
        id: `board-${currentRole}`,
        title: "任务中心待同步",
        detail:
          openTaskCount > 0
            ? `当前还有 ${openTaskCount} 项任务未完成，建议及时分派、跟进并调整优先级。`
            : "今天的任务安排可以再确认一遍，确保没有遗漏新的推进事项。",
        actionLabel: "进入任务中心",
        targetTab: "board",
      });
    }

    if ((currentRole === "leader" || hasGlobalAdminRole) && pendingLeaderReviewCount > 0) {
      items.push({
        id: "leader-review",
        title: "文档待负责人审批",
        detail: `当前有 ${pendingLeaderReviewCount} 份文档在等待负责人审批。`,
        actionLabel: "前往资料归档",
        targetTab: "documents",
        priority: "warning",
      });
    }

    if ((currentRole === "teacher" || hasGlobalAdminRole) && pendingTeacherReviewCount > 0) {
      items.push({
        id: "teacher-review",
        title: "文档待教师终审",
        detail: `当前有 ${pendingTeacherReviewCount} 份文档已经通过负责人审批，等待教师终审。`,
        actionLabel: "查看待审文档",
        targetTab: "documents",
        priority: "warning",
      });
    }

    if (pendingApprovalMembers.length > 0) {
      items.push({
        id: "approval",
        title: "账号待审核",
        detail: `当前有 ${pendingApprovalMembers.length} 个账号等待你审核，通过后他们才能登录系统。`,
        actionLabel: "前往团队管理",
        targetTab: "team",
        priority: "warning",
      });
    }

    if (currentRole === "expert") {
      const pendingAssignments = reviewAssignments.filter((assignment) => assignment.statusKey === "pending");
      if (pendingAssignments.length > 0) {
        items.push({
          id: "expert-review",
          title: "专家评审待完成",
          detail: `你当前还有 ${pendingAssignments.length} 个评审包待提交评分，请按材料逐项完成。`,
          actionLabel: "前往专家评审",
          targetTab: "review",
          priority: "warning",
        });
      }
    }

    return items;
  }, [
    currentMemberId,
    currentRole,
    currentUser,
    hasGlobalAdminRole,
    myOpenTasks.length,
    nearestEvent,
    pendingApprovalMembers.length,
    pendingLeaderReviewCount,
    pendingTeacherReviewCount,
    reviewAssignments,
    tasks,
    todayDateKey,
    todayReportEntryMap,
  ]);

  const todoNotifications = useMemo<TodoCenterItem[]>(
    () =>
      unreadTodoNotifications.map((notification) => ({
        id: `notification-${notification.id}`,
        title: notification.title,
        detail: notification.detail,
        actionLabel: notification.targetTab ? "去处理" : "查看提醒",
        targetTab:
          notification.targetTab && permissions.visibleTabs.includes(notification.targetTab as TabKey)
            ? (notification.targetTab as TabKey)
            : undefined,
        priority: "normal",
        type: "notification",
        notificationId: notification.id,
        documentId: notification.documentId ?? null,
      })),
    [permissions.visibleTabs, unreadTodoNotifications],
  );

  const visibleRoleTodoItems = roleTodoItems.filter((item) => !dismissedTodoIds.includes(item.id));
  const todoItemCount = visibleRoleTodoItems.length + todoNotifications.length;
  const urgentTodoCount = visibleRoleTodoItems.filter((item) => item.priority === "danger").length;

  useEffect(() => {
    if (isBooting || !dismissedTodosReady || todoAutoOpened || todoItemCount <= 0) {
      return;
    }

    setNotificationsOpen(true);
    setTodoAutoOpened(true);
  }, [dismissedTodosReady, isBooting, todoAutoOpened, todoItemCount]);

  useEffect(() => {
    if (!dismissedTodoStorageKey) {
      setDismissedTodoIds([]);
      setDismissedTodosReady(false);
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(dismissedTodoStorageKey);
      if (!rawValue) {
        setDismissedTodoIds([]);
      } else {
        const parsedValue = JSON.parse(rawValue) as unknown;
        setDismissedTodoIds(Array.isArray(parsedValue) ? parsedValue.filter((item) => typeof item === "string") : []);
      }
    } catch {
      setDismissedTodoIds([]);
    } finally {
      setDismissedTodosReady(true);
      setTodoAutoOpened(false);
    }
  }, [dismissedTodoStorageKey]);

  useEffect(() => {
    if (!dismissedTodosReady || !dismissedTodoStorageKey) {
      return;
    }

    window.localStorage.setItem(dismissedTodoStorageKey, JSON.stringify(dismissedTodoIds));
  }, [dismissedTodoIds, dismissedTodoStorageKey, dismissedTodosReady]);

  const dismissTodoItem = (itemId: string) => {
    setDismissedTodoIds((current) => (current.includes(itemId) ? current : [...current, itemId]));
  };

  const markAllTodoItemsAsRead = async () => {
    if (visibleRoleTodoItems.length > 0) {
      setDismissedTodoIds((current) => {
        const next = new Set(current);
        for (const item of visibleRoleTodoItems) {
          next.add(item.id);
        }
        return Array.from(next);
      });
    }

    if (todoNotifications.length > 0) {
      await markAllNotificationsAsRead();
    }
  };

  const canSendDirectiveToMember = (member: TeamMember) => {
    if (!permissions.canSendDirective) {
      return false;
    }

    if (member.id === currentMemberId) {
      return false;
    }

    if (member.systemRole === "系统管理员") {
      return false;
    }

    if (member.systemRole === "校级管理员") {
      return isSystemAdmin;
    }

    return true;
  };

  const reminderTabOptions = useMemo(() => {
    if (!reminderTargetMember) {
      return [] as Array<{ key: string; label: string }>;
    }

    const targetRole = teamRoleToRoleKey[reminderTargetMember.systemRole];
    return rolePermissions[targetRole].visibleTabs
      .filter((key) => key !== "profile")
      .map((key) => ({
        key,
        label: allTabs.find((item) => item.key === key)?.label ?? key,
      }));
  }, [reminderTargetMember]);

  const closeReminderModal = () => {
    setReminderModalOpen(false);
    setReminderTargetMember(null);
    setReminderDraft(defaultReminderDraft);
    setReminderDraftErrors(defaultReminderDraftErrors());
  };

  const openReminderModal = (member: TeamMember) => {
    const targetRole = teamRoleToRoleKey[member.systemRole];
    const targetTabs = rolePermissions[targetRole].visibleTabs.filter((key) => key !== "profile");

    setReminderTargetMember(member);
    setReminderDraft({
      title: `请及时查看：${member.name}`,
      detail: "",
      targetTab: targetTabs.includes("overview") ? "overview" : (targetTabs[0] ?? ""),
    });
    setReminderDraftErrors(defaultReminderDraftErrors());
    setReminderModalOpen(true);
  };

  const openEmailSettingsModal = async () => {
    if (!hasGlobalAdminRole) {
      setLoadError("无权限配置邮件提醒");
      return;
    }

    setEmailSettingsModalOpen(true);
    setEmailSettingsLoading(true);
    try {
      const payload = await requestJson<{ settings: EmailReminderSettingsDraft }>("/api/settings/email");
      setEmailSettingsDraft(payload.settings);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "邮件提醒设置加载失败");
    } finally {
      setEmailSettingsLoading(false);
    }
  };

  const saveEmailSettings = async () => {
    setIsSaving(true);
    try {
      const payload = await requestJson<{ settings: EmailReminderSettingsDraft }>("/api/settings/email", {
        method: "PATCH",
        body: JSON.stringify(emailSettingsDraft),
      });
      setEmailSettingsDraft(payload.settings);
      setEmailSettingsModalOpen(false);
      showSuccessToast("邮件提醒设置已保存", "全体成员的邮件提醒规则已经更新。");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "邮件提醒设置保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const canAcceptTask = (task: BoardTask) => {
    const assignment = getCurrentTaskAssignment(task);
    return Boolean(assignment && !assignment.acceptedAt && !assignment.submittedAt && task.status !== "review" && task.status !== "archived");
  };

  const canSubmitTask = (task: BoardTask) => {
    const assignment = getCurrentTaskAssignment(task);
    return Boolean(assignment && assignment.acceptedAt && !assignment.submittedAt && task.status !== "review" && task.status !== "archived");
  };

  const canMoveTask = (task: BoardTask) => canAcceptTask(task) || canSubmitTask(task);

  const canEditTaskItem = (task: BoardTask) => permissions.canEditTask || task.creatorId === currentMemberId;

  const canDeleteTaskItem = (task: BoardTask) => permissions.canDeleteTask || task.creatorId === currentMemberId;

  const canReviewTaskItem = (task: BoardTask) =>
    hasGlobalAdminRole ||
    ((currentRole === "teacher" || currentRole === "leader") &&
      (task.reviewerId === currentMemberId ||
        Boolean(task.teamGroupId && task.teamGroupId === currentUser?.teamGroupId)));

  const toggleBoardTaskExpand = (taskId: string) => {
    setExpandedBoardTaskIds((current) =>
      current.includes(taskId) ? current.filter((item) => item !== taskId) : [...current, taskId],
    );
  };

  const canDeleteDocument = (doc: DocumentItem) =>
    permissions.canDeleteAnyDocument ||
    (doc.ownerId === currentMemberId && doc.statusKey !== "approved");

  const canDeleteDocumentVersion = (doc: DocumentItem, version: DocumentItem["versions"][number]) =>
    permissions.canDeleteAnyDocument ||
    ((doc.ownerId === currentMemberId || version.uploaderId === currentMemberId) &&
      doc.statusKey !== "approved");

  const canManageReviewMaterials = ["admin", "school_admin"].includes(currentRole);
  const canCreateReviewPackage = ["admin", "school_admin"].includes(currentRole);
  const canManageTrainingQuestion = (question: TrainingQuestionItem) =>
    ["admin", "school_admin", "teacher", "leader"].includes(currentRole) || question.createdById === currentMemberId;
  const activeDrillQuestion =
    trainingQuestions.find((question) => question.id === activeDrillQuestionId) ?? trainingQuestions[0] ?? null;

  const getDocumentActionButtons = (doc: DocumentItem): DocumentActionButton[] => {
    if ((permissions.canLeaderReviewDocument || hasGlobalAdminRole) && doc.statusKey === "pending") {
      return [
        {
          key: "leaderApprove",
          label: "负责人通过",
        },
        {
          key: "leaderRevision",
          label: "负责人打回",
        },
      ];
    }

    if ((permissions.canTeacherReviewDocument || hasGlobalAdminRole) && doc.statusKey === "leader_approved") {
      return [
        {
          key: "teacherApprove",
          label: "教师终审通过",
        },
        {
          key: "teacherRevision",
          label: "教师打回",
        },
      ];
    }

    return [];
  };

  const refreshWorkspace = (resourceKeys?: WorkspaceResourceKey | WorkspaceResourceKey[]) => {
    if (resourceKeys) {
      const keys = Array.isArray(resourceKeys) ? resourceKeys : [resourceKeys];
      for (const key of keys) {
        refreshResourceQueueRef.current.add(key);
      }
    }
    setReloadToken((current) => current + 1);
  };

  const getReportDraftStorageKey = (date: string) =>
    currentMemberId ? `workspace-report-draft:${currentMemberId}:${date}` : null;

  const readStoredReportDraft = (date: string): ReportDraft | null => {
    const storageKey = getReportDraftStorageKey(date);
    if (!storageKey) {
      return null;
    }

    try {
      const rawValue = window.localStorage.getItem(storageKey);
      if (!rawValue) {
        return null;
      }

      const parsedValue = JSON.parse(rawValue) as Partial<ReportDraft>;
      return {
        summary: typeof parsedValue.summary === "string" ? parsedValue.summary : "",
        nextPlan: typeof parsedValue.nextPlan === "string" ? parsedValue.nextPlan : "",
        attachment: typeof parsedValue.attachment === "string" ? parsedValue.attachment : "",
      };
    } catch {
      return null;
    }
  };

  const removeStoredReportDraft = (date: string) => {
    const storageKey = getReportDraftStorageKey(date);
    if (!storageKey) {
      return;
    }

    window.localStorage.removeItem(storageKey);
  };

  useEffect(() => {
    if (!reportModalOpen || !currentMemberId) {
      return;
    }

    const draftDate = editingReportDate || selectedDate;
    const storageKey = currentMemberId ? `workspace-report-draft:${currentMemberId}:${draftDate}` : null;
    if (!storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(reportDraft));
  }, [currentMemberId, editingReportDate, reportDraft, reportModalOpen, selectedDate]);

  const validateClientFile = (
    file: File | null,
    options: {
      allowArchives?: boolean;
      maxSizeBytes?: number;
      maxSizeLabel?: string;
    } = {},
  ) => {
    if (!file) {
      return "请先选择文件";
    }

    return validateUploadMeta(
      {
        fileName: file.name,
        fileSize: file.size,
      },
      options,
    );
  };

  const handleDownload = (downloadUrl?: string | null) => {
    if (!downloadUrl) {
      setLoadError("当前文件尚未生成下载链接");
      return;
    }

    window.location.href = downloadUrl;
  };

  const handleDocumentViewAction = (
    action: "preview" | "download" | "history",
    documentLike: Pick<DocumentItem, "id" | "downloadUrl" | "currentFileName" | "currentMimeType">,
  ) => {
    setOpenDocumentViewMenuId(null);
    if (action === "history") {
      toggleDocExpand(documentLike.id);
      return;
    }

    if (action === "download") {
      handleDownload(documentLike.downloadUrl);
      return;
    }

    handlePreviewDocument({
      downloadUrl: documentLike.downloadUrl,
      fileName: documentLike.currentFileName,
      mimeType: documentLike.currentMimeType,
    });
  };

  const openPreviewAsset = (asset?: PreviewAsset | null) => {
    if (!asset?.url) {
      setLoadError("当前材料暂不可预览");
      return;
    }

    setPreviewAsset(asset);
  };

  const buildInlinePreviewUrl = (downloadUrl?: string | null) => {
    if (!downloadUrl) {
      return null;
    }

    const separator = downloadUrl.includes("?") ? "&" : "?";
    return `${downloadUrl}${separator}inline=1`;
  };

  const buildDocumentPreviewUrl = (downloadUrl?: string | null) => {
    if (!downloadUrl) {
      return null;
    }

    const [path, query] = downloadUrl.split("?");
    if (!path.endsWith("/download")) {
      return buildInlinePreviewUrl(downloadUrl);
    }

    return `${path.replace(/\/download$/, "/preview")}${query ? `?${query}` : ""}`;
  };

  const handlePreviewDocument = ({
    downloadUrl,
    fileName,
    mimeType,
    title = "材料在线预览",
  }: {
    downloadUrl?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    title?: string;
  }) => {
    if (!downloadUrl) {
      setLoadError("当前文件暂不可预览");
      return;
    }

    if (!canPreviewInlineAsset({ downloadUrl, fileName, mimeType, url: downloadUrl } as PreviewAsset)) {
      openPreviewAsset({
        title,
        url: "",
        fileName,
        mimeType,
        mode: "download-fallback",
        downloadUrl,
        fallbackMessage: "该文件类型暂不支持站内预览，请下载后使用本地软件查看。",
      });
      return;
    }

    const previewUrl = isWordAsset({ downloadUrl, fileName, mimeType, url: downloadUrl } as PreviewAsset)
      ? buildDocumentPreviewUrl(downloadUrl)
      : buildInlinePreviewUrl(downloadUrl);
    if (!previewUrl) {
      setLoadError("当前文件暂不可预览");
      return;
    }

    openPreviewAsset({
      title,
      url: previewUrl,
      fileName,
      mimeType,
      mode: "preview",
    });
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    setMobileSidebarOpen(false);
    router.push("/login");
    router.refresh();
  };

  const loadSentReminders = async () => {
    if (!permissions.canSendDirective) {
      return;
    }

    setSentRemindersLoading(true);
    try {
      const payload = await requestJson<{ notifications: NotificationItem[] }>("/api/notifications?scope=sent");
      setSentReminders(payload.notifications);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "邮件提醒记录加载失败");
    } finally {
      setSentRemindersLoading(false);
    }
  };

  const openSentRemindersModal = () => {
    setSentRemindersOpen(true);
    void loadSentReminders();
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      const payload = await requestJson<{ notification: NotificationItem }>(`/api/notifications/${notificationId}`, {
        method: "PATCH",
      });
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? payload.notification : item)),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "消息状态更新失败");
    }
  };

  const markAllNotificationsAsRead = async () => {
    try {
      await requestJson("/api/notifications/read-all", {
        method: "PATCH",
      });
      const nowText = formatDateTime(new Date().toISOString());
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? nowText })));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "消息状态更新失败");
    }
  };

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      await markNotificationAsRead(notification.id);
    }

    setNotificationsOpen(false);

    if (notification.documentId) {
      setExpandedDocs((current) =>
        current.includes(notification.documentId as string)
          ? current
          : [...current, notification.documentId as string],
      );
      setHighlightedDocId(notification.documentId);
      window.setTimeout(() => {
        document
          .getElementById(`doc-${notification.documentId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      router.push(`/workspace?tab=documents&doc=${notification.documentId}`, { scroll: false });
      return;
    }

    if (notification.targetTab && permissions.visibleTabs.includes(notification.targetTab as TabKey)) {
      router.push(notification.targetTab === "overview" ? "/workspace" : `/workspace?tab=${notification.targetTab}`);
    }
  };

  const openTodoItem = async (item: TodoCenterItem) => {
    if (item.type === "notification" && item.notificationId) {
      const targetNotification = notifications.find((notification) => notification.id === item.notificationId);
      if (targetNotification) {
        await openNotification(targetNotification);
        return;
      }
    }

    setNotificationsOpen(false);

    if (item.documentId) {
      setExpandedDocs((current) => (current.includes(item.documentId as string) ? current : [...current, item.documentId as string]));
      setHighlightedDocId(item.documentId);
      window.setTimeout(() => {
        document.getElementById(`doc-${item.documentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      router.push(`/workspace?tab=documents&doc=${item.documentId}`, { scroll: false });
      return;
    }

    if (item.targetTab && permissions.visibleTabs.includes(item.targetTab)) {
      router.push(item.targetTab === "overview" ? "/workspace" : `/workspace?tab=${item.targetTab}`);
    }
  };

  const openCreateTaskModal = () => {
    setEditingTaskId(null);
    setTaskDraft(defaultTaskDraft(defaultAssignableMemberIds, currentUser?.teamGroupId ?? ""));
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (task: BoardTask) => {
    setEditingTaskId(task.id);
    setTaskDraft({
      title: task.title,
      assigneeIds:
        task.assigneeIds?.length
          ? task.assigneeIds
          : task.assignments?.map((assignment) => assignment.assigneeId) ?? (task.assigneeId ? [task.assigneeId] : []),
      teamGroupId: task.teamGroupId ?? currentUser?.teamGroupId ?? "",
      dueDate: toDateTimeInputValue(task.dueDate),
      priority:
        task.priority === "进行中" || task.priority === "待验收" || task.priority === "已归档"
          ? "高优先级"
          : task.priority,
      notifyAssignee: false,
    });
    setTaskModalOpen(true);
  };

  const saveTask = async () => {
    if (!taskDraft.title.trim()) {
      return;
    }

    if (!editingTaskId && taskDraft.assigneeIds.length === 0) {
      if (hasGlobalAdminRole && !taskDraft.teamGroupId) {
        setLoadError("请选择待分配工单所属队伍");
        return;
      }

      if (!hasGlobalAdminRole && !currentUser?.teamGroupId) {
        setLoadError("请先在团队管理中把账号加入队伍，再发布待分配工单");
        return;
      }
    }

    setIsSaving(true);
    try {
      const isEditing = Boolean(editingTaskId);
      if (editingTaskId) {
        await requestJson(`/api/tasks/${editingTaskId}`, {
          method: "PATCH",
          body: JSON.stringify(taskDraft),
        });
      } else {
        await requestJson("/api/tasks", {
          method: "POST",
          body: JSON.stringify(taskDraft),
        });
      }

      setTaskDraft(defaultTaskDraft(defaultAssignableMemberIds, currentUser?.teamGroupId ?? ""));
      setTaskModalOpen(false);
      showSuccessToast(isEditing ? "工单已更新" : "工单已创建", "新的安排已经同步到工作台。");
      refreshWorkspace("tasks");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "任务保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTaskRequest = async (taskId: string) => {
    await requestJson(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
    refreshWorkspace("tasks");
  };

  const deleteTask = (taskId: string, taskTitle: string) => {
    setConfirmDialog({
      open: true,
      title: "删除工单",
      message: `确认删除工单「${taskTitle}」？`,
      confirmLabel: "确认删除",
      successTitle: "工单已删除",
      successDetail: "该工单已经从当前看板移除。",
      onConfirm: () => deleteTaskRequest(taskId),
    });
  };

  const acceptTask = async (task: BoardTask) => {
    setIsSaving(true);
    try {
      await requestJson(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "accept" }),
      });
      showSuccessToast("工单已接取", `「${task.title}」已进入处理中。`);
      refreshWorkspace("tasks");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "工单接取失败");
    } finally {
      setIsSaving(false);
    }
  };

  const openTaskCompletionModal = (task: BoardTask) => {
    setTaskCompletionTarget(task);
    setTaskCompletionDraft(defaultTaskCompletionDraft);
    setTaskCompletionModalOpen(true);
  };

  const closeTaskCompletionModal = () => {
    setTaskCompletionTarget(null);
    setTaskCompletionDraft(defaultTaskCompletionDraft);
    setTaskCompletionModalOpen(false);
  };

  const uploadTaskEvidence = async (taskId: string, file: File) => {
    const validationError = validateClientFile(file);
    if (validationError) {
      throw new Error(validationError);
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.message || "完成凭证上传失败");
    }
  };

  const submitTaskForReview = async () => {
    if (!taskCompletionTarget) {
      return;
    }

    setIsSaving(true);
    try {
      if (taskCompletionDraft.file) {
        await uploadTaskEvidence(taskCompletionTarget.id, taskCompletionDraft.file);
      }

      await requestJson(`/api/tasks/${taskCompletionTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "submit",
          completionNote: taskCompletionDraft.note,
        }),
      });
      closeTaskCompletionModal();
      showSuccessToast("工单已提交验收", `「${taskCompletionTarget.title}」已推送给验收人。`);
      refreshWorkspace("tasks");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "工单提交失败");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmTaskArchive = (task: BoardTask) => {
    setConfirmDialog({
      open: true,
      title: "确认工单完成",
      message: `确认工单「${task.title}」已经完成并归档？`,
      confirmLabel: "确认归档",
      successTitle: "工单已归档",
      successDetail: "该工单已完成闭环，后续可在归档列备查。",
      onConfirm: async () => {
        await requestJson(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "confirm" }),
        });
        refreshWorkspace("tasks");
      },
    });
  };

  const openTaskRejectModal = (task: BoardTask) => {
    setTaskRejectTarget(task);
    setTaskRejectReason("");
    setTaskRejectModalOpen(true);
  };

  const closeTaskRejectModal = () => {
    setTaskRejectTarget(null);
    setTaskRejectReason("");
    setTaskRejectModalOpen(false);
  };

  const rejectTaskForRework = async () => {
    if (!taskRejectTarget) {
      return;
    }

    const rejectionReason = taskRejectReason.trim();
    if (!rejectionReason) {
      setLoadError("请填写驳回原因");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson(`/api/tasks/${taskRejectTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "reject",
          rejectionReason,
        }),
      });
      closeTaskRejectModal();
      showSuccessToast("工单已驳回", `「${taskRejectTarget.title}」已退回处理人继续完善。`);
      refreshWorkspace("tasks");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "工单驳回失败");
    } finally {
      setIsSaving(false);
    }
  };

  const completeTaskFromOverview = async (task: BoardTask) => {
    if (!canMoveTask(task)) {
      setLoadError("你没有权限调整这条任务状态");
      return;
    }

    setLoadError(`请在任务中心打开「${task.title}」后提交验收。`);
    router.push("/workspace?tab=board");
  };

  const resetTrainingQuestionDraft = () => {
    setTrainingQuestionDraft(defaultTrainingQuestionDraft);
    setEditingTrainingQuestionId(null);
  };

  const getTrainingQuestionDraftCategory = (draft: TrainingQuestionDraft) => {
    const category = normalizeTrainingCategory(draft);
    return category || "其他";
  };

  const saveTrainingQuestion = async () => {
    const question = trainingQuestionDraft.question.trim();
    const answerPoints = trainingQuestionDraft.answerPoints.trim();
    const category = getTrainingQuestionDraftCategory(trainingQuestionDraft);

    if (!question) {
      setLoadError("请先填写模拟问题");
      return;
    }

    if (!answerPoints) {
      setLoadError("请先填写标准回答要点");
      return;
    }

    if (trainingQuestionDraft.category === "其他" && !trainingQuestionDraft.customCategory.trim()) {
      setLoadError("选择其他分类时，请填写自定义分类名称");
      return;
    }

    setIsSaving(true);
    try {
      if (editingTrainingQuestionId) {
        await requestJson(`/api/training/questions/${editingTrainingQuestionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            category,
            question,
            answerPoints,
          }),
        });
      } else {
        await requestJson("/api/training/questions", {
          method: "POST",
          body: JSON.stringify({
            category,
            question,
            answerPoints,
          }),
        });
      }

      showSuccessToast(editingTrainingQuestionId ? "题目已更新" : "题目已加入题库", "答辩训练题库已经同步。");
      resetTrainingQuestionDraft();
      refreshWorkspace("trainingQuestions");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "题目保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const editTrainingQuestion = (question: TrainingQuestionItem) => {
    const knownCategory = trainingQuestionCategories.includes(question.category as (typeof trainingQuestionCategories)[number]);
    setEditingTrainingQuestionId(question.id);
    setTrainingQuestionDraft({
      category: knownCategory ? question.category : "其他",
      customCategory: knownCategory ? "" : question.category,
      question: question.question,
      answerPoints: question.answerPoints,
    });
  };

  const openQuestionImportModal = () => {
    setQuestionImportModalOpen(true);
    setQuestionImportError(null);
    setQuestionImportFileName("");
    setQuestionImportRows([]);
  };

  const updateQuestionImportRow = (rowId: string, patch: Partial<TrainingQuestionImportRow>) => {
    setQuestionImportRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  };

  const handleQuestionImportFile = async (file: File | null) => {
    setQuestionImportError(null);
    setQuestionImportRows([]);
    setQuestionImportFileName(file?.name ?? "");

    if (!file) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["txt", "md", "csv", "json", "pdf", "docx", "doc"].includes(extension)) {
      setQuestionImportError("暂不支持该文件格式，请上传 PDF、Word(.docx)、txt、md、csv 或 json。");
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setQuestionImportError("题库导入文档最大 4MB，较大的 PDF 建议先拆分或压缩文字后再导入。");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/training/questions/import", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { rows?: TrainingQuestionImportCandidate[]; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message || "题库文档识别失败");
      }

      const rows = (payload?.rows ?? []).map((row) => createTrainingImportRow(row));
      if (rows.length === 0) {
        throw new Error("没有识别到可导入的问题，请检查文档是否包含“问题/回答要点”内容。");
      }

      setQuestionImportRows(rows);
    } catch (error) {
      setQuestionImportError(error instanceof Error ? error.message : "题库文档识别失败");
    }
  };

  const importTrainingQuestions = async () => {
    const rows = questionImportRows.filter((row) => row.selected);
    if (rows.length === 0) {
      setQuestionImportError("请至少选择 1 条要导入的问题");
      return;
    }

    const invalidRow = rows.find((row) => !row.question.trim() || !row.answerPoints.trim());
    if (invalidRow) {
      setQuestionImportError("请先补全所有已选问题的题干和回答要点");
      return;
    }

    const missingCustomCategory = rows.find((row) => row.category === "其他" && !row.customCategory.trim());
    if (missingCustomCategory) {
      setQuestionImportError("选择其他分类时，请填写自定义分类名称");
      return;
    }

    setIsSaving(true);
    try {
      await Promise.all(
        rows.map((row) =>
          requestJson("/api/training/questions", {
            method: "POST",
            body: JSON.stringify({
              category: getTrainingQuestionDraftCategory(row),
              question: row.question.trim(),
              answerPoints: row.answerPoints.trim(),
            }),
          }),
        ),
      );
      setQuestionImportModalOpen(false);
      setQuestionImportRows([]);
      setQuestionImportFileName("");
      showSuccessToast("题库导入完成", `已导入 ${rows.length} 条 Q&A 问题。`);
      refreshWorkspace("trainingQuestions");
    } catch (error) {
      setQuestionImportError(error instanceof Error ? error.message : "题库导入失败");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTrainingQuestionRequest = async (questionId: string) => {
    await requestJson(`/api/training/questions/${questionId}`, {
      method: "DELETE",
    });
    if (activeDrillQuestionId === questionId) {
      setActiveDrillQuestionId(null);
    }
    setSelectedTrainingQuestionIds((current) => current.filter((item) => item !== questionId));
    refreshWorkspace("trainingQuestions");
  };

  const deleteTrainingQuestion = (question: TrainingQuestionItem) => {
    setConfirmDialog({
      open: true,
      title: "删除题目",
      message: `确认删除题目「${question.question}」？`,
      confirmLabel: "确认删除",
      successTitle: "题目已删除",
      successDetail: "模拟 Q&A 题库已经更新。",
      onConfirm: () => deleteTrainingQuestionRequest(question.id),
    });
  };

  const toggleTrainingQuestionSelection = (questionId: string, selected: boolean) => {
    setSelectedTrainingQuestionIds((current) =>
      selected
        ? current.includes(questionId)
          ? current
          : [...current, questionId]
        : current.filter((item) => item !== questionId),
    );
  };

  const selectAllManageableTrainingQuestions = () => {
    const manageableIds = trainingQuestions.filter(canManageTrainingQuestion).map((question) => question.id);
    setSelectedTrainingQuestionIds((current) =>
      manageableIds.every((questionId) => current.includes(questionId)) ? [] : manageableIds,
    );
  };

  const deleteSelectedTrainingQuestionsRequest = async () => {
    const questionIds = selectedTrainingQuestionIds.filter((questionId) =>
      trainingQuestions.some((question) => question.id === questionId && canManageTrainingQuestion(question)),
    );

    await Promise.all(
      questionIds.map((questionId) =>
        requestJson(`/api/training/questions/${questionId}`, {
          method: "DELETE",
        }),
      ),
    );
    if (activeDrillQuestionId && questionIds.includes(activeDrillQuestionId)) {
      setActiveDrillQuestionId(null);
    }
    setSelectedTrainingQuestionIds([]);
    refreshWorkspace("trainingQuestions");
  };

  const deleteSelectedTrainingQuestions = () => {
    const count = selectedTrainingQuestionIds.filter((questionId) =>
      trainingQuestions.some((question) => question.id === questionId && canManageTrainingQuestion(question)),
    ).length;

    if (count === 0) {
      setLoadError("请先选择可以删除的题目");
      return;
    }

    setConfirmDialog({
      open: true,
      title: "批量删除题目",
      message: `确认删除已选择的 ${count} 条题目？删除后不可恢复。`,
      confirmLabel: "确认删除",
      successTitle: "题目已批量删除",
      successDetail: "模拟 Q&A 题库已经更新。",
      onConfirm: deleteSelectedTrainingQuestionsRequest,
    });
  };

  const drawRandomTrainingQuestion = () => {
    if (trainingQuestions.length === 0) {
      setLoadError("题库里还没有可抽查的问题");
      return;
    }

    const candidates =
      trainingQuestions.length === 1
        ? trainingQuestions
        : trainingQuestions.filter((question) => question.id !== activeDrillQuestionId);
    const nextQuestion = candidates[Math.floor(Math.random() * candidates.length)];
    if (!nextQuestion) {
      return;
    }

    setActiveDrillQuestionId(nextQuestion.id);
  };

  const recordDrillAnswer = (hit: boolean) => {
    setQaDrillStats((current) => ({
      total: current.total + 1,
      hit: current.hit + (hit ? 1 : 0),
    }));
    drawRandomTrainingQuestion();
  };

  const applyTrainingTimerPreset = (preset: TrainingTimerPreset) => {
    setTrainingTimerDuration(preset.seconds);
    setTrainingTimerCustomMinutes(String(preset.seconds / 60));
    setTrainingTimerElapsed(0);
    setTrainingTimerRunning(false);
    setTrainingSessionTitle(preset.label);
  };

  const applyCustomTrainingTimer = () => {
    const minutes = Number(trainingTimerCustomMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 180) {
      setLoadError("自定义计时请填写 1-180 分钟之间的数字");
      return;
    }

    const seconds = Math.round(minutes * 60);
    setTrainingTimerDuration(seconds);
    setTrainingTimerElapsed(0);
    setTrainingTimerRunning(false);
    setTrainingSessionTitle(`${minutes} 分钟自定义训练`);
  };

  const resetTrainingTimer = () => {
    setTrainingTimerRunning(false);
    setTrainingTimerElapsed(0);
  };

  const saveTrainingSession = async () => {
    if (trainingTimerElapsed <= 0) {
      setLoadError("请先完成一次计时训练");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson("/api/training/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: trainingSessionTitle.trim() || "模拟答辩训练",
          durationSeconds: trainingTimerElapsed,
          overtimeSeconds: Math.max(0, trainingTimerElapsed - trainingTimerDuration),
          qaTotal: qaDrillStats.total,
          qaHit: qaDrillStats.hit,
          notes: trainingSessionNotes.trim(),
        }),
      });
      setTrainingTimerRunning(false);
      setTrainingTimerElapsed(0);
      setTrainingSessionNotes("");
      setQaDrillStats({ total: 0, hit: 0 });
      showSuccessToast("训练记录已保存", "仪表盘统计已经同步更新。");
      refreshWorkspace("trainingSessions");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "训练记录保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const publishAnnouncement = async () => {
    if (!announcementDraft.title.trim() || !announcementDraft.detail.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      await requestJson("/api/announcements", {
        method: "POST",
        body: JSON.stringify(announcementDraft),
      });
      setAnnouncementDraft(defaultAnnouncementDraft);
      setAnnouncementModalOpen(false);
      showSuccessToast("公告已发布", "成员将会在首页和通知里看到这条公告。");
      refreshWorkspace("announcements");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "公告发布失败");
    } finally {
      setIsSaving(false);
    }
  };

  const saveReminder = async () => {
    const title = reminderDraft.title.trim();
    const detail = reminderDraft.detail.trim();
    const nextErrors: ReminderDraftErrors = {};

    if (!title) {
      nextErrors.title = "请填写提醒标题";
    }

    if (!detail) {
      nextErrors.detail = "请填写提醒内容";
    }

    if (Object.keys(nextErrors).length > 0) {
      setReminderDraftErrors(nextErrors);
      return;
    }

    if (!reminderTargetMember) {
      setReminderDraftErrors({ submit: "当前未选择提醒对象，请关闭后重试" });
      return;
    }

    setIsSaving(true);
    setReminderDraftErrors(defaultReminderDraftErrors());

    try {
      const payload = await requestJson<DirectReminderResponse>("/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          userId: reminderTargetMember.id,
          title,
          detail,
          targetTab: reminderDraft.targetTab || null,
        }),
      });
      closeReminderModal();
      void loadSentReminders();
      showSuccessToast(
        "提醒已发送",
        getReminderDeliveryDetail(payload.delivery, `已通知 ${reminderTargetMember.name} 及时处理相关事项。`),
      );
      void refreshNotificationsSilently();
    } catch (error) {
      const message = error instanceof Error ? error.message : "提醒发送失败";
      setReminderDraftErrors({ submit: message });
      setLoadError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const sendDirectReminderToUsers = async ({
    userIds,
    title,
    detail,
    targetTab,
    successTitle,
    successDetail,
  }: {
    userIds: string[];
    title: string;
    detail: string;
    targetTab: TabKey;
    successTitle: string;
    successDetail: string;
  }) => {
    if (!permissions.canSendDirective) {
      setLoadError("当前账号没有发送站内提醒的权限");
      return;
    }

    const recipientIds = [...new Set(userIds)].filter((userId) => userId && userId !== currentMemberId);

    if (recipientIds.length === 0) {
      setLoadError("当前没有可提醒的成员");
      return;
    }

    setIsSaving(true);

    try {
      const responses = await Promise.all(
        recipientIds.map((userId) =>
          requestJson<DirectReminderResponse>("/api/notifications", {
            method: "POST",
            body: JSON.stringify({
              userId,
              title,
              detail,
              targetTab,
            }),
          }),
        ),
      );
      void loadSentReminders();
      showSuccessToast(
        successTitle,
        getBatchReminderDeliveryDetail(
          responses.map((response) => response.delivery),
          successDetail,
        ),
      );
      void refreshNotificationsSilently();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "提醒发送失败");
    } finally {
      setIsSaving(false);
    }
  };

  const sendTaskReminder = (task: BoardTask) => {
    const reminderTargetIds = getTaskAssigneeIds(task).filter((assigneeId) => assigneeId !== currentMemberId);
    if (reminderTargetIds.length === 0) {
      setLoadError("该工单还没有处理人，分配后才能发送处理提醒");
      return;
    }

    void sendDirectReminderToUsers({
      userIds: reminderTargetIds,
      title: `工单提醒：${task.title}`,
      detail:
        reminderTargetIds.length > 1
          ? `请及时查看并推进工单「${task.title}」，全部执行人完成后将统一提交验收。`
          : `请及时查看并推进工单「${task.title}」。`,
      targetTab: "board",
      successTitle: "工单提醒已发送",
      successDetail: `已提醒 ${getTaskAssigneeName(task)} 查看任务中心。`,
    });
  };

  const remindTaskDispatch = async (task: BoardTask) => {
    setIsSaving(true);
    try {
      const payload = await requestJson<DirectReminderResponse>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "remind_dispatch" }),
      });
      showSuccessToast(
        "分配提醒已发送",
        getReminderDeliveryDetail(payload.delivery, "已提醒本队项目负责人/指导教师处理待分配工单。"),
      );
      refreshWorkspace("tasks");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "分配提醒发送失败");
    } finally {
      setIsSaving(false);
    }
  };

  const sendReportReminder = (member: TeamMember) => {
    void sendDirectReminderToUsers({
      userIds: [member.id],
      title: `汇报提醒：${formatShortDate(selectedDate)} 日程汇报待提交`,
      detail: `请及时补交 ${formatShortDate(selectedDate)} 的工作汇报，提交后会进入历史归档。`,
      targetTab: "reports",
      successTitle: "汇报提醒已发送",
      successDetail: `已提醒 ${member.name} 尽快补交当日汇报。`,
    });
  };

  const sendDocumentReminder = (doc: DocumentItem) => {
    const statusKey = doc.statusKey ?? "pending";
    const docTeamGroupId = doc.teamGroupId ?? null;
    if (
      !canTriggerDocumentReminder({
        actorRole: currentRole,
        statusKey,
      })
    ) {
      setLoadError("当前账号没有发送该文档审批提醒的权限");
      return;
    }

    const recipientIds = getDocumentReminderRecipientIds({
      statusKey,
      currentUserId: currentMemberId,
      currentTeamGroupId: docTeamGroupId,
      teamMembers: members,
    });

    if (recipientIds.length === 0) {
      setLoadError("当前阶段没有可提醒的审批人");
      return;
    }

    void sendDirectReminderToUsers({
      userIds: recipientIds,
      title: `文档审批提醒：${doc.name}`,
      detail:
        statusKey === "pending"
          ? `《${doc.name}》当前正等待负责人审批，请及时进入资料归档处理。`
          : `《${doc.name}》已进入教师终审阶段，请及时进入资料归档处理。`,
      targetTab: "documents",
      successTitle: "文档审批提醒已发送",
      successDetail: `已提醒当前审批节点处理《${doc.name}》。`,
    });
  };

  const openCreateReportModal = () => {
    const storedDraft = readStoredReportDraft(selectedDate);
    setEditingReportDate(null);
    setReportDraft(storedDraft ?? defaultReportDraft);
    setReportModalOpen(true);
  };

  const openEditReportModal = (report: ReportEntryWithDate) => {
    const storedDraft = readStoredReportDraft(report.date);
    setEditingReportDate(report.date);
    setReportDraft(
      storedDraft ?? {
        summary: report.summary,
        nextPlan: report.nextPlan,
        attachment: report.attachment === "未上传附件" ? "" : report.attachment,
      },
    );
    setReportModalOpen(true);
  };

  const closeReportModal = () => {
    setReportModalOpen(false);
    setEditingReportDate(null);
    setReportDraft(defaultReportDraft);
  };

  const saveReport = async () => {
    if (!reportDraft.summary.trim() || !reportDraft.nextPlan.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const reportDate = editingReportDate || selectedDate;
      await requestJson("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          date: reportDate,
          ...reportDraft,
        }),
      });
      removeStoredReportDraft(reportDate);
      closeReportModal();
      showSuccessToast(editingReportDate ? "汇报已更新" : "汇报已提交", "当前日期的工作汇报已保存。");
      refreshWorkspace("reports");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "汇报保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const removeReportRequest = async (date: string) => {
    await requestJson(`/api/reports?date=${encodeURIComponent(date)}`, {
      method: "DELETE",
    });
    removeStoredReportDraft(date);
    refreshWorkspace("reports");
  };

  const removeReport = (date: string) => {
    setConfirmDialog({
      open: true,
      title: "撤回汇报",
      message: `确认撤回 ${formatShortDate(date)} 的工作汇报？`,
      confirmLabel: "确认撤回",
      successTitle: "汇报已撤回",
      successDetail: "你可以重新编辑并再次提交这一天的汇报。",
      onConfirm: () => removeReportRequest(date),
    });
  };

  const removeTeamReportsRequest = async (date: string, teamGroupId: string) => {
    const result = await requestJson<{ deletedCount?: number }>(
      `/api/reports?date=${encodeURIComponent(date)}&teamGroupId=${encodeURIComponent(teamGroupId)}`,
      {
        method: "DELETE",
      },
    );
    refreshWorkspace("reports");
    return result.deletedCount ?? 0;
  };

  const removeTeamReports = () => {
    const group = teamGroups.find((item) => item.id === reportDeleteTeamGroupId);
    if (!group) {
      setLoadError("请选择要清理的项目组");
      return;
    }

    setConfirmDialog({
      open: true,
      title: "删除队伍汇报",
      message: `确认删除「${group.name}」在 ${formatShortDate(selectedDate)} 的全部日程汇报？该操作不可恢复。`,
      confirmLabel: "确认删除",
      successTitle: "队伍汇报已删除",
      successDetail: `「${group.name}」该日期的汇报记录已经清理。`,
      onConfirm: async () => {
        await removeTeamReportsRequest(selectedDate, group.id);
      },
    });
  };

  const saveEvent = async () => {
    if (!eventDraft.title.trim() || !eventDraft.description.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const isEditing = Boolean(editingEventId);
      if (editingEventId) {
        await requestJson(`/api/events/${editingEventId}`, {
          method: "PATCH",
          body: JSON.stringify(eventDraft),
        });
      } else {
        await requestJson("/api/events", {
          method: "POST",
          body: JSON.stringify(eventDraft),
        });
      }

      setEventDraft(defaultEventDraft);
      setEditingEventId(null);
      setEventModalOpen(false);
      showSuccessToast(isEditing ? "节点已更新" : "节点已创建", "时间进度已经刷新到最新安排。");
      refreshWorkspace("events");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "节点保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const openEventModal = (event?: EventItem) => {
    if (event) {
      setEditingEventId(event.id);
      setEventDraft({
        title: event.title,
        dateTime: toDateTimeInputValue(event.dateTime),
        type: event.type,
        description: event.description,
      });
    } else {
      setEditingEventId(null);
      setEventDraft(defaultEventDraft);
    }
    setEventModalOpen(true);
  };

  const saveExpert = async () => {
    const nextErrors: ExpertDraftErrors = {
      date: expertDraft.date.trim() ? undefined : "请选择日期",
      format: expertDraft.format.trim() ? undefined : "请填写沟通形式",
      expert: expertDraft.expert.trim() ? undefined : "请填写专家姓名",
      topic: expertDraft.topic.trim() ? undefined : "请填写主题",
      summary: expertDraft.summary.trim() ? undefined : "请填写反馈摘要",
      nextAction: expertDraft.nextAction.trim() ? undefined : "请填写后续动作",
    };

    setExpertDraftErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    for (const file of expertFiles) {
      const validationError = validateClientFile(file);
      if (validationError) {
        setExpertDraftErrors((current) => ({
          ...current,
          attachments: validationError,
          submit: undefined,
        }));
        return;
      }
    }

    const formData = new FormData();
    formData.set("date", expertDraft.date);
    formData.set("format", expertDraft.format);
    formData.set("expert", expertDraft.expert.trim());
    formData.set("topic", expertDraft.topic.trim());
    formData.set("summary", expertDraft.summary.trim());
    formData.set("nextAction", expertDraft.nextAction.trim());
    expertFiles.forEach((file) => {
      formData.append("files", file);
    });

    setIsSaving(true);
    try {
      const response = await fetch("/api/experts", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message || "专家意见保存失败");
      }

      setExpertDraft(defaultExpertDraft);
      setExpertFiles([]);
      setExpertDraftErrors(defaultExpertDraftErrors());
      setExpertModalOpen(false);
      showSuccessToast("专家意见已保存", "新的专家反馈已经写入专家意见板块。");
      refreshWorkspace("experts");
    } catch (error) {
      setExpertDraftErrors((current) => ({
        ...current,
        submit: error instanceof Error ? error.message : "专家意见保存失败",
      }));
    } finally {
      setIsSaving(false);
    }
  };

  const removeExpertRequest = async (expertId: string) => {
    await requestJson(`/api/experts/${expertId}`, {
      method: "DELETE",
    });
    refreshWorkspace("experts");
  };

  const removeExpert = (expertId: string, topic: string) => {
    setConfirmDialog({
      open: true,
      title: "删除专家意见",
      message: `确认删除这条专家意见「${topic}」？附件和意见内容会一起删除。`,
      confirmLabel: "确认删除",
      successTitle: "专家意见已删除",
      successDetail: "这条专家意见和相关附件已经清理完成。",
      onConfirm: () => removeExpertRequest(expertId),
    });
  };

  const toggleDocExpand = (docId: string) => {
    setExpandedDocs((current) =>
      current.includes(docId) ? current.filter((item) => item !== docId) : [...current, docId],
    );
  };

  const openDocumentModal = () => {
    setDocumentDraft(defaultDocumentDraft);
    setDocumentModalOpen(true);
  };

  const saveDocument = async () => {
    const validationError = validateClientFile(documentDraft.file, {
      allowArchives: true,
      maxSizeBytes: MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
      maxSizeLabel: "100MB",
    });
    if (validationError) {
      setLoadError(validationError);
      return;
    }

    if (!documentDraft.name.trim()) {
      setLoadError("请填写文档名称");
      return;
    }

    setIsSaving(true);
    try {
      const file = documentDraft.file as File;
      setDocumentSavingLabel("准备上传...");
      setDocumentUploadProgress(null);

      const uploadTicket = await requestJson<{
        uploadUrl: string;
        objectKey: string;
        contentType: string;
      }>("/api/documents/upload-url", {
        method: "POST",
        body: JSON.stringify({
          category: documentDraft.category,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      setDocumentSavingLabel("直传中... 0%");
      await uploadFileDirectly({
        url: uploadTicket.uploadUrl,
        file,
        contentType: uploadTicket.contentType,
        onProgress: (percent) => {
          setDocumentUploadProgress(percent);
          setDocumentSavingLabel(`直传中... ${percent}%`);
        },
      });

      setDocumentSavingLabel("保存中...");
      setDocumentUploadProgress(100);
      await requestJson<{ document: DocumentItem }>("/api/documents", {
        method: "POST",
        body: JSON.stringify({
          name: documentDraft.name.trim(),
          category: documentDraft.category,
          note: documentDraft.note.trim(),
          fileName: file.name,
          filePath: uploadTicket.objectKey,
          fileSize: file.size,
          mimeType: uploadTicket.contentType,
        }),
      });

      setDocumentDraft(defaultDocumentDraft);
      setDocumentModalOpen(false);
      setDocumentSavingLabel("上传中...");
      setDocumentUploadProgress(null);
      showSuccessToast("文档已上传", "资料归档已经记录了新的材料版本。");
      refreshWorkspace("documents");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "文件上传失败");
    } finally {
      setIsSaving(false);
      setDocumentSavingLabel("上传中...");
      setDocumentUploadProgress(null);
    }
  };

  const openVersionUploadModal = (docId: string) => {
    setVersionTargetDocId(docId);
    setVersionUploadFile(null);
    setVersionUploadNote("");
    setVersionModalOpen(true);
  };

  const openReviewModal = (docId: string, action: DocumentReviewActionKey) => {
    setReviewTargetDocId(docId);
    setReviewAction(action);
    setReviewComment("");
    setReviewModalOpen(true);
  };

  const uploadNewDocumentVersion = async () => {
    if (!permissions.canUploadDocument) {
      return;
    }

    const validationError = validateClientFile(versionUploadFile, {
      allowArchives: true,
      maxSizeBytes: MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
      maxSizeLabel: "100MB",
    });
    if (validationError) {
      setLoadError(validationError);
      return;
    }

    if (!versionTargetDocId) {
      setLoadError("未找到需要上传版本的文档");
      return;
    }

    setIsSaving(true);
    try {
      const file = versionUploadFile as File;
      const documentCategory = documents.find((item) => item.id === versionTargetDocId)?.category ?? "计划书";
      setVersionSavingLabel("准备上传...");
      setVersionUploadProgress(null);

      const uploadTicket = await requestJson<{
        uploadUrl: string;
        objectKey: string;
        contentType: string;
      }>("/api/documents/upload-url", {
        method: "POST",
        body: JSON.stringify({
          category: documentCategory,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      setVersionSavingLabel("直传中... 0%");
      await uploadFileDirectly({
        url: uploadTicket.uploadUrl,
        file,
        contentType: uploadTicket.contentType,
        onProgress: (percent) => {
          setVersionUploadProgress(percent);
          setVersionSavingLabel(`直传中... ${percent}%`);
        },
      });

      setVersionSavingLabel("保存中...");
      setVersionUploadProgress(100);
      await requestJson<{ document: DocumentItem }>(`/api/documents/${versionTargetDocId}/version`, {
        method: "POST",
        body: JSON.stringify({
          note: versionUploadNote.trim(),
          fileName: file.name,
          filePath: uploadTicket.objectKey,
          fileSize: file.size,
          mimeType: uploadTicket.contentType,
        }),
      });

      setVersionUploadFile(null);
      setVersionUploadNote("");
      setVersionTargetDocId(null);
      setVersionModalOpen(false);
      setVersionSavingLabel("上传中...");
      setVersionUploadProgress(null);
      showSuccessToast("新版本已上传", "历史版本列表已经同步更新。");
      refreshWorkspace("documents");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "文档版本上传失败");
    } finally {
      setIsSaving(false);
      setVersionSavingLabel("上传中...");
      setVersionUploadProgress(null);
    }
  };

  const reviewDocument = async () => {
    if (!reviewTargetDocId || !reviewAction) {
      setLoadError("未找到审批目标");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson(`/api/documents/${reviewTargetDocId}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          action: reviewAction,
          comment: reviewComment.trim() || undefined,
        }),
      });
      setReviewModalOpen(false);
      setReviewTargetDocId(null);
      setReviewAction(null);
      setReviewComment("");
      showSuccessToast("审批已提交", "文档审批状态和批注已经更新。");
      refreshWorkspace("documents");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "文档审核失败");
    } finally {
      setIsSaving(false);
    }
  };

  const openReviewAssignmentModal = (assignmentsToEdit?: ExpertReviewAssignmentItem[]) => {
    const editAssignments = assignmentsToEdit?.filter(Boolean) ?? [];

    if (editAssignments.length > 0) {
      const firstAssignment = editAssignments[0];
      setReviewAssignmentEditAssignmentId(firstAssignment.id);
      setReviewAssignmentDraft({
        expertUserId: firstAssignment.expert.id,
        expertUserIds: editAssignments.map((assignment) => assignment.expert.id),
        targetName: firstAssignment.targetName,
        stageId: "",
        materialSubmissionIds: [],
        roundLabel: firstAssignment.roundLabel,
        overview: firstAssignment.overview,
        deadline: firstAssignment.deadline
          ? formatBeijingDateTimeInput(firstAssignment.deadline)
          : getDefaultReviewAssignmentDeadline(),
      });
      setReviewAssignmentModalOpen(true);
      return;
    }

    setReviewAssignmentEditAssignmentId(null);
    setReviewAssignmentDraft(defaultExpertReviewAssignmentDraft(expertMembers[0]?.id ?? ""));
    setReviewAssignmentModalOpen(true);
  };

  const saveReviewAssignment = async () => {
    if (reviewAssignmentEditAssignmentId) {
      if (reviewAssignmentDraft.expertUserIds.length === 0) {
        setLoadError("请至少保留一位评审专家");
        return;
      }

      setIsSaving(true);
      try {
        await requestJson(`/api/expert-reviews/assignments/${reviewAssignmentEditAssignmentId}`, {
          method: "PATCH",
          body: JSON.stringify({
            expertUserIds: reviewAssignmentDraft.expertUserIds,
            roundLabel: reviewAssignmentDraft.roundLabel.trim(),
            overview: reviewAssignmentDraft.overview.trim(),
            deadline: reviewAssignmentDraft.deadline
              ? new Date(reviewAssignmentDraft.deadline).toISOString()
              : null,
          }),
        });

        setReviewAssignmentModalOpen(false);
        setReviewAssignmentEditAssignmentId(null);
        setReviewAssignmentDraft(defaultExpertReviewAssignmentDraft(expertMembers[0]?.id ?? ""));
        showSuccessToast("评审包已更新", "截止时间、说明和专家名单已同步到专家端。");
        refreshWorkspace("reviewAssignments");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "评审任务更新失败");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!reviewAssignmentDraft.stageId) {
      setLoadError("请先选择项目管理轮次");
      return;
    }

    if (reviewAssignmentDraft.materialSubmissionIds.length === 0) {
      setLoadError("请先选择已生效项目材料");
      return;
    }

    if (reviewAssignmentDraft.expertUserIds.length === 0) {
      setLoadError("请先批量选择专家");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson("/api/expert-reviews/assignments", {
        method: "POST",
        body: JSON.stringify({
          stageId: reviewAssignmentDraft.stageId,
          materialSubmissionIds: reviewAssignmentDraft.materialSubmissionIds,
          expertUserIds: reviewAssignmentDraft.expertUserIds,
          roundLabel: reviewAssignmentDraft.roundLabel.trim(),
          overview: reviewAssignmentDraft.overview.trim(),
          deadline: reviewAssignmentDraft.deadline
            ? new Date(reviewAssignmentDraft.deadline).toISOString()
            : undefined,
        }),
      });

      setReviewAssignmentModalOpen(false);
      setReviewAssignmentEditAssignmentId(null);
      setReviewAssignmentDraft(defaultExpertReviewAssignmentDraft(expertMembers[0]?.id ?? ""));
      showSuccessToast("评审任务已生成", "已按项目管理轮次分配给专家。");
      refreshWorkspace("reviewAssignments");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "评审任务创建失败");
    } finally {
      setIsSaving(false);
    }
  };

  const openReviewMaterialModal = (assignmentId: string, kind: "plan" | "ppt" | "video") => {
    setReviewMaterialTargetId(assignmentId);
    setReviewMaterialSavingLabel("上传中...");
    setReviewMaterialUploadProgress(null);
    setReviewMaterialDraft({
      kind,
      name: "",
      file: null,
    });
    setReviewMaterialModalOpen(true);
  };

  const saveReviewMaterial = async () => {
    if (!reviewMaterialTargetId || !reviewMaterialDraft.file) {
      setLoadError("请先选择需要上传的评审材料");
      return;
    }

    if (reviewMaterialDraft.kind !== "video" && !(await hasPdfSignature(reviewMaterialDraft.file))) {
      setLoadError(
        `${reviewMaterialDraft.kind === "plan" ? "计划书" : "路演材料"}需上传有效的 PDF 文件`,
      );
      return;
    }

    setIsSaving(true);
    try {
      setReviewMaterialSavingLabel("准备上传...");
      setReviewMaterialUploadProgress(null);

      const uploadTicket = await requestJson<{
        uploadUrl: string;
        objectKey: string;
        contentType: string;
      }>(`/api/expert-reviews/assignments/${reviewMaterialTargetId}/materials/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          kind: reviewMaterialDraft.kind,
          fileName: reviewMaterialDraft.file.name,
          fileSize: reviewMaterialDraft.file.size,
          mimeType: reviewMaterialDraft.file.type,
        }),
      });

      setReviewMaterialSavingLabel("直传中... 0%");
      await uploadFileDirectly({
        url: uploadTicket.uploadUrl,
        file: reviewMaterialDraft.file,
        contentType: uploadTicket.contentType,
        onProgress: (percent) => {
          setReviewMaterialUploadProgress(percent);
          setReviewMaterialSavingLabel(`直传中... ${percent}%`);
        },
      });

      setReviewMaterialSavingLabel("保存中...");
      setReviewMaterialUploadProgress(100);
      await requestJson<{ assignment: ExpertReviewAssignmentItem }>(
        `/api/expert-reviews/assignments/${reviewMaterialTargetId}/materials`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: reviewMaterialDraft.kind,
            name: reviewMaterialDraft.name.trim(),
            fileName: reviewMaterialDraft.file.name,
            filePath: uploadTicket.objectKey,
            fileSize: reviewMaterialDraft.file.size,
            mimeType: uploadTicket.contentType,
          }),
        },
      );

      setReviewMaterialModalOpen(false);
      setReviewMaterialTargetId(null);
      setReviewMaterialDraft(defaultExpertReviewMaterialDraft());
      setReviewMaterialSavingLabel("上传中...");
      setReviewMaterialUploadProgress(null);
      showSuccessToast("评审材料已上传", "专家端现在可以在线查看这份材料。");
      refreshWorkspace("reviewAssignments");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "评审材料上传失败");
    } finally {
      setIsSaving(false);
      setReviewMaterialSavingLabel("上传中...");
      setReviewMaterialUploadProgress(null);
    }
  };

  const deleteReviewMaterialRequest = async (
    assignmentId: string,
    kind: "plan" | "ppt" | "video",
  ) => {
    await requestJson<{ assignment: ExpertReviewAssignmentItem }>(
      `/api/expert-reviews/assignments/${assignmentId}/materials?kind=${kind}`,
      {
        method: "DELETE",
      },
    );
    refreshWorkspace("reviewAssignments");
  };

  const deleteReviewMaterial = (
    assignmentId: string,
    kind: "plan" | "ppt" | "video",
  ) => {
    setConfirmDialog({
      open: true,
      title: "删除评审材料",
      message: `确认删除${expertReviewMaterialLabels[kind]}？删除后专家将无法继续查看该材料。`,
      confirmLabel: "确认删除",
      successTitle: "评审材料已删除",
      successDetail: "该材料已经从当前评审包移除。",
      onConfirm: () => deleteReviewMaterialRequest(assignmentId, kind),
    });
  };

  const deleteReviewAssignmentRequest = async (assignmentId: string) => {
    await requestJson(`/api/expert-reviews/assignments/${assignmentId}`, {
      method: "DELETE",
    });
    refreshWorkspace("reviewAssignments");
  };

  const deleteReviewAssignment = (assignmentId: string, targetName: string) => {
    setConfirmDialog({
      open: true,
      title: "删除专家评审包",
      message: `确认删除专家评审包「${targetName}」？相关指派、评分与临时材料都会一起清除。`,
      confirmLabel: "确认删除",
      successTitle: "评审包已删除",
      successDetail: "相关指派、评分和材料已经一并清理。",
      onConfirm: () => deleteReviewAssignmentRequest(assignmentId),
    });
  };

  const updateReviewScoreDraft = (
    assignmentId: string,
    field: keyof ExpertReviewScoreDraft,
    value: string,
  ) => {
    setReviewScoreDrafts((current) => ({
      ...current,
      [assignmentId]: {
        ...(current[assignmentId] ?? createExpertReviewScoreDraft()),
        [field]: value,
      },
    }));
  };

  const getReviewScoreTotal = (draft: ExpertReviewScoreDraft | undefined) =>
    (draft?.scorePersonalGrowth
      ? mapExpertReviewGradeToScore("scorePersonalGrowth", draft.scorePersonalGrowth as "A" | "B" | "C" | "D" | "E")
      : 0) +
    (draft?.scoreInnovation
      ? mapExpertReviewGradeToScore("scoreInnovation", draft.scoreInnovation as "A" | "B" | "C" | "D" | "E")
      : 0) +
    (draft?.scoreIndustry
      ? mapExpertReviewGradeToScore("scoreIndustry", draft.scoreIndustry as "A" | "B" | "C" | "D" | "E")
      : 0) +
    (draft?.scoreTeamwork
      ? mapExpertReviewGradeToScore("scoreTeamwork", draft.scoreTeamwork as "A" | "B" | "C" | "D" | "E")
      : 0);

  const saveExpertReviewScore = async (assignmentId: string) => {
    const draft = reviewScoreDrafts[assignmentId];
    if (!draft) {
      setLoadError("评分表单尚未准备完成");
      return;
    }

    if (!draft.commentTotal.trim()) {
      setLoadError("请填写综合评语");
      return;
    }

    if (
      !draft.scorePersonalGrowth ||
      !draft.scoreInnovation ||
      !draft.scoreIndustry ||
      !draft.scoreTeamwork
    ) {
      setLoadError("请先为四个评分项都选择一个等级");
      return;
    }

    setActiveReviewAssignmentId(assignmentId);
    try {
      await requestJson("/api/expert-reviews/scores", {
        method: "POST",
        body: JSON.stringify({
          assignmentId,
          scorePersonalGrowth: mapExpertReviewGradeToScore("scorePersonalGrowth", draft.scorePersonalGrowth as "A" | "B" | "C" | "D" | "E"),
          scoreInnovation: mapExpertReviewGradeToScore("scoreInnovation", draft.scoreInnovation as "A" | "B" | "C" | "D" | "E"),
          scoreIndustry: mapExpertReviewGradeToScore("scoreIndustry", draft.scoreIndustry as "A" | "B" | "C" | "D" | "E"),
          scoreTeamwork: mapExpertReviewGradeToScore("scoreTeamwork", draft.scoreTeamwork as "A" | "B" | "C" | "D" | "E"),
          commentTotal: draft.commentTotal.trim(),
        }),
      });
      showSuccessToast("评分已提交", "本次专家评分已经保存。");
      refreshWorkspace("reviewAssignments");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "专家评分提交失败");
    } finally {
      setActiveReviewAssignmentId(null);
    }
  };

  const removeDocumentRequest = async (docId: string) => {
    await requestJson(`/api/documents/${docId}`, {
      method: "DELETE",
    });
    setExpandedDocs((current) => current.filter((item) => item !== docId));
    refreshWorkspace("documents");
  };

  const removeDocument = (docId: string, docName: string) => {
    setConfirmDialog({
      open: true,
      title: "删除文档",
      message: `确认删除文档「${docName}」？删除后不可恢复。`,
      confirmLabel: "确认删除",
      successTitle: "文档已删除",
      successDetail: "文档及其相关版本已经移除。",
      onConfirm: () => removeDocumentRequest(docId),
    });
  };

  const removeDocumentVersionRequest = async (docId: string, versionId?: string) => {
    if (!versionId) {
      throw new Error("版本编号缺失，暂时无法删除");
    }

    await requestJson(`/api/documents/${docId}/version?versionId=${versionId}`, {
      method: "DELETE",
    });
    refreshWorkspace("documents");
  };

  const removeDocumentVersion = (docId: string, versionId: string | undefined) => {
    setConfirmDialog({
      open: true,
      title: "删除历史版本",
      message: "确认删除该历史版本？",
      confirmLabel: "确认删除",
      successTitle: "历史版本已删除",
      successDetail: "文档版本记录已经更新。",
      onConfirm: () => removeDocumentVersionRequest(docId, versionId),
    });
  };

  const saveTeamMember = async () => {
    if (!teamDraft.name.trim() || !teamDraft.username.trim()) {
      return;
    }

    const usernameError = validateUsername(teamDraft.username);
    if (usernameError) {
      setLoadError(usernameError);
      return;
    }

    setIsSaving(true);
    try {
      await requestJson("/api/team", {
        method: "POST",
        body: JSON.stringify({
          name: teamDraft.name,
          username: teamDraft.username,
          email: teamDraft.email,
          password: teamDraft.password || "123456",
          role: teamDraft.role,
          responsibility: teamDraft.responsibility,
          teamGroupId: teamDraft.role === "评审专家" ? null : teamDraft.teamGroupId || null,
        }),
      });
      setTeamDraft(defaultTeamDraft);
      setTeamModalOpen(false);
      showSuccessToast("账号已创建", "新的下级账号已经可以进入系统。");
      refreshWorkspace("team");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "成员创建失败");
    } finally {
      setIsSaving(false);
    }
  };

  const saveTeamGroup = async () => {
    if (!teamGroupDraft.name.trim()) {
      setLoadError("请输入分组名称");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson(editingTeamGroupId ? `/api/team/groups/${editingTeamGroupId}` : "/api/team/groups", {
        method: editingTeamGroupId ? "PATCH" : "POST",
        body: JSON.stringify({
          name: teamGroupDraft.name,
          description: teamGroupDraft.description,
        }),
      });
      setTeamGroupDraft(defaultTeamGroupDraft);
      setEditingTeamGroupId(null);
      showSuccessToast(
        editingTeamGroupId ? "分组已更新" : "分组已创建",
        editingTeamGroupId ? "分组名称已经更新，成员归属保持不变。" : "现在可以把团队账号分配到这个分组。",
      );
      refreshWorkspace("team");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : editingTeamGroupId ? "分组更新失败" : "分组创建失败");
    } finally {
      setIsSaving(false);
    }
  };

  const editTeamGroup = (group: TeamGroupItem) => {
    setLoadError(null);
    setEditingTeamGroupId(group.id);
    setTeamGroupDraft({
      name: group.name,
      description: group.description ?? "",
    });
  };

  const cancelEditTeamGroup = () => {
    setEditingTeamGroupId(null);
    setTeamGroupDraft(defaultTeamGroupDraft);
  };

  const deleteTeamGroupRequest = async (groupId: string) => {
    await requestJson(`/api/team/groups/${groupId}`, {
      method: "DELETE",
    });
    if (teamGroupFilter === groupId) {
      setTeamGroupFilter("全部");
    }
    refreshWorkspace("team");
  };

  const deleteTeamGroup = (group: TeamGroupItem) => {
    const copy = buildTeamManagementConfirmation({
      type: "deleteGroup",
      groupName: group.name,
    });

    setConfirmDialog({
      open: true,
      ...copy,
      onConfirm: () => deleteTeamGroupRequest(group.id),
    });
  };

  const saveBatchExperts = async () => {
    const lines = batchExpertDraft.rows
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setLoadError("请至少填写一行专家账号数据");
      return;
    }

    const experts = lines.map((line, index) => {
      const columns = (line.includes(",") || line.includes("，")
        ? line.split(/[，,]/)
        : line.split(/\s+/)
      ).map((item) => item.trim());
      const [name = "", username = "", password = "", email = ""] = columns;

      return {
        lineNumber: index + 1,
        name,
        username,
        password,
        email,
      };
    });

    const invalidRow = experts.find((expert) => {
      if (!expert.name || !expert.username) {
        return true;
      }
      return Boolean(validateUsername(expert.username));
    });

    if (invalidRow) {
      const usernameError = invalidRow.username ? validateUsername(invalidRow.username) : null;
      setLoadError(
        `第 ${invalidRow.lineNumber} 行数据不完整：请填写姓名和账号名${
          usernameError ? `，${usernameError}` : ""
        }`,
      );
      return;
    }

    setIsSaving(true);
    try {
      const payload = await requestJson<{ createdCount: number }>("/api/team/batch-experts", {
        method: "POST",
        body: JSON.stringify({ experts }),
      });
      setBatchExpertDraft(defaultBatchExpertDraft);
      setBatchExpertModalOpen(false);
      setTeamAccountView("experts");
      showSuccessToast("专家账号已批量创建", `已新增 ${payload.createdCount} 个评审专家账号。`);
      refreshWorkspace("team");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "批量添加专家失败");
    } finally {
      setIsSaving(false);
    }
  };

  const openProfilePage = () => {
    setProfileMessage(null);
    setProfileMenuOpen(false);
    router.push("/workspace?tab=profile");
  };

  const openOverviewTarget = (target?: TabKey | "notifications") => {
    if (target === "notifications") {
      setNotificationsOpen(true);
      return;
    }

    if (target) {
      router.push(target === "overview" ? "/workspace" : `/workspace?tab=${target}`);
    }
  };

  const applyUpdatedCurrentUser = (user: CurrentUser) => {
    setCurrentUser(user);
    setMembers((current) =>
      current.map((member) =>
        member.id === user.id
          ? {
              ...member,
              name: user.name,
              account: user.email || user.username,
              responsibility: user.responsibility,
              avatar: user.avatar,
              avatarUrl: user.avatarUrl ?? null,
            }
          : member,
      ),
    );
    setPendingTeamMembers((current) =>
      current.map((member) =>
        member.id === user.id
          ? {
              ...member,
              name: user.name,
              account: user.email || user.username,
              responsibility: user.responsibility,
              avatar: user.avatar,
              avatarUrl: user.avatarUrl ?? null,
            }
          : member,
      ),
    );
  };

  const saveProfile = async () => {
    if (!profileDraft.name.trim()) {
      setLoadError("请输入姓名");
      return;
    }

    const emailError = validateRequiredEmail(profileDraft.email);
    if (emailError) {
      setLoadError(emailError);
      return;
    }

    setIsSaving(true);
    try {
      const payload = await requestJson<{ user: CurrentUser }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: profileDraft.name.trim(),
          email: profileDraft.email.trim(),
          responsibility: profileDraft.responsibility.trim(),
          password: profileDraft.password.trim() || undefined,
        }),
      });

      applyUpdatedCurrentUser(payload.user);
      setProfileDraft({ ...defaultProfileDraft(payload.user), password: "" });
      setProfileMessage("个人信息已保存");
      showSuccessToast("个人信息已保存", "你的资料已经更新完成。");
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "个人信息保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadProfileAvatar = async (file: File | null) => {
    if (!file) {
      return;
    }

    setIsAvatarUploading(true);
    setLoadError(null);
    setProfileMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      const payload = (await response.json().catch(() => null)) as
        | { user?: CurrentUser; message?: string }
        | null;

      if (!response.ok || !payload?.user) {
        throw new Error(payload?.message || "头像上传失败");
      }

      applyUpdatedCurrentUser(payload.user);
      setProfileDraft((current) => ({
        ...current,
        name: payload.user?.name ?? current.name,
        email: payload.user?.email ?? current.email,
      }));
      showSuccessToast("头像已更新", "新的个人头像已经在系统内生效。");
      setProfileMessage("头像已更新");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "头像上传失败");
    } finally {
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      setIsAvatarUploading(false);
    }
  };

  const approveMemberRegistrationRequest = async (memberId: string) => {
    await requestJson(`/api/team/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    refreshWorkspace("team");
  };

  const confirmApproveMemberRegistration = (member: TeamMember) => {
    const copy = buildTeamManagementConfirmation({
      type: "approveRegistration",
      memberName: member.name,
      roleLabel: member.systemRole,
    });

    setConfirmDialog({
      open: true,
      ...copy,
      onConfirm: () => approveMemberRegistrationRequest(member.id),
    });
  };

  const openTeamRowEditor = (member: TeamMember) => {
    setEditingTeamRowId(member.id);
    setEditingTeamRowRole(member.systemRole);
    setEditingTeamRowGroupId(member.teamGroupId ?? "");
  };

  const cancelTeamRowEditor = () => {
    setEditingTeamRowId(null);
    setEditingTeamRowRole(null);
    setEditingTeamRowGroupId("");
  };

  const getTeamGroupDisplayName = (teamGroupId?: string | null) => {
    if (!teamGroupId) {
      return "未分组";
    }

    return teamGroups.find((group) => group.id === teamGroupId)?.name ?? "未知分组";
  };

  const saveTeamRowEditor = (member: TeamMember) => {
    const nextRole = editingTeamRowRole ?? member.systemRole;
    const nextTeamGroupId = editingTeamRowGroupId;
    const roleChanged = nextRole !== member.systemRole;
    const groupChanged = (member.teamGroupId ?? "") !== nextTeamGroupId;

    if (!roleChanged && !groupChanged) {
      cancelTeamRowEditor();
      return;
    }

    const changeSummary = [
      roleChanged ? `角色：${member.systemRole} → ${nextRole}` : null,
      groupChanged ? `分组：${getTeamGroupDisplayName(member.teamGroupId)} → ${getTeamGroupDisplayName(nextTeamGroupId || null)}` : null,
    ]
      .filter(Boolean)
      .join("；");

    setConfirmDialog({
      open: true,
      title: "确认保存账号调整",
      message: `确认更新「${member.name}」的账号设置？${changeSummary}`,
      confirmLabel: "确认保存",
      confirmVariant: "primary",
      successTitle: "账号设置已更新",
      successDetail: "角色和分组已同步生效。",
      onConfirm: async () => {
        await requestJson(`/api/team/${member.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            role: nextRole,
            teamGroupId: nextTeamGroupId || null,
          }),
        });
        cancelTeamRowEditor();
        refreshWorkspace("team");
      },
    });
  };

  const openPasswordModal = (member: TeamMember) => {
    setPasswordTargetMember(member);
    setPasswordDraft("");
    setPasswordModalOpen(true);
  };

  const resetMemberPassword = async () => {
    if (!passwordTargetMember || !passwordDraft.trim()) {
      setLoadError("请输入新密码");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson(`/api/team/${passwordTargetMember.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          password: passwordDraft.trim(),
        }),
      });
      setPasswordDraft("");
      setPasswordTargetMember(null);
      setPasswordModalOpen(false);
      showSuccessToast("密码已重置", "新密码已经生效。");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "密码重置失败");
    } finally {
      setIsSaving(false);
    }
  };

  const removeMemberRequest = async (memberId: string) => {
    await requestJson(`/api/team/${memberId}`, {
      method: "DELETE",
    });
    refreshWorkspace("team");
  };

  const removeMember = (memberId: string, memberName: string) => {
    const copy = buildTeamManagementConfirmation({
      type: "deleteAccount",
      memberName,
    });

    setConfirmDialog({
      open: true,
      ...copy,
      onConfirm: () => removeMemberRequest(memberId),
    });
  };

  const rejectMemberRegistration = (member: TeamMember) => {
    const copy = buildTeamManagementConfirmation({
      type: "rejectRegistration",
      memberName: member.name,
    });

    setConfirmDialog({
      open: true,
      ...copy,
      onConfirm: () => removeMemberRequest(member.id),
    });
  };

  const handleConfirmDialog = async () => {
    if (!confirmDialog?.onConfirm) {
      return;
    }

    setIsSaving(true);
    try {
      const successTitle = confirmDialog.successTitle;
      const successDetail = confirmDialog.successDetail;
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
      if (successTitle) {
        showSuccessToast(successTitle, successDetail);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsSaving(false);
    }
  };  const contextValue = {
    router,
    currentUser,
    setCurrentUser,
    currentDateTime,
    setCurrentDateTime,
    isBooting,
    setIsBooting,
    loadError,
    setLoadError,
    reloadToken,
    setReloadToken,
    loadedWorkspaceResourcesRef,
    announcements,
    setAnnouncements,
    events,
    setEvents,
    tasks,
    setTasks,
    experts,
    setExperts,
    reviewAssignments,
    setReviewAssignments,
    trainingQuestions,
    setTrainingQuestions,
    trainingSessions,
    setTrainingSessions,
    trainingStats,
    setTrainingStats,
    trainingPanel,
    setTrainingPanel,
    documents,
    setDocuments,
    projectStages,
    setProjectStages,
    projectMaterials,
    setProjectMaterials,
    notifications,
    setNotifications,
    sentReminders,
    setSentReminders,
    members,
    setMembers,
    pendingTeamMembers,
    setPendingTeamMembers,
    teamGroups,
    setTeamGroups,
    reportEntriesByDay,
    setReportEntriesByDay,
    reportDates,
    setReportDates,
    selectedDate,
    setSelectedDate,
    selectedReportTeamGroupId,
    setSelectedReportTeamGroupId,
    reportDeleteTeamGroupId,
    setReportDeleteTeamGroupId,
    selectedCategory,
    setSelectedCategory,
    expandedDocs,
    setExpandedDocs,
    expandedBoardTaskIds,
    setExpandedBoardTaskIds,
    boardStatusFilter,
    setBoardStatusFilter,
    boardSearch,
    setBoardSearch,
    countdown,
    setCountdown,
    notificationsOpen,
    setNotificationsOpen,
    sentRemindersOpen,
    setSentRemindersOpen,
    sentRemindersLoading,
    setSentRemindersLoading,
    teamSearch,
    setTeamSearch,
    teamRoleFilter,
    setTeamRoleFilter,
    teamGroupFilter,
    setTeamGroupFilter,
    teamAiFilter,
    setTeamAiFilter,
    teamAccountView,
    setTeamAccountView,
    teamAiSelectedIds,
    setTeamAiSelectedIds,
    teamAiPage,
    setTeamAiPage,
    aiBatchQuotaDraft,
    setAiBatchQuotaDraft,
    todoAutoOpened,
    setTodoAutoOpened,
    dismissedTodosReady,
    setDismissedTodosReady,
    dismissedTodoIds,
    setDismissedTodoIds,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    profileMenuOpen,
    setProfileMenuOpen,
    confirmDialog,
    setConfirmDialog,
    successToast,
    setSuccessToast,
    isSaving,
    setIsSaving,
    previewAsset,
    setPreviewAsset,
    taskModalOpen,
    setTaskModalOpen,
    editingTaskId,
    setEditingTaskId,
    taskDraft,
    setTaskDraft,
    taskCompletionModalOpen,
    setTaskCompletionModalOpen,
    taskCompletionTarget,
    setTaskCompletionTarget,
    taskCompletionDraft,
    setTaskCompletionDraft,
    taskRejectModalOpen,
    setTaskRejectModalOpen,
    taskRejectTarget,
    setTaskRejectTarget,
    taskRejectReason,
    setTaskRejectReason,
    trainingQuestionDraft,
    setTrainingQuestionDraft,
    editingTrainingQuestionId,
    setEditingTrainingQuestionId,
    questionImportModalOpen,
    setQuestionImportModalOpen,
    questionImportFileName,
    setQuestionImportFileName,
    questionImportRows,
    setQuestionImportRows,
    questionImportError,
    setQuestionImportError,
    selectedTrainingQuestionIds,
    setSelectedTrainingQuestionIds,
    activeDrillQuestionId,
    setActiveDrillQuestionId,
    qaDrillStats,
    setQaDrillStats,
    trainingTimerDuration,
    setTrainingTimerDuration,
    trainingTimerCustomMinutes,
    setTrainingTimerCustomMinutes,
    trainingTimerElapsed,
    setTrainingTimerElapsed,
    trainingTimerRunning,
    setTrainingTimerRunning,
    trainingSessionTitle,
    setTrainingSessionTitle,
    trainingSessionNotes,
    setTrainingSessionNotes,
    announcementModalOpen,
    setAnnouncementModalOpen,
    announcementDraft,
    setAnnouncementDraft,
    selectedAnnouncement,
    setSelectedAnnouncement,
    reminderModalOpen,
    setReminderModalOpen,
    reminderTargetMember,
    setReminderTargetMember,
    reminderDraft,
    setReminderDraft,
    reminderDraftErrors,
    setReminderDraftErrors,
    emailSettingsModalOpen,
    setEmailSettingsModalOpen,
    emailSettingsDraft,
    setEmailSettingsDraft,
    emailSettingsLoading,
    setEmailSettingsLoading,
    eventModalOpen,
    setEventModalOpen,
    editingEventId,
    setEditingEventId,
    eventDraft,
    setEventDraft,
    expertModalOpen,
    setExpertModalOpen,
    expertDraft,
    setExpertDraft,
    expertFiles,
    setExpertFiles,
    expertDraftErrors,
    setExpertDraftErrors,
    reviewAssignmentModalOpen,
    setReviewAssignmentModalOpen,
    reviewAssignmentDraft,
    setReviewAssignmentDraft,
    reviewAssignmentEditAssignmentId,
    setReviewAssignmentEditAssignmentId,
    reviewMaterialModalOpen,
    setReviewMaterialModalOpen,
    reviewMaterialTargetId,
    setReviewMaterialTargetId,
    reviewMaterialDraft,
    setReviewMaterialDraft,
    reviewMaterialSavingLabel,
    setReviewMaterialSavingLabel,
    reviewMaterialUploadProgress,
    setReviewMaterialUploadProgress,
    reviewScoreDrafts,
    setReviewScoreDrafts,
    activeReviewAssignmentId,
    setActiveReviewAssignmentId,
    expandedReviewPackageKeys,
    setExpandedReviewPackageKeys,
    teamModalOpen,
    setTeamModalOpen,
    teamDraft,
    setTeamDraft,
    teamGroupDraft,
    setTeamGroupDraft,
    editingTeamGroupId,
    setEditingTeamGroupId,
    batchExpertModalOpen,
    setBatchExpertModalOpen,
    batchExpertDraft,
    setBatchExpertDraft,
    profileDraft,
    setProfileDraft,
    profileMessage,
    setProfileMessage,
    isAvatarUploading,
    setIsAvatarUploading,
    aiPermissionItems,
    setAiPermissionItems,
    aiPermissionDrafts,
    setAiPermissionDrafts,
    aiPermissionsLoading,
    setAiPermissionsLoading,
    aiPermissionsMessage,
    setAiPermissionsMessage,
    aiPermissionSavingId,
    setAiPermissionSavingId,
    aiPermissionBatchSaving,
    setAiPermissionBatchSaving,
    avatarInputRef,
    profileMenuRef,
    aiPermissionAutoSaveTimersRef,
    passwordModalOpen,
    setPasswordModalOpen,
    passwordTargetMember,
    setPasswordTargetMember,
    passwordDraft,
    setPasswordDraft,
    reportModalOpen,
    setReportModalOpen,
    editingReportDate,
    setEditingReportDate,
    reportDraft,
    setReportDraft,
    documentModalOpen,
    setDocumentModalOpen,
    documentDraft,
    setDocumentDraft,
    documentSavingLabel,
    setDocumentSavingLabel,
    documentUploadProgress,
    setDocumentUploadProgress,
    versionModalOpen,
    setVersionModalOpen,
    versionTargetDocId,
    setVersionTargetDocId,
    versionUploadNote,
    setVersionUploadNote,
    versionUploadFile,
    setVersionUploadFile,
    versionSavingLabel,
    setVersionSavingLabel,
    versionUploadProgress,
    setVersionUploadProgress,
    reviewModalOpen,
    setReviewModalOpen,
    reviewTargetDocId,
    setReviewTargetDocId,
    reviewAction,
    setReviewAction,
    reviewComment,
    setReviewComment,
    highlightedDocId,
    setHighlightedDocId,
    openDocumentViewMenuId,
    setOpenDocumentViewMenuId,
    openExpertAttachmentMenuId,
    setOpenExpertAttachmentMenuId,
    editingTeamRowId,
    setEditingTeamRowId,
    editingTeamRowRole,
    setEditingTeamRowRole,
    editingTeamRowGroupId,
    setEditingTeamRowGroupId,
    role,
    currentRole,
    isSystemAdmin,
    isSchoolAdmin,
    hasGlobalAdminRole,
    currentMemberId,
    permissions,
    requiresEmailCompletion,
    visibleTabs,
    sidebarTabs,
    safeActiveTab,
    activeTabItem,
    nearestUpcomingIndex,
    nearestEvent,
    portalScopeText,
    canReviewDocuments,
    hasBlockingOverlay,
    showSuccessToast,
    loadAiPermissions,
    saveAiPermission,
    scheduleAiPermissionSave,
    flushAiPermissionSave,
    updateAiPermissionDraft,
    runBatchAiPermissionUpdate,
    confirmBatchAiPermissionUpdate,
    applyReportsPayload,
    applyReviewAssignments,
    applyTeamPayload,
    clearNonExpertWorkspaceData,
    buildReportsRequestUrl,
    getWorkspaceTabResourceKeys,
    loadWorkspaceResource,
    loadWorkspaceResources,
    membersMap,
    reportEntries,
    reportEntryMap,
    todayDateKey,
    dismissedTodoStorageKey,
    todayReportEntries,
    todayReportEntryMap,
    taskAssignableMembers,
    defaultAssignableMemberIds,
    visibleReportMembers,
    reportDateOptions,
    selectedReportSubmittedCount,
    selectedReportExpectedCount,
    selectedReportMissingCount,
    currentUserSelectedReport,
    selectedDateHasSavedReports,
    filteredDocuments,
    expertMembers,
    myOpenTasks,
    pendingLeaderReviewCount,
    pendingTeacherReviewCount,
    reportableMembers,
    reportSubmittedCount,
    reportExpectedCount,
    getMemberName,
    getTaskAssigneeIds,
    getTaskAssignments,
    getCurrentTaskAssignment,
    getTaskAssignmentSummary,
    getTaskAssigneeName,
    todayTaskSummaryTasks,
    canManageMember,
    canResetMemberPassword,
    canApprovePendingMember,
    availableRoleOptions,
    canViewExpertAccounts,
    canViewTeamAccountIdentifiers,
    visibleTeamMembers,
    aiPermissionMap,
    visibleCoreTeamMembers,
    visibleExpertAccountMembers,
    activeTeamMembers,
    canUseTeamGroups,
    showTeamActions,
    teamListGridClassName,
    teamFilterOptions,
    filteredTeamMembers,
    sortedTeamMembers,
    teamPageSize,
    teamPageCount,
    displayedTeamMembers,
    selectedVisibleAiIds,
    allVisibleAiSelected,
    teamAiStats,
    canBatchCreateExperts,
    pendingApprovalMembers,
    unreadTodoNotifications,
    roleTodoItems,
    todoNotifications,
    visibleRoleTodoItems,
    todoItemCount,
    urgentTodoCount,
    dismissTodoItem,
    markAllTodoItemsAsRead,
    canSendDirectiveToMember,
    reminderTabOptions,
    closeReminderModal,
    openReminderModal,
    openEmailSettingsModal,
    saveEmailSettings,
    canAcceptTask,
    canSubmitTask,
    canMoveTask,
    canEditTaskItem,
    canDeleteTaskItem,
    canReviewTaskItem,
    toggleBoardTaskExpand,
    canDeleteDocument,
    canDeleteDocumentVersion,
    canManageReviewMaterials,
    canCreateReviewPackage,
    canManageTrainingQuestion,
    activeDrillQuestion,
    getDocumentActionButtons,
    refreshWorkspace,
    getReportDraftStorageKey,
    readStoredReportDraft,
    removeStoredReportDraft,
    validateClientFile,
    handleDownload,
    handleDocumentViewAction,
    openPreviewAsset,
    buildInlinePreviewUrl,
    buildDocumentPreviewUrl,
    handlePreviewDocument,
    handleLogout,
    loadSentReminders,
    openSentRemindersModal,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    openNotification,
    openTodoItem,
    openCreateTaskModal,
    openEditTaskModal,
    saveTask,
    deleteTaskRequest,
    deleteTask,
    acceptTask,
    openTaskCompletionModal,
    closeTaskCompletionModal,
    uploadTaskEvidence,
    submitTaskForReview,
    confirmTaskArchive,
    openTaskRejectModal,
    closeTaskRejectModal,
    rejectTaskForRework,
    completeTaskFromOverview,
    resetTrainingQuestionDraft,
    getTrainingQuestionDraftCategory,
    saveTrainingQuestion,
    editTrainingQuestion,
    openQuestionImportModal,
    updateQuestionImportRow,
    handleQuestionImportFile,
    importTrainingQuestions,
    deleteTrainingQuestionRequest,
    deleteTrainingQuestion,
    toggleTrainingQuestionSelection,
    selectAllManageableTrainingQuestions,
    deleteSelectedTrainingQuestionsRequest,
    deleteSelectedTrainingQuestions,
    drawRandomTrainingQuestion,
    recordDrillAnswer,
    applyTrainingTimerPreset,
    applyCustomTrainingTimer,
    resetTrainingTimer,
    saveTrainingSession,
    publishAnnouncement,
    saveReminder,
    sendDirectReminderToUsers,
    sendTaskReminder,
    remindTaskDispatch,
    sendReportReminder,
    sendDocumentReminder,
    openCreateReportModal,
    openEditReportModal,
    closeReportModal,
    saveReport,
    removeReportRequest,
    removeReport,
    removeTeamReportsRequest,
    removeTeamReports,
    saveEvent,
    openEventModal,
    saveExpert,
    removeExpertRequest,
    removeExpert,
    toggleDocExpand,
    openDocumentModal,
    saveDocument,
    openVersionUploadModal,
    openReviewModal,
    uploadNewDocumentVersion,
    reviewDocument,
    openReviewAssignmentModal,
    saveReviewAssignment,
    openReviewMaterialModal,
    saveReviewMaterial,
    deleteReviewMaterialRequest,
    deleteReviewMaterial,
    deleteReviewAssignmentRequest,
    deleteReviewAssignment,
    updateReviewScoreDraft,
    getReviewScoreTotal,
    saveExpertReviewScore,
    removeDocumentRequest,
    removeDocument,
    removeDocumentVersionRequest,
    removeDocumentVersion,
    saveTeamMember,
    saveTeamGroup,
    editTeamGroup,
    cancelEditTeamGroup,
    deleteTeamGroupRequest,
    deleteTeamGroup,
    saveBatchExperts,
    openProfilePage,
    openOverviewTarget,
    applyUpdatedCurrentUser,
    saveProfile,
    uploadProfileAvatar,
    approveMemberRegistrationRequest,
    confirmApproveMemberRegistration,
    openTeamRowEditor,
    cancelTeamRowEditor,
    getTeamGroupDisplayName,
    saveTeamRowEditor,
    openPasswordModal,
    resetMemberPassword,
    removeMemberRequest,
    removeMember,
    rejectMemberRegistration,
    handleConfirmDialog,
  };

  return contextValue;
}

type WorkspaceContextValue = ReturnType<typeof useWorkspaceController>;

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  activeTab = "overview",
  targetDocumentId = null,
  children,
}: {
  activeTab?: TabKey;
  targetDocumentId?: string | null;
  children: React.ReactNode;
}) {
  const contextValue = useWorkspaceController({ activeTab, targetDocumentId });

  return <WorkspaceContext.Provider value={contextValue}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error("WorkspaceContext is not available");
  }

  return context;
}
