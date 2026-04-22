"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";

import type { BoardTask, EventItem, TeamMember } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

const SCHOOL_NAME = "南京铁道职业技术学院";
const DAY_MS = 24 * 60 * 60 * 1000;
const RING_CIRCUMFERENCE = 125.66;

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

const metricToneMap: Record<
  MetricTone,
  {
    iconContainerClassName: string;
    iconClassName: string;
    accentClassName: string;
    activeValueClassName: string;
  }
> = {
  blue: {
    iconContainerClassName: "bg-[#E6F1FB]",
    iconClassName: "text-[#185FA5]",
    accentClassName: "bg-[#2563EB]",
    activeValueClassName: "text-[#2563EB]",
  },
  amber: {
    iconContainerClassName: "bg-[#FAEEDA]",
    iconClassName: "text-[#854F0B]",
    accentClassName: "bg-[#EF9F27]",
    activeValueClassName: "text-[#EF9F27]",
  },
  green: {
    iconContainerClassName: "bg-[#EAF3DE]",
    iconClassName: "text-[#3B6D11]",
    accentClassName: "bg-[#1D9E75]",
    activeValueClassName: "text-[#1D9E75]",
  },
  red: {
    iconContainerClassName: "bg-[#FCEBEB]",
    iconClassName: "text-[#A32D2D]",
    accentClassName: "bg-[#E24B4A]",
    activeValueClassName: "text-[#E24B4A]",
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
    ringClassName: "text-[#2563EB]",
    textClassName: "text-[#2563EB]",
  },
  amber: {
    ringClassName: "text-[#EF9F27]",
    textClassName: "text-[#854F0B]",
  },
  slate: {
    ringClassName: "text-[#888780]",
    textClassName: "text-[#6B7280]",
  },
  green: {
    ringClassName: "text-[#1D9E75]",
    textClassName: "text-[#1D9E75]",
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
    dotClassName: "bg-[#E24B4A]",
    badgeClassName: "bg-[#FCEBEB] text-[#A32D2D]",
  },
  warning: {
    dotClassName: "bg-[#EF9F27]",
    badgeClassName: "bg-[#FAEEDA] text-[#854F0B]",
  },
};

const sectionActionClassName =
  "inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] transition-all duration-200 hover:translate-x-0.5 hover:text-[#1d4ed8]";

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

function OverviewMetricCard({ item }: { item: OverviewMetricCardItem }) {
  const Icon = item.icon;
  const tone = metricToneMap[item.tone];
  const valueClassName = item.value > 0 ? tone.activeValueClassName : "text-gray-300";

  return (
    <button
      className="group relative flex min-h-[104px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2563EB]/25 hover:bg-[#F8FBFF]"
      onClick={item.onClick}
      type="button"
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${tone.iconContainerClassName}`}>
        <Icon className={`h-4.5 w-4.5 ${tone.iconClassName}`} />
      </div>
      <div className="mt-3 flex items-end gap-1.5">
        <span className={`text-[28px] font-medium leading-none tracking-[-0.04em] ${valueClassName}`}>
          {toCountString(item.value)}
        </span>
        <span className="pb-0.5 text-[13px] font-medium text-gray-400">{item.unit}</span>
      </div>
      <p className="mt-1.5 text-[12px] font-medium text-gray-500">{item.label}</p>
      <div className={`absolute inset-x-0 bottom-0 h-[3px] ${tone.accentClassName}`} />
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
    <div className="relative flex h-[44px] w-[44px] items-center justify-center">
      <svg className="-rotate-90" height="44" viewBox="0 0 52 52" width="44">
        <circle
          className="stroke-gray-200"
          cx="26"
          cy="26"
          fill="none"
          r="20"
          strokeWidth="4.5"
        />
        <circle
          className={`${progressClassName} stroke-current transition-all duration-300`}
          cx="26"
          cy="26"
          fill="none"
          r="20"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
          strokeLinecap="round"
          strokeWidth="4.5"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold text-gray-800">
        {getProgressCenterLabel(value, total)}
      </span>
    </div>
  );
}

function SectionTitle({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="h-4 w-[3px] rounded-full bg-[#2563EB]" />
        <h2 className="text-[16px] font-semibold text-gray-900">{title}</h2>
      </div>
      {actionLabel && onAction ? (
        <button className={sectionActionClassName} onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function OverviewTab() {
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

  const {
    CalendarDays,
    Clock3,
    FileCheck,
    FileText,
    KanbanSquare,
    Mail,
    UserPlus,
  } = Workspace;

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
  const visibleEvents = sortedEvents.slice(0, 3);
  const visibleAnnouncements = announcements.slice(0, 3);

  const welcomeName =
    currentUser?.name ||
    currentUser?.profile.name ||
    currentUser?.roleLabel ||
    "同学";

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-gray-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-medium text-gray-900">欢迎回来，{welcomeName}</h1>
          <p className="mt-1 text-[13px] text-gray-500">{getDateHeadline(currentDateTime)}</p>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        {metricCards.map((item) => (
          <OverviewMetricCard item={item} key={item.label} />
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-3">
          <article className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionTitle
              actionLabel="查看全部 →"
              onAction={() => openOverviewTarget(currentRole === "member" ? "board" : "reports")}
              title="业务进度"
            />

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {progressPanels.map((item) => (
                <button
                  className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2 text-left transition-all duration-200 hover:border-[#2563EB]/20 hover:bg-[#F5F9FF]"
                  key={item.title}
                  onClick={() => openOverviewTarget(item.target)}
                  type="button"
                >
                  <ProgressRing tone={item.tone} total={item.total} value={item.value} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">{item.title}</p>
                    <p className="mt-0.5 text-[11px] leading-4.5 text-gray-500">{item.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionTitle
              actionLabel="全部任务 →"
              onAction={() => openOverviewTarget("board")}
              title="紧急事项"
            />

            <div className="mt-3">
              {urgentItems.length > 0 ? (
                urgentItems.map((item, index) => {
                  const tone = urgentToneMap[item.tone];
                  return (
                    <button
                      className={`flex w-full items-center gap-3 py-2 text-left transition-all duration-200 hover:bg-[#F8FBFF] ${index !== urgentItems.length - 1 ? "border-b border-gray-100" : ""}`}
                      key={item.id}
                      onClick={() => openOverviewTarget("board")}
                      type="button"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dotClassName}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-gray-900">{item.title}</p>
                        <p className="mt-1 text-[12px] text-gray-500">{item.owner}</p>
                      </div>
                      <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${tone.badgeClassName}`}>
                        {item.badgeText}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="py-4 text-[13px] text-gray-400">当前没有紧急事项</p>
              )}
            </div>
          </article>
        </div>

        <div className="space-y-3">
          <article className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionTitle
              actionLabel="完整日程 →"
              onAction={() => openOverviewTarget("timeline")}
              title="赛事日程"
            />

            <div className="mt-3 rounded-xl bg-[#EFF6FF] px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-white">
                  <Clock3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-500">最近截止</p>
                  <p className="mt-0.5 truncate text-[14px] font-semibold text-[#2563EB]">
                    {nearestUpcomingEvent
                      ? `距 ${nearestUpcomingEvent.title} 还剩 ${countdown.days}天 ${countdown.hours}小时`
                      : "近期暂无未过期赛事节点"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {visibleEvents.length > 0 ? (
                visibleEvents.map((item) => {
                  const eventParts = getEventDisplayParts(item);

                  return (
                    <button
                      className="flex w-full items-start gap-3 rounded-xl px-1 py-0.5 text-left transition-all duration-200 hover:bg-[#F8FBFF]"
                      key={item.id}
                      onClick={() => openOverviewTarget("timeline")}
                      type="button"
                    >
                      <div
                        className="flex w-[42px] shrink-0 flex-col items-center justify-center rounded-xl bg-gray-50 px-1 py-2"
                        data-slot="event-day-card"
                      >
                        <span className="text-[16px] font-semibold leading-none text-gray-900">{eventParts.day}</span>
                        <span className="mt-1 text-[10px] text-gray-500">{eventParts.month}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-[13px] font-semibold text-gray-900">{item.title}</p>
                        <p className="mt-1 line-clamp-1 text-[11px] text-gray-500">{item.description}</p>
                        <p className="mt-1 text-[11px] text-gray-400">{eventParts.dateText}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="py-6 text-[13px] text-gray-400">当前暂无赛事日程</p>
              )}
            </div>
          </article>

          <article className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionTitle
              actionLabel="查看全部 →"
              onAction={() => openOverviewTarget("notifications")}
              title="通知公告"
            />

            <div className="mt-3">
              {visibleAnnouncements.length > 0 ? (
                visibleAnnouncements.map((item, index) => (
                  <button
                    className={`flex w-full items-start justify-between gap-3 py-2 text-left transition-all duration-200 hover:bg-[#F8FBFF] ${index !== visibleAnnouncements.length - 1 ? "border-b border-gray-100" : ""}`}
                    data-slot="announcement-link-button"
                    key={item.id}
                    onClick={() => setSelectedAnnouncement(item)}
                    type="button"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-gray-900 transition-colors duration-200 hover:text-[#2563EB]">
                        {item.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-500">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-gray-400">{getAnnouncementDateText(item.createdAt)}</span>
                  </button>
                ))
              ) : (
                <p className="py-6 text-[13px] text-gray-400">当前暂无公告</p>
              )}
            </div>
          </article>

          <article className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionTitle title="今日汇报" />

            <div className="mt-2.5 flex items-center justify-between gap-3">
              <p className="text-[12px] text-gray-500">团队成员提交状态</p>
              <span className="text-[13px] font-semibold text-gray-900">
                {reportSubmittedCount}/{reportExpectedCount || 0} 人已提交
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {reportStatusItems.length > 0 ? (
                reportStatusItems.map((item) => (
                  <button
                    className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                      item.submitted
                        ? "bg-[#EAF3DE] text-[#3B6D11] hover:bg-[#dcecc5]"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                    data-slot="report-pill"
                    key={item.id}
                    onClick={() => openOverviewTarget("reports")}
                    type="button"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${item.submitted ? "bg-[#1D9E75]" : "bg-gray-400"}`}
                    />
                    <span>{item.name}</span>
                  </button>
                ))
              ) : (
                <span className="rounded-full bg-gray-100 px-2.5 py-1.5 text-[11px] text-gray-500">
                  当前暂无需提交成员
                </span>
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
