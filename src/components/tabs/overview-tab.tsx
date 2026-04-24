"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Mail,
  Megaphone,
  UserPlus,
} from "lucide-react";

import type { BoardTask, EventItem, TeamGroupItem, TeamMember } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

const SCHOOL_NAME = "南京铁道职业技术学院";
const DAY_MS = 24 * 60 * 60 * 1000;

type MetricTone = "blue" | "amber" | "green" | "red";
type ProgressTone = "blue" | "amber" | "slate" | "green";
type UrgentTone = "danger" | "warning";
type OverviewTarget = Workspace.TabKey | "notifications";

type OverviewMetricCardItem = {
  label: string;
  value: number;
  unit: string;
  tone: MetricTone;
  icon: LucideIcon;
  onClick: () => void;
};

type ProgressPanelItem = {
  title: string;
  description: string;
  value: number;
  total: number;
  tone: ProgressTone;
  target: Workspace.TabKey;
};

type UrgentTaskItem = {
  id: string;
  title: string;
  owner: string;
  tone: UrgentTone;
  badgeText: string;
};

type ReportStatusItem = {
  id: string;
  name: string;
  submitted: boolean;
};

type AdminReportGroupStatus = "complete" | "partial" | "none";

type AdminReportGroupItem = {
  id: string;
  name: string;
  status: AdminReportGroupStatus;
  submittedCount: number;
  totalCount: number;
  members: ReportStatusItem[];
};

const metricToneMap: Record<
  MetricTone,
  {
    iconContainerClassName: string;
    iconClassName: string;
    activeValueClassName: string;
    watermarkClassName: string;
  }
> = {
  blue: {
    iconContainerClassName: "bg-blue-50",
    iconClassName: "text-blue-600",
    activeValueClassName: "text-blue-700",
    watermarkClassName: "text-blue-600",
  },
  amber: {
    iconContainerClassName: "bg-amber-50",
    iconClassName: "text-amber-600",
    activeValueClassName: "text-amber-700",
    watermarkClassName: "text-amber-600",
  },
  green: {
    iconContainerClassName: "bg-emerald-50",
    iconClassName: "text-emerald-600",
    activeValueClassName: "text-emerald-700",
    watermarkClassName: "text-emerald-600",
  },
  red: {
    iconContainerClassName: "bg-rose-50",
    iconClassName: "text-rose-600",
    activeValueClassName: "text-rose-700",
    watermarkClassName: "text-rose-600",
  },
};

const progressToneMap: Record<
  ProgressTone,
  {
    ringClassName: string;
    textClassName: string;
  }
> = {
  blue: {
    ringClassName: "text-[color:var(--color-primary)]",
    textClassName: "text-[color:var(--color-primary)]",
  },
  amber: {
    ringClassName: "text-[color:var(--color-primary)]",
    textClassName: "text-[color:var(--color-primary)]",
  },
  slate: {
    ringClassName: "text-[color:var(--color-primary)]",
    textClassName: "text-[color:var(--color-primary)]",
  },
  green: {
    ringClassName: "text-[color:var(--color-primary)]",
    textClassName: "text-[color:var(--color-primary)]",
  },
};

const urgentToneMap: Record<
  UrgentTone,
  {
    dotClassName: string;
    badgeClassName: string;
  }
> = {
  danger: {
    dotClassName: "bg-[var(--color-danger)]",
    badgeClassName: "bg-[var(--color-danger-soft)] text-[color:var(--color-danger)]",
  },
  warning: {
    dotClassName: "bg-[var(--color-warning)]",
    badgeClassName: "bg-[var(--color-warning-soft)] text-[color:var(--color-warning)]",
  },
};

const adminReportGroupStatusMap: Record<
  AdminReportGroupStatus,
  {
    dotClassName: string;
    rowClassName: string;
    label: string;
  }
> = {
  complete: {
    dotClassName: "bg-emerald-500",
    rowClassName: "hover:border-emerald-200 hover:bg-emerald-50/40",
    label: "全员提交",
  },
  partial: {
    dotClassName: "bg-amber-500",
    rowClassName: "hover:border-amber-200 hover:bg-amber-50/40",
    label: "部分提交",
  },
  none: {
    dotClassName: "bg-rose-500",
    rowClassName: "hover:border-rose-200 hover:bg-rose-50/40",
    label: "无人提交",
  },
};

const parseSafeDate = (value?: string | null) => (value ? Workspace.parseDateLikeValue(value) : null);

const toCountString = (value: number) => (value > 99 ? "99+" : String(value));

const getDateHeadline = (currentDateTime: Date) => `${Workspace.formatFriendlyDate(currentDateTime)} · ${SCHOOL_NAME}`;

const getEventDisplayParts = (event: EventItem) => {
  const parsedDate = parseSafeDate(event.dateTime);
  if (!parsedDate) {
    return {
      day: "--",
      month: "--月",
      dateText: "时间待定",
    };
  }

  return {
    day: String(parsedDate.getDate()),
    month: `${parsedDate.getMonth() + 1}月`,
    dateText: Workspace.formatDateTime(event.dateTime),
  };
};

const getAnnouncementDateText = (value: string) => {
  const parsedDate = parseSafeDate(value);
  if (!parsedDate) {
    return "--";
  }

  return `${parsedDate.getMonth() + 1}-${String(parsedDate.getDate()).padStart(2, "0")}`;
};

const getProgressCenterLabel = (value: number, total: number) => {
  if (total <= 0) {
    return "0%";
  }

  if (total <= 9) {
    return `${value}/${total}`;
  }

  return `${Math.round((Math.min(value, total) / total) * 100)}%`;
};

const getProgressRatio = (value: number, total: number) => {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, value / total));
};

const getTaskDueMeta = (task: BoardTask, currentDateTime: Date) => {
  const dueDate = parseSafeDate(task.dueDate);
  if (!dueDate) {
    return null;
  }

  const diffMs = dueDate.getTime() - currentDateTime.getTime();
  const diffDays = Math.ceil(diffMs / DAY_MS);

  if (diffMs < 0) {
    return {
      diffMs,
      diffDays,
      tone: "danger" as const,
      badgeText: `超期 ${Math.max(1, Math.ceil(Math.abs(diffMs) / DAY_MS))} 天`,
    };
  }

  if (diffDays <= 7) {
    return {
      diffMs,
      diffDays,
      tone: "warning" as const,
      badgeText: `剩余 ${Math.max(1, diffDays)} 天`,
    };
  }

  return null;
};

function buildOverviewMetricCards(args: {
  currentRole: string;
  hasGlobalAdminRole: boolean;
  pendingApprovalCount: number;
  openTaskCount: number;
  unreadMessageCount: number;
  pendingDocumentCount: number;
  unsubmittedReportCount: number;
  unassignedTaskCount: number;
  myOpenTaskCount: number;
  activeMyTaskCount: number;
  myPendingReportCount: number;
  pendingExpertReviewCount: number;
  completedReviewCount: number;
  openTarget: (target?: OverviewTarget) => void;
  icons: {
    account: LucideIcon;
    board: LucideIcon;
    mail: LucideIcon;
    document: LucideIcon;
    report: LucideIcon;
    review: LucideIcon;
  };
}): OverviewMetricCardItem[] {
  const {
    currentRole,
    hasGlobalAdminRole,
    pendingApprovalCount,
    openTaskCount,
    unreadMessageCount,
    pendingDocumentCount,
    unsubmittedReportCount,
    unassignedTaskCount,
    myOpenTaskCount,
    activeMyTaskCount,
    myPendingReportCount,
    pendingExpertReviewCount,
    completedReviewCount,
    openTarget,
    icons,
  } = args;

  if (hasGlobalAdminRole) {
    return [
      {
        label: "待审核账号",
        value: pendingApprovalCount,
        unit: "个",
        tone: "blue",
        icon: icons.account,
        onClick: () => openTarget("team"),
      },
      {
        label: "进行中工单",
        value: openTaskCount,
        unit: "项",
        tone: "amber",
        icon: icons.board,
        onClick: () => openTarget("board"),
      },
      {
        label: "未读消息",
        value: unreadMessageCount,
        unit: "条",
        tone: "green",
        icon: icons.mail,
        onClick: () => openTarget("notifications"),
      },
      {
        label: "文档待审批",
        value: pendingDocumentCount,
        unit: "份",
        tone: "red",
        icon: icons.document,
        onClick: () => openTarget("documents"),
      },
    ];
  }

  if (currentRole === "teacher") {
    return [
      {
        label: "团队待交汇报",
        value: unsubmittedReportCount,
        unit: "人",
        tone: "blue",
        icon: icons.report,
        onClick: () => openTarget("reports"),
      },
      {
        label: "进行中工单",
        value: openTaskCount,
        unit: "项",
        tone: "amber",
        icon: icons.board,
        onClick: () => openTarget("board"),
      },
      {
        label: "未读消息",
        value: unreadMessageCount,
        unit: "条",
        tone: "green",
        icon: icons.mail,
        onClick: () => openTarget("notifications"),
      },
      {
        label: "文档待审批",
        value: pendingDocumentCount,
        unit: "份",
        tone: "red",
        icon: icons.document,
        onClick: () => openTarget("documents"),
      },
    ];
  }

  if (currentRole === "leader") {
    return [
      {
        label: "待分配工单",
        value: unassignedTaskCount,
        unit: "项",
        tone: "blue",
        icon: icons.account,
        onClick: () => openTarget("board"),
      },
      {
        label: "进行中工单",
        value: openTaskCount,
        unit: "项",
        tone: "amber",
        icon: icons.board,
        onClick: () => openTarget("board"),
      },
      {
        label: "未读消息",
        value: unreadMessageCount,
        unit: "条",
        tone: "green",
        icon: icons.mail,
        onClick: () => openTarget("notifications"),
      },
      {
        label: "文档待审批",
        value: pendingDocumentCount,
        unit: "份",
        tone: "red",
        icon: icons.document,
        onClick: () => openTarget("documents"),
      },
    ];
  }

  if (currentRole === "expert") {
    return [
      {
        label: "待评任务",
        value: pendingExpertReviewCount,
        unit: "项",
        tone: "blue",
        icon: icons.review,
        onClick: () => openTarget("review"),
      },
      {
        label: "已交评分",
        value: completedReviewCount,
        unit: "条",
        tone: "amber",
        icon: icons.review,
        onClick: () => openTarget("review"),
      },
      {
        label: "未读消息",
        value: unreadMessageCount,
        unit: "条",
        tone: "green",
        icon: icons.mail,
        onClick: () => openTarget("notifications"),
      },
      {
        label: "赛事节点",
        value: 0,
        unit: "项",
        tone: "red",
        icon: icons.report,
        onClick: () => openTarget("timeline"),
      },
    ];
  }

  return [
    {
      label: "我的待办任务",
      value: myOpenTaskCount,
      unit: "项",
      tone: "blue",
      icon: icons.account,
      onClick: () => openTarget("board"),
    },
    {
      label: "进行中工单",
      value: activeMyTaskCount,
      unit: "项",
      tone: "amber",
      icon: icons.board,
      onClick: () => openTarget("board"),
    },
    {
      label: "未读消息",
      value: unreadMessageCount,
      unit: "条",
      tone: "green",
      icon: icons.mail,
      onClick: () => openTarget("notifications"),
    },
    {
      label: "待提交汇报",
      value: myPendingReportCount,
      unit: "份",
      tone: "red",
      icon: icons.report,
      onClick: () => openTarget("reports"),
    },
  ];
}

function buildProgressPanels(args: {
  reportSubmittedCount: number;
  reportExpectedCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
  reviewedDocumentCount: number;
  totalDocumentCount: number;
  completedReviewCount: number;
  totalReviewCount: number;
}): ProgressPanelItem[] {
  const {
    reportSubmittedCount,
    reportExpectedCount,
    completedTaskCount,
    totalTaskCount,
    reviewedDocumentCount,
    totalDocumentCount,
    completedReviewCount,
    totalReviewCount,
  } = args;

  return [
    {
      title: "团队汇报",
      description: reportExpectedCount > 0 ? `今日已提交 ${reportSubmittedCount} 人` : "当前暂无需提交成员",
      value: reportSubmittedCount,
      total: reportExpectedCount,
      tone: "blue",
      target: "reports",
    },
    {
      title: "任务工单",
      description: totalTaskCount > 0 ? `已完成 ${completedTaskCount} 项` : "当前暂无工单数据",
      value: completedTaskCount,
      total: totalTaskCount,
      tone: "amber",
      target: "board",
    },
    {
      title: "文档审批",
      description: totalDocumentCount > 0 ? `已审 ${reviewedDocumentCount} 份` : "无待审批材料",
      value: reviewedDocumentCount,
      total: totalDocumentCount,
      tone: totalDocumentCount > 0 ? "slate" : "slate",
      target: "documents",
    },
    {
      title: "专家评审",
      description: totalReviewCount > 0 ? `已评 ${completedReviewCount} 份` : "暂无评审任务",
      value: completedReviewCount,
      total: totalReviewCount,
      tone: "green",
      target: "review",
    },
  ];
}

function buildUrgentItems(args: {
  tasks: BoardTask[];
  currentDateTime: Date;
  getTaskAssigneeName: (task: BoardTask) => string;
}): UrgentTaskItem[] {
  const items = args.tasks
    .filter((task) => task.status !== "archived")
    .map((task) => {
      const dueMeta = getTaskDueMeta(task, args.currentDateTime);
      if (!dueMeta) {
        return null;
      }

      return {
        id: task.id,
        title: task.title,
        owner: args.getTaskAssigneeName(task),
        tone: dueMeta.tone,
        badgeText: dueMeta.badgeText,
        sortWeight: dueMeta.diffMs,
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        title: string;
        owner: string;
        tone: UrgentTone;
        badgeText: string;
        sortWeight: number;
      } => Boolean(item),
    )
    .sort((left, right) => left.sortWeight - right.sortWeight)
    .slice(0, 3);

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    owner: item.owner,
    tone: item.tone,
    badgeText: item.badgeText,
  }));
}

const buildReportStatusItems = (
  members: TeamMember[],
  todayReportEntryMap: Map<string, unknown>,
): ReportStatusItem[] =>
  members.map((member) => ({
    id: member.id,
    name: member.name,
    submitted: todayReportEntryMap.has(member.id),
  }));

const getAdminReportGroupStatus = (submittedCount: number, totalCount: number): AdminReportGroupStatus => {
  if (totalCount > 0 && submittedCount >= totalCount) {
    return "complete";
  }

  if (submittedCount > 0) {
    return "partial";
  }

  return "none";
};

const getAdminReportGroupSortWeight = (status: AdminReportGroupStatus) => {
  if (status === "none") {
    return 0;
  }

  if (status === "partial") {
    return 1;
  }

  return 2;
};

const buildAdminReportGroupItems = ({
  members,
  teamGroups,
  todayReportEntryMap,
}: {
  members: TeamMember[];
  teamGroups: TeamGroupItem[];
  todayReportEntryMap: Map<string, unknown>;
}): AdminReportGroupItem[] => {
  const groupNameMap = new Map(teamGroups.map((group) => [group.id, group.name]));
  const groups = new Map<string, { id: string; name: string; members: ReportStatusItem[] }>();

  for (const member of members) {
    if (!member.teamGroupId) {
      continue;
    }

    const groupId = member.teamGroupId;
    const groupName = groupNameMap.get(groupId) ?? member.teamGroupName ?? "未命名项目组";
    const group = groups.get(groupId) ?? { id: groupId, name: groupName, members: [] };

    group.members.push({
      id: member.id,
      name: member.name,
      submitted: todayReportEntryMap.has(member.id),
    });
    groups.set(groupId, group);
  }

  return [...groups.values()]
    .map((group) => {
      const submittedCount = group.members.filter((member) => member.submitted).length;
      const totalCount = group.members.length;
      const status = getAdminReportGroupStatus(submittedCount, totalCount);

      return {
        ...group,
        status,
        submittedCount,
        totalCount,
      };
    })
    .sort((left, right) => {
      const statusDiff = getAdminReportGroupSortWeight(left.status) - getAdminReportGroupSortWeight(right.status);
      if (statusDiff !== 0) {
        return statusDiff;
      }

      const completionDiff =
        left.totalCount === 0
          ? 0
          : left.submittedCount / left.totalCount - (right.totalCount === 0 ? 0 : right.submittedCount / right.totalCount);

      if (completionDiff !== 0) {
        return completionDiff;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });
};

function OverviewMetricCard({ item }: { item: OverviewMetricCardItem }) {
  const Icon = item.icon;
  const tone = metricToneMap[item.tone];
  const valueClassName = item.value > 0 ? tone.activeValueClassName : "text-slate-400";

  return (
    <button
      className="metric-card group relative flex flex-col overflow-hidden text-left"
      onClick={item.onClick}
      type="button"
    >
      <div className="flex items-start justify-between">
        <div className={`metric-card-icon ${tone.iconContainerClassName}`}>
          <Icon className={`h-5 w-5 ${tone.iconClassName}`} />
        </div>
        <Icon className={`metric-card-watermark ${tone.watermarkClassName}`} />
      </div>
      <div className="mt-3 flex items-end gap-1.5">
        <span className={`metric-card-value ${valueClassName}`}>
          {toCountString(item.value)}
        </span>
        <span className="metric-card-unit pb-1">{item.unit}</span>
      </div>
      <p className="metric-card-label">{item.label}</p>
    </button>
  );
}

function ProgressRing({
  value,
  total,
  tone,
}: {
  value: number;
  total: number;
  tone: ProgressTone;
}) {
  const ratio = getProgressRatio(value, total);
  const progressClassName = progressToneMap[tone].ringClassName;

  return (
    <div className="relative flex h-[56px] w-[56px] items-center justify-center">
      <svg className="-rotate-90" height="56" viewBox="0 0 60 60" width="56">
        <circle
          className="stroke-slate-200"
          cx="30"
          cy="30"
          fill="none"
          r="24"
          strokeWidth="5"
        />
        <circle
          className={`${progressClassName} stroke-current transition-all duration-300`}
          cx="30"
          cy="30"
          fill="none"
          r="24"
          strokeDasharray={150.8}
          strokeDashoffset={150.8 * (1 - ratio)}
          strokeLinecap="round"
          strokeWidth="5"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-slate-700">
        {getProgressCenterLabel(value, total)}
      </span>
    </div>
  );
}

function SectionTitle({
  title,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}) {
  const Icon = icon;
  return (
    <div className="overview-section-title">
      {Icon ? (
        <span className="overview-section-title-icon">
          <Icon className="h-[15px] w-[15px]" />
        </span>
      ) : null}
      <h2 className="overview-section-title-text">{title}</h2>
      {actionLabel && onAction ? (
        <button className="overview-section-title-action" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function OverviewTab() {
  const [expandedReportGroupId, setExpandedReportGroupId] = useState("");
  const {
    currentUser,
    currentDateTime,
    announcements,
    events,
    tasks,
    reviewAssignments,
    documents,
    countdown,
    setSelectedAnnouncement,
    currentRole,
    hasGlobalAdminRole,
    currentMemberId,
    teamGroups,
    nearestEvent,
    todayReportEntryMap,
    myOpenTasks,
    pendingLeaderReviewCount,
    pendingTeacherReviewCount,
    reportableMembers,
    reportSubmittedCount,
    reportExpectedCount,
    getTaskAssigneeName,
    pendingApprovalMembers,
    unreadTodoNotifications,
    openOverviewTarget,
  } = Workspace.useWorkspaceContext();

  const { Landmark } = Workspace;

  const openTasks = tasks.filter((task) => task.status !== "archived");
  const completedTaskCount = tasks.filter((task) => task.status === "archived").length;
  const pendingDocumentCount = pendingLeaderReviewCount + pendingTeacherReviewCount;
  const reviewedDocumentCount = documents.filter((document) => document.statusKey !== "pending").length;
  const reviewCompletedCount = reviewAssignments.filter(
    (assignment) => assignment.statusKey === "completed" || assignment.statusKey === "locked" || Boolean(assignment.score),
  ).length;
  const pendingExpertReviewCount = reviewAssignments.filter((assignment) => assignment.statusKey === "pending").length;
  const unsubmittedReportCount = reportableMembers.filter((member) => !todayReportEntryMap.has(member.id)).length;
  const unassignedTaskCount = tasks.filter((task) => task.status === "todo" && !task.assigneeId).length;
  const activeMyTaskCount = myOpenTasks.filter((task) => task.status === "doing" || task.status === "review").length;
  const myPendingReportCount = todayReportEntryMap.has(currentMemberId) ? 0 : 1;

  const sortedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const leftDate = parseSafeDate(left.dateTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDate = parseSafeDate(right.dateTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate;
      }),
    [events],
  );

  const nearestUpcomingEvent =
    nearestEvent ??
    sortedEvents.find((event) => {
      const parsedDate = parseSafeDate(event.dateTime);
      return parsedDate ? parsedDate.getTime() >= currentDateTime.getTime() : false;
    }) ??
    null;

  const metricCards = buildOverviewMetricCards({
    currentRole,
    hasGlobalAdminRole,
    pendingApprovalCount: pendingApprovalMembers.length,
    openTaskCount: openTasks.length,
    unreadMessageCount: unreadTodoNotifications.length,
    pendingDocumentCount,
    unsubmittedReportCount,
    unassignedTaskCount,
    myOpenTaskCount: myOpenTasks.length,
    activeMyTaskCount,
    myPendingReportCount,
    pendingExpertReviewCount,
    completedReviewCount: reviewCompletedCount,
    openTarget: openOverviewTarget,
    icons: {
      account: UserPlus,
      board: KanbanSquare,
      mail: Mail,
      document: FileText,
      report: CalendarDays,
      review: FileCheck,
    },
  });

  const progressPanels = buildProgressPanels({
    reportSubmittedCount,
    reportExpectedCount,
    completedTaskCount,
    totalTaskCount: tasks.length,
    reviewedDocumentCount,
    totalDocumentCount: documents.length,
    completedReviewCount: reviewCompletedCount,
    totalReviewCount: reviewAssignments.length,
  });

  const urgentItems = buildUrgentItems({
    tasks,
    currentDateTime,
    getTaskAssigneeName,
  });

  const reportStatusItems = buildReportStatusItems(reportableMembers, todayReportEntryMap);
  const adminReportGroupItems = useMemo(
    () => buildAdminReportGroupItems({ members: reportableMembers, teamGroups, todayReportEntryMap }),
    [reportableMembers, teamGroups, todayReportEntryMap],
  );
  const fullySubmittedGroupCount = adminReportGroupItems.filter((group) => group.status === "complete").length;
  const visibleEvents = sortedEvents.slice(0, 3);
  const visibleAnnouncements = announcements.slice(0, 3);

  const welcomeName =
    currentUser?.name ||
    currentUser?.profile.name ||
    currentUser?.roleLabel ||
    "同学";

  return (
    <div className="overview-dashboard space-y-5">
      {/* Welcome Banner */}
      <section className="campus-welcome-banner relative overflow-hidden px-6 py-6 sm:px-8 sm:py-7">
        <div aria-hidden="true" className="campus-watermark-frame">
          <Image
            alt=""
            className="campus-watermark"
            fill
            priority
            sizes="(min-width: 1280px) 34vw, 55vw"
            src="/login-campus.jpg"
          />
        </div>
        <div className="relative z-[1] flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] font-medium text-white/85">
              <Landmark className="h-3.5 w-3.5" />
              <span>中国国际大学生创新大赛管理系统</span>
            </div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-white sm:text-[26px]">
              欢迎回来，{welcomeName}
            </h1>
            <p className="mt-2 text-[13px] text-white/75">{getDateHeadline(currentDateTime)}</p>
          </div>
          <div className="hidden max-w-[240px] rounded-2xl border border-white/15 bg-white/8 px-5 py-4 text-right text-white/80 backdrop-blur md:block">
            <p className="text-[11px] text-white/60">组织单位</p>
            <p className="mt-1 text-[14px] font-semibold text-white">{SCHOOL_NAME}</p>
          </div>
        </div>
      </section>

      {/* Stat Cards */}
      <section className="grid gap-4 lg:grid-cols-4">
        {metricCards.map((item) => (
          <OverviewMetricCard item={item} key={item.label} />
        ))}
      </section>

      {/* Main Grid */}
      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.38fr)_minmax(420px,1fr)] xl:items-stretch">
        {/* Left Column */}
        <div className="flex h-full flex-col gap-5">
          {/* 业务进度 */}
          <article className="overview-card p-5">
            <SectionTitle
              actionLabel="查看全部 →"
              icon={LayoutDashboard}
              onAction={() => openOverviewTarget(currentRole === "member" ? "board" : "reports")}
              title="业务进度"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {progressPanels.map((item) => (
                <button
                  className="progress-panel-card text-left"
                  key={item.title}
                  onClick={() => openOverviewTarget(item.target)}
                  type="button"
                >
                  <ProgressRing tone={item.tone} total={item.total} value={item.value} />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-[12px] leading-5 text-slate-500">{item.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </article>

          {/* 紧急事项 */}
          <article className="overview-card p-5">
            <SectionTitle
              actionLabel="全部任务 →"
              icon={AlertCircle}
              onAction={() => openOverviewTarget("board")}
              title="紧急事项"
            />
            <div className="mt-4">
              {urgentItems.length > 0 ? (
                urgentItems.map((item) => {
                  const tone = urgentToneMap[item.tone];
                  return (
                    <button
                      className="urgent-item w-full text-left"
                      key={item.id}
                      onClick={() => openOverviewTarget("board")}
                      type="button"
                    >
                      <span className={`urgent-dot ${tone.dotClassName}`} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-[12px] text-slate-500">{item.owner}</p>
                      </div>
                      <span className={`urgent-badge ${tone.badgeClassName}`}>{item.badgeText}</span>
                    </button>
                  );
                })
              ) : (
                <p className="py-5 text-[13px] text-slate-400">当前没有紧急事项</p>
              )}
            </div>
          </article>

          {/* 今日汇报 */}
          <article className="overview-card flex flex-1 flex-col p-5">
            <SectionTitle icon={CheckCircle2} title={hasGlobalAdminRole ? "全校今日汇报" : "今日汇报"} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[12px] text-slate-500">
                {hasGlobalAdminRole ? "项目组提交状态" : "团队成员提交状态"}
              </p>
              <span className="text-[14px] font-bold text-slate-900">
                {hasGlobalAdminRole
                  ? `${fullySubmittedGroupCount}/${adminReportGroupItems.length || 0} 组已全员提交`
                  : `${reportSubmittedCount}/${reportExpectedCount || 0} 人已提交`}
              </span>
            </div>
            {hasGlobalAdminRole ? (
              <>
                <div className="mt-4 space-y-2">
                  {adminReportGroupItems.length > 0 ? (
                    adminReportGroupItems.map((group) => {
                      const meta = adminReportGroupStatusMap[group.status];
                      const isExpanded = expandedReportGroupId === group.id;

                      return (
                        <div
                          className={`rounded-xl border border-slate-200 bg-white transition ${meta.rowClassName}`}
                          data-slot="admin-report-group-row"
                          key={group.id}
                        >
                          <button
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                            onClick={() => setExpandedReportGroupId((current) => (current === group.id ? "" : group.id))}
                            type="button"
                          >
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dotClassName}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-[13px] font-semibold text-slate-900">{group.name}</p>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                                  {meta.label}
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 text-[13px] font-bold text-slate-900">
                              {group.submittedCount}/{group.totalCount}
                            </span>
                            <span className="shrink-0 text-[11px] font-medium text-blue-600">
                              {isExpanded ? "收起成员" : "一键展开查看成员"}
                            </span>
                          </button>
                          {isExpanded ? (
                            <div className="border-t border-slate-100 px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                {group.members.map((item) => (
                                  <button
                                    className={`report-pill ${
                                      item.submitted
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                    data-slot="report-pill"
                                    key={item.id}
                                    onClick={() => openOverviewTarget("reports")}
                                    type="button"
                                  >
                                    <span
                                      className={`h-2 w-2 rounded-full ${
                                        item.submitted ? "bg-emerald-500" : "bg-slate-400"
                                      }`}
                                    />
                                    <span>{item.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[12px] text-slate-500">
                      当前暂无项目组汇报数据
                    </span>
                  )}
                </div>
                <button
                  className="mt-4 text-[12px] font-semibold text-blue-600 transition hover:text-blue-700"
                  onClick={() => openOverviewTarget("reports")}
                  type="button"
                >
                  查看详情 →
                </button>
              </>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {reportStatusItems.length > 0 ? (
                  reportStatusItems.map((item) => (
                    <button
                      className={`report-pill ${
                        item.submitted
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                      data-slot="report-pill"
                      key={item.id}
                      onClick={() => openOverviewTarget("reports")}
                      type="button"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${item.submitted ? "bg-emerald-500" : "bg-slate-400"}`}
                      />
                      <span>{item.name}</span>
                    </button>
                  ))
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[12px] text-slate-500">
                    当前暂无需提交成员
                  </span>
                )}
              </div>
            )}
          </article>
        </div>

        {/* Right Column */}
        <div className="flex h-full flex-col gap-5">
          {/* 赛事日程 */}
          <article className="overview-card p-5">
            <SectionTitle
              actionLabel="完整日程 →"
              icon={CalendarDays}
              onAction={() => openOverviewTarget("timeline")}
              title="赛事日程"
            />
            {/* 最近截止提醒 */}
            <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 border border-blue-100">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Clock3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">最近截止</p>
                  <p className="mt-0.5 truncate text-[13px] font-semibold text-blue-700">
                    {nearestUpcomingEvent
                      ? `距 ${nearestUpcomingEvent.title} 还剩 ${countdown.days}天 ${countdown.hours}小时`
                      : "近期暂无未过期赛事节点"}
                  </p>
                </div>
              </div>
            </div>
            {/* Timeline */}
            <div className="mt-4">
              {visibleEvents.length > 0 ? (
                visibleEvents.map((item) => {
                  const eventParts = getEventDisplayParts(item);
                  return (
                    <button
                      className="timeline-item w-full text-left"
                      key={item.id}
                      onClick={() => openOverviewTarget("timeline")}
                      type="button"
                    >
                      <div className="timeline-date-block">
                        <span className="timeline-date-day">{eventParts.day}</span>
                        <span className="timeline-date-month">{eventParts.month}</span>
                      </div>
                      <div className="min-w-0 pt-1">
                        <p className="text-[13px] font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-[12px] text-slate-500">{item.description}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{eventParts.dateText}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="py-6 text-[13px] text-slate-400">当前暂无赛事日程</p>
              )}
            </div>
          </article>

          {/* 通知公告 */}
          <article className="overview-card flex flex-1 flex-col p-5">
            <SectionTitle
              actionLabel="查看全部 →"
              icon={Megaphone}
              onAction={() => openOverviewTarget("notifications")}
              title="通知公告"
            />
            <div className="mt-4 flex-1 space-y-3">
              {visibleAnnouncements.length > 0 ? (
                visibleAnnouncements.map((item) => (
                  <button
                    className="announcement-card w-full text-left"
                    data-slot="announcement-link-button"
                    key={item.id}
                    onClick={() => setSelectedAnnouncement(item)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-[13px] font-semibold text-slate-900">
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {getAnnouncementDateText(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-500">{item.detail}</p>
                  </button>
                ))
              ) : (
                <p className="py-6 text-[13px] text-slate-400">当前暂无公告</p>
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
