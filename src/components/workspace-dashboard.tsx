"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BellPlus,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
  Pause,
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
import { PdfPreview } from "@/components/pdf-preview";
import {
  formatBeijingDateTimeShort,
  formatBeijingFriendlyDate,
  toIsoDateKey,
} from "@/lib/date";
import {
  buildReportDateOptions,
  getReportAttachmentNote,
  getVisibleReportMembers,
  isReportDateKey,
} from "@/lib/report-history";
import { EMAIL_RULE_HINT, USERNAME_RULE_HINT, validateRequiredEmail, validateUsername } from "@/lib/account-policy";
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
import type { TrainingQuestionImportCandidate } from "@/lib/training-import";
import { buildTaskWorkflowSteps, getTaskAcceptedTimeLabel, getTaskReviewerLabel } from "@/lib/task-workflow";

type BoardStatus = (typeof boardColumns)[number]["id"];
type BoardStatusFilter = BoardStatus | "all";

type TabKey =
  | "overview"
  | "timeline"
  | "board"
  | "training"
  | "reports"
  | "experts"
  | "review"
  | "documents"
  | "team"
  | "profile";

type TabItem = {
  key: TabKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

type TaskDraft = {
  title: string;
  assigneeId: string;
  teamGroupId: string;
  dueDate: string;
  priority: "高优先级" | "中优先级" | "低优先级";
  notifyAssignee: boolean;
};

type TaskCompletionDraft = {
  note: string;
  file: File | null;
};

type TrainingQuestionDraft = {
  category: string;
  customCategory: string;
  question: string;
  answerPoints: string;
};

type TrainingQuestionImportRow = TrainingQuestionDraft & {
  id: string;
  selected: boolean;
};

type TrainingTimerPreset = {
  key: "pitch" | "qa" | "full";
  label: string;
  seconds: number;
  description: string;
};

type EventDraft = {
  title: string;
  dateTime: string;
  type: string;
  description: string;
};

type ExpertDraft = {
  date: string;
  expert: string;
  topic: string;
  format: string;
  summary: string;
  nextAction: string;
};

type ExpertDraftErrors = {
  date?: string;
  format?: string;
  expert?: string;
  topic?: string;
  summary?: string;
  nextAction?: string;
  attachments?: string;
  submit?: string;
};

type AnnouncementDraft = {
  title: string;
  detail: string;
  notifyTeam: boolean;
};

type ReminderDraft = {
  title: string;
  detail: string;
  targetTab: string;
};

type ReminderDraftErrors = {
  title?: string;
  detail?: string;
  submit?: string;
};

type EmailReminderSettingsDraft = {
  taskAssignmentEnabled: boolean;
  taskReviewEnabled: boolean;
  announcementEnabled: boolean;
  directReminderEnabled: boolean;
  documentReviewEnabled: boolean;
  reportSubmitEnabled: boolean;
  dailyReportMissingEnabled: boolean;
  dailyReportHour: number;
};

type TeamDraft = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: TeamRoleLabel;
  responsibility: string;
  teamGroupId: string;
};

type BatchExpertDraft = {
  rows: string;
};

type TeamGroupDraft = {
  name: string;
  description: string;
};

type ProfileDraft = {
  name: string;
  username: string;
  email: string;
  responsibility: string;
  password: string;
};

type ReportDraft = {
  summary: string;
  nextPlan: string;
  attachment: string;
};

type ExpertReviewAssignmentDraft = {
  expertUserId: string;
  targetName: string;
  roundLabel: string;
  overview: string;
  deadline: string;
};

type ExpertReviewMaterialDraft = {
  kind: "plan" | "ppt" | "video";
  name: string;
  file: File | null;
};

type ExpertReviewScoreDraft = {
  scorePersonalGrowth: string;
  scoreInnovation: string;
  scoreIndustry: string;
  scoreTeamwork: string;
  commentTotal: string;
};

type DocumentDraft = {
  name: string;
  category: (typeof documentCategories)[number];
  note: string;
  file: File | null;
};

type CurrentUser = {
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

type ReportEntryWithDate = ReportEntry & {
  date: string;
};

type PreviewAsset = {
  title: string;
  url: string;
  mimeType?: string | null;
  fileName?: string | null;
  mode?: "preview" | "download-fallback";
  downloadUrl?: string | null;
  fallbackMessage?: string;
};

type TodoCenterItem = {
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

const imagePreviewExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"] as const;
const wordPreviewExtensions = [".docx"] as const;

const trainingQuestionCategories = ["商业模式", "技术壁垒", "市场与竞品", "财务数据", "团队分工", "综合答辩", "其他"] as const;

const defaultTrainingQuestionDraft: TrainingQuestionDraft = {
  category: "商业模式",
  customCategory: "",
  question: "",
  answerPoints: "",
};

const createTrainingImportRowId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeTrainingCategory = (draft: Pick<TrainingQuestionDraft, "category" | "customCategory">) =>
  draft.category === "其他" ? draft.customCategory.trim() : draft.category;

const createTrainingImportRow = (
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

const trainingTimerPresets: TrainingTimerPreset[] = [
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

const allTabs: TabItem[] = [
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
    label: "任务看板",
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
    key: "review",
    label: "专家评审",
    description: "按职教赛道创业组量表查看评审任务、打分和专家汇总。",
    icon: FileCheck,
  },
  {
    key: "documents",
    label: "文档中心",
    description: "分类管理计划书、PPT、答辩材料和证明附件。",
    icon: FolderOpen,
  },
  {
    key: "team",
    label: "团队管理",
    description: "查看成员分工、账号信息和角色配置。",
    icon: Users,
  },
  {
    key: "profile",
    label: "个人信息",
    description: "查看并维护当前登录账号的个人资料。",
    icon: User,
  },
];

const boardStatusMeta: Record<
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
    dotClassName: "bg-amber-500",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    rowAccentClassName: "bg-amber-500",
  },
  doing: {
    label: "处理中",
    description: "处理人正在推进并补充凭证",
    dotClassName: "bg-blue-600",
    badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
    rowAccentClassName: "bg-blue-600",
  },
  review: {
    label: "待验收",
    description: "等待负责人或教师确认闭环",
    dotClassName: "bg-orange-500",
    badgeClassName: "border-orange-200 bg-orange-50 text-orange-700",
    rowAccentClassName: "bg-orange-500",
  },
  archived: {
    label: "已归档",
    description: "已完成闭环，保留备查",
    dotClassName: "bg-emerald-600",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rowAccentClassName: "bg-emerald-600",
  },
};

const boardStatusOrder: Record<BoardStatus, number> = {
  review: 0,
  doing: 1,
  todo: 2,
  archived: 3,
};

const getBoardStatusLabel = (task: BoardTask) => {
  if (task.status === "todo" && !task.assigneeId) {
    return "待分配";
  }

  if (task.status === "todo") {
    return "待接取";
  }

  return boardStatusMeta[task.status].label;
};

const docStatusStyles: Record<DocumentItem["status"], string> = {
  待负责人审批: "bg-[#fef3c7] text-[#9a6700]",
  待教师终审: "bg-[#dbeafe] text-[#1d4ed8]",
  终审通过: "bg-[#e7f4eb] text-[#32734c]",
  负责人打回: "bg-[#fee2e2] text-[#b91c1c]",
  教师打回: "bg-[#fce7f3] text-[#be185d]",
};

type DocumentStatusKey = NonNullable<DocumentItem["statusKey"]>;
type DocumentReviewActionKey =
  | "leaderApprove"
  | "leaderRevision"
  | "teacherApprove"
  | "teacherRevision";
type DocumentActionButton = {
  key: DocumentReviewActionKey;
  label: string;
  variant: "secondary" | "danger";
};

type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  successTitle?: string;
  successDetail?: string;
  onConfirm: () => Promise<void> | void;
} | null;

type SuccessToastState = {
  title: string;
  detail?: string;
} | null;

type NotificationDeliveryResult = {
  notificationCount: number;
  emailRecipientCount: number;
  emailFailureCount: number;
  emailSkippedReason?: "disabled" | "no-recipient-email" | "setting-disabled";
  emailFailureReason?: "resend-domain-unverified" | "unknown";
};

type DirectReminderResponse = {
  success: boolean;
  delivery?: NotificationDeliveryResult;
};

const getReminderDeliveryDetail = (delivery?: NotificationDeliveryResult, fallbackDetail?: string) => {
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

const getBatchReminderDeliveryDetail = (
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

const reviewActionTitles: Record<DocumentReviewActionKey, string> = {
  leaderApprove: "负责人审批通过",
  leaderRevision: "负责人打回",
  teacherApprove: "教师终审通过",
  teacherRevision: "教师打回",
};

const documentStepLabels = ["成员提交", "负责人审批", "教师终审"] as const;
type DocumentStepState = "complete" | "current" | "pending";

const getDocumentWorkflowState = (statusKey: DocumentStatusKey) => {
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

const getDocumentStepCaption = (stepState: DocumentStepState) => {
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

const getDocumentStatusHint = (statusKey: DocumentStatusKey) => {
  switch (statusKey) {
    case "pending":
      return "当前正等待项目负责人审批。";
    case "leader_approved":
      return "负责人已通过，等待指导教师终审。";
    case "approved":
      return "文档已完成终审，可用于正式提交。";
    case "leader_revision":
      return "负责人已打回，等待成员修改后重新提交负责人审批。";
    case "revision":
      return "教师已打回，等待负责人修改后重新提交教师终审。";
    default:
      return "当前审批状态已更新。";
  }
};

const taskPriorityStyles: Record<TaskDraft["priority"], string> = {
  高优先级: "border-rose-200 bg-rose-50 text-rose-700",
  中优先级: "border-amber-200 bg-amber-50 text-amber-700",
  低优先级: "border-slate-200 bg-slate-100 text-slate-600",
};

const taskWorkflowDotClassNames: Record<"done" | "current" | "pending", string> = {
  done: "bg-emerald-500 text-white",
  current: "bg-blue-600 text-white shadow-sm shadow-blue-500/30",
  pending: "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
};

const surfaceCardClassName = "rounded-xl border border-slate-100 bg-white p-5 shadow-sm";
const subtleCardClassName = "rounded-xl border border-slate-100 bg-slate-50 p-4";
const fieldClassName =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const fieldErrorClassName =
  "mt-1.5 w-full rounded-lg border border-red-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-200";
const textareaClassName = `${fieldClassName} min-h-28`;

const rolePermissions = {
  admin: {
    visibleTabs: ["overview", "timeline", "board", "training", "reports", "experts", "review", "documents", "team", "profile"] as TabKey[],
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
    visibleTabs: ["overview", "timeline", "board", "training", "reports", "experts", "review", "documents", "team", "profile"] as TabKey[],
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
    visibleTabs: ["overview", "timeline", "board", "training", "reports", "experts", "review", "documents", "team", "profile"] as TabKey[],
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
    visibleTabs: ["overview", "timeline", "board", "training", "reports", "experts", "review", "documents", "team", "profile"] as TabKey[],
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

const teamRoleToRoleKey: Record<TeamRoleLabel, RoleKey> = {
  系统管理员: "admin",
  指导教师: "teacher",
  项目负责人: "leader",
  团队成员: "member",
  评审专家: "expert",
};

const formatDateTime = (value: string) => formatBeijingDateTimeShort(value);

const formatShortDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
};

const padDatePart = (value: number) => `${value}`.padStart(2, "0");

const parseDateLikeValue = (value: string) => {
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

const toDateInputValue = (value: string) => {
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

const toDateTimeInputValue = (value: string) => {
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

const formatFriendlyDate = (value: Date) => formatBeijingFriendlyDate(value);

const formatSeconds = (seconds: number) => {
  const normalizedSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;
  return `${minutes}:${`${remainingSeconds}`.padStart(2, "0")}`;
};

const getCountdown = (target: string) => {
  const difference = Math.max(new Date(target).getTime() - Date.now(), 0);
  const totalSeconds = Math.floor(difference / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

const getNearestUpcomingIndex = (events: EventItem[]) => {
  const now = Date.now();
  const nextIndex = events.findIndex((item) => new Date(item.dateTime).getTime() >= now);
  return nextIndex === -1 ? events.length - 1 : nextIndex;
};

const defaultTaskDraft = (assigneeId: string, teamGroupId = ""): TaskDraft => ({
  title: "",
  assigneeId,
  teamGroupId,
  dueDate: "2026-04-08T18:00",
  priority: "高优先级",
  notifyAssignee: true,
});

const defaultTaskCompletionDraft: TaskCompletionDraft = {
  note: "",
  file: null,
};

const defaultAnnouncementDraft: AnnouncementDraft = {
  title: "",
  detail: "",
  notifyTeam: true,
};

const defaultReminderDraft: ReminderDraft = {
  title: "请及时查看并处理",
  detail: "",
  targetTab: "",
};

const defaultReminderDraftErrors = (): ReminderDraftErrors => ({});

const defaultEmailReminderSettingsDraft: EmailReminderSettingsDraft = {
  taskAssignmentEnabled: true,
  taskReviewEnabled: true,
  announcementEnabled: true,
  directReminderEnabled: true,
  documentReviewEnabled: true,
  reportSubmitEnabled: true,
  dailyReportMissingEnabled: true,
  dailyReportHour: 20,
};

const emailReminderSettingItems: Array<{
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

const defaultEventDraft: EventDraft = {
  title: "",
  dateTime: "2026-04-15T18:00",
  type: "节点",
  description: "",
};

const defaultExpertDraft: ExpertDraft = {
  date: toDateInputValue("2026-04-05"),
  expert: "",
  topic: "",
  format: "线上点评",
  summary: "",
  nextAction: "",
};

const defaultExpertDraftErrors = (): ExpertDraftErrors => ({});

const defaultTeamDraft: TeamDraft = {
  name: "",
  username: "",
  email: "",
  password: "123456",
  role: "团队成员",
  responsibility: "",
  teamGroupId: "",
};

const defaultBatchExpertDraft: BatchExpertDraft = {
  rows: "",
};

const defaultTeamGroupDraft: TeamGroupDraft = {
  name: "",
  description: "",
};

const defaultProfileDraft = (user?: CurrentUser | null): ProfileDraft => ({
  name: user?.name ?? "",
  username: user?.username ?? "",
  email: user?.email ?? "",
  responsibility: user?.responsibility ?? "",
  password: "",
});

const defaultReportDraft: ReportDraft = {
  summary: "",
  nextPlan: "",
  attachment: "",
};

const defaultExpertReviewAssignmentDraft = (
  expertUserId = "",
): ExpertReviewAssignmentDraft => ({
  expertUserId,
  targetName: "",
  roundLabel: "校内专家预审",
  overview: "",
  deadline: "2026-04-10T18:00",
});

const defaultExpertReviewMaterialDraft = (): ExpertReviewMaterialDraft => ({
  kind: "plan",
  name: "",
  file: null,
});

const createExpertReviewScoreDraft = (
  assignment?: ExpertReviewAssignmentItem | null,
): ExpertReviewScoreDraft => ({
  scorePersonalGrowth: getExpertReviewGradeFromScore("scorePersonalGrowth", assignment?.score?.scorePersonalGrowth),
  scoreInnovation: getExpertReviewGradeFromScore("scoreInnovation", assignment?.score?.scoreInnovation),
  scoreIndustry: getExpertReviewGradeFromScore("scoreIndustry", assignment?.score?.scoreIndustry),
  scoreTeamwork: getExpertReviewGradeFromScore("scoreTeamwork", assignment?.score?.scoreTeamwork),
  commentTotal: assignment?.score?.commentTotal ?? "",
});

const defaultDocumentDraft: DocumentDraft = {
  name: "",
  category: "计划书",
  note: "",
  file: null,
};

const getDefaultDateKey = () => toIsoDateKey(new Date());

const getAssetExtension = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const normalized = value.split("?")[0].toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
};

const isPdfAsset = (asset: PreviewAsset) =>
  asset.mimeType === "application/pdf" ||
  getAssetExtension(asset.fileName) === ".pdf" ||
  getAssetExtension(asset.url) === ".pdf";

const isImageAsset = (asset: PreviewAsset) =>
  asset.mimeType?.startsWith("image/") ||
  imagePreviewExtensions.includes(getAssetExtension(asset.fileName) as (typeof imagePreviewExtensions)[number]) ||
  imagePreviewExtensions.includes(getAssetExtension(asset.url) as (typeof imagePreviewExtensions)[number]);

const isTextAsset = (asset: PreviewAsset) =>
  asset.mimeType?.startsWith("text/") ||
  getAssetExtension(asset.fileName) === ".txt" ||
  getAssetExtension(asset.url) === ".txt";

const isWordAsset = (asset: PreviewAsset) =>
  asset.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  wordPreviewExtensions.includes(getAssetExtension(asset.fileName) as (typeof wordPreviewExtensions)[number]) ||
  wordPreviewExtensions.includes(getAssetExtension(asset.url) as (typeof wordPreviewExtensions)[number]);

const canPreviewInlineAsset = (asset: Pick<PreviewAsset, "mimeType" | "fileName" | "url">) =>
  isPdfAsset(asset as PreviewAsset) ||
  isImageAsset(asset as PreviewAsset) ||
  isTextAsset(asset as PreviewAsset) ||
  isWordAsset(asset as PreviewAsset);

const formatFileSize = (fileSize?: number | null) => {
  if (!fileSize || fileSize <= 0) {
    return "未知大小";
  }

  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(fileSize / 1024))} KB`;
};

const hasPdfSignature = async (file: File) => {
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

const uploadFileDirectly = ({
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

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.message || "请求失败");
  }

  return payload as T;
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 rounded-md bg-[#EAF1FB] px-3 py-2">
        <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      </div>
      {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
  );
}

function DemoResetNote() {
  return <p className="text-xs leading-6 text-slate-400">当前数据已保存到云端数据库，可跨设备同步</p>;
}

function Modal({
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl ${sizeClassName} ${panelClassName ?? ""}`.trim()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 pb-4 pt-6">
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

function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex justify-end gap-3 border-t border-slate-200 pt-4">{children}</div>;
}

function ConfirmDialog({
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

function EmptyState({
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

function SuccessToast({ toast }: { toast: SuccessToastState }) {
  if (!toast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed top-5 right-5 z-[80] w-[min(360px,calc(100vw-2rem))]">
      <div className="rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 shadow-lg shadow-emerald-100/60 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
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

function ActionButton({
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
      ? "border border-[#0B3B8A] bg-[#0B3B8A] text-white hover:bg-[#0A3277]"
      : variant === "danger"
        ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        : "border border-slate-200 bg-white text-slate-700 hover:border-[#C9D9F3] hover:bg-[#F7FAFE] hover:text-[#0B3B8A]";

  return (
    <button
      className={`inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm shadow-sm transition duration-200 focus-visible:ring-2 focus-visible:ring-[#0B3B8A]/20 focus-visible:outline-none ${variantClassName} ${
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

function UserAvatar({
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
    <div className={className}>
      {avatarUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`${name} 的头像`}
          className="h-full w-full rounded-full object-cover"
          onError={() => setImageFailed(true)}
          src={avatarUrl}
        />
      ) : (
        <span className={textClassName}>{avatar}</span>
      )}
    </div>
  );
}

export function WorkspaceDashboard({
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [sentReminders, setSentReminders] = useState<NotificationItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingTeamMembers, setPendingTeamMembers] = useState<TeamMember[]>([]);
  const [teamGroups, setTeamGroups] = useState<TeamGroupItem[]>([]);
  const [reportEntriesByDay, setReportEntriesByDay] = useState<Record<string, ReportEntryWithDate[]>>({});
  const [reportDates, setReportDates] = useState<string[]>([getDefaultDateKey()]);
  const [selectedDate, setSelectedDate] = useState(getDefaultDateKey());
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
  const [teamAccountView, setTeamAccountView] = useState<"team" | "experts">("team");
  const [todoAutoOpened, setTodoAutoOpened] = useState(false);
  const [dismissedTodosReady, setDismissedTodosReady] = useState(false);
  const [dismissedTodoIds, setDismissedTodoIds] = useState<string[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [successToast, setSuccessToast] = useState<SuccessToastState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<PreviewAsset | null>(null);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(defaultTaskDraft("leader-1"));
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

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamDraft, setTeamDraft] = useState<TeamDraft>(defaultTeamDraft);
  const [teamGroupDraft, setTeamGroupDraft] = useState<TeamGroupDraft>(defaultTeamGroupDraft);
  const [editingTeamGroupId, setEditingTeamGroupId] = useState<string | null>(null);
  const [batchExpertModalOpen, setBatchExpertModalOpen] = useState(false);
  const [batchExpertDraft, setBatchExpertDraft] = useState<BatchExpertDraft>(defaultBatchExpertDraft);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(defaultProfileDraft());
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
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

  const role = currentUser?.role ?? null;
  const currentRole = role ?? "member";
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
    currentRole === "admin"
      ? "全局管理"
      : currentRole === "expert"
        ? "专家评审任务"
        : currentUser?.teamGroupName ?? "未加入项目组";
  const canReviewDocuments =
    currentRole === "admin" || permissions.canLeaderReviewDocument || permissions.canTeacherReviewDocument;
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

  useEffect(() => {
    let isMounted = true;

    const applyReviewAssignments = (assignments: ExpertReviewAssignmentItem[]) => {
      setReviewAssignments(assignments);
      setReviewScoreDrafts(
        Object.fromEntries(
          assignments.map((assignment) => [assignment.id, createExpertReviewScoreDraft(assignment)]),
        ),
      );
    };

    const loadWorkspaceData = async () => {
      setLoadError(null);

      try {
        const mePayload = await requestJson<{ user: CurrentUser }>("/api/auth/me");

        if (!isMounted) {
          return;
        }

        setCurrentUser(mePayload.user);

        if (mePayload.user.role === "expert") {
          const reviewPayload = await requestJson<{
            assignments: ExpertReviewAssignmentItem[];
          }>("/api/expert-reviews/assignments");

          if (!isMounted) {
            return;
          }

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
          setNotifications([]);
          setSentReminders([]);
          setMembers([]);
          setPendingTeamMembers([]);
          setTeamGroups([]);
          setReportEntriesByDay({});
          setReportDates([getDefaultDateKey()]);
          setSelectedDate(getDefaultDateKey());
          applyReviewAssignments(reviewPayload.assignments);
          return;
        }

        const requests: Array<Promise<unknown>> = [
          requestJson<{ announcements: Announcement[] }>("/api/announcements"),
          requestJson<{ events: EventItem[] }>("/api/events"),
          requestJson<{ tasks: BoardTask[] }>("/api/tasks"),
          requestJson<{ dates: string[]; reports: ReportEntryWithDate[] }>("/api/reports"),
          requestJson<{ experts: ExpertItem[] }>("/api/experts"),
          requestJson<{ documents: DocumentItem[] }>("/api/documents"),
          requestJson<{ notifications: NotificationItem[] }>("/api/notifications"),
          requestJson<{ members: TeamMember[]; pendingMembers: TeamMember[]; groups?: TeamGroupItem[] }>("/api/team"),
          requestJson<{ questions: TrainingQuestionItem[] }>("/api/training/questions"),
          requestJson<{ sessions: TrainingSessionItem[]; stats: TrainingStats }>("/api/training/sessions"),
        ];

        if (
          mePayload.user.role === "admin" ||
          mePayload.user.role === "teacher" ||
          mePayload.user.role === "leader" ||
          mePayload.user.role === "member"
        ) {
          requests.push(
            requestJson<{ assignments: ExpertReviewAssignmentItem[] }>(
              "/api/expert-reviews/assignments",
            ),
          );
        }

        const [
          announcementsPayload,
          eventsPayload,
          tasksPayload,
          reportsPayload,
          expertsPayload,
          documentsPayload,
          notificationsPayload,
          teamPayload,
          trainingQuestionsPayload,
          trainingSessionsPayload,
          reviewPayload,
        ] = (await Promise.all(requests)) as [
          { announcements: Announcement[] },
          { events: EventItem[] },
          { tasks: BoardTask[] },
          { dates: string[]; reports: ReportEntryWithDate[] },
          { experts: ExpertItem[] },
          { documents: DocumentItem[] },
          { notifications: NotificationItem[] },
          { members: TeamMember[]; pendingMembers: TeamMember[]; groups?: TeamGroupItem[] },
          { questions: TrainingQuestionItem[] },
          { sessions: TrainingSessionItem[]; stats: TrainingStats },
          { assignments: ExpertReviewAssignmentItem[] } | undefined,
        ];

        const groupedReports = reportsPayload.reports.reduce<Record<string, ReportEntryWithDate[]>>(
          (accumulator, item) => {
            const list = accumulator[item.date] ?? [];
            accumulator[item.date] = [...list, item];
            return accumulator;
          },
          {},
        );

        const nextDates = reportsPayload.dates.length > 0 ? reportsPayload.dates : [getDefaultDateKey()];

        setAnnouncements(announcementsPayload.announcements);
        setEvents(eventsPayload.events);
        setTasks(tasksPayload.tasks);
        setExperts(expertsPayload.experts);
        setDocuments(documentsPayload.documents);
        setNotifications(notificationsPayload.notifications);
        setTrainingQuestions(trainingQuestionsPayload.questions);
        setTrainingSessions(trainingSessionsPayload.sessions);
        setTrainingStats(trainingSessionsPayload.stats);
        if (!["admin", "teacher"].includes(mePayload.user.role)) {
          setSentReminders([]);
        }
        setMembers(teamPayload.members);
        setPendingTeamMembers(teamPayload.pendingMembers);
        setTeamGroups(teamPayload.groups ?? []);
        setReportEntriesByDay(groupedReports);
        setReportDates(nextDates);
        setSelectedDate((current) => (isReportDateKey(current) ? current : nextDates[0]));
        applyReviewAssignments(reviewPayload?.assignments ?? []);
        setReviewAssignmentDraft((current) =>
          current.expertUserId
            ? current
            : defaultExpertReviewAssignmentDraft(
                teamPayload.members.find((member) => member.systemRole === "评审专家")?.id ?? "",
              ),
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : "数据加载失败";
        if (message === "未登录") {
          router.replace("/login");
          return;
        }

        setLoadError(message);
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    };

    void loadWorkspaceData();

    return () => {
      isMounted = false;
    };
  }, [reloadToken, router]);

  useEffect(() => {
    if (!currentMemberId || requiresEmailCompletion || hasBlockingOverlay) {
      return undefined;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        setReloadToken((current) => current + 1);
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
  }, [currentMemberId, hasBlockingOverlay, requiresEmailCompletion]);

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

  const firstAssignableMemberId = taskAssignableMembers[0]?.id ?? currentMemberId;

  const visibleReportMembers = getVisibleReportMembers({
    members,
    currentMemberId,
    canViewAllReports: permissions.canViewAllReports,
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
  const myOpenTasks = tasks.filter((task) => task.assigneeId === currentMemberId && task.status !== "archived");
  const pendingLeaderReviewCount = documents.filter((doc) => doc.statusKey === "pending").length;
  const pendingTeacherReviewCount = documents.filter((doc) => doc.statusKey === "leader_approved").length;
  const reportableMembers = members.filter(
    (item) => ["项目负责人", "团队成员"].includes(item.systemRole) && Boolean(item.teamGroupId),
  );
  const reportSubmittedCount = todayReportEntries.length;
  const reportExpectedCount = reportableMembers.length;

  const getMemberName = (memberId: string) => membersMap[memberId]?.name ?? memberId;
  const getTaskAssigneeName = (task: BoardTask) =>
    task.assignee?.name ?? (task.assigneeId ? membersMap[task.assigneeId]?.name : null) ?? "待分配";

  const todayTaskSummaryTasks = tasks
    .filter((item) => item.status !== "archived")
    .slice(0, 3);

  const canManageMember = (member: TeamMember) => {
    if (!permissions.canManageTeam) {
      return false;
    }
    if (currentRole === "admin") {
      return true;
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

    if (currentRole === "admin") {
      return true;
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

    if (currentRole === "admin") {
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
    currentRole === "admin"
      ? ["指导教师", "项目负责人", "团队成员", "评审专家"]
      : currentRole === "teacher"
        ? ["项目负责人", "团队成员", "评审专家"]
        : ["团队成员"];

  const canViewExpertAccounts = currentRole === "admin" || currentRole === "teacher";
  const canViewTeamAccountIdentifiers = currentRole === "admin" || currentRole === "teacher";
  const visibleTeamMembers = members.filter((member) => canViewExpertAccounts || member.systemRole !== "评审专家");

  const visibleCoreTeamMembers = visibleTeamMembers.filter((member) => member.systemRole !== "评审专家");
  const visibleExpertAccountMembers = visibleTeamMembers.filter((member) => member.systemRole === "评审专家");
  const activeTeamMembers =
    teamAccountView === "experts" ? visibleExpertAccountMembers : visibleCoreTeamMembers;
  const canUseTeamGroups = currentRole === "admin" && teamAccountView === "team";
  const showTeamActions = permissions.canManageTeam || permissions.canSendDirective || permissions.canResetPassword;
  const teamListGridClassName = canUseTeamGroups
    ? "lg:grid-cols-[minmax(0,1.3fr)_160px_180px_120px_minmax(260px,1fr)]"
    : showTeamActions
      ? "lg:grid-cols-[minmax(0,1.4fr)_180px_140px_minmax(280px,1fr)]"
      : "lg:grid-cols-[minmax(0,1.6fr)_180px_140px]";

  const teamFilterOptions = useMemo(
    () => ["全部", ...new Set(activeTeamMembers.map((member) => member.systemRole))] as Array<"全部" | TeamRoleLabel>,
    [activeTeamMembers],
  );

  const filteredTeamMembers = activeTeamMembers.filter((member) => {
    const normalizedKeyword = teamSearch.trim().toLowerCase();
    const matchesKeyword =
      !normalizedKeyword ||
      member.name.toLowerCase().includes(normalizedKeyword) ||
      (!member.accountHidden && member.account.toLowerCase().includes(normalizedKeyword));

    const matchesRole = teamRoleFilter === "全部" || member.systemRole === teamRoleFilter;
    const matchesGroup =
      currentRole !== "admin" ||
      teamAccountView !== "team" ||
      teamGroupFilter === "全部" ||
      (teamGroupFilter === "未分组" ? !member.teamGroupId : member.teamGroupId === teamGroupFilter);
    return matchesKeyword && matchesRole && matchesGroup;
  });
  const canBatchCreateExperts = currentRole === "admin" || currentRole === "teacher";

  useEffect(() => {
    if (!canViewExpertAccounts && teamAccountView === "experts") {
      setTeamAccountView("team");
    }
  }, [canViewExpertAccounts, teamAccountView]);

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
        actionLabel: "查看任务看板",
        targetTab: "board",
      });
    }

    if (["leader", "teacher", "admin"].includes(currentRole)) {
      const openTaskCount = tasks.filter((task) => task.status !== "archived").length;
      items.push({
        id: `board-${currentRole}`,
        title: "任务看板待同步",
        detail:
          openTaskCount > 0
            ? `当前还有 ${openTaskCount} 项任务未完成，建议及时分派、跟进并调整优先级。`
            : "今天的任务安排可以再确认一遍，确保没有遗漏新的推进事项。",
        actionLabel: "进入任务看板",
        targetTab: "board",
      });
    }

    if ((currentRole === "leader" || currentRole === "admin") && pendingLeaderReviewCount > 0) {
      items.push({
        id: "leader-review",
        title: "文档待负责人审批",
        detail: `当前有 ${pendingLeaderReviewCount} 份文档在等待负责人审批。`,
        actionLabel: "前往文档中心",
        targetTab: "documents",
        priority: "warning",
      });
    }

    if ((currentRole === "teacher" || currentRole === "admin") && pendingTeacherReviewCount > 0) {
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

  const canSendDirectiveToMember = (member: TeamMember) => {
    if (!permissions.canSendDirective) {
      return false;
    }

    if (member.id === currentMemberId) {
      return false;
    }

    return member.systemRole !== "系统管理员";
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
    if (currentRole !== "admin") {
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

  const canMoveTask = (task: BoardTask) => {
    void task;
    return false;
  };

  const canEditTaskItem = (task: BoardTask) => permissions.canEditTask || task.creatorId === currentMemberId;

  const canDeleteTaskItem = (task: BoardTask) => permissions.canDeleteTask || task.creatorId === currentMemberId;

  const canReviewTaskItem = (task: BoardTask) =>
    currentRole === "admin" ||
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

  const canManageReviewMaterials = ["admin", "teacher", "leader"].includes(currentRole);
  const canCreateReviewPackage = ["admin", "teacher", "leader"].includes(currentRole);
  const canManageTrainingQuestion = (question: TrainingQuestionItem) =>
    ["admin", "teacher", "leader"].includes(currentRole) || question.createdById === currentMemberId;
  const activeDrillQuestion =
    trainingQuestions.find((question) => question.id === activeDrillQuestionId) ?? trainingQuestions[0] ?? null;

  const getDocumentActionButtons = (doc: DocumentItem): DocumentActionButton[] => {
    if ((permissions.canLeaderReviewDocument || currentRole === "admin") && doc.statusKey === "pending") {
      return [
        {
          key: "leaderApprove",
          label: "负责人通过",
          variant: "secondary" as const,
        },
        {
          key: "leaderRevision",
          label: "负责人打回",
          variant: "danger" as const,
        },
      ];
    }

    if ((permissions.canTeacherReviewDocument || currentRole === "admin") && doc.statusKey === "leader_approved") {
      return [
        {
          key: "teacherApprove",
          label: "教师终审通过",
          variant: "secondary" as const,
        },
        {
          key: "teacherRevision",
          label: "教师打回",
          variant: "danger" as const,
        },
      ];
    }

    return [];
  };

  const refreshWorkspace = () => {
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
      setLoadError(error instanceof Error ? error.message : "提醒记录加载失败");
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
    setTaskDraft(defaultTaskDraft(firstAssignableMemberId, currentUser?.teamGroupId ?? ""));
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (task: BoardTask) => {
    setEditingTaskId(task.id);
    setTaskDraft({
      title: task.title,
      assigneeId: task.assigneeId ?? "",
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

    if (!editingTaskId && !taskDraft.assigneeId) {
      if (currentRole === "admin" && !taskDraft.teamGroupId) {
        setLoadError("请选择待分配工单所属队伍");
        return;
      }

      if (currentRole !== "admin" && !currentUser?.teamGroupId) {
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

      setTaskDraft(defaultTaskDraft(firstAssignableMemberId, currentUser?.teamGroupId ?? ""));
      setTaskModalOpen(false);
      showSuccessToast(isEditing ? "工单已更新" : "工单已创建", "新的安排已经同步到工作台。");
      refreshWorkspace();
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
    refreshWorkspace();
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
      refreshWorkspace();
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

    if (!taskCompletionDraft.file && (taskCompletionTarget.attachments?.length ?? 0) === 0) {
      setLoadError("请先上传完成凭证，再提交验收");
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
      refreshWorkspace();
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
        refreshWorkspace();
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
      refreshWorkspace();
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

    setLoadError(`请在任务看板打开「${task.title}」，上传完成凭证后提交验收。`);
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
      refreshWorkspace();
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
      refreshWorkspace();
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
    refreshWorkspace();
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
    refreshWorkspace();
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
      refreshWorkspace();
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
      refreshWorkspace();
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
      refreshWorkspace();
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
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "提醒发送失败");
    } finally {
      setIsSaving(false);
    }
  };

  const sendTaskReminder = (task: BoardTask) => {
    if (!task.assigneeId) {
      setLoadError("该工单还没有处理人，分配后才能发送处理提醒");
      return;
    }

    void sendDirectReminderToUsers({
      userIds: [task.assigneeId],
      title: `工单提醒：${task.title}`,
      detail: `请及时查看并推进工单「${task.title}」。`,
      targetTab: "board",
      successTitle: "工单提醒已发送",
      successDetail: `已提醒 ${getTaskAssigneeName(task)} 查看任务看板。`,
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
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "分配提醒发送失败");
    } finally {
      setIsSaving(false);
    }
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
      refreshWorkspace();
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
    refreshWorkspace();
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
    refreshWorkspace();
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
      refreshWorkspace();
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
      refreshWorkspace();
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
    refreshWorkspace();
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
      showSuccessToast("文档已上传", "文档中心已经记录了新的材料版本。");
      refreshWorkspace();
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
      refreshWorkspace();
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
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "文档审核失败");
    } finally {
      setIsSaving(false);
    }
  };

  const openReviewAssignmentModal = () => {
    setReviewAssignmentDraft(defaultExpertReviewAssignmentDraft(expertMembers[0]?.id ?? ""));
    setReviewAssignmentModalOpen(true);
  };

  const saveReviewAssignment = async () => {
    if (!reviewAssignmentDraft.expertUserId || !reviewAssignmentDraft.targetName.trim()) {
      setLoadError("请先选择专家并填写评审对象");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson("/api/expert-reviews/assignments", {
        method: "POST",
        body: JSON.stringify({
          expertUserId: reviewAssignmentDraft.expertUserId,
          targetName: reviewAssignmentDraft.targetName.trim(),
          roundLabel: reviewAssignmentDraft.roundLabel.trim(),
          overview: reviewAssignmentDraft.overview.trim(),
          deadline: reviewAssignmentDraft.deadline
            ? new Date(reviewAssignmentDraft.deadline).toISOString()
            : undefined,
        }),
      });

      setReviewAssignmentModalOpen(false);
      setReviewAssignmentDraft(defaultExpertReviewAssignmentDraft(expertMembers[0]?.id ?? ""));
      showSuccessToast("评审包已创建", "可以继续上传计划书、路演材料和视频。");
      refreshWorkspace();
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
      refreshWorkspace();
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
    refreshWorkspace();
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
    refreshWorkspace();
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
      refreshWorkspace();
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
    refreshWorkspace();
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
    refreshWorkspace();
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
      refreshWorkspace();
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
      refreshWorkspace();
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
    refreshWorkspace();
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
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "批量添加专家失败");
    } finally {
      setIsSaving(false);
    }
  };

  const openProfilePage = () => {
    setProfileMessage(null);
    router.push("/workspace?tab=profile");
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
    refreshWorkspace();
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

  const updateMemberRole = async (memberId: string, roleLabel: TeamRoleLabel) => {
    try {
      await requestJson(`/api/team/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: roleLabel }),
      });
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "角色更新失败");
    }
  };

  const confirmUpdateMemberRole = (member: TeamMember, roleLabel: TeamRoleLabel) => {
    if (member.systemRole === roleLabel) {
      return;
    }

    const copy = buildTeamManagementConfirmation({
      type: "roleChange",
      memberName: member.name,
      fromRole: member.systemRole,
      toRole: roleLabel,
    });

    setConfirmDialog({
      open: true,
      ...copy,
      onConfirm: () => updateMemberRole(member.id, roleLabel),
    });
  };

  const updateMemberGroup = async (memberId: string, teamGroupId: string) => {
    try {
      await requestJson(`/api/team/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ teamGroupId: teamGroupId || null }),
      });
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "分组更新失败");
    }
  };

  const getTeamGroupDisplayName = (teamGroupId?: string | null) => {
    if (!teamGroupId) {
      return "未分组";
    }

    return teamGroups.find((group) => group.id === teamGroupId)?.name ?? "未知分组";
  };

  const confirmUpdateMemberGroup = (member: TeamMember, teamGroupId: string) => {
    const normalizedTeamGroupId = teamGroupId || null;
    if ((member.teamGroupId ?? null) === normalizedTeamGroupId) {
      return;
    }

    const copy = buildTeamManagementConfirmation({
      type: "groupChange",
      memberName: member.name,
      fromGroupName: getTeamGroupDisplayName(member.teamGroupId),
      toGroupName: getTeamGroupDisplayName(normalizedTeamGroupId),
    });

    setConfirmDialog({
      open: true,
      ...copy,
      onConfirm: () => updateMemberGroup(member.id, teamGroupId),
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
    refreshWorkspace();
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
  };

  const renderOverview = () => {
    const quickCompletableTask = tasks.find((task) => task.status !== "archived" && canMoveTask(task));
    const countdownTotalHours = countdown.days * 24 + countdown.hours;
    const countdownStatus = !nearestEvent
      ? {
          label: "待配置",
          className: "border-slate-200 bg-slate-50 text-slate-500",
          hint: "补充节点后自动预警",
        }
      : countdownTotalHours <= 24
        ? {
            label: "紧急",
            className: "border-red-200 bg-red-50 text-red-600",
            hint: "进入最后 24 小时",
          }
        : countdown.days <= 3
          ? {
              label: "临近",
              className: "border-amber-200 bg-amber-50 text-amber-700",
              hint: "建议开始集中检查",
            }
          : {
              label: "推进中",
              className: "border-blue-100 bg-blue-50 text-[#1d4ed8]",
              hint: "按计划持续推进",
            };

    const openTasks = tasks.filter((task) => task.status !== "archived");
    const unsubmittedReportCount = reportableMembers.filter(
      (member) => !todayReportEntryMap.has(member.id),
    ).length;
    const myReportSubmitted = todayReportEntryMap.has(currentMemberId);
    const reviewScoreCount = reviewAssignments.filter((assignment) => assignment.score).length;
    const pendingExpertReviewCount = reviewAssignments.filter((assignment) => assignment.statusKey === "pending").length;

    const overviewMetrics =
      currentRole === "admin"
        ? [
            {
              label: "待审核账号",
              value: `${pendingApprovalMembers.length} 个`,
              hint: pendingApprovalMembers.length > 0 ? "等待系统管理员审核处理" : "当前没有待审核账号",
            },
            {
              label: "待办提醒",
              value: `${todoItemCount} 项`,
              hint: todoItemCount > 0 ? "建议优先处理站内待办与提醒" : "当前无新增待办",
            },
            {
              label: "未读消息",
              value: `${unreadTodoNotifications.length} 条`,
              hint: unreadTodoNotifications.length > 0 ? "含系统提醒与审批通知" : "消息已基本处理完成",
            },
          ]
        : currentRole === "teacher"
          ? [
              {
                label: "待审材料",
                value: `${pendingLeaderReviewCount + pendingTeacherReviewCount} 份`,
                hint:
                  pendingLeaderReviewCount + pendingTeacherReviewCount > 0
                    ? "文档中心仍有待审批材料"
                    : "当前没有待审批材料",
              },
              {
                label: "未交汇报",
                value: `${unsubmittedReportCount} 人`,
                hint: unsubmittedReportCount > 0 ? "建议尽快督促项目组补齐汇报" : "团队汇报已基本收齐",
              },
              {
                label: "待办提醒",
                value: `${todoItemCount} 项`,
                hint: todoItemCount > 0 ? "有事项待处理" : "当前无新增待办",
              },
            ]
          : currentRole === "leader"
            ? [
                {
                  label: "待分配工单",
                  value: `${tasks.filter((task) => task.status === "todo" && !task.assigneeId).length} 项`,
                  hint: "本队待分配任务需尽快落到责任人",
                },
                {
                  label: "待验收工单",
                  value: `${tasks.filter((task) => task.status === "review").length} 项`,
                  hint: "已提交待验收的事项请及时闭环",
                },
                {
                  label: "未交汇报",
                  value: `${unsubmittedReportCount} 人`,
                  hint: unsubmittedReportCount > 0 ? "团队汇报尚未收齐" : "今天团队汇报已基本收齐",
                },
              ]
            : currentRole === "expert"
              ? [
                  {
                    label: "待评任务",
                    value: `${pendingExpertReviewCount} 项`,
                    hint: pendingExpertReviewCount > 0 ? "请按时完成评审打分" : "当前没有待评分配任务",
                  },
                  {
                    label: "已交评分",
                    value: `${reviewScoreCount} 条`,
                    hint: reviewScoreCount > 0 ? "已完成的评审结果会保留存档" : "当前尚未提交评分",
                  },
                  {
                    label: "待办提醒",
                    value: `${todoItemCount} 项`,
                    hint: todoItemCount > 0 ? "仍有待办需要查看" : "当前无新增待办",
                  },
                ]
              : [
                  {
                    label: "我的任务",
                    value: `${myOpenTasks.length} 项`,
                    hint: myOpenTasks.length > 0 ? "优先推进分配给自己的任务" : "当前没有个人未完成任务",
                  },
                  {
                    label: "今日日报",
                    value: myReportSubmitted ? "已提交" : "待提交",
                    hint: myReportSubmitted ? "今天的日程汇报已完成" : "请先提交今日工作汇报",
                  },
                  {
                    label: "未读消息",
                    value: `${unreadTodoNotifications.length} 条`,
                    hint: unreadTodoNotifications.length > 0 ? "有新提醒待查看" : "当前没有未读消息",
                  },
                ];

    const businessTabs = [
      {
        key: "todo",
        label: "待办事项",
        count: todoItemCount,
        onClick: () => setNotificationsOpen(true),
      },
      {
        key: "board",
        label: "工单流转",
        count: openTasks.length,
        onClick: () => router.push("/workspace?tab=board"),
      },
      {
        key: "documents",
        label: "文档审批",
        count: pendingLeaderReviewCount + pendingTeacherReviewCount,
        onClick: () => router.push("/workspace?tab=documents"),
      },
      {
        key: "reports",
        label: "日程汇报",
        count: reportExpectedCount > 0 ? reportExpectedCount - reportSubmittedCount : 0,
        onClick: () => router.push("/workspace?tab=reports"),
      },
    ];

    const portalQuickEntries = [
      {
        title: currentRole === "member" || currentRole === "leader" ? "今日日程汇报" : "团队汇报进度",
        icon: CalendarDays,
        metric:
          currentRole === "member" || currentRole === "leader"
            ? myReportSubmitted
              ? "已提交"
              : "待提交"
            : `${reportSubmittedCount}/${reportExpectedCount || 0}`,
        detail:
          currentRole === "member" || currentRole === "leader"
            ? myReportSubmitted
              ? "今日汇报已完成，可继续查看任务推进。"
              : "建议先补齐今日完成与明日计划。"
            : reportExpectedCount > 0
              ? `今日已有 ${reportSubmittedCount} 人提交，还有 ${unsubmittedReportCount} 人待提交。`
              : "当前没有需要统计的团队汇报对象。",
        actionLabel: currentRole === "member" || currentRole === "leader" ? "进入汇报" : "查看汇报",
        onAction: () => router.push("/workspace?tab=reports"),
      },
      {
        title: "任务工单",
        icon: KanbanSquare,
        metric: `${openTasks.length} 项`,
        detail:
          quickCompletableTask && currentRole === "member"
            ? "你有可直接推进的个人工单，可快速标记处理状态。"
            : openTasks.length > 0
              ? "当前仍有工单流转中，建议查看处理进度。"
              : "当前没有未归档工单。",
        actionLabel: quickCompletableTask && currentRole === "member" ? "标记完成" : "进入工单",
        onAction: () => {
          if (quickCompletableTask && currentRole === "member") {
            void completeTaskFromOverview(quickCompletableTask);
            return;
          }
          router.push("/workspace?tab=board");
        },
      },
      {
        title: canReviewDocuments ? "文档审批" : "文档中心",
        icon: FolderOpen,
        metric: `${pendingLeaderReviewCount + pendingTeacherReviewCount} 份`,
        detail:
          canReviewDocuments
            ? pendingLeaderReviewCount + pendingTeacherReviewCount > 0
              ? "仍有材料待审批，建议尽快处理。"
              : "当前没有待审批材料。"
            : `当前共维护 ${documents.length} 份文档材料。`,
        actionLabel: "查看文档",
        onAction: () => router.push("/workspace?tab=documents"),
      },
      {
        title: "专家评审",
        icon: FileCheck,
        metric: reviewScoreCount > 0 ? `${reviewScoreCount} 条` : pendingExpertReviewCount > 0 ? "进行中" : "暂无",
        detail:
          reviewScoreCount > 0
            ? "已有评分和综合评语，可结合结果继续优化。"
            : pendingExpertReviewCount > 0
              ? "当前还有评审包正在评分中。"
              : "当前暂无可查看的评审结果。",
        actionLabel: "查看评审",
        onAction: () => router.push("/workspace?tab=review"),
      },
    ];

    const priorityFocusItems =
      currentRole === "member"
        ? [
            myReportSubmitted ? "今日日程汇报已提交。" : "今日日程汇报还未提交，建议先补齐。",
            myOpenTasks.length > 0
              ? `当前有 ${myOpenTasks.length} 项个人任务待推进。`
              : "当前没有个人待办任务。",
            reviewScoreCount > 0
              ? `专家评审已有 ${reviewScoreCount} 条评分/评语可查看。`
              : "当前暂无专家评审结果。",
          ]
        : currentRole === "leader"
          ? [
              unsubmittedReportCount > 0 ? `今天还有 ${unsubmittedReportCount} 人未提交汇报。` : "今天团队汇报已基本收齐。",
              openTasks.length > 0 ? `工单台账仍有 ${openTasks.length} 项待推进。` : "工单台账当前没有未完成事项。",
              reviewScoreCount > 0 ? `专家评审已有 ${reviewScoreCount} 条评分/评语。` : "专家评审结果暂未形成。",
            ]
          : [
              pendingApprovalMembers.length > 0
                ? `当前有 ${pendingApprovalMembers.length} 个账号等待审核。`
                : "当前没有新的账号审核积压。",
              pendingLeaderReviewCount + pendingTeacherReviewCount > 0
                ? `文档中心共有 ${pendingLeaderReviewCount + pendingTeacherReviewCount} 份材料待审批。`
                : "文档中心当前没有待审批材料。",
              reviewScoreCount > 0 ? `专家评审已有 ${reviewScoreCount} 条评分/评语。` : "专家评审暂无已提交评分。",
            ];

    const keyEventItems = events.slice(0, 4);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-[18px] border border-[#D9E5F7] bg-white px-4 py-3 shadow-sm">
            <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
            <p className="truncate text-sm font-semibold text-slate-900">中国国际大学生创新大赛管理系统</p>
            <span className="rounded-full border border-[#DCE7F6] bg-[#F7FAFE] px-3 py-1 text-xs text-slate-500">
              南京铁道职业技术学院
            </span>
            <span className="rounded-full border border-[#DCE7F6] bg-[#F7FAFE] px-3 py-1 text-xs text-slate-500">
              {formatFriendlyDate(currentDateTime)}
            </span>
            <span className="rounded-full border border-[#DCE7F6] bg-[#F7FAFE] px-3 py-1 text-xs text-[#0B3B8A]">
              {currentUser?.roleLabel ?? roleLabels[currentRole]}
            </span>
            <span className="rounded-full border border-[#DCE7F6] bg-[#F7FAFE] px-3 py-1 text-xs text-slate-500">
              {portalScopeText}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DemoResetNote />
            <ActionButton
              disabled={!permissions.canPublishAnnouncement}
              onClick={() => setAnnouncementModalOpen(true)}
              title="无权限"
              variant="primary"
            >
              <span className="inline-flex items-center gap-2">
                <BellPlus className="h-4 w-4" />
                <span>发布公告</span>
              </span>
            </ActionButton>
          </div>
        </div>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <article className="overflow-hidden rounded-[20px] border border-[#D9E5F7] bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#F9FBFF_0%,#FFFFFF_100%)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#D7E4F7] bg-white px-3 py-1 text-xs font-medium tracking-[0.08em] text-[#0B3B8A]">
                    <span className="h-2 w-2 rounded-full bg-[#0B3B8A]" />
                    今日总览
                  </div>
                  <h3 className="mt-4 text-[30px] font-bold tracking-[-0.04em] text-slate-900">
                    欢迎登录，{currentUser?.profile.name ?? currentUser?.name ?? "用户"}。
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
                    {currentRole === "admin"
                      ? "当前为全局管理视角，请优先关注账号审核、站内待办和公告发布。"
                      : currentRole === "teacher"
                        ? "当前聚合本队材料审批、团队汇报和关键节点，便于统一查看与督办。"
                        : currentRole === "leader"
                          ? "当前聚合本队工单流转、汇报进度和专家反馈，便于推进每日事务。"
                          : currentRole === "expert"
                            ? "当前展示评审任务、评分进度和关键提醒，便于集中完成专家评审。"
                            : "当前展示本队任务、今日日报和评审反馈，方便快速进入个人办理事项。"}
                  </p>
                </div>
                <button
                  className="hidden shrink-0 rounded-full border border-[#D9E5F7] bg-[#F8FBFF] px-4 py-2 text-sm font-medium text-[#0B3B8A] transition hover:border-[#BDD0EF] hover:bg-white lg:inline-flex"
                  onClick={() => setNotificationsOpen(true)}
                  type="button"
                >
                  今日待办 {todoItemCount} 项 →
                </button>
              </div>
            </div>
            <div className="grid gap-3 px-6 py-5 md:grid-cols-3">
              {overviewMetrics.map((item) => (
                <article
                  key={item.label}
                  className="rounded-2xl border border-[#E3ECF8] bg-[#FBFDFF] px-4 py-4 shadow-sm shadow-slate-100/70"
                >
                  <p className="text-xs tracking-[0.08em] text-slate-400">{item.label}</p>
                  <p className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-slate-900">{item.value}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{item.hint}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-[#F7FAFE] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
                <h3 className="text-lg font-semibold text-slate-900">今日工作提示</h3>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {priorityFocusItems.map((item, index) => (
                <div
                  key={item}
                  className="rounded-xl border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3 shadow-sm shadow-slate-100/60"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#EAF1FB] px-2 text-xs font-semibold text-[#0B3B8A]">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-slate-600">{item}</p>
                  </div>
                </div>
              ))}
              <button
                className="flex w-full items-center justify-between rounded-xl border border-[#D9E5F7] bg-white px-4 py-3 text-left transition hover:border-[#BDD0EF] hover:bg-[#F9FBFF]"
                onClick={() => setNotificationsOpen(true)}
                type="button"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">进入待办中心</p>
                  <p className="mt-1 text-xs text-slate-500">统一查看待办、提醒与审批通知</p>
                </div>
                <span className="rounded-full bg-[#EAF1FB] px-2.5 py-1 text-xs font-medium text-[#0B3B8A]">
                  {todoItemCount} 项
                </span>
              </button>
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <article className="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-[#F7FAFE] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
                  <h3 className="text-lg font-semibold text-slate-900">业务办理</h3>
                </div>
                <span className="text-xs text-slate-400">常用业务入口</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {businessTabs.map((item, index) => (
                  <button
                    className={`rounded-t-xl border px-3 py-2 text-sm transition ${
                      index === 0
                        ? "border-[#BFD2F0] bg-white text-[#0B3B8A] shadow-sm"
                        : "border-transparent bg-transparent text-slate-500 hover:border-[#D9E4F5] hover:bg-white"
                    }`}
                    key={item.key}
                    onClick={item.onClick}
                    type="button"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                {portalQuickEntries.slice(0, 2).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="group rounded-2xl border border-slate-100 bg-white px-4 py-4 text-left shadow-sm transition hover:border-[#C9D9F3] hover:bg-[#F9FBFF]"
                      key={item.title}
                      onClick={item.onAction}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F1F6FE] text-[#0B3B8A]">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-900">{item.metric}</p>
                          </div>
                        </div>
                        <span className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500 transition group-hover:bg-white">
                          进入
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-500">{item.detail}</p>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {portalQuickEntries.slice(2).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="group rounded-2xl border border-slate-100 bg-[#FBFDFF] px-4 py-4 text-left shadow-sm transition hover:border-[#C9D9F3] hover:bg-white"
                      key={item.title}
                      onClick={item.onAction}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F6FE] text-[#0B3B8A]">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 text-lg font-bold tracking-[-0.02em] text-slate-900">{item.metric}</p>
                          </div>
                        </div>
                        <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 transition group-hover:bg-[#F8FBFF]">
                          进入
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-2xl border border-dashed border-[#D9E5F7] bg-[#F8FBFF] px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">快捷办理提示</p>
                    <p className="mt-1 text-sm text-slate-500">优先从待办事项进入，可减少重复查找模块的时间。</p>
                  </div>
                  <button
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#D0DFF5] bg-white px-3 py-2 text-sm font-medium text-[#0B3B8A] transition hover:border-[#B7CDEE] hover:bg-[#F9FBFF]"
                    onClick={() => setNotificationsOpen(true)}
                    type="button"
                  >
                    查看待办
                    <span className="rounded-full bg-[#EAF1FB] px-2 py-0.5 text-xs">{todoItemCount}</span>
                  </button>
                </div>
              </div>
            </div>
          </article>

          <div className="space-y-4">
            <article className="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-[#F7FAFE] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
                    <h3 className="text-lg font-semibold text-slate-900">通知公告</h3>
                  </div>
                  <span className="text-xs text-slate-400">{announcements.length} 条</span>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {announcements.slice(0, 5).map((item) => (
                  <article className="px-4 py-3 transition hover:bg-[#FAFCFF]" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0B3B8A]" />
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="inline-flex rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-400">
                          通知公告
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
                {announcements.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-500">当前暂无公告。</div>
                ) : null}
              </div>
            </article>

            <article className="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-[#F7FAFE] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
                    <h3 className="text-lg font-semibold text-slate-900">关键节点</h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${countdownStatus.className}`}>
                    {countdownStatus.label}
                  </span>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="rounded-xl border border-[#DDE8F7] bg-[#F8FBFF] px-4 py-3">
                  <p className="text-xs text-slate-400">节点倒计时</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {nearestEvent
                      ? `距 ${nearestEvent.title} 还剩 ${countdown.days}天 ${countdown.hours}小时 ${countdown.minutes}分`
                      : "当前还没有配置关键节点"}
                  </p>
                </div>
                <div className="space-y-0 rounded-xl border border-slate-100 bg-white">
                  {keyEventItems.map((item, index) => (
                    <button
                      className={`block w-full px-4 py-3 text-left transition hover:bg-[#F9FBFF] ${index !== keyEventItems.length - 1 ? "border-b border-slate-100" : ""}`}
                      key={item.id}
                      onClick={() => router.push("/workspace?tab=timeline")}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#0B3B8A]" />
                          {index !== keyEventItems.length - 1 ? <span className="mt-1 h-10 w-px bg-[#D7E4F7]" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
                            <span className="shrink-0 text-xs text-slate-400">{formatDateTime(item.dateTime)}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <article className="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-[#F7FAFE] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
                <h3 className="text-lg font-semibold text-slate-900">今日任务摘要</h3>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {todayTaskSummaryTasks.length > 0 ? (
                todayTaskSummaryTasks.map((item, index) => (
                <div
                  key={item.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-[#FBFDFF] px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-[#EAF1FB] text-xs font-semibold text-[#0B3B8A]">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium leading-6 text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          负责人：{getTaskAssigneeName(item)} · 截止：{formatDateTime(item.dueDate)}
                        </p>
                      </div>
                    </div>
                    {canMoveTask(item) ? (
                      <ActionButton disabled={isSaving} onClick={() => void completeTaskFromOverview(item)}>
                        勾选完成
                      </ActionButton>
                    ) : (
                      <button
                        className="self-start text-sm font-medium text-[#0B3B8A] transition hover:text-[#0A3277] lg:self-center"
                        onClick={() => router.push("/workspace?tab=board")}
                        type="button"
                      >
                        查看工单 →
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-slate-500">当前暂无待处理任务。</p>
              )}
            </div>
          </article>

          <article className="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-[#F7FAFE] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
                <h3 className="text-lg font-semibold text-slate-900">优先关注</h3>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {priorityFocusItems.map((item) => (
                <div className="rounded-xl border border-slate-100 bg-[#FBFDFF] px-4 py-3" key={item}>
                  <div className="flex gap-3">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0B3B8A]" />
                    <p className="text-sm leading-6 text-slate-600">{item}</p>
                  </div>
                </div>
              ))}
              <div className="rounded-xl border border-[#E4ECF8] bg-[#F8FBFF] px-4 py-3">
                <p className="text-xs text-slate-400">节点提示</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{countdownStatus.hint}</p>
              </div>
            </div>
          </article>
        </section>
      </div>
    );
  };

  const renderTimeline = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="用横向时间轴统一查看比赛节点推进情况，关键节点会被重点高亮。"
          title="时间进度"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canEditTimeline}
            onClick={() => openEventModal()}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>新增节点</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className={`overflow-x-auto ${surfaceCardClassName}`}>
        {events.length === 0 ? (
          <p className="text-sm leading-7 text-slate-500">当前还没有时间节点，请先新增比赛关键节点。</p>
        ) : null}
        <div className="min-w-[860px]">
          <div className="relative px-6 pt-8">
            <div className="absolute left-6 right-6 top-[44px] h-[2px] bg-slate-300" />
            <div className="relative grid grid-cols-4 gap-4">
              {events.map((item, index) => {
                const isPast = index < nearestUpcomingIndex;
                const isCurrent = index === nearestUpcomingIndex;
                const dotClass = isPast
                    ? "border-slate-400 bg-slate-400"
                    : isCurrent
                      ? "border-blue-600 bg-blue-600 ring-4 ring-blue-100"
                      : "border-slate-400 bg-white";

                return (
                  <div key={item.id} className="relative">
                    <div className="flex flex-col items-center">
                      <div className={`h-5 w-5 rounded-full border-2 ${dotClass}`}>
                        {isCurrent ? (
                          <span className="block h-full w-full animate-ping rounded-full bg-[#2563eb]/40" />
                        ) : null}
                      </div>
                      <p className="mt-4 text-center text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="mt-2 text-center text-sm text-slate-500">{formatDateTime(item.dateTime)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-4 gap-4">
            {events.map((item) => (
              <article key={item.id} className={subtleCardClassName}>
                <div className="flex items-start justify-between gap-4">
                  <span className="rounded-md bg-blue-50 px-3 py-1 text-sm text-blue-600">
                    {item.type}
                  </span>
                  <ActionButton
                    disabled={!permissions.canEditTimeline}
                    onClick={() => openEventModal(item)}
                    title="无权限"
                  >
                    编辑
                  </ActionButton>
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-500">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  const renderBoard = () => {
    const normalizedBoardSearch = boardSearch.trim().toLowerCase();
    const taskStatusCounts = boardColumns.reduce(
      (result, column) => ({
        ...result,
        [column.id]: tasks.filter((task) => task.status === column.id).length,
      }),
      {} as Record<BoardStatus, number>,
    );
    const filteredTasks = tasks
      .filter((task) => boardStatusFilter === "all" || task.status === boardStatusFilter)
      .filter((task) => {
        if (!normalizedBoardSearch) {
          return true;
        }

        return [
          task.title,
          task.priority,
          getTaskAssigneeName(task),
          task.reviewer?.name,
          task.teamGroupName,
          task.creator?.name,
        ]
          .filter(Boolean)
          .some((value) => `${value}`.toLowerCase().includes(normalizedBoardSearch));
      })
      .sort((first, second) => {
        const statusDifference = boardStatusOrder[first.status] - boardStatusOrder[second.status];
        if (statusDifference !== 0) {
          return statusDifference;
        }

        return new Date(first.dueDate).getTime() - new Date(second.dueDate).getTime();
      });

    const activeTaskCount = tasks.filter((task) => task.status !== "archived").length;
    const reviewTaskCount = taskStatusCounts.review ?? 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeader
            description="以工单台账方式管理提报、分配、接取、验收和归档，状态清楚，责任到人。"
            title="任务工单"
          />
          <div className="flex flex-wrap items-center gap-3">
            <DemoResetNote />
            <ActionButton
              disabled={!permissions.canCreateTask}
              onClick={openCreateTaskModal}
              title="无权限"
              variant="primary"
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>发布工单</span>
              </span>
            </ActionButton>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-[#F7FAFE] p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "待推进工单", value: `${activeTaskCount} 项`, hint: "未归档总量" },
                  { label: "待验收", value: `${reviewTaskCount} 项`, hint: "需要确认闭环" },
                  { label: "已归档", value: `${taskStatusCounts.archived ?? 0} 项`, hint: "完成留痕" },
                ].map((item) => (
                  <div className="rounded-lg border border-slate-100 bg-white px-4 py-3" key={item.label}>
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.hint}</p>
                  </div>
                ))}
              </div>

              <label className="relative block w-full xl:w-80">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  onChange={(event) => setBoardSearch(event.target.value)}
                  placeholder="搜索工单、处理人、队伍"
                  value={boardSearch}
                />
              </label>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {[
                { id: "all" as BoardStatusFilter, label: "全部", count: tasks.length, description: "全部工单" },
                ...boardColumns.map((column) => ({
                  id: column.id as BoardStatusFilter,
                  label: boardStatusMeta[column.id].label,
                  count: taskStatusCounts[column.id] ?? 0,
                  description: boardStatusMeta[column.id].description,
                })),
              ].map((item) => {
                const active = boardStatusFilter === item.id;
                const dotClassName =
                  item.id === "all" ? "bg-slate-500" : boardStatusMeta[item.id as BoardStatus].dotClassName;

                return (
                  <button
                    className={`shrink-0 rounded-lg border px-3.5 py-2 text-left transition ${
                      active
                        ? "border-[#C9D9F3] bg-[#EAF1FB] text-[#0B3B8A] shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#D9E3F2] hover:bg-[#F7FAFE]"
                    }`}
                    key={item.id}
                    onClick={() => setBoardStatusFilter(item.id)}
                    title={item.description}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                      <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
                      {item.label}
                      <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs text-slate-500">{item.count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[min(780px,calc(100vh-300px))] min-h-[420px] space-y-3 overflow-y-auto bg-slate-50/40 p-4">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => {
                const isTaskExpanded = expandedBoardTaskIds.includes(task.id);
                const canExpandTask = task.title.length > 32;
                const statusMeta = boardStatusMeta[task.status];
                const attachmentCount = task.attachments?.length ?? 0;
                const isUnassignedTask = task.status === "todo" && !task.assigneeId;
                const canPromptDispatch =
                  isUnassignedTask &&
                  Boolean(task.teamGroupId) &&
                  (task.creatorId === currentMemberId ||
                    currentRole === "admin" ||
                    currentRole === "teacher" ||
                    currentRole === "leader");
                const workflowSteps = buildTaskWorkflowSteps({
                  status: task.status,
                  assigneeId: task.assigneeId,
                  assigneeName: task.assigneeId ? getTaskAssigneeName(task) : null,
                  reviewerName: task.reviewer?.name ?? null,
                });
                const nextStepLabel = isUnassignedTask
                  ? "等待项目负责人 / 指导教师分配处理人"
                  : task.status === "todo"
                    ? "等待处理人接取工单"
                    : task.status === "doing"
                      ? "补充完成凭证并提交验收"
                      : task.status === "review"
                        ? "等待验收人确认闭环"
                        : "已归档，可后续备查";
                const taskPeople = [
                  { label: "提报人", value: task.creator?.name ?? "系统记录" },
                  { label: "发布人", value: task.creator?.name ?? "系统记录" },
                  { label: "处理人", value: getTaskAssigneeName(task) },
                  { label: "审批人", value: getTaskReviewerLabel({ status: task.status, reviewerName: task.reviewer?.name }) },
                  { label: "所属队伍", value: task.teamGroupName ?? "未分组" },
                ];
                const taskTimeItems = [
                  { label: "提报时间", value: task.createdAt ?? "未记录" },
                  { label: "截止时间", value: task.dueDate },
                  { label: "接取时间", value: getTaskAcceptedTimeLabel(task) },
                  { label: "提交验收", value: task.submittedAt ?? "未提交" },
                  { label: "归档时间", value: task.archivedAt ?? "未归档" },
                ];
                const completedWorkflowCount = workflowSteps.filter((step) => step.state === "done").length;

                return (
                  <article
                    className="group relative overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:border-[#D2E0F5] hover:shadow-md"
                    key={task.id}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${statusMeta.rowAccentClassName}`} />
                    <div className="p-4 pl-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusMeta.badgeClassName}`}
                          >
                            {getBoardStatusLabel(task)}
                          </span>
                          <span
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                              task.priority in taskPriorityStyles
                                ? taskPriorityStyles[task.priority as TaskDraft["priority"]]
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {task.priority}
                          </span>
                          {attachmentCount > 0 ? (
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
                              凭证 {attachmentCount} 个
                            </span>
                          ) : null}
                        </div>

                        <button
                          className="mt-3 block w-full text-left"
                          onClick={() => (canExpandTask ? toggleBoardTaskExpand(task.id) : undefined)}
                          title={canExpandTask ? "点击展开完整工单标题" : task.title}
                          type="button"
                        >
                          <h3
                            className={`text-base font-semibold leading-7 text-slate-900 ${
                              isTaskExpanded ? "" : "line-clamp-2"
                            }`}
                          >
                            {task.title}
                          </h3>
                        </button>
                        {canExpandTask ? (
                          <button
                            className="mt-1 text-xs font-medium text-blue-600 transition hover:text-blue-700"
                            onClick={() => toggleBoardTaskExpand(task.id)}
                            type="button"
                          >
                            {isTaskExpanded ? "收起标题" : "展开标题"}
                          </button>
                        ) : null}

                        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                              {taskPeople.map((item) => (
                                <div
                                  className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
                                  key={item.label}
                                >
                                  <span className="block text-[11px] font-medium tracking-[0.08em] text-slate-400">
                                    {item.label}
                                  </span>
                                  <span className="mt-1 block truncate text-sm font-semibold text-slate-800">
                                    {item.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="rounded-xl border border-[#D9E4F5] bg-[#F5F9FF] px-4 py-3 shadow-sm xl:w-56">
                              <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">当前环节</p>
                              <p className="mt-1 text-sm font-semibold leading-6 text-slate-900">{nextStepLabel}</p>
                              <p className="mt-2 text-xs text-[#0B3B8A]">
                                已完成 {completedWorkflowCount}/4 个节点
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 rounded-xl border border-[#D9E4F5] bg-[#F5F9FF] px-4 py-4">
                          <div className="overflow-x-auto pb-1">
                            <div className="grid min-w-[760px] grid-cols-4">
                              {workflowSteps.map((step, index) => {
                                const leftLineClass =
                                  index > 0 && workflowSteps[index - 1]?.state === "done"
                                    ? "bg-[#89B3EA]"
                                    : "bg-slate-200";
                                const rightLineClass =
                                  step.state === "done"
                                    ? "bg-[#89B3EA]"
                                    : step.state === "current"
                                      ? "bg-[#BFD5F5]"
                                      : "bg-slate-200";

                                return (
                                  <div className="relative px-2 text-center" key={step.key}>
                                    {index > 0 ? (
                                      <span
                                        className={`absolute top-4 left-0 h-0.5 w-1/2 rounded-full ${leftLineClass}`}
                                      />
                                    ) : null}
                                    {index < workflowSteps.length - 1 ? (
                                      <span
                                        className={`absolute top-4 right-0 h-0.5 w-1/2 rounded-full ${rightLineClass}`}
                                      />
                                    ) : null}
                                    <span
                                      className={`relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${taskWorkflowDotClassNames[step.state]}`}
                                    >
                                      {index + 1}
                                    </span>
                                    <p
                                      className={`mt-2 text-sm font-semibold ${
                                        step.state === "done"
                                          ? "text-[#0B3B8A]"
                                          : step.state === "current"
                                            ? "text-[#0B3B8A]"
                                            : "text-slate-500"
                                      }`}
                                    >
                                      {step.label}
                                    </p>
                                    <p className="mx-auto mt-1 max-w-[160px] text-xs leading-5 text-slate-500">
                                      {step.helper}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          </div>

                          <details className="mt-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm text-slate-600">
                            <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500">
                              查看时间台账
                            </summary>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                              {taskTimeItems.map((item) => (
                                <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100" key={item.label}>
                                  <span className="block text-xs text-slate-400">{item.label}</span>
                                  <span className="mt-1 block font-medium text-slate-700">{item.value}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>

                        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">办理提示</p>
                            <p className="min-w-0 text-sm font-semibold text-slate-800">{nextStepLabel}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            {isUnassignedTask && canEditTaskItem(task) ? (
                              <ActionButton disabled={isSaving} onClick={() => openEditTaskModal(task)} variant="primary">
                                分配处理人
                              </ActionButton>
                            ) : null}
                            {canPromptDispatch ? (
                              <ActionButton disabled={isSaving} onClick={() => void remindTaskDispatch(task)}>
                                提醒分配
                              </ActionButton>
                            ) : null}
                            {task.status === "todo" && task.assigneeId === currentMemberId ? (
                              <ActionButton disabled={isSaving} onClick={() => void acceptTask(task)} variant="secondary">
                                接取
                              </ActionButton>
                            ) : null}
                            {task.status === "doing" && task.assigneeId === currentMemberId ? (
                              <ActionButton disabled={isSaving} onClick={() => openTaskCompletionModal(task)} variant="primary">
                                提交验收
                              </ActionButton>
                            ) : null}
                            {task.status === "review" && canReviewTaskItem(task) ? (
                              <>
                                <ActionButton disabled={isSaving} onClick={() => confirmTaskArchive(task)} variant="secondary">
                                  确认归档
                                </ActionButton>
                                <ActionButton disabled={isSaving} onClick={() => openTaskRejectModal(task)} variant="danger">
                                  驳回
                                </ActionButton>
                              </>
                            ) : null}
                            {permissions.canSendDirective && task.assigneeId && task.assigneeId !== currentMemberId ? (
                              <ActionButton disabled={isSaving} onClick={() => sendTaskReminder(task)}>
                                提醒
                              </ActionButton>
                            ) : null}
                            <ActionButton
                              disabled={!canEditTaskItem(task)}
                              onClick={() => openEditTaskModal(task)}
                              title="无权限"
                            >
                              {isUnassignedTask ? "编辑内容" : "编辑"}
                            </ActionButton>
                            <ActionButton
                              disabled={!canDeleteTaskItem(task)}
                              onClick={() => deleteTask(task.id, task.title)}
                              title="无权限"
                              variant="danger"
                            >
                              删除
                            </ActionButton>
                          </div>
                        </div>

                        {task.rejectionReason ? (
                          <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                            驳回原因：{task.rejectionReason}
                          </p>
                        ) : null}
                        {task.completionNote ? (
                          <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                            完成说明：{task.completionNote}
                          </p>
                        ) : null}
                        {attachmentCount > 0 ? (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold text-slate-400">完成凭证</p>
                              <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                                {attachmentCount} 个附件
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {task.attachments?.slice(0, 6).map((attachment) => {
                                const asset = {
                                  title: "完成凭证预览",
                                  url: attachment.downloadUrl,
                                  fileName: attachment.fileName,
                                  mimeType: attachment.mimeType,
                                } satisfies PreviewAsset;
                                const isPreviewableImage = isImageAsset(asset);

                                return (
                                  <div
                                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
                                    key={attachment.id}
                                  >
                                    <button
                                      className="block w-full text-left"
                                      onClick={() =>
                                        handlePreviewDocument({
                                          downloadUrl: attachment.downloadUrl,
                                          fileName: attachment.fileName,
                                          mimeType: attachment.mimeType,
                                          title: "完成凭证预览",
                                        })
                                      }
                                      type="button"
                                    >
                                      <div className="flex h-28 items-center justify-center overflow-hidden bg-slate-100">
                                        {isPreviewableImage ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            alt={attachment.fileName}
                                            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                                            loading="lazy"
                                            src={buildInlinePreviewUrl(attachment.downloadUrl) ?? attachment.downloadUrl}
                                          />
                                        ) : (
                                          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400">
                                            <FileText className="h-8 w-8" />
                                            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold uppercase text-slate-500 ring-1 ring-slate-200">
                                              {getAssetExtension(attachment.fileName).replace(".", "") || "file"}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="p-3">
                                        <p className="line-clamp-2 text-sm font-semibold leading-6 text-slate-800">
                                          {attachment.fileName}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400">
                                          {formatFileSize(attachment.fileSize)} · {attachment.uploaderName}
                                        </p>
                                      </div>
                                    </button>
                                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-3 py-2">
                                      <button
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                        onClick={() =>
                                          handlePreviewDocument({
                                            downloadUrl: attachment.downloadUrl,
                                            fileName: attachment.fileName,
                                            mimeType: attachment.mimeType,
                                            title: "完成凭证预览",
                                          })
                                        }
                                        type="button"
                                      >
                                        预览
                                      </button>
                                      <button
                                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                                        onClick={() => handleDownload(attachment.downloadUrl)}
                                        type="button"
                                      >
                                        下载
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {attachmentCount > 6 ? (
                              <p className="mt-3 text-xs text-slate-400">
                                还有 {attachmentCount - 6} 个附件未在卡片中展开，可进入工单详情后继续查看。
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
                <EmptyState
                  description="当前筛选条件下没有工单，可以切换状态或重新搜索。"
                  icon={KanbanSquare}
                  title="暂无工单"
                />
              </div>
            )}
          </div>
        </section>
      </div>
    );
  };

  const renderTraining = () => {
    const remainingSeconds = Math.max(trainingTimerDuration - trainingTimerElapsed, 0);
    const overtimeSeconds = Math.max(trainingTimerElapsed - trainingTimerDuration, 0);
    const timerProgress =
      trainingTimerDuration > 0
        ? Math.min(100, Math.round((Math.min(trainingTimerElapsed, trainingTimerDuration) / trainingTimerDuration) * 100))
        : 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeader
            description="分成答辩训练和路演训练两块：前者沉淀 Q&A 题库，后者练陈述节奏和时间控制。"
            title="训练中心"
          />
          <DemoResetNote />
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          {[
            {
              key: "qa",
              icon: HelpCircle,
              title: "答辩训练",
              description: "管理评委追问、标准回答要点和随机抽查。",
              metric: `${trainingStats.questionCount} 题`,
              accent: "blue",
            },
            {
              key: "pitch",
              icon: Timer,
              title: "路演训练",
              description: "练习陈述节奏、超时控制和复盘记录。",
              metric: `${trainingStats.sessionCount} 次`,
              accent: "emerald",
            },
          ].map((item) => {
            const Icon = item.icon;
            const selected = trainingPanel === item.key;

            return (
              <button
                className={`group rounded-xl border bg-white p-5 text-left shadow-sm transition ${
                  selected
                    ? item.accent === "blue"
                      ? "border-blue-200 ring-2 ring-blue-500/10"
                      : "border-emerald-200 ring-2 ring-emerald-500/10"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                key={item.key}
                onClick={() => setTrainingPanel(item.key as "qa" | "pitch")}
                type="button"
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                      item.accent === "blue" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      selected
                        ? item.accent === "blue"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {selected ? "当前板块" : item.metric}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
              </button>
            );
          })}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {(trainingPanel === "qa"
            ? [
                { label: "题库数量", value: `${trainingStats.questionCount} 题`, hint: "覆盖商业、技术、财务等方向" },
                { label: "Q&A 命中率", value: `${trainingStats.qaHitRate}%`, hint: "抽查题回答到位比例" },
                { label: "本轮抽查", value: `${qaDrillStats.total} 题`, hint: `${qaDrillStats.hit} 题命中要点` },
              ]
            : [
                { label: "模拟训练", value: `${trainingStats.sessionCount} 次`, hint: "已保存的完整训练记录" },
                { label: "平均超时", value: formatSeconds(trainingStats.averageOvertimeSeconds), hint: "越接近 0 越稳" },
                { label: "当前计时", value: formatSeconds(trainingTimerDuration), hint: overtimeSeconds > 0 ? "已经超时" : "当前预设时长" },
              ]).map((item) => (
            <article className={surfaceCardClassName} key={item.label}>
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-900">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.hint}</p>
            </article>
          ))}
        </section>

        <section className={`grid gap-4 ${trainingPanel === "qa" ? "xl:grid-cols-[minmax(0,1fr)_420px]" : "xl:grid-cols-1"}`}>
          <article className={`${surfaceCardClassName} ${trainingPanel === "qa" ? "" : "hidden"}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                  答辩训练
                </span>
                <h3 className="mt-3 text-base font-semibold text-slate-900">模拟 Q&A 题库</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  录入常见追问和标准回答要点，也可以先上传文档自动识别，再二次校对入库。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={openQuestionImportModal}>
                  <span className="inline-flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    导入题库
                  </span>
                </ActionButton>
                {editingTrainingQuestionId ? (
                  <ActionButton onClick={resetTrainingQuestionDraft}>取消编辑</ActionButton>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                <label className="text-sm text-slate-500">
                  问题分类
                  <select
                    className={fieldClassName}
                    value={trainingQuestionDraft.category}
                    onChange={(event) =>
                      setTrainingQuestionDraft((current) => ({ ...current, category: event.target.value }))
                    }
                  >
                    {trainingQuestionCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                {trainingQuestionDraft.category === "其他" ? (
                  <label className="text-sm text-slate-500">
                    自定义分类 <span className="text-red-500">*</span>
                    <input
                      className={fieldClassName}
                      placeholder="例如：政策合规、现场追问"
                      value={trainingQuestionDraft.customCategory}
                      onChange={(event) =>
                        setTrainingQuestionDraft((current) => ({
                          ...current,
                          customCategory: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                <label
                  className={`text-sm text-slate-500 ${
                    trainingQuestionDraft.category === "其他" ? "md:col-span-2" : ""
                  }`}
                >
                  评委可能提问 <span className="text-red-500">*</span>
                  <input
                    className={fieldClassName}
                    placeholder="例如：你们的商业模式如何形成可持续收入？"
                    value={trainingQuestionDraft.question}
                    onChange={(event) =>
                      setTrainingQuestionDraft((current) => ({ ...current, question: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="text-sm text-slate-500">
                标准回答要点 <span className="text-red-500">*</span>
                <textarea
                  className={textareaClassName}
                  placeholder="写下 3-5 个回答关键词，便于抽查时快速复盘。"
                  value={trainingQuestionDraft.answerPoints}
                  onChange={(event) =>
                    setTrainingQuestionDraft((current) => ({ ...current, answerPoints: event.target.value }))
                  }
                />
              </label>
              <div className="flex justify-end">
                <ActionButton
                  disabled={isSaving}
                  loading={isSaving}
                  loadingLabel="保存中..."
                  onClick={() => void saveTrainingQuestion()}
                  variant="primary"
                >
                  {editingTrainingQuestionId ? "保存修改" : "加入题库"}
                </ActionButton>
              </div>
            </div>

            {trainingQuestions.length > 0 ? (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">题库管理</p>
                  <p className="mt-1 text-xs text-slate-500">
                    已选择 {selectedTrainingQuestionIds.length} / {trainingQuestions.length} 题；列表固定高度滚动展示。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={selectAllManageableTrainingQuestions}>
                    {selectedTrainingQuestionIds.length > 0 ? "取消选择" : "全选可删题目"}
                  </ActionButton>
                  <ActionButton
                    disabled={selectedTrainingQuestionIds.length === 0}
                    onClick={deleteSelectedTrainingQuestions}
                    variant="danger"
                  >
                    批量删除
                  </ActionButton>
                </div>
              </div>
            ) : null}

            <div className="mt-5 max-h-[640px] space-y-3 overflow-y-auto pr-1">
              {trainingQuestions.length > 0 ? (
                trainingQuestions.map((item) => (
                  <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={item.id}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 gap-3">
                        {canManageTrainingQuestion(item) ? (
                          <input
                            aria-label={`选择题目：${item.question}`}
                            checked={selectedTrainingQuestionIds.includes(item.id)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                            onChange={(event) => toggleTrainingQuestionSelection(item.id, event.target.checked)}
                            type="checkbox"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                            {item.category}
                          </span>
                          <h4 className="mt-3 text-base font-semibold leading-7 text-slate-900">{item.question}</h4>
                          <p className="mt-2 text-sm leading-7 text-slate-500">{item.answerPoints}</p>
                          <p className="mt-2 text-xs text-slate-400">
                            录入：{item.createdByName} · 更新：{item.updatedAt}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <ActionButton onClick={() => setActiveDrillQuestionId(item.id)}>
                          抽这题
                        </ActionButton>
                        {canManageTrainingQuestion(item) ? (
                          <>
                            <ActionButton onClick={() => editTrainingQuestion(item)}>编辑</ActionButton>
                            <ActionButton onClick={() => deleteTrainingQuestion(item)} variant="danger">
                              删除
                            </ActionButton>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200">
                  <EmptyState
                    description="先录入几条评委常问问题，比如商业模式、技术壁垒、财务数据。"
                    icon={HelpCircle}
                    title="题库还是空的"
                  />
                </div>
              )}
            </div>
          </article>

          <div className="space-y-4">
            <article className={`${surfaceCardClassName} ${trainingPanel === "qa" ? "" : "hidden"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">抽查模式</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">随机弹题，训练答辩人的临场反应。</p>
                </div>
                <ActionButton onClick={drawRandomTrainingQuestion} variant="primary">
                  <span className="inline-flex items-center gap-2">
                    <Shuffle className="h-4 w-4" />
                    抽一题
                  </span>
                </ActionButton>
              </div>

              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                {activeDrillQuestion ? (
                  <>
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-blue-600">
                      {activeDrillQuestion.category}
                    </span>
                    <p className="mt-3 text-lg font-semibold leading-8 text-slate-900">
                      {activeDrillQuestion.question}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      <span className="font-medium text-slate-900">回答要点：</span>
                      {activeDrillQuestion.answerPoints}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton onClick={() => recordDrillAnswer(true)} variant="primary">
                        命中要点
                      </ActionButton>
                      <ActionButton onClick={() => recordDrillAnswer(false)}>
                        还需打磨
                      </ActionButton>
                    </div>
                  </>
                ) : (
                  <p className="text-sm leading-7 text-slate-500">题库有内容后，点击“抽一题”开始训练。</p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">本轮抽查</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{qaDrillStats.total} 题</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">命中率</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {qaDrillStats.total > 0 ? Math.round((qaDrillStats.hit / qaDrillStats.total) * 100) : 0}%
                  </p>
                </div>
              </div>
            </article>

            <article className={`${surfaceCardClassName} ${trainingPanel === "pitch" ? "" : "hidden"}`}>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                路演训练
              </span>
              <h3 className="mt-3 text-base font-semibold text-slate-900">模拟计时器</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                可选常用路演时长，也可以自定义分钟数，适合陈述节奏和问答节奏训练。
              </p>

              <div className="mt-4 grid gap-2">
                {trainingTimerPresets.map((preset) => (
                  <button
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      trainingTimerDuration === preset.seconds
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                    key={preset.key}
                    onClick={() => applyTrainingTimerPreset(preset)}
                    type="button"
                  >
                    <span className="text-sm font-semibold">{preset.label}</span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">{preset.description}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-3">
                <label className="text-sm text-slate-500">
                  自定义计时（分钟）
                  <div className="mt-1.5 flex gap-2">
                    <input
                      className={fieldClassName}
                      inputMode="decimal"
                      min="1"
                      max="180"
                      placeholder="例如：6"
                      type="number"
                      value={trainingTimerCustomMinutes}
                      onChange={(event) => setTrainingTimerCustomMinutes(event.target.value)}
                    />
                    <ActionButton onClick={applyCustomTrainingTimer}>应用</ActionButton>
                  </div>
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-950 px-5 py-6 text-center text-white">
                <p className="text-xs tracking-[0.2em] text-white/50">
                  {overtimeSeconds > 0 ? "已超时" : "剩余时间"}
                </p>
                <p className={`mt-2 text-[48px] font-bold tabular-nums ${overtimeSeconds > 0 ? "text-red-300" : ""}`}>
                  {overtimeSeconds > 0 ? `+${formatSeconds(overtimeSeconds)}` : formatSeconds(remainingSeconds)}
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-blue-400" style={{ width: `${timerProgress}%` }} />
                </div>
                <div className="mt-5 flex justify-center gap-2">
                  <ActionButton
                    onClick={() => setTrainingTimerRunning((current) => !current)}
                    variant="primary"
                  >
                    <span className="inline-flex items-center gap-2">
                      {trainingTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {trainingTimerRunning ? "暂停" : "开始"}
                    </span>
                  </ActionButton>
                  <ActionButton onClick={resetTrainingTimer}>
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      重置
                    </span>
                  </ActionButton>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  className={fieldClassName}
                  placeholder="训练标题，例如：校内终审彩排第 1 轮"
                  value={trainingSessionTitle}
                  onChange={(event) => setTrainingSessionTitle(event.target.value)}
                />
                <textarea
                  className={`${textareaClassName} min-h-24`}
                  placeholder="复盘备注：哪里超时、哪类问题没答好、下一轮要练什么。"
                  value={trainingSessionNotes}
                  onChange={(event) => setTrainingSessionNotes(event.target.value)}
                />
                <ActionButton
                  disabled={isSaving}
                  loading={isSaving}
                  loadingLabel="保存中..."
                  onClick={() => void saveTrainingSession()}
                  variant="primary"
                >
                  保存训练记录
                </ActionButton>
              </div>
            </article>

            <article className={`${surfaceCardClassName} ${trainingPanel === "pitch" ? "" : "hidden"}`}>
              <h3 className="text-base font-semibold text-slate-900">最近训练记录</h3>
              <div className="mt-4 space-y-3">
                {trainingSessions.slice(0, 5).map((session) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={session.id}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{session.title}</p>
                      <span className="text-xs text-slate-400">{session.createdAt}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      用时 {formatSeconds(session.durationSeconds)} · 超时 {formatSeconds(session.overtimeSeconds)} · Q&A 命中 {session.qaHitRate}%
                    </p>
                  </div>
                ))}
                {trainingSessions.length === 0 ? (
                  <p className="text-sm leading-7 text-slate-500">还没有训练记录，完成一次计时后可以保存复盘。</p>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      </div>
    );
  };

  const renderReports = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description={
            permissions.canViewAllReports
              ? "按日期查看团队汇报归档，历史记录会一直保留，可随时回看。"
              : "按日期查看自己的历史汇报，已提交内容会持续保存。"
          }
          title="日程汇报"
        />
        <div className="flex flex-wrap items-center gap-3 text-right">
          <DemoResetNote />
        </div>
      </div>

      <section className={surfaceCardClassName}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">选择查看日期</p>
                <p className="mt-1 text-sm text-slate-500">
                  可以直接选择过去任意一天；有保存记录的日期会在下方显示。
                </p>
              </div>
              <label className="block min-w-56 text-sm font-medium text-slate-600">
                日期
                <input
                  className={`${fieldClassName} mt-1.5`}
                  max={todayDateKey}
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    if (event.target.value) {
                      setSelectedDate(event.target.value);
                    }
                  }}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {reportDateOptions.slice(0, 10).map((date) => {
                const hasReport = (reportEntriesByDay[date] ?? []).length > 0;
                const isSelected = date === selectedDate;

                return (
                  <button
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : hasReport
                          ? "border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-200"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`}
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    type="button"
                  >
                    {date === todayDateKey ? "今天" : formatShortDate(date)}
                    {hasReport ? <span className="ml-1 text-xs opacity-75">有记录</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm text-slate-500">当前日期</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">{formatShortDate(selectedDate)}</h3>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-400">应提交</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{selectedReportExpectedCount}</p>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-400">已提交</p>
                  <p className="mt-1 text-lg font-semibold text-blue-700">{selectedReportSubmittedCount}</p>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-400">未提交</p>
                  <p className="mt-1 text-lg font-semibold text-rose-600">{selectedReportMissingCount}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width:
                      selectedReportExpectedCount > 0
                        ? `${Math.round((selectedReportSubmittedCount / selectedReportExpectedCount) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
            {permissions.canSubmitReport ? (
              <ActionButton
                className="mt-4 w-full justify-center"
                onClick={() =>
                  currentUserSelectedReport
                    ? openEditReportModal(currentUserSelectedReport)
                    : openCreateReportModal()
                }
                variant="primary"
              >
                {currentUserSelectedReport ? "修改我的汇报" : "提交这天汇报"}
              </ActionButton>
            ) : (
              <p className="mt-4 rounded-lg bg-white px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
                当前角色只查看归档，不需要提交汇报。
              </p>
            )}
            {currentRole === "admin" ? (
              <div className="mt-4 rounded-lg border border-rose-100 bg-white p-3">
                <p className="text-xs font-semibold text-rose-600">管理员清理</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  只删除指定项目组在当前日期的汇报记录。
                </p>
                <select
                  className={`${fieldClassName} mt-2`}
                  value={reportDeleteTeamGroupId}
                  onChange={(event) => setReportDeleteTeamGroupId(event.target.value)}
                >
                  <option value="">选择项目组</option>
                  {teamGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <ActionButton
                  className="mt-2 w-full justify-center"
                  disabled={!reportDeleteTeamGroupId}
                  onClick={removeTeamReports}
                  variant="danger"
                >
                  删除该组本日汇报
                </ActionButton>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {visibleReportMembers.length > 0 ? (
          visibleReportMembers.map((member) => {
            const report = reportEntryMap.get(member.id);
            const attachmentNote = getReportAttachmentNote(report?.attachment);

            return (
              <article
                key={member.id}
                className={`${surfaceCardClassName} overflow-hidden p-0`}
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{member.name}</h3>
                      <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                        {member.systemRole}
                      </span>
                      {member.teamGroupName ? (
                        <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                          {member.teamGroupName}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {formatShortDate(selectedDate)} 汇报记录 · 提交人 {member.name}
                    </p>
                  </div>
                  {report ? (
                    <span className="shrink-0 rounded-md bg-blue-50 px-3 py-1 text-sm text-blue-600">
                      已提交 {report.submittedAt}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-md bg-red-50 px-3 py-1 text-sm text-red-700">
                      未提交
                    </span>
                  )}
                </div>

                <div className="p-5">
                  {report ? (
                    <>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-400">今日完成</p>
                          <p className="mt-2 text-sm leading-7 text-slate-700">{report.summary}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-400">明日计划</p>
                          <p className="mt-2 text-sm leading-7 text-slate-700">{report.nextPlan}</p>
                        </div>
                      </div>
                      {attachmentNote ? (
                        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                          附件备注：{attachmentNote}
                        </p>
                      ) : null}
                      {member.id === currentMemberId && permissions.canSubmitReport ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <ActionButton onClick={() => openEditReportModal(report)}>修改汇报</ActionButton>
                          <ActionButton onClick={() => removeReport(report.date)} variant="danger">
                            撤回汇报
                          </ActionButton>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
                      <p className="text-sm font-semibold text-slate-700">这一天还没有汇报</p>
                      <p className="mt-2 text-sm leading-7 text-slate-500">
                        {member.id === currentMemberId && permissions.canSubmitReport
                          ? "可以补交这一天的工作汇报，保存后会进入历史记录。"
                          : `该成员在 ${formatShortDate(selectedDate)} 尚未提交当日汇报。`}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <div className="xl:col-span-2">
            <EmptyState
              description="当前日期下还没有可展示的汇报记录，提交后会集中显示在这里。"
              icon={CalendarDays}
              title="暂无汇报记录"
            />
          </div>
        )}
      </section>

      {!selectedDateHasSavedReports && visibleReportMembers.length > 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
          {formatShortDate(selectedDate)} 暂无保存记录。选择其他历史日期，或点击“提交这天汇报”补录保存。
        </p>
      ) : null}
    </div>
  );

  const renderExperts = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="按时间倒序沉淀每次专家辅导意见与后续落地动作。"
          title="专家意见"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canUploadExpert}
            onClick={() => {
              setExpertDraft(defaultExpertDraft);
              setExpertFiles([]);
              setExpertDraftErrors(defaultExpertDraftErrors());
              setExpertModalOpen(true);
            }}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span>上传专家意见</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="space-y-4">
        {experts.length > 0 ? (
          experts.map((session) => (
            <article
              key={session.id}
              className={surfaceCardClassName}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">
                    {session.date} · {session.format}
                  </p>
                  <h3 className="mt-3 text-base font-semibold text-slate-900">
                    {session.expert} · {session.topic}
                  </h3>
                </div>
                <div className="mt-3 flex flex-col items-start gap-3 md:mt-0 md:items-end">
                  <div className="flex flex-wrap gap-2">
                    {session.attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm ${
                          attachment.downloadUrl
                            ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            : "bg-slate-100 text-slate-400"
                        }`}
                        disabled={!attachment.downloadUrl}
                        onClick={() => {
                          if (attachment.downloadUrl) {
                            handlePreviewDocument({
                              downloadUrl: attachment.downloadUrl,
                              fileName: attachment.fileName,
                              mimeType: attachment.mimeType,
                            });
                          }
                        }}
                        type="button"
                      >
                        <Eye className="h-4 w-4" />
                        {attachment.fileName}
                      </button>
                    ))}
                  </div>
                  {permissions.canDeleteExpert ? (
                    <ActionButton onClick={() => removeExpert(session.id, session.topic)} variant="danger">
                      <span className="inline-flex items-center gap-2">
                        <Trash2 className="h-4 w-4" />
                        <span>删除意见</span>
                      </span>
                    </ActionButton>
                  ) : null}
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">反馈摘要：{session.summary}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">落实动作：{session.nextAction}</p>
            </article>
          ))
        ) : (
          <EmptyState
            description="专家意见上传后会按时间倒序展示，便于团队持续跟进。"
            icon={MessageSquareText}
            title="暂无专家意见"
          />
        )}
      </section>
    </div>
  );

  const renderReview = () => {
    const reviewStatusStyles = {
      pending: "bg-amber-50 text-amber-700",
      completed: "bg-blue-50 text-blue-600",
      locked: "bg-slate-100 text-slate-600",
    } as const;

    const groupedAssignments = reviewAssignments.reduce<
      Array<{
        key: string;
        targetName: string;
        roundLabel: string;
        deadline: string | null;
        items: ExpertReviewAssignmentItem[];
      }>
    >((groups, assignment) => {
      const key = assignment.packageId;
      const existingGroup = groups.find((item) => item.key === key);

      if (existingGroup) {
        existingGroup.items.push(assignment);
        return groups;
      }

      return [
        ...groups,
        {
          key,
          targetName: assignment.targetName,
          roundLabel: assignment.roundLabel,
          deadline: assignment.deadline,
          items: [assignment],
        },
      ];
    }, []);

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeader
            description={
              currentRole === "expert"
                ? "仅显示当前专家被指派的评审任务，材料只支持在线查看计划书、路演材料和视频；提交后截止前可继续修改，截止后自动锁定。"
                : currentRole === "member"
                  ? "查看专家已提交的评分、等级和综合评语。"
                : "评审材料与主文档中心完全独立，管理员、教师和负责人都可创建并指派评审包；教师和管理员可查看全部评分。"
            }
            title="专家评审"
          />
          <div className="flex flex-wrap items-center gap-3">
            {currentRole !== "expert" ? <DemoResetNote /> : null}
            {canCreateReviewPackage ? (
              <ActionButton onClick={openReviewAssignmentModal} variant="primary">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>新建评审包</span>
                </span>
              </ActionButton>
            ) : null}
          </div>
        </div>

        {reviewAssignments.length === 0 ? (
          <section className={surfaceCardClassName}>
            <EmptyState
              description={
                currentRole === "expert"
                  ? "管理员、教师或负责人完成指派后，你的评审任务会显示在这里。"
                  : currentRole === "member"
                    ? "专家完成评分后，结果会显示在这里。"
                  : "当前还没有专家评审包，创建后即可上传计划书、路演材料和视频，并分配给指定专家。"
              }
              icon={FileCheck}
              title={currentRole === "member" ? "暂无专家评分" : "暂无专家评审包"}
            />
          </section>
        ) : currentRole === "expert" ? (
          <section className="space-y-4">
            {reviewAssignments.map((assignment) => {
              const draft = reviewScoreDrafts[assignment.id] ?? createExpertReviewScoreDraft(assignment);
              const planMaterial = assignment.materials.plan;
              const pptMaterial = assignment.materials.ppt;
              const videoMaterial = assignment.materials.video;

              return (
                <article key={assignment.id} className={surfaceCardClassName}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-base font-semibold text-slate-900">{assignment.targetName}</h3>
                        <span className={`rounded-md px-3 py-1 text-sm ${reviewStatusStyles[assignment.statusKey]}`}>
                          {assignment.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {assignment.roundLabel}
                        {assignment.deadline ? ` · 截止时间 ${formatDateTime(assignment.deadline)}` : ""}
                      </p>
                      {assignment.overview ? (
                        <p className="mt-3 text-sm leading-7 text-slate-600">{assignment.overview}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {planMaterial ? (
                        <ActionButton
                          onClick={() =>
                            openPreviewAsset({
                              title: `${assignment.targetName} · 计划书`,
                              url: planMaterial.previewUrl,
                              mimeType: planMaterial.mimeType,
                              fileName: planMaterial.fileName,
                            })
                          }
                        >
                          查看计划书
                        </ActionButton>
                      ) : null}
                      {pptMaterial ? (
                        <ActionButton
                          onClick={() =>
                            openPreviewAsset({
                              title: `${assignment.targetName} · 路演材料`,
                              url: pptMaterial.previewUrl,
                              mimeType: pptMaterial.mimeType,
                              fileName: pptMaterial.fileName,
                            })
                          }
                        >
                          查看路演材料
                        </ActionButton>
                      ) : null}
                      {videoMaterial ? (
                        <ActionButton
                          onClick={() =>
                            openPreviewAsset({
                              title: `${assignment.targetName} · 视频`,
                              url: videoMaterial.previewUrl,
                              mimeType: videoMaterial.mimeType,
                              fileName: videoMaterial.fileName,
                            })
                          }
                        >
                          查看视频
                        </ActionButton>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {(Object.keys(expertReviewCategoryCaps) as Array<keyof typeof expertReviewCategoryCaps>).map(
                      (fieldKey) => {
                        const choices = getExpertReviewGradeChoices(fieldKey);
                        const selectedGrade = draft[fieldKey];

                        return (
                          <div key={`${assignment.id}-${fieldKey}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-900">
                                {expertReviewFieldLabels[fieldKey]}
                                <span className="ml-2 text-xs font-medium text-slate-400">
                                  满分 {expertReviewCategoryCaps[fieldKey]}
                                </span>
                              </p>
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 shadow-sm">
                                {selectedGrade
                                  ? `${selectedGrade} · ${mapExpertReviewGradeToScore(fieldKey, selectedGrade as "A" | "B" | "C" | "D" | "E")} 分`
                                  : "请选择等级"}
                              </span>
                            </div>
                            <div className="mt-4 grid grid-cols-5 gap-2">
                              {choices.map((choice) => {
                                const isSelected = selectedGrade === choice.grade;
                                return (
                                  <button
                                    key={`${assignment.id}-${fieldKey}-${choice.grade}`}
                                    className={`rounded-lg border px-3 py-2 text-center transition ${
                                      isSelected
                                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                                    } ${!assignment.canEdit || activeReviewAssignmentId === assignment.id ? "cursor-not-allowed opacity-60" : ""}`}
                                    disabled={!assignment.canEdit || activeReviewAssignmentId === assignment.id}
                                    onClick={() => updateReviewScoreDraft(assignment.id, fieldKey, choice.grade)}
                                    type="button"
                                  >
                                    <span className="block text-sm font-semibold">{choice.grade}</span>
                                    <span className="mt-1 block text-[11px]">{choice.score}分</span>
                                  </button>
                                );
                              })}
                            </div>
                            <span className="mt-3 block text-xs leading-6 text-slate-400">
                              {expertReviewFieldHints[fieldKey].join(" / ")}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>

                  <label className="mt-5 block text-sm text-slate-500">
                    综合评语
                    <textarea
                      className={`${textareaClassName} min-h-32`}
                      disabled={!assignment.canEdit || activeReviewAssignmentId === assignment.id}
                      placeholder="请结合四大类评分填写综合评语"
                      value={draft.commentTotal}
                      onChange={(event) =>
                        updateReviewScoreDraft(assignment.id, "commentTotal", event.target.value)
                      }
                    />
                  </label>

                  <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-slate-500">当前总分</p>
                      <p className="mt-1 text-2xl font-bold text-blue-600">
                        {getReviewScoreTotal(draft)}
                        <span className="ml-2 text-sm font-medium text-slate-400">/ 100</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {assignment.score ? (
                        <p className="text-sm text-slate-400">
                          最近提交：{formatDateTime(assignment.score.updatedAt)}
                        </p>
                      ) : null}
                      <ActionButton
                        disabled={!assignment.canEdit}
                        loading={activeReviewAssignmentId === assignment.id}
                        loadingLabel="提交中..."
                        onClick={() => void saveExpertReviewScore(assignment.id)}
                        title={assignment.canEdit ? undefined : "已截止，当前任务已锁定"}
                        variant="primary"
                      >
                        {assignment.score ? "更新评分" : "提交评分"}
                      </ActionButton>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="space-y-4">
            {groupedAssignments.map((group) => (
              <article key={group.key} className={surfaceCardClassName}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{group.targetName}</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      {group.roundLabel}
                      {group.deadline ? ` · 截止时间 ${formatDateTime(group.deadline)}` : ""}
                    </p>
                  </div>
                  {canManageReviewMaterials ? (
                    <ActionButton
                      onClick={() => deleteReviewAssignment(group.items[0].id, group.targetName)}
                      variant="danger"
                    >
                      删除整包评审数据
                    </ActionButton>
                  ) : null}
                </div>

                {currentRole === "member" ? null : (
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    {(["plan", "ppt", "video"] as const).map((kind) => {
                      const material = group.items[0]?.materials[kind];

                      return (
                        <div key={`${group.key}-${kind}`} className={subtleCardClassName}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{expertReviewMaterialLabels[kind]}</p>
                              <p className="mt-2 text-xs text-slate-400">
                                {material ? material.fileName : "暂未上传"}
                              </p>
                            </div>
                            <span
                              className={`rounded-md px-2.5 py-1 text-xs ${
                                material ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {material ? "已上传" : "待补充"}
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {material ? (
                              <>
                                <ActionButton
                                  onClick={() =>
                                    openPreviewAsset({
                                      title: `${group.targetName} · ${expertReviewMaterialLabels[kind]}`,
                                      url: material.previewUrl,
                                      mimeType: material.mimeType,
                                      fileName: material.fileName,
                                    })
                                  }
                                >
                                  查看
                                </ActionButton>
                                {canManageReviewMaterials ? (
                                  <>
                                    <ActionButton onClick={() => openReviewMaterialModal(group.items[0].id, kind)}>
                                      替换
                                    </ActionButton>
                                    <ActionButton
                                      onClick={() => deleteReviewMaterial(group.items[0].id, kind)}
                                      variant="danger"
                                    >
                                      删除
                                    </ActionButton>
                                  </>
                                ) : null}
                              </>
                            ) : canManageReviewMaterials ? (
                              <ActionButton onClick={() => openReviewMaterialModal(group.items[0].id, kind)} variant="primary">
                                上传
                              </ActionButton>
                            ) : (
                              <span className="text-sm text-slate-400">暂未提供</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {group.items.map((assignment) => (
                    <div key={assignment.id} className={subtleCardClassName}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-slate-900">{assignment.expert.name}</p>
                          <p className="mt-2 text-sm text-slate-500">{assignment.expert.roleLabel}</p>
                        </div>
                        <span className={`rounded-md px-3 py-1 text-sm ${reviewStatusStyles[assignment.statusKey]}`}>
                          {assignment.status}
                        </span>
                      </div>

                      {assignment.score ? (
                        <>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {(Object.keys(expertReviewCategoryCaps) as Array<keyof typeof expertReviewCategoryCaps>).map(
                              (fieldKey) => (
                                <div key={`${assignment.id}-${fieldKey}`} className="rounded-lg bg-white px-4 py-3">
                                  <p className="text-xs text-slate-400">{expertReviewFieldLabels[fieldKey]}</p>
                                  <p className="mt-2 text-lg font-semibold text-slate-900">
                                    {getExpertReviewGradeFromScore(fieldKey, assignment.score?.[fieldKey])}
                                    <span className="ml-2 text-sm font-medium text-slate-500">
                                      {assignment.score?.[fieldKey]}分
                                    </span>
                                    <span className="ml-1 text-xs text-slate-400">
                                      / {expertReviewCategoryCaps[fieldKey]}
                                    </span>
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                          <p className="mt-4 text-sm font-medium text-blue-600">
                            总分：{assignment.score.totalScore} / 100
                          </p>
                          <p className="mt-3 text-sm leading-7 text-slate-600">
                            评语：{assignment.score.commentTotal}
                          </p>
                          <p className="mt-3 text-xs text-slate-400">
                            提交时间：{formatDateTime(assignment.score.updatedAt)}
                          </p>
                        </>
                      ) : (
                        <p className="mt-4 text-sm leading-7 text-slate-500">该专家尚未提交本次评分。</p>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    );
  };

  const renderDocuments = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="点击分类卡片筛选文档，并可查看历史版本、上传新版本和执行审核。"
          title="文档中心"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canUploadDocument}
            onClick={openDocumentModal}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span>上传文档</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {documentCategories.map((category) => {
          const count = documents.filter((item) => item.category === category).length;
          const isActive = selectedCategory === category;

          return (
            <button
              key={category}
              className={`rounded-xl border p-5 text-left shadow-sm transition ${
                isActive
                  ? "border-[#C9D9F3] bg-[#EAF1FB]"
                  : "border-slate-100 bg-white hover:border-[#D9E3F2] hover:bg-[#F7FAFE]"
              }`}
              onClick={() => setSelectedCategory((current) => (current === category ? null : category))}
              type="button"
            >
              <div className="inline-flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-[#0B3B8A]" />
                <h3 className="text-base font-semibold text-slate-900">{category}</h3>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900">{count}</p>
              <p className="mt-2 text-sm text-slate-500">点击筛选该分类文档</p>
            </button>
          );
        })}
      </section>

      <section className="space-y-4">
        {filteredDocuments.length > 0 ? (
          filteredDocuments.map((doc) => (
            <article
              id={`doc-${doc.id}`}
              key={doc.id}
              className={`${surfaceCardClassName} transition ${
                highlightedDocId === doc.id ? "ring-2 ring-blue-500 ring-offset-2" : ""
              }`}
            >
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-4 md:grid-cols-3">
                {documentStepLabels.map((label, index) => {
                  const states = getDocumentWorkflowState(doc.statusKey ?? "pending");
                  const stepState = states[index];
                  const dotClassName =
                    stepState === "complete"
                      ? "border-blue-600 bg-blue-600"
                      : stepState === "current"
                        ? "border-blue-600 bg-blue-600 ring-4 ring-blue-100"
                        : "border-slate-300 bg-white";
                  const lineClassName =
                    index < documentStepLabels.length - 1 &&
                    stepState === "complete" &&
                    states[index + 1] === "complete"
                      ? "bg-blue-600"
                      : "bg-slate-300";
                  const textClassName =
                    stepState === "current"
                        ? "text-blue-600"
                        : stepState === "pending"
                          ? "text-slate-400"
                        : "text-slate-700";

                  return (
                    <div className="relative flex items-center gap-3" key={`${doc.id}-${label}`}>
                      {index < documentStepLabels.length - 1 ? (
                        <div className={`absolute left-4 right-0 top-4 hidden h-[2px] md:block ${lineClassName}`} />
                      ) : null}
                      <span
                        className={`relative z-10 h-8 w-8 rounded-full border-2 ${dotClassName} ${
                          stepState === "current" ? "animate-pulse" : ""
                        }`}
                      />
                      <div className="relative z-10">
                        <p className={`text-xs font-medium ${textClassName}`}>{label}</p>
                        <p className={`mt-1 text-xs ${textClassName}`}>{getDocumentStepCaption(stepState)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-sm text-slate-500">{getDocumentStatusHint(doc.statusKey ?? "pending")}</p>
            </div>

            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">{doc.name}</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "文档分类", value: doc.category },
                    { label: "当前版本", value: doc.currentVersion },
                    { label: "上传人", value: doc.ownerName ?? getMemberName(doc.ownerId) },
                    { label: "上传时间", value: doc.createdAt ?? "未记录" },
                  ].map((item) => (
                    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200" key={item.label}>
                      <span className="block text-xs text-slate-400">{item.label}</span>
                      <span className="mt-1 block font-medium text-slate-700">{item.value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-500">批注：{doc.comment}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-md px-3 py-1 text-sm ${docStatusStyles[doc.status]}`}>
                    {doc.status}
                  </span>
                <ActionButton
                  onClick={() => openVersionUploadModal(doc.id)}
                  disabled={!permissions.canUploadDocument}
                  title="无权限"
                >
                  <span className="inline-flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    <span>上传新版本</span>
                  </span>
                </ActionButton>
                <ActionButton
                  onClick={() =>
                    handlePreviewDocument({
                      downloadUrl: doc.downloadUrl,
                      fileName: doc.currentFileName,
                      mimeType: doc.currentMimeType,
                    })
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <span>在线预览</span>
                  </span>
                </ActionButton>
                <ActionButton
                  disabled={!doc.downloadUrl}
                  onClick={() => handleDownload(doc.downloadUrl)}
                  title={doc.downloadUrl ? undefined : "当前文件尚未生成下载链接"}
                >
                  <span className="inline-flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    <span>下载</span>
                  </span>
                </ActionButton>
                <ActionButton
                  disabled={!canDeleteDocument(doc)}
                  onClick={() => removeDocument(doc.id, doc.name)}
                  title="无权限"
                  variant="danger"
                >
                  <span className="inline-flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    <span>删除文档</span>
                  </span>
                </ActionButton>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {getDocumentActionButtons(doc).map((actionButton) => (
                <ActionButton
                  key={`${doc.id}-${actionButton.key}`}
                  onClick={() => openReviewModal(doc.id, actionButton.key)}
                  variant={actionButton.variant}
                >
                  <span className="inline-flex items-center gap-2">
                    {actionButton.variant === "danger" ? null : <FileCheck className="h-4 w-4" />}
                    <span>{actionButton.label}</span>
                  </span>
                </ActionButton>
              ))}
              <button
                className="inline-flex items-center gap-2 text-sm text-blue-600"
                onClick={() => toggleDocExpand(doc.id)}
                type="button"
              >
                {expandedDocs.includes(doc.id) ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    <span>收起历史版本</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span>展开历史版本</span>
                  </>
                )}
              </button>
            </div>

            {expandedDocs.includes(doc.id) ? (
              <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                {doc.versions.map((version) => (
                  <div
                    key={`${doc.id}-${version.version}`}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{version.version}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {version.uploadedAt} · {version.uploader}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {version.fileName || "未记录文件名"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-slate-500">{version.note}</p>
                      <ActionButton
                        onClick={() =>
                          handlePreviewDocument({
                            downloadUrl: version.downloadUrl,
                            fileName: version.fileName,
                            mimeType: version.mimeType,
                          })
                        }
                      >
                        <span className="inline-flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <span>预览版本</span>
                        </span>
                      </ActionButton>
                      <ActionButton
                        disabled={!version.downloadUrl}
                        onClick={() => handleDownload(version.downloadUrl)}
                        title={version.downloadUrl ? undefined : "当前版本尚未生成下载链接"}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          <span>下载版本</span>
                        </span>
                      </ActionButton>
                      <ActionButton
                        disabled={!canDeleteDocumentVersion(doc, version) || doc.versions.length <= 1}
                        onClick={() => removeDocumentVersion(doc.id, version.id)}
                        title={doc.versions.length <= 1 ? "至少保留一个版本" : "无权限"}
                        variant="danger"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          <span>删除版本</span>
                        </span>
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            </article>
          ))
        ) : (
          <EmptyState
            description={
              selectedCategory
                ? `当前分类“${selectedCategory}”下还没有文档，可以切换分类或上传新文档。`
                : "当前还没有上传文档，上传后会按分类展示在这里。"
            }
            icon={FolderOpen}
            title="暂无文档"
          />
        )}
      </section>
    </div>
  );

  const renderTeam = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description={
            permissions.canManageTeam
              ? "支持创建直属账号，并对自助注册的下级账号执行审核通过。"
              : undefined
          }
          title="团队管理"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          {permissions.canSendDirective ? (
            <ActionButton onClick={openSentRemindersModal}>
              <span className="inline-flex items-center gap-2">
                <BellPlus className="h-4 w-4" />
                <span>提醒记录</span>
              </span>
            </ActionButton>
          ) : null}
          {currentRole === "admin" ? (
            <ActionButton onClick={() => void openEmailSettingsModal()}>
              <span className="inline-flex items-center gap-2">
                <BellPlus className="h-4 w-4" />
                <span>邮件设置</span>
              </span>
            </ActionButton>
          ) : null}
          {canBatchCreateExperts ? (
            <ActionButton onClick={() => setBatchExpertModalOpen(true)}>
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>批量添加专家</span>
              </span>
            </ActionButton>
          ) : null}
          {permissions.canManageTeam ? (
            <ActionButton onClick={() => setTeamModalOpen(true)} variant="primary">
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>创建账号</span>
              </span>
            </ActionButton>
          ) : null}
        </div>
      </div>

      {pendingApprovalMembers.length > 0 ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            当前有 {pendingApprovalMembers.length} 个账号待你审核，通过后对方才能登录系统。
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {pendingApprovalMembers.map((member) => (
              <article key={`pending-${member.id}`} className={surfaceCardClassName}>
                <div className="flex items-start gap-4">
                  <UserAvatar
                    avatar={member.avatar}
                    avatarUrl={member.avatarUrl}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-base font-semibold text-white"
                    name={member.name}
                    textClassName="text-base font-semibold text-white"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{member.name}</h3>
                        {!member.accountHidden ? (
                          <p className="mt-2 text-sm text-slate-500">账号：{member.account}</p>
                        ) : null}
                      </div>
                      <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                        待{member.pendingApproverLabel ?? "上级"}审核
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs text-slate-400">申请身份</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">{member.systemRole}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs text-slate-400">账号状态</p>
                        <p className="mt-1 text-sm font-medium text-amber-700">{member.approvalStatusLabel}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <ActionButton
                        loading={isSaving}
                        loadingLabel="审核中..."
                        onClick={() => confirmApproveMemberRegistration(member)}
                        variant="primary"
                      >
                        审核通过
                      </ActionButton>
                      <ActionButton
                        disabled={isSaving}
                        onClick={() => rejectMemberRegistration(member)}
                        variant="danger"
                      >
                        驳回删除
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {currentRole === "admin" ? (
        <section className={`${surfaceCardClassName} space-y-4`}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">团队分组</h3>
              <p className="mt-1 text-sm text-slate-500">
                仅系统管理员可见，可按学校、项目组等维度管理教师、负责人和成员；评审专家独立管理，不参与分组。
              </p>
            </div>
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {teamGroups.length} 个分组
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
            <label className="block text-sm text-slate-500">
              分组名称
              <input
                className={fieldClassName}
                placeholder="例如：南铁院 / 智轨灯塔项目组"
                value={teamGroupDraft.name}
                onChange={(event) => setTeamGroupDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="block text-sm text-slate-500">
              说明（选填）
              <input
                className={fieldClassName}
                placeholder="可填写学校、项目方向或管理备注"
                value={teamGroupDraft.description}
                onChange={(event) =>
                  setTeamGroupDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <div className="flex items-end">
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  loading={isSaving}
                  loadingLabel={editingTeamGroupId ? "保存中..." : "创建中..."}
                  onClick={saveTeamGroup}
                  variant="primary"
                >
                  {editingTeamGroupId ? "保存修改" : "新建分组"}
                </ActionButton>
                {editingTeamGroupId ? (
                  <ActionButton disabled={isSaving} onClick={cancelEditTeamGroup}>
                    取消编辑
                  </ActionButton>
                ) : null}
              </div>
            </div>
          </div>

          {teamGroups.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {teamGroups.map((group) => (
                <div
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  key={group.id}
                >
                  <span className="font-medium text-slate-800">{group.name}</span>
                  <span className="text-xs text-slate-400">{group.memberCount} 人</span>
                  <button
                    className="rounded-md px-1.5 py-1 text-xs text-[#0B3B8A] transition hover:bg-[#F3F8FF]"
                    onClick={() => editTeamGroup(group)}
                    type="button"
                  >
                    编辑
                  </button>
                  <button
                    className="rounded-md px-1.5 py-1 text-xs text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    onClick={() => deleteTeamGroup(group)}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              暂无分组。可以先按学校或项目组创建，再在账号列表里分配成员。
            </div>
          )}
        </section>
      ) : null}

      <section className={`${surfaceCardClassName} p-0 overflow-hidden`}>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {teamAccountView === "experts" ? "评审专家账号" : "团队账号"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {teamAccountView === "experts"
                  ? "评审专家账号单独管理，便于临时开通、批量创建和后续清理。"
                  : canViewTeamAccountIdentifiers
                    ? "普通团队账号与评审专家分开管理，避免权限和操作混在一起。"
                    : "仅显示你所在团队的人员姓名与角色，不展示账号名。"}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block min-w-[240px] text-sm text-slate-500">
                <span className="sr-only">搜索账号</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder={canViewTeamAccountIdentifiers ? "搜索姓名或账号" : "搜索姓名"}
                  type="text"
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                />
              </label>
              <label className="text-sm text-slate-500">
                <span className="sr-only">按角色筛选</span>
                <select
                  className="w-full min-w-[160px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  value={teamRoleFilter}
                  onChange={(event) => setTeamRoleFilter(event.target.value as "全部" | TeamRoleLabel)}
                >
                  {teamFilterOptions.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {roleOption === "全部" ? "全部角色" : roleOption}
                    </option>
                  ))}
                </select>
              </label>
              {canUseTeamGroups ? (
                <label className="text-sm text-slate-500">
                  <span className="sr-only">按分组筛选</span>
                  <select
                    className="w-full min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    value={teamGroupFilter}
                    onChange={(event) => setTeamGroupFilter(event.target.value)}
                  >
                    <option value="全部">全部分组</option>
                    <option value="未分组">未分组</option>
                    {teamGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>

          <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {[
              { key: "team", label: "团队账号", count: visibleCoreTeamMembers.length },
              ...(canViewExpertAccounts
                ? [{ key: "experts", label: "评审专家", count: visibleExpertAccountMembers.length }]
                : []),
            ].map((item) => (
              <button
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  teamAccountView === item.key
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                key={item.key}
                onClick={() => setTeamAccountView(item.key as "team" | "experts")}
                type="button"
              >
                {item.label}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              当前共 {activeTeamMembers.length} 个账号
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-600">
              已筛选 {filteredTeamMembers.length} 个结果
            </span>
            {pendingApprovalMembers.length > 0 ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                待审核 {pendingApprovalMembers.length} 个
              </span>
            ) : null}
            {canUseTeamGroups && teamGroupFilter !== "全部" ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                分组：{teamGroupFilter === "未分组"
                  ? "未分组"
                  : teamGroups.find((group) => group.id === teamGroupFilter)?.name ?? "已筛选"}
              </span>
            ) : null}
          </div>
        </div>

        <div className={`hidden ${teamListGridClassName} gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium tracking-[0.06em] text-slate-400 lg:grid`}>
          <span>账号信息</span>
          <span>角色</span>
          {canUseTeamGroups ? <span>分组</span> : null}
          <span>状态</span>
          {showTeamActions ? <span className="text-right">操作</span> : null}
        </div>

        {filteredTeamMembers.length > 0 ? (
          filteredTeamMembers.map((member) => {
            const editable = canManageMember(member);
            const roleDisabled = !editable || member.systemRole === "系统管理员";

            return (
              <article
                key={member.id}
                className="border-b border-slate-200 px-5 py-4 last:border-b-0"
              >
                <div className={`grid gap-4 ${teamListGridClassName} lg:items-center`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      avatar={member.avatar}
                      avatarUrl={member.avatarUrl}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
                      name={member.name}
                      textClassName="text-sm font-semibold text-white"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-900">{member.name}</h3>
                        {member.systemRole === "系统管理员" ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                            最高权限
                          </span>
                        ) : member.systemRole === "评审专家" ? (
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600">
                            评审专家
                          </span>
                        ) : null}
                      </div>
                      {!member.accountHidden ? (
                        <p className="mt-1 truncate text-sm text-slate-500">账号：{member.account}</p>
                      ) : member.teamGroupName ? (
                        <p className="mt-1 truncate text-sm text-slate-500">团队：{member.teamGroupName}</p>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-slate-400 lg:hidden">角色</p>
                    {permissions.canManageTeam && !roleDisabled ? (
                      <select
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        value={member.systemRole}
                        onChange={(event) => confirmUpdateMemberRole(member, event.target.value as TeamRoleLabel)}
                      >
                        {availableRoleOptions.map((roleOption) => (
                          <option key={roleOption} value={roleOption}>
                            {roleOption}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {member.systemRole}
                      </span>
                    )}
                  </div>

                  {canUseTeamGroups ? (
                    <div>
                      <p className="mb-2 text-xs text-slate-400 lg:hidden">分组</p>
                      <select
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        disabled={member.systemRole === "系统管理员"}
                        value={member.teamGroupId ?? ""}
                        onChange={(event) => confirmUpdateMemberGroup(member, event.target.value)}
                      >
                        <option value="">未分组</option>
                        {teamGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-xs text-slate-400 lg:hidden">状态</p>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        member.systemRole === "系统管理员"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {member.systemRole === "系统管理员" ? "系统保留账号" : "已启用"}
                    </span>
                  </div>

                  {showTeamActions ? (
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {canSendDirectiveToMember(member) ? (
                        <ActionButton onClick={() => openReminderModal(member)}>
                          发送提醒
                        </ActionButton>
                      ) : null}
                      {permissions.canResetPassword ? (
                        <ActionButton
                          disabled={!canResetMemberPassword(member)}
                          onClick={() => openPasswordModal(member)}
                          title="无权限"
                        >
                          重置密码
                        </ActionButton>
                      ) : null}
                      {permissions.canManageTeam ? (
                        <ActionButton
                          disabled={!editable || member.systemRole === "系统管理员"}
                          onClick={() => removeMember(member.id, member.name)}
                          title="无权限"
                          variant="danger"
                        >
                          删除账号
                        </ActionButton>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <div className="px-5 py-8">
            <EmptyState
              description="当前筛选条件下没有匹配账号，可以调整角色筛选或搜索关键词。"
              icon={Users}
              title="暂无匹配账号"
            />
          </div>
        )}
      </section>
    </div>
  );

  const renderProfile = () => {
    if (!currentUser) {
      return null;
    }

    return (
      <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="这里仅显示你自己的账号资料，可按需维护头像、姓名、联系邮箱和登录密码。"
          title="个人信息"
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <article className={surfaceCardClassName}>
          <div className="flex flex-col items-center text-center">
            <UserAvatar
              avatar={currentUser.profile.avatar}
              avatarUrl={currentUser.profile.avatarUrl}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-2xl font-semibold text-white"
              name={currentUser.profile.name}
              textClassName="text-2xl font-semibold text-white"
            />
            <h3 className="mt-4 text-xl font-semibold text-slate-900">{currentUser.profile.name}</h3>
            <p className="mt-2 rounded-md bg-blue-50 px-3 py-1 text-sm text-blue-600">
              {roleLabels[currentRole]}
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs text-slate-400">个人头像</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                支持 JPG、PNG、WEBP，单张图片不超过 2MB。上传后会同步显示在顶部栏和团队管理中。
              </p>
              <input
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(event) => void uploadProfileAvatar(event.target.files?.[0] ?? null)}
                ref={avatarInputRef}
                type="file"
              />
              <div className="mt-4">
                <ActionButton
                  disabled={isAvatarUploading}
                  loading={isAvatarUploading}
                  loadingLabel="上传中..."
                  onClick={() => avatarInputRef.current?.click()}
                  variant="primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    <span>上传头像</span>
                  </span>
                </ActionButton>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">账号名</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{currentUser.username}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">账号角色</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{currentUser.roleLabel}</p>
            </div>
            {currentUser.role !== "admin" && currentUser.role !== "expert" ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-400">当前队伍</p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {currentUser.teamGroupName ?? "暂未分组"}
                </p>
              </div>
            ) : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">账号状态</p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                {currentUser.approvalStatusLabel ?? "已通过"}
              </p>
            </div>
          </div>
        </article>

        <article className={surfaceCardClassName}>
          {requiresEmailCompletion ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              请先补充联系邮箱。系统会通过邮箱发送任务、公告和日程汇报提醒。
            </div>
          ) : null}

          {profileMessage ? (
            <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {profileMessage}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-500">
              姓名
              <input
                className={fieldClassName}
                value={profileDraft.name}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, name: event.target.value }));
                  setProfileMessage(null);
                }}
              />
            </label>
            <label className="block text-sm text-slate-500">
              联系邮箱 <span className="text-red-500">*</span>
              <input
                className={fieldClassName}
                placeholder="必填，用于接收任务和日程提醒"
                type="email"
                value={profileDraft.email}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, email: event.target.value }));
                  setProfileMessage(null);
                }}
              />
              <span className="mt-1.5 block text-xs leading-5 text-slate-400">{EMAIL_RULE_HINT}</span>
            </label>
          </div>

          <label className="mt-4 block text-sm text-slate-500">
            新密码
            <input
              className={fieldClassName}
              placeholder="如不修改可留空"
              type="password"
              value={profileDraft.password}
              onChange={(event) => {
                setProfileDraft((current) => ({ ...current, password: event.target.value }));
                setProfileMessage(null);
              }}
            />
          </label>

          <ModalActions>
            <ActionButton
              disabled={isSaving}
              onClick={() => {
                setProfileDraft(defaultProfileDraft(currentUser));
                setProfileMessage(null);
              }}
            >
              重置
            </ActionButton>
            <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveProfile} variant="primary">
              保存个人信息
            </ActionButton>
          </ModalActions>
        </article>
      </section>
      </div>
    );
  };

  const renderContent = () => {
    switch (safeActiveTab) {
      case "overview":
        return renderOverview();
      case "timeline":
        return renderTimeline();
      case "board":
        return renderBoard();
      case "training":
        return renderTraining();
      case "reports":
        return renderReports();
      case "experts":
        return renderExperts();
      case "review":
        return renderReview();
      case "documents":
        return renderDocuments();
      case "team":
        return renderTeam();
      case "profile":
        return renderProfile();
      default:
        return renderOverview();
    }
  };

  if (isBooting) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.08),_transparent_45%)]" />
        <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white/95 px-6 py-7 shadow-sm backdrop-blur sm:px-8 sm:py-8">
          <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium tracking-[0.08em] text-blue-600">
            中国国际大学生创新大赛管理系统
          </div>
          <div className="mt-5 flex items-start gap-4">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <span className="absolute inset-0 rounded-2xl border border-blue-100 animate-pulse" />
              <Loader2 className="relative h-6 w-6 animate-spin" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-semibold tracking-[-0.02em] text-slate-900">正在进入管理中心</p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                正在同步角色权限、任务概览和最近通知，马上就好。
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((item) => (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                key={item}
              >
                <div className="h-2.5 w-16 rounded-full bg-slate-200 animate-pulse" />
                <div className="mt-3 h-3 rounded-full bg-slate-200/80 animate-pulse" />
                <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-200/70 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            <span>正在加载工作台数据...</span>
          </div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">登录状态已失效，正在返回登录页...</p>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 xl:flex-row">
          {mobileSidebarOpen ? (
            <div
              className="fixed inset-0 z-40 bg-slate-950/40 xl:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          ) : null}

          <aside className="hidden xl:block xl:w-[280px] xl:flex-none">
            <div className="rounded-xl bg-[#0B3B8A] px-5 py-6 text-white shadow-sm xl:sticky xl:top-4 xl:flex xl:h-[calc(100vh-2rem)] xl:flex-col">
              <div className="border-b border-white/15 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
                    <Image alt="南铁校徽" className="h-9 w-auto object-contain" height={77} src="/official-logo.png" width={430} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-base font-semibold tracking-[0.02em] text-white">管理中心</h1>
                    <p className="mt-1 text-[11px] tracking-[0.12em] text-white/70">南京铁道职业技术学院</p>
                  </div>
                </div>
              </div>

              <nav className="mt-5 space-y-1.5">
                {sidebarTabs.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === safeActiveTab;
                  const href =
                    item.key === "overview" ? "/workspace" : `/workspace?tab=${item.key}`;

                  return (
                    <Link
                      key={item.key}
                      className={`relative flex items-center gap-3 rounded-lg px-4 py-3 text-sm no-underline transition ${
                        isActive
                          ? "bg-blue-800 text-white shadow-sm"
                          : "text-white/80 hover:bg-white/8 hover:text-white"
                      }`}
                      href={href}
                    >
                      {isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-white" /> : null}
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto border-t border-white/10 pt-4">
                <div className="flex items-center gap-3">
                <UserAvatar
                  avatar={currentUser.profile.avatar}
                  avatarUrl={currentUser.profile.avatarUrl}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
                  name={currentUser.profile.name}
                  textClassName="text-sm font-semibold text-white"
                />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{currentUser.profile.name}</p>
                    <p className="mt-1 text-xs text-white/60">{roleLabels[currentRole]}</p>
                    {currentUser.teamGroupName ? (
                      <p className="mt-1 truncate text-xs text-white/50">{currentUser.teamGroupName}</p>
                    ) : null}
                  </div>
                </div>
                <button
                  className="mt-4 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  <span>退出</span>
                </button>
              </div>
            </div>
          </aside>

          <aside
            className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-[#0B3B8A] px-5 py-6 text-white shadow-xl transition-transform duration-200 xl:hidden ${
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-white/15 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
                    <Image alt="南铁校徽" className="h-8 w-auto object-contain" height={77} src="/official-logo.png" width={430} />
                  </div>
                  <div>
                    <h1 className="text-base font-semibold tracking-[0.02em] text-white">管理中心</h1>
                    <p className="mt-1 text-[11px] tracking-[0.12em] text-white/70">南京铁道职业技术学院</p>
                  </div>
                </div>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/80"
                  onClick={() => setMobileSidebarOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="mt-5 space-y-1.5">
                {sidebarTabs.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === safeActiveTab;
                  const href =
                    item.key === "overview" ? "/workspace" : `/workspace?tab=${item.key}`;

                  return (
                    <Link
                      key={`mobile-${item.key}`}
                      className={`relative flex items-center gap-3 rounded-lg px-4 py-3 text-sm no-underline transition ${
                        isActive
                          ? "bg-blue-800 text-white shadow-sm"
                          : "text-white/80 hover:bg-white/8 hover:text-white"
                      }`}
                      href={href}
                      onClick={() => setMobileSidebarOpen(false)}
                    >
                      {isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-white" /> : null}
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto border-t border-white/10 pt-4">
                <div className="flex items-center gap-3">
                <UserAvatar
                  avatar={currentUser.profile.avatar}
                  avatarUrl={currentUser.profile.avatarUrl}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
                  name={currentUser.profile.name}
                  textClassName="text-sm font-semibold text-white"
                />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{currentUser.profile.name}</p>
                    <p className="mt-1 text-xs text-white/60">{roleLabels[currentRole]}</p>
                    {currentUser.teamGroupName ? (
                      <p className="mt-1 truncate text-xs text-white/50">{currentUser.teamGroupName}</p>
                    ) : null}
                  </div>
                </div>
                <button
                  className="mt-4 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  <span>退出</span>
                </button>
              </div>
            </div>
          </aside>

          <section className="min-w-0 flex-1">
            <header className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
              <div className="mx-auto flex max-w-[1200px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-h-10 items-center gap-3">
                  <button
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm xl:hidden"
                    onClick={() => setMobileSidebarOpen(true)}
                    type="button"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  <p className="text-lg font-semibold text-slate-900">{activeTabItem.label}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="relative inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-600 shadow-sm hover:bg-slate-50"
                    onClick={() => setNotificationsOpen(true)}
                    type="button"
                  >
                    <BellPlus className="h-4 w-4" />
                    <span className="text-sm font-medium">待办</span>
                    {todoItemCount > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-[10px] font-semibold text-white">
                        {todoItemCount}
                      </span>
                    ) : null}
                  </button>
                  <button
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-slate-50"
                    onClick={openProfilePage}
                    type="button"
                  >
                    <UserAvatar
                      avatar={currentUser.profile.avatar}
                      avatarUrl={currentUser.profile.avatarUrl}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563eb] text-sm font-semibold text-white"
                      name={currentUser.profile.name}
                      textClassName="text-sm font-semibold text-white"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{currentUser.profile.name}</p>
                        <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs text-blue-600">
                          {roleLabels[currentRole]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">点击查看个人信息</p>
                      {currentUser.teamGroupName ? (
                        <p className="mt-1 text-xs text-slate-500">当前队伍：{currentUser.teamGroupName}</p>
                      ) : null}
                    </div>
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 no-underline shadow-sm hover:bg-slate-50"
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
            </header>

            <div className="mx-auto mt-4 flex max-w-[1200px] flex-col gap-4">
              {loadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                  {loadError}
                </div>
              ) : null}
              {renderContent()}
            </div>
          </section>
        </div>
      </main>

      <SuccessToast toast={successToast} />

      {questionImportModalOpen ? (
        <Modal
          onClose={() => setQuestionImportModalOpen(false)}
          panelClassName="max-w-[min(92vw,980px)]"
          title="导入 Q&A 题库"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-7 text-blue-700">
              上传文档后会先自动识别问题和回答要点，导入前可以逐条校对、修改和取消选择。支持 PDF、Word(.docx)、
              txt / md / csv / json；旧版 .doc 请另存为 .docx 后导入，单文件最大 4MB。
            </div>
            <label className="block text-sm text-slate-500">
              选择题库文档
              <input
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.json"
                className={fieldClassName}
                type="file"
                onChange={(event) => void handleQuestionImportFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {questionImportFileName ? (
              <p className="text-sm text-slate-500">当前文件：{questionImportFileName}</p>
            ) : null}
            {questionImportError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {questionImportError}
              </div>
            ) : null}

            {questionImportRows.length > 0 ? (
              <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {questionImportRows.map((row, index) => (
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={row.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          checked={row.selected}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          onChange={(event) => updateQuestionImportRow(row.id, { selected: event.target.checked })}
                          type="checkbox"
                        />
                        导入第 {index + 1} 题
                      </label>
                      <button
                        className="text-sm text-red-500 transition hover:text-red-600"
                        onClick={() => setQuestionImportRows((current) => current.filter((item) => item.id !== row.id))}
                        type="button"
                      >
                        移除
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                      <label className="text-sm text-slate-500">
                        分类
                        <select
                          className={fieldClassName}
                          value={row.category}
                          onChange={(event) => updateQuestionImportRow(row.id, { category: event.target.value })}
                        >
                          {trainingQuestionCategories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.category === "其他" ? (
                        <label className="text-sm text-slate-500">
                          自定义分类
                          <input
                            className={fieldClassName}
                            placeholder="例如：政策合规、临场追问"
                            value={row.customCategory}
                            onChange={(event) => updateQuestionImportRow(row.id, { customCategory: event.target.value })}
                          />
                        </label>
                      ) : null}
                      <label className={`text-sm text-slate-500 ${row.category === "其他" ? "md:col-span-2" : ""}`}>
                        问题
                        <textarea
                          className={`${textareaClassName} min-h-24`}
                          value={row.question}
                          onChange={(event) => updateQuestionImportRow(row.id, { question: event.target.value })}
                        />
                      </label>
                    </div>
                    <label className="mt-3 block text-sm text-slate-500">
                      标准回答要点
                      <textarea
                        className={`${textareaClassName} min-h-24`}
                        value={row.answerPoints}
                        onChange={(event) => updateQuestionImportRow(row.id, { answerPoints: event.target.value })}
                      />
                    </label>
                  </article>
                ))}
              </div>
            ) : null}

            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setQuestionImportModalOpen(false)}>
                取消
              </ActionButton>
              <ActionButton
                disabled={isSaving || questionImportRows.length === 0}
                loading={isSaving}
                loadingLabel="导入中..."
                onClick={() => void importTrainingQuestions()}
                variant="primary"
              >
                确认导入
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {taskModalOpen ? (
        <Modal title={editingTaskId ? "编辑工单" : "发布工单"} onClose={() => setTaskModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              工单标题
              <input
                className={fieldClassName}
                value={taskDraft.title}
                onChange={(event) =>
                  setTaskDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              处理人
              <select
                className={fieldClassName}
                value={taskDraft.assigneeId}
                onChange={(event) =>
                  setTaskDraft((current) => ({ ...current, assigneeId: event.target.value }))
                }
              >
                {currentRole !== "member" ? <option value="">暂不分配，进入待分配</option> : null}
                {taskAssignableMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            {!editingTaskId && !taskDraft.assigneeId ? (
              currentRole === "admin" ? (
                <label className="block text-sm text-slate-500">
                  所属队伍 <span className="text-red-500">*</span>
                  <select
                    className={fieldClassName}
                    value={taskDraft.teamGroupId}
                    onChange={(event) =>
                      setTaskDraft((current) => ({ ...current, teamGroupId: event.target.value }))
                    }
                  >
                    <option value="">请选择待分配工单所属队伍</option>
                    {teamGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
                  暂不分配时，工单会进入当前队伍
                  {currentUser?.teamGroupName ? `「${currentUser.teamGroupName}」` : ""}
                  的待分配列表，并提醒项目负责人处理。
                </p>
              )
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                截止时间
                <input
                  className={fieldClassName}
                  type="datetime-local"
                  value={taskDraft.dueDate}
                  onChange={(event) =>
                    setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-500">
                优先级
                <select
                  className={fieldClassName}
                  value={taskDraft.priority}
                  onChange={(event) =>
                    setTaskDraft((current) => ({
                      ...current,
                      priority: event.target.value as TaskDraft["priority"],
                    }))
                  }
                >
                  <option value="高优先级">高优先级</option>
                  <option value="中优先级">中优先级</option>
                  <option value="低优先级">低优先级</option>
                </select>
              </label>
            </div>
            {!editingTaskId ? (
              <label className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-600">
                <input
                  checked={taskDraft.notifyAssignee}
                  className="mt-1 h-4 w-4 rounded border-blue-200 text-blue-600"
                  onChange={(event) =>
                    setTaskDraft((current) => ({ ...current, notifyAssignee: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>
                  <span className="font-medium text-slate-900">创建后发送提醒</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    已分配时提醒处理人；暂不分配时提醒本队项目负责人来分配。
                  </span>
                </span>
              </label>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setTaskModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveTask} variant="primary">
                保存工单
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {taskCompletionModalOpen && taskCompletionTarget ? (
        <Modal title="提交工单验收" onClose={closeTaskCompletionModal}>
          <div className="space-y-4">
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
              完成后需要上传至少一份佐证附件，提交后会推送给验收人确认闭环。
            </p>
            <label className="block text-sm text-slate-500">
              完成说明
              <textarea
                className={textareaClassName}
                placeholder="简要说明完成情况、关键结果或需要验收人注意的点"
                value={taskCompletionDraft.note}
                onChange={(event) =>
                  setTaskCompletionDraft((current) => ({ ...current, note: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              完成凭证
              <input
                accept={documentAcceptAttribute}
                className={fieldClassName}
                onChange={(event) =>
                  setTaskCompletionDraft((current) => ({
                    ...current,
                    file: event.target.files?.[0] ?? null,
                  }))
                }
                type="file"
              />
              <span className="mt-1.5 block text-xs leading-5 text-slate-400">
                支持 PDF、Word、Excel、图片、txt，单文件最大 20MB。
              </span>
            </label>
            {taskCompletionTarget.attachments && taskCompletionTarget.attachments.length > 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                已有凭证：{taskCompletionTarget.attachments.map((item) => item.fileName).join("、")}
              </div>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeTaskCompletionModal}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="提交中..." onClick={submitTaskForReview} variant="primary">
                提交验收
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {taskRejectModalOpen && taskRejectTarget ? (
        <Modal title="驳回工单" onClose={closeTaskRejectModal}>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-slate-500">
              驳回后工单会回到“处理中”，并提醒处理人继续完善。
            </p>
            <label className="block text-sm text-slate-500">
              驳回原因
              <textarea
                className={textareaClassName}
                placeholder="请写清需要补充或重做的内容"
                value={taskRejectReason}
                onChange={(event) => setTaskRejectReason(event.target.value)}
              />
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeTaskRejectModal}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="提交中..." onClick={rejectTaskForRework} variant="danger">
                确认驳回
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reportModalOpen ? (
        <Modal title={editingReportDate ? "修改日程汇报" : "提交日程汇报"} onClose={closeReportModal}>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-slate-500">
              提交日期：{formatShortDate(editingReportDate || selectedDate)} · 提交人：{currentUser.profile.name}
            </p>
            <label className="block text-sm text-slate-500">
              今日完成
              <textarea
                className={textareaClassName}
                value={reportDraft.summary}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              明日计划
              <textarea
                className={textareaClassName}
                value={reportDraft.nextPlan}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, nextPlan: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              附件
              <input
                className={fieldClassName}
                placeholder="例如：日报截图.png / 无"
                value={reportDraft.attachment}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, attachment: event.target.value }))
                }
              />
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeReportModal}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="提交中..." onClick={saveReport} variant="primary">
                {editingReportDate ? "保存修改" : "保存汇报"}
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {announcementModalOpen ? (
        <Modal title="发布公告" onClose={() => setAnnouncementModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              公告标题
              <input
                className={fieldClassName}
                value={announcementDraft.title}
                onChange={(event) =>
                  setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              公告内容
              <textarea
                className={`${textareaClassName} min-h-32`}
                value={announcementDraft.detail}
                onChange={(event) =>
                  setAnnouncementDraft((current) => ({ ...current, detail: event.target.value }))
                }
              />
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-600">
              <input
                checked={announcementDraft.notifyTeam}
                className="mt-1 h-4 w-4 rounded border-blue-200 text-blue-600"
                onChange={(event) =>
                  setAnnouncementDraft((current) => ({ ...current, notifyTeam: event.target.checked }))
                }
                type="checkbox"
              />
              <span>
                <span className="font-medium text-slate-900">发布后同步提醒团队</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  勾选后会给相关团队账号发送站内提醒，避免公告被漏看。
                </span>
              </span>
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setAnnouncementModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="发布中..." onClick={publishAnnouncement} variant="primary">
                发布公告
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {eventModalOpen ? (
        <Modal title={editingEventId ? "编辑时间节点" : "新增时间节点"} onClose={() => setEventModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              节点标题
              <input
                className={fieldClassName}
                value={eventDraft.title}
                onChange={(event) => setEventDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                时间
                <input
                  className={fieldClassName}
                  type="datetime-local"
                  value={eventDraft.dateTime}
                  onChange={(event) =>
                    setEventDraft((current) => ({ ...current, dateTime: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-500">
                节点类型
                <input
                  className={fieldClassName}
                  value={eventDraft.type}
                  onChange={(event) => setEventDraft((current) => ({ ...current, type: event.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              节点说明
              <textarea
                className={textareaClassName}
                value={eventDraft.description}
                onChange={(event) =>
                  setEventDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setEventModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveEvent} variant="primary">
                保存节点
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {expertModalOpen ? (
        <Modal
          title="上传专家意见"
          onClose={() => {
            setExpertModalOpen(false);
            setExpertDraft(defaultExpertDraft);
            setExpertFiles([]);
            setExpertDraftErrors(defaultExpertDraftErrors());
          }}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
              <p className="font-medium text-slate-700">带 <span className="text-red-500">*</span> 的项目为必填项</p>
              <p className="mt-1">如提交失败，会在对应字段下方直接说明原因。</p>
            </div>
            {expertDraftErrors.submit ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {expertDraftErrors.submit}
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                日期 <span className="text-red-500">*</span>
                <input
                  className={expertDraftErrors.date ? fieldErrorClassName : fieldClassName}
                  type="date"
                  value={expertDraft.date}
                  onChange={(event) => {
                    setExpertDraft((current) => ({ ...current, date: event.target.value }));
                    setExpertDraftErrors((current) => ({
                      ...current,
                      date: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {expertDraftErrors.date ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.date}</p> : null}
              </label>
              <label className="block text-sm text-slate-500">
                形式 <span className="text-red-500">*</span>
                <input
                  className={expertDraftErrors.format ? fieldErrorClassName : fieldClassName}
                  value={expertDraft.format}
                  onChange={(event) => {
                    setExpertDraft((current) => ({ ...current, format: event.target.value }));
                    setExpertDraftErrors((current) => ({
                      ...current,
                      format: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {expertDraftErrors.format ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.format}</p> : null}
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                专家姓名 <span className="text-red-500">*</span>
                <input
                  className={expertDraftErrors.expert ? fieldErrorClassName : fieldClassName}
                  value={expertDraft.expert}
                  onChange={(event) => {
                    setExpertDraft((current) => ({ ...current, expert: event.target.value }));
                    setExpertDraftErrors((current) => ({
                      ...current,
                      expert: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {expertDraftErrors.expert ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.expert}</p> : null}
              </label>
              <label className="block text-sm text-slate-500">
                主题 <span className="text-red-500">*</span>
                <input
                  className={expertDraftErrors.topic ? fieldErrorClassName : fieldClassName}
                  value={expertDraft.topic}
                  onChange={(event) => {
                    setExpertDraft((current) => ({ ...current, topic: event.target.value }));
                    setExpertDraftErrors((current) => ({
                      ...current,
                      topic: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {expertDraftErrors.topic ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.topic}</p> : null}
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              反馈摘要 <span className="text-red-500">*</span>
              <textarea
                className={`${expertDraftErrors.summary ? fieldErrorClassName : fieldClassName} min-h-28`}
                value={expertDraft.summary}
                onChange={(event) => {
                  setExpertDraft((current) => ({ ...current, summary: event.target.value }));
                  setExpertDraftErrors((current) => ({
                    ...current,
                    summary: undefined,
                    submit: undefined,
                  }));
                }}
              />
              {expertDraftErrors.summary ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.summary}</p> : null}
            </label>
            <label className="block text-sm text-slate-500">
              后续动作 <span className="text-red-500">*</span>
              <textarea
                className={`${expertDraftErrors.nextAction ? fieldErrorClassName : fieldClassName} min-h-28`}
                value={expertDraft.nextAction}
                onChange={(event) => {
                  setExpertDraft((current) => ({ ...current, nextAction: event.target.value }));
                  setExpertDraftErrors((current) => ({
                    ...current,
                    nextAction: undefined,
                    submit: undefined,
                  }));
                }}
              />
              {expertDraftErrors.nextAction ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.nextAction}</p> : null}
            </label>
            <label className="block text-sm text-slate-500">
              上传附件
              <input
                accept={documentAcceptAttribute}
                className={`${fieldClassName} block min-h-11`}
                multiple
                type="file"
                onChange={(event) => {
                  const nextFiles = Array.from(event.target.files ?? []);
                  for (const file of nextFiles) {
                    const validationError = validateClientFile(file);
                    if (validationError) {
                      setExpertDraftErrors((current) => ({
                        ...current,
                        attachments: validationError,
                        submit: undefined,
                      }));
                      event.target.value = "";
                      setExpertFiles([]);
                      return;
                    }
                  }
                  setExpertFiles(nextFiles);
                  setExpertDraftErrors((current) => ({
                    ...current,
                    attachments: undefined,
                    submit: undefined,
                  }));
                }}
              />
              <p className="mt-1 text-xs leading-5 text-slate-400">附件选填，支持 Word / PDF / Excel / 图片。</p>
              {expertDraftErrors.attachments ? (
                <p className="mt-1 text-sm text-red-600">{expertDraftErrors.attachments}</p>
              ) : null}
            </label>
            {expertFiles.length > 0 ? (
              <div className={`${subtleCardClassName} space-y-2`}>
                <p className="text-sm text-slate-500">已选附件</p>
                {expertFiles.map((file) => (
                  <p key={`${file.name}-${file.size}`} className="text-sm text-slate-600">
                    {file.name}
                  </p>
                ))}
              </div>
            ) : null}
            <ModalActions>
              <ActionButton
                disabled={isSaving}
                onClick={() => {
                  setExpertModalOpen(false);
                  setExpertDraft(defaultExpertDraft);
                  setExpertFiles([]);
                }}
              >
                取消
              </ActionButton>
              <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveExpert} variant="primary">
                保存意见
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reviewAssignmentModalOpen ? (
        <Modal title="新建专家评审包" onClose={() => setReviewAssignmentModalOpen(false)}>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                评审专家
                <select
                  className={fieldClassName}
                  value={reviewAssignmentDraft.expertUserId}
                  onChange={(event) =>
                    setReviewAssignmentDraft((current) => ({
                      ...current,
                      expertUserId: event.target.value,
                    }))
                  }
                >
                  <option value="">请选择专家</option>
                  {expertMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-500">
                评审轮次
                <input
                  className={fieldClassName}
                  value={reviewAssignmentDraft.roundLabel}
                  onChange={(event) =>
                    setReviewAssignmentDraft((current) => ({
                      ...current,
                      roundLabel: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              评审对象 / 项目名称
              <input
                className={fieldClassName}
                value={reviewAssignmentDraft.targetName}
                onChange={(event) =>
                  setReviewAssignmentDraft((current) => ({
                    ...current,
                    targetName: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              任务说明
              <textarea
                className={`${textareaClassName} min-h-28`}
                value={reviewAssignmentDraft.overview}
                onChange={(event) =>
                  setReviewAssignmentDraft((current) => ({
                    ...current,
                    overview: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              截止时间
              <input
                className={fieldClassName}
                type="datetime-local"
                value={reviewAssignmentDraft.deadline}
                onChange={(event) =>
                  setReviewAssignmentDraft((current) => ({
                    ...current,
                    deadline: event.target.value,
                  }))
                }
              />
            </label>
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              评审包创建后，可在卡片里分别上传计划书、路演材料和视频，和主文档中心完全分离。
            </p>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setReviewAssignmentModalOpen(false)}>
                取消
              </ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel="保存中..."
                onClick={saveReviewAssignment}
                variant="primary"
              >
                保存评审包
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reviewMaterialModalOpen ? (
        <Modal title={`上传${expertReviewMaterialLabels[reviewMaterialDraft.kind]}`} onClose={() => setReviewMaterialModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              材料名称
              <input
                className={fieldClassName}
                value={reviewMaterialDraft.name}
                onChange={(event) =>
                  setReviewMaterialDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              选择文件
              <input
                accept={expertReviewAcceptAttributes[reviewMaterialDraft.kind]}
                className={`${fieldClassName} block`}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setReviewMaterialDraft((current) => ({ ...current, file }));
                }}
              />
            </label>
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              {reviewMaterialDraft.kind === "plan"
                ? "计划书仅支持 PDF 导出版，确保评委端在线预览稳定。"
                : reviewMaterialDraft.kind === "ppt"
                  ? "路演材料仅支持 PDF 导出版，确保评委端在线预览稳定。"
                  : "视频支持 .mp4 / .mov / .avi"}，单文件最大 30MB。
            </p>
            {reviewMaterialUploadProgress !== null ? (
              <div className={`${subtleCardClassName} space-y-3`}>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>当前上传进度</span>
                  <span className="font-medium text-slate-700">{reviewMaterialUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${reviewMaterialUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setReviewMaterialModalOpen(false)}>
                取消
              </ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel={reviewMaterialSavingLabel}
                onClick={() => void saveReviewMaterial()}
                variant="primary"
              >
                保存材料
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {notificationsOpen ? (
        <Modal
          onClose={() => setNotificationsOpen(false)}
          panelClassName="max-w-[min(92vw,860px)]"
          title="今日待办"
        >
          <div className="space-y-5">
            <div className={`${subtleCardClassName} flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {currentUser.profile.name}，今天先把最关键的几件事推进掉。
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  你可以把当前待办先标记为已读，未读提醒点开后也不会重复弹出。
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">
                <BellPlus className="h-3.5 w-3.5 text-blue-600" />
                <span>当前共 {todoItemCount} 项待处理</span>
              </div>
            </div>

            {visibleRoleTodoItems.length > 0 ? (
              <section className="space-y-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">角色待办</p>
                  <p className="mt-1 text-sm text-slate-400">先点已读收起也可以，需要时再从待办入口打开。</p>
                </div>
                <div className="space-y-3">
                  {visibleRoleTodoItems.map((item) => (
                    <div
                      className={`rounded-xl border px-4 py-4 shadow-sm ${
                        item.priority === "danger"
                          ? "border-red-200 bg-red-50/70"
                          : item.priority === "warning"
                            ? "border-amber-200 bg-amber-50/70"
                            : "border-slate-200 bg-white"
                      }`}
                      key={item.id}
                    >
                      <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            {item.priority === "danger" ? (
                              <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                                紧急
                              </span>
                            ) : item.priority === "warning" ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                                待处理
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <ActionButton onClick={() => dismissTodoItem(item.id)}>
                            已读
                          </ActionButton>
                          <ActionButton onClick={() => void openTodoItem(item)} variant="primary">
                            {item.actionLabel}
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {todoNotifications.length > 0 ? (
              <section className="space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">未读提醒</p>
                    <p className="mt-1 text-sm text-slate-400">这些提醒处理后会自动标记，不会反复打扰。</p>
                  </div>
                  <button
                    className="text-sm font-medium text-blue-600"
                    onClick={() => void markAllNotificationsAsRead()}
                    type="button"
                  >
                    全部已读
                  </button>
                </div>
                <div className="space-y-3">
                  {todoNotifications.map((item) => (
                    <button
                      className="w-full rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-4 text-left shadow-sm transition hover:bg-blue-50"
                      key={item.id}
                      onClick={() => void openTodoItem(item)}
                      type="button"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                        </div>
                        <div className="flex items-center gap-3 md:pl-4">
                          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                          <span className="text-sm font-medium text-blue-600">{item.actionLabel}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {todoItemCount === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200">
                <EmptyState
                  description="当前没有需要你立刻处理的事项，今天的节奏已经很不错了。"
                  icon={BellPlus}
                  title="暂时没有新的待办"
                />
              </div>
            ) : null}

            <ModalActions>
              <ActionButton onClick={() => setNotificationsOpen(false)}>稍后处理</ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reminderModalOpen ? (
        <Modal onClose={closeReminderModal} title="发送站内提醒">
          <div className="space-y-4">
            <div className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              当前提醒对象：
              <span className="ml-1 font-medium text-slate-800">
                {reminderTargetMember?.name}（{reminderTargetMember?.systemRole}）
              </span>
            </div>

            <div>
              <label className="text-sm text-slate-500">
                提醒标题 <span className="text-red-500">*</span>
                <input
                  className={reminderDraftErrors.title ? fieldErrorClassName : fieldClassName}
                  placeholder="例如：请尽快补齐材料并同步结果"
                  type="text"
                  value={reminderDraft.title}
                  onChange={(event) =>
                    setReminderDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </label>
              {reminderDraftErrors.title ? (
                <p className="mt-1 text-xs text-red-500">{reminderDraftErrors.title}</p>
              ) : null}
            </div>

            <div>
              <label className="text-sm text-slate-500">
                跳转板块
                <select
                  className={fieldClassName}
                  value={reminderDraft.targetTab}
                  onChange={(event) =>
                    setReminderDraft((current) => ({ ...current, targetTab: event.target.value }))
                  }
                >
                  <option value="">仅提醒，不跳转</option>
                  {reminderTabOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label className="text-sm text-slate-500">
                提醒内容 <span className="text-red-500">*</span>
                <textarea
                  className={reminderDraftErrors.detail ? fieldErrorClassName : textareaClassName}
                  placeholder="请填写需要对方查看和执行的事项。"
                  value={reminderDraft.detail}
                  onChange={(event) =>
                    setReminderDraft((current) => ({ ...current, detail: event.target.value }))
                  }
                />
              </label>
              {reminderDraftErrors.detail ? (
                <p className="mt-1 text-xs text-red-500">{reminderDraftErrors.detail}</p>
              ) : null}
            </div>

            {reminderDraftErrors.submit ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {reminderDraftErrors.submit}
              </div>
            ) : null}

            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeReminderModal}>
                取消
              </ActionButton>
              <ActionButton loading={isSaving} loadingLabel="发送中..." onClick={saveReminder} variant="primary">
                发送提醒
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {emailSettingsModalOpen ? (
        <Modal
          onClose={() => setEmailSettingsModalOpen(false)}
          panelClassName="max-w-[min(92vw,760px)]"
          title="邮件提醒设置"
        >
          <div className="space-y-4">
            <div className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              该设置仅系统管理员可修改，保存后对全体成员生效；站内提醒不受影响。
            </div>

            {emailSettingsLoading ? (
              <div className={`${subtleCardClassName} flex items-center justify-center py-10 text-sm text-slate-500`}>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在加载邮件提醒设置...
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {emailReminderSettingItems.map((item) => (
                    <label
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/30"
                      key={item.key}
                    >
                      <input
                        checked={Boolean(emailSettingsDraft[item.key])}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        onChange={(event) =>
                          setEmailSettingsDraft((current) => ({
                            ...current,
                            [item.key]: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <label className="block rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  每日未提交汇报提醒时间
                  <select
                    className={fieldClassName}
                    value={emailSettingsDraft.dailyReportHour}
                    onChange={(event) =>
                      setEmailSettingsDraft((current) => ({
                        ...current,
                        dailyReportHour: Number(event.target.value),
                      }))
                    }
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {`${hour}`.padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs leading-5 text-slate-400">
                    系统会按小时检查，到达这里设置的整点才发送邮件。
                  </span>
                </label>
              </>
            )}

            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setEmailSettingsModalOpen(false)}>
                取消
              </ActionButton>
              <ActionButton
                disabled={emailSettingsLoading}
                loading={isSaving}
                loadingLabel="保存中..."
                onClick={() => void saveEmailSettings()}
                variant="primary"
              >
                保存设置
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {sentRemindersOpen ? (
        <Modal onClose={() => setSentRemindersOpen(false)} panelClassName="max-w-[min(92vw,860px)]" title="提醒记录">
          <div className="space-y-4">
            <div className={`${subtleCardClassName} flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
              <div>
                <p className="text-sm font-medium text-slate-900">这里会记录你发送给成员的站内提醒。</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">成员点开提醒或待办后，这里会更新为已读状态。</p>
              </div>
              <ActionButton disabled={sentRemindersLoading} onClick={() => void loadSentReminders()}>
                刷新记录
              </ActionButton>
            </div>

            {sentRemindersLoading ? (
              <div className={`${subtleCardClassName} flex items-center justify-center py-12 text-sm text-slate-500`}>
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在加载提醒记录...</span>
                </span>
              </div>
            ) : sentReminders.length > 0 ? (
              <div className="space-y-3">
                {sentReminders.map((item) => (
                  <article key={item.id} className={surfaceCardClassName}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.isRead ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {item.isRead ? "已读" : "未读"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                          <span>接收人：{item.recipient?.name ?? "成员"}</span>
                          <span>发送时间：{item.createdAt}</span>
                          {item.targetTab ? (
                            <span>
                              跳转板块：
                              {allTabs.find((tab) => tab.key === item.targetTab)?.label ?? item.targetTab}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                        <p className="font-medium text-slate-700">{item.isRead ? "对方已查看" : "等待查看"}</p>
                        <p className="mt-1">{item.readAt ? `已读时间：${item.readAt}` : "暂未打开此提醒"}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200">
                <EmptyState
                  description="你最近还没有发送新的站内提醒，后续发送后会在这里查看已读状态。"
                  icon={BellPlus}
                  title="暂无提醒记录"
                />
              </div>
            )}

            <ModalActions>
              <ActionButton onClick={() => setSentRemindersOpen(false)}>关闭</ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {previewAsset ? (
        <Modal
          bodyClassName="px-5 py-4 md:px-6 md:py-5"
          onClose={() => setPreviewAsset(null)}
          size="preview"
          title={previewAsset.title}
        >
          <div className="space-y-4">
            {previewAsset.mode === "download-fallback" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <div className="space-y-3">
                  <p className="text-base font-medium text-slate-900">
                    {previewAsset.fileName || "当前文件"}
                  </p>
                  <p className="text-sm leading-7 text-slate-500">
                    {previewAsset.fallbackMessage || "该文件类型暂不支持站内预览，请下载后使用本地软件查看。"}
                  </p>
                </div>
              </div>
            ) : previewAsset.mimeType?.startsWith("video/") ? (
              <video
                className="max-h-[78vh] w-full rounded-lg border border-slate-200 bg-black"
                controls
                playsInline
                src={previewAsset.url}
              />
            ) : isPdfAsset(previewAsset) ? (
              <PdfPreview url={previewAsset.url} />
            ) : isImageAsset(previewAsset) ? (
              <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={previewAsset.fileName || previewAsset.title}
                  className="block h-auto max-w-none rounded-md border border-slate-200 bg-white shadow-sm"
                  loading="eager"
                  src={previewAsset.url}
                />
              </div>
            ) : (
              <iframe
                className="h-[78vh] w-full rounded-lg border border-slate-200 bg-white"
                src={previewAsset.url}
                title={previewAsset.title}
              />
            )}
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              {previewAsset.mode === "download-fallback"
                ? "已为当前文件切换到下载查看模式。"
                : previewAsset.mimeType?.startsWith("video/")
                ? "视频材料支持在当前页面直接播放。"
                : isPdfAsset(previewAsset)
                  ? "PDF 使用站内渲染模式，避免浏览器原生预览层在后台页面残留。"
                  : isImageAsset(previewAsset)
                    ? "图片按原始清晰度显示，可在窗口内滚动查看细节。"
                    : isWordAsset(previewAsset)
                      ? "Word 文档已切换为站内只读预览；在线标注和协同修改需要后续接入文档协作服务。"
                      : "已切换为站内在线预览模式。"}
            </p>
            <ModalActions>
              {previewAsset.mode === "download-fallback" ? (
                <ActionButton
                  onClick={() => handleDownload(previewAsset.downloadUrl)}
                  variant="primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    <span>下载查看</span>
                  </span>
                </ActionButton>
              ) : null}
              <ActionButton onClick={() => setPreviewAsset(null)}>关闭</ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {documentModalOpen ? (
        <Modal title="上传文档" onClose={() => setDocumentModalOpen(false)}>
          <div className="space-y-4">
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              仅支持 `.doc`、`.docx`、`.pdf`、`.xls`、`.xlsx`、`.txt`、`.jpg`、`.jpeg`、`.png`、
              `.zip`、`.rar`、`.7z`，单文件最大 100MB；不支持视频和 PPT 源文件。若选择 “PPT” 分类，请上传导出版 PDF 或图片版本。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                文档名称
                <input
                  className={fieldClassName}
                  value={documentDraft.name}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-500">
                文档分类
                <select
                  className={fieldClassName}
                  value={documentDraft.category}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({
                      ...current,
                      category: event.target.value as DocumentDraft["category"],
                    }))
                  }
                >
                  {documentCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              版本说明
              <textarea
                className={`${textareaClassName} min-h-24`}
                value={documentDraft.note}
                onChange={(event) =>
                  setDocumentDraft((current) => ({ ...current, note: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              选择文件
              <input
                accept={documentCenterAcceptAttribute}
                className={`${fieldClassName} block`}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const validationError = validateClientFile(file, {
                    allowArchives: true,
                    maxSizeBytes: MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
                    maxSizeLabel: "100MB",
                  });
                  if (validationError && file) {
                    setLoadError(validationError);
                    event.target.value = "";
                    setDocumentDraft((current) => ({ ...current, file: null }));
                    return;
                  }
                  setDocumentDraft((current) => ({ ...current, file }));
                }}
              />
            </label>
            {documentUploadProgress !== null ? (
              <div className={`${subtleCardClassName} space-y-3`}>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>当前上传进度</span>
                  <span className="font-medium text-slate-700">{documentUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${documentUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setDocumentModalOpen(false)}>取消</ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel={documentSavingLabel}
                onClick={() => void saveDocument()}
                variant="primary"
              >
                上传文档
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {versionModalOpen ? (
        <Modal title="上传文档新版本" onClose={() => setVersionModalOpen(false)}>
          <div className="space-y-4">
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              仅支持 `.doc`、`.docx`、`.pdf`、`.xls`、`.xlsx`、`.txt`、`.jpg`、`.jpeg`、`.png`、
              `.zip`、`.rar`、`.7z`，单文件最大 100MB；不支持视频和 PPT 源文件。若选择 “PPT” 分类，请上传导出版 PDF 或图片版本。
            </p>
            <label className="block text-sm text-slate-500">
              版本说明
              <textarea
                className={`${textareaClassName} min-h-24`}
                value={versionUploadNote}
                onChange={(event) => setVersionUploadNote(event.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-500">
              选择文件
              <input
                accept={documentCenterAcceptAttribute}
                className={`${fieldClassName} block`}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const validationError = validateClientFile(file, {
                    allowArchives: true,
                    maxSizeBytes: MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
                    maxSizeLabel: "100MB",
                  });
                  if (validationError && file) {
                    setLoadError(validationError);
                    event.target.value = "";
                    setVersionUploadFile(null);
                    return;
                  }
                  setVersionUploadFile(file);
                }}
              />
            </label>
            {versionUploadProgress !== null ? (
              <div className={`${subtleCardClassName} space-y-3`}>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>当前上传进度</span>
                  <span className="font-medium text-slate-700">{versionUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${versionUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setVersionModalOpen(false)}>取消</ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel={versionSavingLabel}
                onClick={() => void uploadNewDocumentVersion()}
                variant="primary"
              >
                上传新版本
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reviewModalOpen && reviewAction ? (
        <Modal
          title={reviewActionTitles[reviewAction]}
          onClose={() => {
            setReviewModalOpen(false);
            setReviewTargetDocId(null);
            setReviewAction(null);
            setReviewComment("");
          }}
        >
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              审批批注
              <textarea
                className={textareaClassName}
                placeholder="请填写审批批注（可选）"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
              />
            </label>
            <ModalActions>
              <ActionButton
                disabled={isSaving}
                onClick={() => {
                  setReviewModalOpen(false);
                  setReviewTargetDocId(null);
                  setReviewAction(null);
                  setReviewComment("");
                }}
              >
                取消
              </ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel="提交中..."
                onClick={() => void reviewDocument()}
                variant={reviewAction === "leaderRevision" || reviewAction === "teacherRevision" ? "danger" : "primary"}
              >
                确认提交
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {teamModalOpen ? (
        <Modal title="创建账号" onClose={() => setTeamModalOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
              通过团队管理创建的直属账号会立即生效，无需再走待审核流程。
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                姓名 / 显示名
                <input
                  className={fieldClassName}
                  value={teamDraft.name}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="block text-sm text-slate-500">
                用户名
                <input
                  className={fieldClassName}
                  value={teamDraft.username}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, username: event.target.value }))}
                />
                <span className="mt-1 block text-xs leading-6 text-slate-400">{USERNAME_RULE_HINT}</span>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                邮箱
                <input
                  className={fieldClassName}
                  value={teamDraft.email}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="block text-sm text-slate-500">
                初始密码
                <input
                  className={fieldClassName}
                  value={teamDraft.password}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              角色
              <select
                className={fieldClassName}
                value={teamDraft.role}
                onChange={(event) =>
                  setTeamDraft((current) => ({
                    ...current,
                    role: event.target.value as TeamRoleLabel,
                    teamGroupId: event.target.value === "评审专家" ? "" : current.teamGroupId,
                  }))
                }
              >
                {availableRoleOptions.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleOption}
                  </option>
                ))}
              </select>
            </label>
            {currentRole === "admin" && teamDraft.role !== "评审专家" ? (
              <label className="block text-sm text-slate-500">
                分组（选填）
                <select
                  className={fieldClassName}
                  value={teamDraft.teamGroupId}
                  onChange={(event) =>
                    setTeamDraft((current) => ({ ...current, teamGroupId: event.target.value }))
                  }
                >
                  <option value="">暂不分组</option>
                  {teamGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setTeamModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveTeamMember} variant="primary">
                创建账号
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {batchExpertModalOpen ? (
        <Modal title="批量添加评审专家" onClose={() => setBatchExpertModalOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-500">
              每行填写一个专家账号，格式为：
              <span className="mx-1 font-medium text-slate-700">姓名，账号名，初始密码，邮箱</span>
              。初始密码和邮箱可不填，未填写密码时默认使用 123456。
            </div>
            <label className="block text-sm text-slate-500">
              专家账号数据
              <textarea
                className={`${textareaClassName} min-h-[180px] font-mono text-sm`}
                placeholder={"王老师,expertwang,123456,wang@example.com\n李老师,expertli,123456,li@example.com"}
                value={batchExpertDraft.rows}
                onChange={(event) => setBatchExpertDraft({ rows: event.target.value })}
              />
              <span className="mt-1 block text-xs leading-6 text-slate-400">
                账号名仅支持英文字母和数字，不允许中文；批量创建后账号会直接生效。
              </span>
            </label>
            <ModalActions>
              <ActionButton
                disabled={isSaving}
                onClick={() => {
                  setBatchExpertDraft(defaultBatchExpertDraft);
                  setBatchExpertModalOpen(false);
                }}
              >
                取消
              </ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel="创建中..."
                onClick={() => void saveBatchExperts()}
                variant="primary"
              >
                批量创建
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {passwordModalOpen ? (
        <Modal title="重置密码" onClose={() => setPasswordModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-slate-500">
              正在为 {passwordTargetMember?.name ?? "该成员"} 设置新密码。
            </p>
            <label className="block text-sm text-slate-500">
              新密码
              <input
                className={fieldClassName}
                type="password"
                value={passwordDraft}
                onChange={(event) => setPasswordDraft(event.target.value)}
              />
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setPasswordModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="提交中..." onClick={resetMemberPassword} variant="primary">
                确认重置
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        confirmLabel={confirmDialog?.confirmLabel ?? "确认"}
        confirmVariant={confirmDialog?.confirmVariant}
        isLoading={isSaving}
        message={confirmDialog?.message ?? ""}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => void handleConfirmDialog()}
        open={Boolean(confirmDialog?.open)}
        title={confirmDialog?.title ?? "确认操作"}
      />
    </>
  );
}
