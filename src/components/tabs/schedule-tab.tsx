"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as Workspace from "@/components/workspace-context";
import { getReportsViewRole } from "@/lib/report-history";

type ReportMember = Workspace.TeamMember;
type ReportRecord = Workspace.ReportEntryWithDate;

type DateSelectorProps = {
  fieldClassName: string;
  formatShortDate: (value: string) => string;
  hasGlobalAdminRole: boolean;
  reportDateOptions: string[];
  reportEntriesByDay: Record<string, ReportRecord[]>;
  selectedDate: string;
  selectedReportTeamGroupId: string;
  setSelectedDate: (value: string) => void;
  setSelectedReportTeamGroupId: (value: string) => void;
  teamGroups: Workspace.TeamGroupItem[];
  todayDateKey: string;
};

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

type ReportsViewProps = {
  ActionButton: typeof Workspace.ActionButton;
  BellPlus: typeof Workspace.BellPlus;
  CalendarDays: typeof Workspace.CalendarDays;
  EmptyState: typeof Workspace.EmptyState;
  SectionHeader: typeof Workspace.SectionHeader;
  currentMemberId: string;
  currentUserSelectedReport?: ReportRecord;
  fieldClassName: string;
  filteredReportMembers: ReportMember[];
  formatShortDate: (value: string) => string;
  getReportAttachmentNote: (value?: string | null) => string | null;
  hasGlobalAdminRole: boolean;
  openCreateReportModal: () => void;
  openEditReportModal: (report: ReportRecord) => void;
  permissions: {
    canSendDirective: boolean;
    canSubmitReport: boolean;
  };
  removeReport: (date: string) => void;
  removeTeamReports: () => void;
  reportDateOptions: string[];
  reportDeleteTeamGroupId: string;
  reportEntriesByDay: Record<string, ReportRecord[]>;
  reportEntryMap: Map<string, ReportRecord>;
  reportSearch: string;
  reportSearchPlaceholder: string;
  reportSearchScopeLabel: string;
  selectedDate: string;
  selectedDateHasSavedReports: boolean;
  selectedReportExpectedCount: number;
  selectedReportMissingCount: number;
  selectedReportSubmittedCount: number;
  selectedReportTeamGroupId: string;
  sendReportReminder: (member: ReportMember) => void;
  setReportDeleteTeamGroupId: (value: string) => void;
  setReportSearch: (value: string) => void;
  setSelectedDate: (value: string) => void;
  setSelectedReportTeamGroupId: (value: string) => void;
  surfaceCardClassName: string;
  teamGroups: Workspace.TeamGroupItem[];
  todayDateKey: string;
  visibleReportMembers: ReportMember[];
  viewDescription: string;
};

const DateSelector = ({
  fieldClassName,
  formatShortDate,
  hasGlobalAdminRole,
  reportDateOptions,
  reportEntriesByDay,
  selectedDate,
  selectedReportTeamGroupId,
  setSelectedDate,
  setSelectedReportTeamGroupId,
  teamGroups,
  todayDateKey,
}: DateSelectorProps) => (
  <div className="report-filter-column flex flex-col space-y-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">选择查看日期</p>
        <p className="mt-1 text-sm text-slate-500">可以直接选择过去任意一天；有保存记录的日期会在下方显示。</p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        {hasGlobalAdminRole ? (
          <label className="block w-full text-sm font-medium text-slate-600 md:min-w-56">
            项目组
            <select
              className={`${fieldClassName} mt-1.5`}
              value={selectedReportTeamGroupId}
              onChange={(event) => setSelectedReportTeamGroupId(event.target.value)}
            >
              <option value="">全部项目组</option>
              {teamGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block w-full text-sm font-medium text-slate-600 md:min-w-56">
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
    </div>

    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
      {getPinnedDateChips(reportDateOptions, selectedDate, todayDateKey, 10).map((date) => {
        const hasReport = (reportEntriesByDay[date] ?? []).length > 0;
        const isSelected = date === selectedDate;

        return (
          <button
            className={`report-date-chip ${isSelected ? "selected" : ""} ${hasReport ? "has-record" : "muted"}`}
            key={date}
            onClick={() => setSelectedDate(date)}
            type="button"
          >
            {date === todayDateKey ? "今天" : formatShortDate(date)}
            {hasReport ? <span className="report-date-dot" /> : null}
          </button>
        );
      })}
    </div>

    {hasGlobalAdminRole ? (
      <div className="report-record-legend rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3">
        <p className="text-sm font-medium text-slate-700">日期标签说明</p>
        <p className="mt-1 text-sm text-slate-500">右上角带蓝点代表该日期已有汇报记录；未标记的日期表示当前还没有保存内容。</p>
      </div>
    ) : null}
  </div>
);

const SearchBar = ({ value, onChange, placeholder }: SearchBarProps) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
    <Workspace.Search className="h-4 w-4 text-slate-400" />
    <input
      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
      placeholder={placeholder}
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
);

type ReportEvaluationItem = {
  id: string;
  reportId: string;
  evaluatorId: string;
  evaluatorRole: string;
  evaluatorRoleLabel: string;
  type: "praise" | "improve" | "comment";
  content: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  evaluator: {
    id: string;
    name: string;
    avatar: string;
    avatarUrl?: string | null;
    roleLabel: string;
  };
  report?: {
    id: string;
    date: string;
    summary: string;
    submittedAt: string;
    userId: string;
  } | null;
};

type EvaluationComposerState = {
  reportId: string;
  type: "praise" | "improve" | "comment";
  value: string;
};

type TrendPoint = {
  date: string;
  label: string;
  submitRate: number | null;
  praiseCount: number;
  evaluationCount: number;
};

type GroupHealthItem = {
  id: string;
  name: string;
  submittedCount: number;
  expectedCount: number;
  submitRate: number;
  tone: "danger" | "warning" | "success";
  summary: string;
  alerts: string[];
  members: ReportMember[];
  reports: ReportRecord[];
  teacherNames: string[];
};

type TeacherTrendRange = "week" | "month";
type TeacherMemberFilter = "all" | "pending" | "missing";
type TeacherMemberCardMode = "collapsed" | "expanded" | "compact" | "warning" | "missing" | "missing-today" | "overdue";

const adminSurfaceCardClassName =
  "rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_4px_16px_rgba(16,24,40,0.04)]";
const adminSubtlePanelClassName = "rounded-2xl border border-slate-200/80 bg-slate-50/70";
const adminFieldCompactClassName =
  "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100";
const adminHealthToneMeta: Record<
  GroupHealthItem["tone"],
  {
    dotClassName: string;
    badgeClassName: string;
    progressClassName: string;
    label: string;
  }
> = {
  danger: {
    dotClassName: "bg-rose-500",
    badgeClassName: "border-rose-100 bg-rose-50 text-rose-700",
    progressClassName: "bg-rose-500",
    label: "存在明显异常",
  },
  warning: {
    dotClassName: "bg-amber-500",
    badgeClassName: "border-amber-100 bg-amber-50 text-amber-700",
    progressClassName: "bg-amber-500",
    label: "需要关注",
  },
  success: {
    dotClassName: "bg-emerald-500",
    badgeClassName: "border-emerald-100 bg-emerald-50 text-emerald-700",
    progressClassName: "bg-emerald-500",
    label: "运行稳定",
  },
};

const REPORT_REMINDER_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const REPORT_REMINDER_COOLDOWN_STORAGE_KEY = "workspace-report-reminder-cooldowns";
const REPORT_DEADLINE_HOUR = 18;
const concernKeywordPattern = /卡住|不会|没思路|受阻|困难|没进展|没有方向|不清楚/i;

const isBeforeReportDeadline = (dateKey: string, todayKey: string) => {
  if (dateKey !== todayKey) {
    return false;
  }

  const now = new Date();
  const beijingHour = Number(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );

  return beijingHour < REPORT_DEADLINE_HOUR;
};

const getEffectiveDataDays = (dateKeys: string[], todayKey: string) =>
  dateKeys.filter((date) => !isBeforeReportDeadline(date, todayKey)).length;

const evaluationTypeMeta: Record<
  ReportEvaluationItem["type"],
  {
    label: string;
    badgeClassName: string;
    icon: string;
  }
> = {
  praise: {
    label: "点赞",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: "▲",
  },
  improve: {
    label: "待改进",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    icon: "⚠️",
  },
  comment: {
    label: "批注",
    badgeClassName: "border-slate-200 bg-slate-100 text-slate-700",
    icon: "💬",
  },
};

const getRecentDateKeys = (dateKeys: string[], anchorDate: string, limit: number) =>
  dateKeys.filter((date) => date <= anchorDate).slice(0, limit);

const getPinnedDateChips = (dateKeys: string[], selectedDate: string, todayDateKey: string, limit: number) => {
  const pinnedDates = new Set([todayDateKey, selectedDate].filter(Boolean));
  return Array.from(new Set([...dateKeys.slice(0, limit), ...pinnedDates])).sort((left, right) => (left < right ? 1 : -1));
};

const getEvaluationReportDateLabel = (
  reportDate: string | null | undefined,
  formatShortDate: (value: string) => string,
) => (reportDate ? `${formatShortDate(reportDate)} 评价汇报` : "未知日期评价汇报");

const getReminderCooldownKey = (memberId: string, date: string) => `${memberId}:${date}`;

const loadReminderCooldowns = () => {
  if (typeof window === "undefined") {
    return {} as Record<string, number>;
  }

  try {
    const raw = window.localStorage.getItem(REPORT_REMINDER_COOLDOWN_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed).filter(([, expiresAt]) => Number.isFinite(expiresAt) && expiresAt > now));
  } catch {
    return {};
  }
};

const persistReminderCooldowns = (value: Record<string, number>) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(REPORT_REMINDER_COOLDOWN_STORAGE_KEY, JSON.stringify(value));
};

const getReportTextCorpus = (report?: ReportRecord) =>
  [report?.summary ?? "", report?.nextPlan ?? "", report?.attachment ?? ""].join(" ");

const getConcernText = (report?: ReportRecord) => {
  if (!report) {
    return null;
  }

  const matched = getReportTextCorpus(report).match(concernKeywordPattern);
  return matched?.[0] ?? null;
};

const getMemberAvatarFallback = (member: Pick<ReportMember, "avatar" | "name">) =>
  member.name.trim().slice(0, 1) || member.avatar.trim().slice(0, 1) || "?";

const getEvaluationTotal = (report?: ReportRecord) =>
  (report?.praiseCount ?? 0) + (report?.improveCount ?? 0) + (report?.commentCount ?? 0);

const getMemberReportForDate = (
  reportEntriesByDay: Record<string, ReportRecord[]>,
  date: string,
  memberId: string,
) => (reportEntriesByDay[date] ?? []).find((item) => item.memberId === memberId);

const getLatestMemberReportOnOrBeforeDate = (
  reportEntriesByDay: Record<string, ReportRecord[]>,
  reportDateOptions: string[],
  selectedDate: string,
  memberId: string,
) => {
  for (const date of reportDateOptions) {
    if (date > selectedDate) {
      continue;
    }

    const report = getMemberReportForDate(reportEntriesByDay, date, memberId);
    if (report) {
      return report;
    }
  }

  return undefined;
};

const getMissingDaysStreak = (
  memberId: string,
  dateKeys: string[],
  reportEntriesByDay: Record<string, ReportRecord[]>,
  todayDateKey: string,
) => {
  let streak = 0;

  for (const date of dateKeys) {
    if (isBeforeReportDeadline(date, todayDateKey)) {
      continue;
    }

    const report = getMemberReportForDate(reportEntriesByDay, date, memberId);
    if (report) {
      break;
    }

    streak += 1;
  }

  return streak;
};

const getNoFeedbackStreak = (
  memberId: string,
  dateKeys: string[],
  reportEntriesByDay: Record<string, ReportRecord[]>,
) => {
  let streak = 0;

  for (const date of dateKeys) {
    const report = getMemberReportForDate(reportEntriesByDay, date, memberId);
    if (!report) {
      continue;
    }

    if (getEvaluationTotal(report) > 0) {
      break;
    }

    streak += 1;
  }

  return streak;
};

const getShortDateLabel = (value: string) => value.slice(5).replace("-", "/");

const buildTrendSeries = ({
  dateKeys,
  members,
  reportEntriesByDay,
  evaluationsByReportId,
  todayDateKey,
}: {
  dateKeys: string[];
  members: ReportMember[];
  reportEntriesByDay: Record<string, ReportRecord[]>;
  evaluationsByReportId: Record<string, ReportEvaluationItem[]>;
  todayDateKey: string;
}) =>
  [...dateKeys]
    .reverse()
    .map((date) => {
      const dayReports = (reportEntriesByDay[date] ?? []).filter((report) =>
        members.some((member) => member.id === report.memberId),
      );
      const expectedCount = members.length;
      const isTodayBeforeDeadline = isBeforeReportDeadline(date, todayDateKey);
      const submitRate = isTodayBeforeDeadline
        ? null
        : expectedCount > 0
          ? Math.round((dayReports.length / expectedCount) * 100)
          : 0;
      const evaluations = dayReports.flatMap((report) => evaluationsByReportId[report.id ?? ""] ?? []);

      return {
        date,
        label: getShortDateLabel(date),
        submitRate,
        praiseCount: evaluations.filter((item) => item.type === "praise").length,
        evaluationCount: evaluations.length,
      };
    });

const getAverageSubmitRate = (series: TrendPoint[]) => {
  const values = series
    .map((point) => point.submitRate)
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const getTrendTotal = (series: TrendPoint[], accessor: (point: TrendPoint) => number) =>
  series.reduce((sum, point) => sum + accessor(point), 0);

const getPreviousTrendDateKeys = (reportDateOptions: string[], currentDateKeys: string[]) => {
  if (currentDateKeys.length === 0) {
    return [];
  }

  const oldestCurrentDate = currentDateKeys[currentDateKeys.length - 1];
  return reportDateOptions.filter((date) => date < oldestCurrentDate).slice(0, currentDateKeys.length);
};

const formatTrendDelta = (delta: number, unit: string, emptyLabel: string) => {
  if (delta === 0) {
    return emptyLabel;
  }

  return `${delta > 0 ? "↑" : "↓"} 较上期 ${delta > 0 ? "+" : "-"}${Math.abs(delta)}${unit}`;
};

const ChartEmptyState = ({ accumulatedDays, compact }: { accumulatedDays: number; compact?: boolean }) => (
  <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center ${compact ? "py-4" : "py-8"}`}>
    <Workspace.BarChart3 className={`text-slate-300 ${compact ? "mb-1 h-6 w-6" : "mb-2 h-8 w-8"}`} />
    <p className="text-sm font-medium text-slate-500">数据积累中，3 天后显示趋势</p>
    {!compact ? <p className="mt-1 text-xs text-slate-400">当前已积累 {accumulatedDays} 天数据</p> : null}
  </div>
);

const MainTrendChart = ({
  series,
  todayDateKey,
}: {
  series: TrendPoint[];
  todayDateKey: string;
}) => {
  const effectiveDays = getEffectiveDataDays(
    series.map((s) => s.date),
    todayDateKey,
  );

  if (series.length === 0 || effectiveDays < 3) {
    return <ChartEmptyState accumulatedDays={effectiveDays} />;
  }

  const hasRealVariance = series.some((p) => (p.submitRate ?? 0) !== (series[0].submitRate ?? 0));
  const allNull = series.every((p) => p.submitRate === null);
  if (!hasRealVariance && !allNull) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
        <Workspace.BarChart3 className="mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">本周数据平稳，暂无显著波动</p>
      </div>
    );
  }

  const chartWidth = 420;
  const chartHeight = 140;
  const plotLeft = 30;
  const plotRight = 410;
  const plotTop = 20;
  const plotBottom = 100;
  const plotHeight = plotBottom - plotTop;
  const step = series.length === 1 ? 0 : (plotRight - plotLeft) / (series.length - 1);
  const yForValue = (value: number) =>
    Number((plotBottom - (Math.min(100, Math.max(0, value)) / 100) * plotHeight).toFixed(2));
  const lastKnownValue =
    [...series]
      .reverse()
      .find((point) => typeof point.submitRate === "number")?.submitRate ?? 0;
  const chartPoints = series.map((point, index) => {
    const isToday = point.date === todayDateKey || index === series.length - 1;
    const value = point.submitRate;
    const fallbackValue = typeof value === "number" ? value : lastKnownValue;

    return {
      ...point,
      displayLabel: isToday ? "今日" : point.label,
      isToday,
      x: Number((series.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + index * step).toFixed(2)),
      y: yForValue(fallbackValue),
      value,
    };
  });
  const knownPoints = chartPoints.filter((point) => typeof point.value === "number");
  const areaPath =
    knownPoints.length > 1
      ? [
          `M ${knownPoints[0].x} ${plotBottom}`,
          ...knownPoints.map((point, index) => `${index === 0 ? "L" : "L"} ${point.x} ${point.y}`),
          `L ${knownPoints[knownPoints.length - 1].x} ${plotBottom}`,
          "Z",
        ].join(" ")
      : "";
  const solidSegments: Array<{ from: (typeof chartPoints)[number]; to: (typeof chartPoints)[number] }> = [];
  const todaySegments: Array<{ from: (typeof chartPoints)[number]; to: (typeof chartPoints)[number] }> = [];

  chartPoints.forEach((point, index) => {
    if (index === 0) {
      return;
    }

    const previous = chartPoints[index - 1];
    if (typeof previous.value !== "number") {
      return;
    }

    if (point.isToday) {
      todaySegments.push({ from: previous, to: point });
      return;
    }

    if (typeof point.value === "number") {
      solidSegments.push({ from: previous, to: point });
    }
  });

  return (
    <svg
      className="h-[140px] w-full overflow-visible"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
    >
      <title>每日提交率趋势</title>
      {[100, 50, 0].map((tick) => {
        const y = yForValue(tick);
        return (
          <g key={tick}>
            <line
              stroke="#E5E7EB"
              strokeDasharray="2 2"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
              x1={plotLeft}
              x2={plotRight}
              y1={y}
              y2={y}
            />
            <text fill="#9CA3AF" fontSize="10" x="4" y={y + 4}>
              {tick}%
            </text>
          </g>
        );
      })}
      {areaPath ? (
        <path d={areaPath} fill="#2563EB" fillOpacity="0.08" stroke="none" />
      ) : null}
      {solidSegments.map((segment) => (
        <line
          key={`${segment.from.date}-${segment.to.date}`}
          stroke="#2563EB"
          strokeLinecap="round"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          x1={segment.from.x}
          x2={segment.to.x}
          y1={segment.from.y}
          y2={segment.to.y}
        />
      ))}
      {todaySegments.map((segment) => (
        <line
          key={`${segment.from.date}-${segment.to.date}-today`}
          stroke="#2563EB"
          strokeDasharray="3 2"
          strokeLinecap="round"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          x1={segment.from.x}
          x2={segment.to.x}
          y1={segment.from.y}
          y2={segment.to.y}
        />
      ))}
      {chartPoints.map((point) => (
        <g key={point.date}>
          <circle
            cx={point.x}
            cy={point.y}
            fill={point.isToday ? "#FFFFFF" : "#2563EB"}
            r={point.isToday ? 3 : 2.5}
            stroke={point.isToday ? "#2563EB" : "none"}
            strokeWidth={point.isToday ? 1.5 : 0}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {typeof point.value === "number"
                ? `${point.label} · 提交率 ${point.value}%`
                : `${point.label} · 数据待更新`}
            </title>
          </circle>
          <text fill="#9CA3AF" fontSize="10" textAnchor="middle" x={point.x} y="126">
            {point.displayLabel}
          </text>
        </g>
      ))}
    </svg>
  );
};

const RightDrawer = ({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-slate-950/20 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-[min(92vw,560px)] flex-col bg-white shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button className="text-sm text-slate-500" onClick={onClose} type="button">
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

const AdminReadonlyReportCard = ({
  member,
  report,
  evaluations,
  formatShortDate,
  date,
}: {
  member: ReportMember;
  report?: ReportRecord;
  evaluations: ReportEvaluationItem[];
  formatShortDate: (value: string) => string;
  date: string;
}) => {
  const attachmentNote = Workspace.getReportAttachmentNote(report?.attachment);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white p-0">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{member.name}</h3>
            <span className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
              {member.systemRole}
            </span>
            {member.teamGroupName ? (
              <span className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                {member.teamGroupName}
              </span>
            ) : null}
          </div>
        </div>
        {report ? (
          <span className="shrink-0 rounded-md bg-blue-50 px-2.5 py-1 text-xs text-blue-600">已提交 {report.submittedAt}</span>
        ) : (
          <span className="shrink-0 rounded-md bg-red-50 px-2.5 py-1 text-xs text-red-700">未提交</span>
        )}
      </div>

      <div className="p-4">
        {report ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-400">今日完成</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{report.summary}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-400">明日计划</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{report.nextPlan}</p>
              </div>
            </div>
            {attachmentNote ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">附件备注：{attachmentNote}</p>
            ) : null}
            {evaluations.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500">已收到的评价</p>
                <EvaluationTimeline
                  currentMemberId=""
                  evaluations={evaluations}
                  onRevoke={() => {}}
                  revokingEvaluationId={null}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-center">
            <p className="text-sm text-slate-500">该成员在 {formatShortDate(date)} 尚未提交汇报。</p>
          </div>
        )}
      </div>
    </article>
  );
};

const EvaluationBadge = ({ type }: { type: ReportEvaluationItem["type"] }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${evaluationTypeMeta[type].badgeClassName}`}>
    <span>{evaluationTypeMeta[type].icon}</span>
    <span>{evaluationTypeMeta[type].label}</span>
  </span>
);

const EvaluationTimeline = ({
  evaluations,
  currentMemberId,
  onRevoke,
  revokingEvaluationId,
}: {
  evaluations: ReportEvaluationItem[];
  currentMemberId: string;
  onRevoke: (reportId: string, evaluationId: string) => void;
  revokingEvaluationId: string | null;
}) => {
  if (evaluations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-400">
        暂无评价记录
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {evaluations.map((evaluation) => {
        const canRevoke = evaluation.evaluatorId === currentMemberId;

        return (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3" key={evaluation.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <EvaluationBadge type={evaluation.type} />
                <span className="text-sm font-medium text-slate-700">{evaluation.evaluator.name}</span>
                <span className="text-xs text-slate-400">{evaluation.createdAt}</span>
              </div>
              {canRevoke ? (
                <button
                  className="text-xs font-medium text-rose-600 transition hover:text-rose-700"
                  disabled={revokingEvaluationId === evaluation.id}
                  onClick={() => onRevoke(evaluation.reportId, evaluation.id)}
                  type="button"
                >
                  {revokingEvaluationId === evaluation.id ? "撤回中..." : "撤回"}
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {evaluation.content.trim() || (evaluation.type === "praise" ? "老师送出了一次点赞。" : "未填写详细内容")}
            </p>
          </div>
        );
      })}
    </div>
  );
};

const StudentReportsView = (props: ReportsViewProps) => {
  const { currentMemberId } = Workspace.useWorkspaceContext();
  const { selectedDate, todayDateKey } = props;
  const [evaluations, setEvaluations] = useState<ReportEvaluationItem[]>([]);
  const [stats, setStats] = useState<{
    continuous_submit_days: number;
    monthly_submit_rate: number;
    total_praise_count: number;
    group_rank: number;
    group_total: number;
    rank_change: string;
  } | null>(null);
  const [expandedTeammateId, setExpandedTeammateId] = useState<string>("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0 });
  const [markingReadIds, setMarkingReadIds] = useState<Set<string>>(new Set());

  const isToday = selectedDate === todayDateKey;
  const myReport = props.currentUserSelectedReport;
  const teammates = useMemo(
    () => props.visibleReportMembers.filter((m) => m.id !== currentMemberId),
    [props.visibleReportMembers, currentMemberId],
  );

  const reportDateOptionsForSelector = useMemo(() => {
    const cutoff = new Date(`${props.todayDateKey}T00:00:00+08:00`);
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffKey = [
      cutoff.getFullYear(),
      String(cutoff.getMonth() + 1).padStart(2, "0"),
      String(cutoff.getDate()).padStart(2, "0"),
    ].join("-");
    return props.reportDateOptions.filter((d) => d >= cutoffKey && d <= props.todayDateKey);
  }, [props.reportDateOptions, props.todayDateKey]);

  useEffect(() => {
    if (!isToday) return;
    const update = () => {
      const now = new Date();
      const beijing = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
      const deadline = new Date(beijing);
      deadline.setHours(23, 59, 59, 999);
      const diff = deadline.getTime() - beijing.getTime();
      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0 });
      } else {
        setCountdown({
          hours: Math.floor(diff / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        });
      }
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [isToday]);

  useEffect(() => {
    if (isToday && myReport && !showCelebration) {
      const celebratedKey = `celebrated-${myReport.id ?? myReport.date}`;
      if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(celebratedKey)) {
        sessionStorage.setItem(celebratedKey, "1");
        const showTimer = setTimeout(() => setShowCelebration(true), 50);
        const hideTimer = setTimeout(() => setShowCelebration(false), 2050);
        return () => {
          clearTimeout(showTimer);
          clearTimeout(hideTimer);
        };
      }
    }
  }, [isToday, myReport, showCelebration]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await Workspace.requestJson<{ evaluations: ReportEvaluationItem[] }>(
          `/api/students/${currentMemberId}/evaluations?limit=5`,
        );
        if (active) setEvaluations(res.evaluations);
      } catch {
        // 评价加载失败静默处理，不阻塞主界面
      }
    })();
    return () => {
      active = false;
    };
  }, [currentMemberId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await Workspace.requestJson<{
          continuous_submit_days: number;
          monthly_submit_rate: number;
          total_praise_count: number;
          group_rank: number;
          group_total: number;
          rank_change: string;
        }>(`/api/students/${currentMemberId}/stats`);
        if (active) setStats(res);
      } catch {
        // 统计数据加载失败静默处理
      }
    })();
    return () => {
      active = false;
    };
  }, [currentMemberId]);

  const handleMarkRead = useCallback(
    async (evaluationIds: string[]) => {
      if (evaluationIds.length === 0) return;
      const unreadIds = evaluationIds.filter((id) => !markingReadIds.has(id));
      if (unreadIds.length === 0) return;
      setMarkingReadIds((prev) => new Set([...prev, ...unreadIds]));
      try {
        await Workspace.requestJson<{ success: boolean }>(
          `/api/students/${currentMemberId}/evaluations/mark_read`,
          { method: "POST", body: JSON.stringify({ evaluation_ids: unreadIds }) },
        );
        setEvaluations((prev) => prev.map((ev) => (unreadIds.includes(ev.id) ? { ...ev, isRead: true } : ev)));
      } catch {
        setMarkingReadIds((prev) => {
          const next = new Set(prev);
          unreadIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [currentMemberId, markingReadIds],
  );

  return (
    <div className="space-y-4">
      <Workspace.SectionHeader description={props.viewDescription} title="日程汇报" />

      {/* 日期选择器 */}
      <section className={props.surfaceCardClassName}>
        <DateSelector
          fieldClassName={props.fieldClassName}
          formatShortDate={props.formatShortDate}
          hasGlobalAdminRole={false}
          reportDateOptions={reportDateOptionsForSelector}
          reportEntriesByDay={props.reportEntriesByDay}
          selectedDate={props.selectedDate}
          selectedReportTeamGroupId={props.selectedReportTeamGroupId}
          setSelectedDate={(value) => {
            if (value > props.todayDateKey) return;
            props.setSelectedDate(value);
          }}
          setSelectedReportTeamGroupId={props.setSelectedReportTeamGroupId}
          teamGroups={props.teamGroups}
          todayDateKey={props.todayDateKey}
        />
      </section>

      {/* 第一区：我的今日汇报 */}
      <section className={`${props.surfaceCardClassName} relative overflow-hidden`}>
        {showCelebration && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className="h-3 w-3 animate-ping rounded-full"
                  style={{
                    backgroundColor: ["#fbbf24", "#f87171", "#60a5fa", "#34d399", "#a78bfa"][i],
                    animationDuration: "0.8s",
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {selectedDate !== todayDateKey ? `补交 ${selectedDate} 汇报` : "我的今日汇报"}
            </h3>
            {selectedDate === todayDateKey && (
              <p className="mt-1 text-sm text-slate-500">
                距今日 23:59 截止还有 {countdown.hours} 小时 {countdown.minutes} 分钟
              </p>
            )}
          </div>

          {props.permissions.canSubmitReport && (
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <Workspace.ActionButton
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={() =>
                  myReport ? props.openEditReportModal(myReport) : props.openCreateReportModal()
                }
              >
                {myReport ? (isToday ? "编辑今日汇报" : "修改汇报") : "立即提交今日汇报"}
              </Workspace.ActionButton>
              {isToday && stats && stats.continuous_submit_days > 0 && (
                <p className="text-xs text-slate-500">
                  连续提交第 {stats.continuous_submit_days} 天，别断了
                </p>
              )}
            </div>
          )}
        </div>

        {myReport ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">提交于 {myReport.submittedAt}</span>
              {isToday && (
                <button
                  className="text-xs text-blue-600 hover:text-blue-700"
                  onClick={() => props.openEditReportModal(myReport)}
                  type="button"
                >
                  编辑
                </button>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-400">今日完成</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{myReport.summary}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-400">明日计划</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{myReport.nextPlan}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
            <p className="text-sm text-slate-500">
              {isToday
                ? "今天还没有提交汇报，抓紧时间完成今日任务吧！"
                : `在 ${props.formatShortDate(props.selectedDate)} 尚未提交汇报，可以补交。`}
            </p>
          </div>
        )}
      </section>

      {/* 第二区：我收到的评价 */}
      <section className={props.surfaceCardClassName}>
        <h3 className="text-base font-semibold text-slate-900">我收到的评价</h3>
        <div className="mt-3 space-y-3">
          {evaluations.length > 0 ? (
            evaluations.map((ev) => (
              <div
                key={ev.id}
                className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                  ev.isRead ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/50"
                }`}
                onClick={() => {
                  if (!ev.isRead) {
                    void handleMarkRead([ev.id]);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <Workspace.UserAvatar
                  className="h-9 w-9"
                  name={ev.evaluator.name}
                  avatar={ev.evaluator.avatar}
                  avatarUrl={ev.evaluator.avatarUrl}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{ev.evaluator.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        ev.type === "praise"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : ev.type === "improve"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {ev.type === "praise" ? "🌟 点赞" : ev.type === "improve" ? "⚠️ 待改进" : "💬 批注"}
                    </span>
                    {!ev.isRead && <span className="h-2 w-2 rounded-full bg-red-500" />}
                  </div>
                  <p className="mt-1 text-xs font-medium text-blue-600">
                    评价对象：{getEvaluationReportDateLabel(ev.report?.date, props.formatShortDate)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{ev.content || "未填写详细内容"}</p>
                  <p className="mt-1 text-xs text-slate-400">{ev.createdAt}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
              <p className="text-sm text-slate-500">
                暂无评价，继续加油提交汇报，指导老师会来点评
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 第三区：我的成就面板 */}
      {stats && (
        <section className={props.surfaceCardClassName}>
          <h3 className="text-base font-semibold text-slate-900">我的成就面板</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-center">
              <p className="text-2xl font-semibold text-slate-900">
                🔥 {stats.continuous_submit_days}
                {stats.continuous_submit_days >= 100 && (
                  <span className="ml-1 text-sm">🎖️</span>
                )}
                {stats.continuous_submit_days >= 30 && stats.continuous_submit_days < 100 && (
                  <span className="ml-1 text-sm">🥈</span>
                )}
                {stats.continuous_submit_days >= 7 && stats.continuous_submit_days < 30 && (
                  <span className="ml-1 text-sm">🥉</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">连续提交</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-center">
              <p className="text-2xl font-semibold text-slate-900">📊 {stats.monthly_submit_rate}%</p>
              <p className="mt-1 text-xs text-slate-500">本月提交率</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-center">
              <p className="text-2xl font-semibold text-slate-900">
                🌟 {stats.total_praise_count}
                {stats.total_praise_count >= 10 && (
                  <span className="ml-1 text-sm">🏅</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">点赞数</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-center">
              <p className="text-2xl font-semibold text-slate-900">
                🏆 {stats.group_rank}/{stats.group_total}
                {stats.rank_change === "up" && <span className="ml-1 text-sm text-emerald-600">↑</span>}
                {stats.rank_change === "down" && <span className="ml-1 text-sm text-rose-600">↓</span>}
              </p>
              <p className="mt-1 text-xs text-slate-500">当前排名</p>
            </div>
          </div>
        </section>
      )}

      {/* 第四区：项目组今日动态 */}
      <section className={props.surfaceCardClassName}>
        <h3 className="text-base font-semibold text-slate-900">项目组今日动态</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {teammates.length > 0 ? (
            teammates.map((member) => {
              const report = props.reportEntryMap.get(member.id);
              const isExpanded = expandedTeammateId === member.id;
              const praiseCount = report ? ((report as ReportRecord & { praiseCount?: number }).praiseCount ?? 0) : 0;

              return (
                <div key={member.id} className="py-2">
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50"
                    onClick={() => setExpandedTeammateId((prev) => (prev === member.id ? "" : member.id))}
                    type="button"
                  >
                    <Workspace.UserAvatar
                      className="h-8 w-8"
                      name={member.name}
                      avatar={getMemberAvatarFallback(member)}
                      avatarUrl={member.avatarUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{member.name}</span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                          {member.systemRole}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {report ? (
                        <>
                          <span className="text-xs text-emerald-600">✓ 已提交</span>
                          <span className="text-xs text-slate-400">{report.submittedAt}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">○ 未提交</span>
                      )}
                      {praiseCount > 0 && <span className="text-xs text-amber-500">🌟 {praiseCount}</span>}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 px-2 pb-2">
                      {report ? (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                          <div>
                            <p className="text-xs font-semibold text-slate-400">今日完成</p>
                            <p className="mt-1 text-sm text-slate-700">{report.summary}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-400">明日计划</p>
                            <p className="mt-1 text-sm text-slate-700">{report.nextPlan}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">该成员今日尚未提交汇报。</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-4 text-center text-sm text-slate-400">暂无其他团队成员</div>
          )}
        </div>
      </section>

    </div>
  );
};

const TeacherMemberReportCard = ({
  currentMemberId,
  member,
  report,
  selectedDate,
  evaluations,
  isExpanded,
  composer,
  onToggleExpand,
  onOpenComposer,
  onComposerChange,
  onCloseComposer,
  onSubmitComposer,
  onRevokeEvaluation,
  revokingEvaluationId,
  onSendReminder,
  sendingReminder,
  reminderCoolingDown,
  composerSubmitting,
  todayDateKey,
}: {
  currentMemberId: string;
  member: ReportMember;
  report?: ReportRecord;
  selectedDate: string;
  evaluations: ReportEvaluationItem[];
  isExpanded: boolean;
  composer: EvaluationComposerState | null;
  onToggleExpand: () => void;
  onOpenComposer: (type: EvaluationComposerState["type"]) => void;
  onComposerChange: (value: string) => void;
  onCloseComposer: () => void;
  onSubmitComposer: (type: EvaluationComposerState["type"]) => void;
  onRevokeEvaluation: (reportId: string, evaluationId: string) => void;
  revokingEvaluationId: string | null;
  onSendReminder: () => void;
  sendingReminder: boolean;
  reminderCoolingDown: boolean;
  composerSubmitting: boolean;
  todayDateKey: string;
}) => {
  const concernText = getConcernText(report);
  const isTodayBeforeDeadline = isBeforeReportDeadline(selectedDate, todayDateKey);
  const cardMode: TeacherMemberCardMode = report
    ? composer?.reportId === report.id || isExpanded
      ? "expanded"
      : concernText
        ? "warning"
        : evaluations.length > 0
          ? "compact"
          : "collapsed"
    : isTodayBeforeDeadline
      ? "missing-today"
      : "overdue";

  const statusBadgeMeta: Record<TeacherMemberCardMode, { label: string; className: string }> = {
    collapsed: { label: "已提交", className: "bg-emerald-50 text-emerald-700" },
    expanded: { label: "已提交", className: "bg-emerald-50 text-emerald-700" },
    compact: { label: "已提交", className: "bg-emerald-50 text-emerald-700" },
    warning: { label: "需关注", className: "bg-amber-50 text-amber-700" },
    missing: { label: "未提交", className: "bg-slate-100 text-slate-600" },
    "missing-today": { label: "今日待提交", className: "bg-slate-100 text-slate-500" },
    overdue: { label: "连续未提交", className: "bg-rose-50 text-rose-700" },
  };

  const containerClassName =
    cardMode === "overdue"
      ? "border-rose-200 bg-white"
      : cardMode === "missing-today"
        ? "border-slate-200 bg-white"
        : cardMode === "expanded"
          ? "border-blue-300 bg-blue-50/40"
          : cardMode === "warning"
            ? "border-amber-200 bg-white"
            : "border-slate-200 bg-white";

  const badge = statusBadgeMeta[cardMode];

  return (
    <article className={`rounded-md border p-3 transition ${containerClassName}`}>
      <div className="flex items-start gap-3">
        <Workspace.UserAvatar
          className={`h-9 w-9 shrink-0 rounded-full ${cardMode === "overdue" || cardMode === "missing-today" ? "bg-slate-100 text-slate-400" : "bg-blue-50 text-blue-600"}`}
          name={member.name}
          avatar={getMemberAvatarFallback(member)}
          avatarUrl={member.avatarUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900">{member.name}</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
              {member.systemRole}
            </span>
            {cardMode === "warning" ? (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                关键词预警
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {report ? `${selectedDate.replaceAll("-", "/")} 汇报` : `尚未提交 ${selectedDate.replaceAll("-", "/")} 汇报`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
            {badge.label}
          </span>
          {report ? (
            <button
              className="text-[11px] text-slate-500 transition hover:text-blue-600"
              onClick={onToggleExpand}
              type="button"
            >
              {isExpanded || composer?.reportId === report.id ? "收起" : evaluations.length > 0 ? "查看详情" : "展开"}
            </button>
          ) : null}
        </div>
      </div>

      {cardMode === "overdue" ? (
        <div className="mt-3 rounded-xl border border-dashed border-rose-200 bg-rose-50/50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-rose-700">该成员已连续多日未提交汇报，建议尽快催交。</span>
            <button
              className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                reminderCoolingDown
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  : "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
              }`}
              disabled={reminderCoolingDown || sendingReminder}
              onClick={onSendReminder}
              type="button"
            >
              <Workspace.BellPlus className="h-3.5 w-3.5" />
              {sendingReminder ? "发送中..." : reminderCoolingDown ? "2 小时内已催交" : "催交"}
            </button>
          </div>
        </div>
      ) : null}

      {cardMode === "missing-today" ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">今日汇报截止时间前，暂不标记为异常。</p>
        </div>
      ) : null}

      {report ? (
        <>
          {cardMode === "warning" && concernText ? (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {`检测到关键词"${concernText}"，建议优先查看该成员进展并及时跟进。`}
            </div>
          ) : null}

          <div className="mt-2 rounded-lg bg-slate-50/70 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
            <span className="sr-only">最近一次汇报</span>
            <div>
              <span className="text-slate-400">今日完成：</span>
              <span className={cardMode === "expanded" || cardMode === "warning" ? "" : "line-clamp-1"}>{report.summary}</span>
            </div>
            {report.nextPlan ? (
              <div className={cardMode === "expanded" || cardMode === "warning" ? "" : "line-clamp-1"}>
                <span className="text-slate-400">明日计划：</span>
                {report.nextPlan}
              </div>
            ) : null}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-transparent px-2.5 py-1 text-[12px] text-slate-600 transition hover:bg-slate-50"
              onClick={() => onOpenComposer("praise")}
              type="button"
            >
              <span className="text-blue-600">▲</span>
              <span>点赞</span>
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-transparent px-2.5 py-1 text-[12px] text-slate-600 transition hover:bg-slate-50"
              onClick={() => onOpenComposer("improve")}
              type="button"
            >
              <span className="text-amber-600">!</span>
              <span>待改进</span>
            </button>
            <button
              className="rounded-md border border-slate-200 bg-transparent px-2.5 py-1 text-[12px] text-slate-600 transition hover:bg-slate-50"
              onClick={() => onOpenComposer("comment")}
              type="button"
            >
              <span>批注</span>
            </button>
            <span className="ml-auto text-[11px] text-slate-400">
              {evaluations.length > 0 ? `已收到 ${evaluations.length} 条点评` : "待点评"}
            </span>
          </div>

          {composer?.reportId === report.id
            ? (() => {
                const activeComposer = composer;
                if (!activeComposer) {
                  return null;
                }

                return (
                  <div className="mt-2.5 rounded-md border border-blue-300 bg-white p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-medium text-blue-700">快速点评</p>
                      <button
                        className="text-[11px] text-slate-500 transition hover:text-blue-600"
                        onClick={onCloseComposer}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                    <textarea
                      className="mt-2 min-h-14 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none transition focus:border-blue-500"
                      placeholder="写下对该汇报的点评，留空则发送默认点赞"
                      value={activeComposer.value}
                      onChange={(event) => onComposerChange(event.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button
                        className="rounded-md border-0 bg-blue-50 px-3 py-1 text-[12px] font-medium text-blue-700 transition hover:bg-blue-100"
                        disabled={composerSubmitting}
                        onClick={() => onSubmitComposer("praise")}
                        type="button"
                      >
                        {composerSubmitting && activeComposer.type === "praise" ? "发送中..." : "▲ 发送点赞"}
                      </button>
                      <button
                        className="rounded-md border-0 bg-amber-50 px-3 py-1 text-[12px] font-medium text-amber-700 transition hover:bg-amber-100"
                        disabled={composerSubmitting}
                        onClick={() => onSubmitComposer("improve")}
                        type="button"
                      >
                        {composerSubmitting && activeComposer.type === "improve" ? "发送中..." : "! 标记待改进"}
                      </button>
                      <button
                        className="rounded-md border border-slate-200 bg-transparent px-3 py-1 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
                        disabled={composerSubmitting}
                        onClick={() => onSubmitComposer("comment")}
                        type="button"
                      >
                        {composerSubmitting && activeComposer.type === "comment" ? "发送中..." : "仅批注"}
                      </button>
                    </div>
                  </div>
                );
              })()
            : null}

          {isExpanded && evaluations.length > 0 ? (
            <div className="mt-3">
              <p className="mb-2 text-[11px] font-medium text-slate-400">已收到 {evaluations.length} 条点评</p>
              <EvaluationTimeline
                currentMemberId={currentMemberId}
                evaluations={evaluations}
                onRevoke={onRevokeEvaluation}
                revokingEvaluationId={revokingEvaluationId}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
};

const GroupOperationsBoard = ({
  groupName,
  members,
  title = "我负责的项目组",
  searchValue,
  onSearchChange,
  showOverviewHeader = false,
}: {
  groupName: string;
  members: ReportMember[];
  title?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showOverviewHeader?: boolean;
}) => {
  const {
    currentMemberId,
    permissions,
    reportEntriesByDay,
    reportDateOptions,
    selectedDate,
    showSuccessToast,
    setLoadError,
    todayDateKey,
  } = Workspace.useWorkspaceContext();
  const [internalSearch, setInternalSearch] = useState("");
  const [evaluationsByReportId, setEvaluationsByReportId] = useState<Record<string, ReportEvaluationItem[]>>({});
  const [composer, setComposer] = useState<EvaluationComposerState | null>(null);
  const [submittingEvaluationKey, setSubmittingEvaluationKey] = useState<string | null>(null);
  const [revokingEvaluationId, setRevokingEvaluationId] = useState<string | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderCooldowns, setReminderCooldowns] = useState<Record<string, number>>({});
  const [memberFilter, setMemberFilter] = useState<TeacherMemberFilter>("all");
  const [expandedMemberId, setExpandedMemberId] = useState("");
  const [trendRange, setTrendRange] = useState<TeacherTrendRange>("week");

  const resolvedSearch = searchValue ?? internalSearch;
  const handleSearchChange = onSearchChange ?? setInternalSearch;

  useEffect(() => {
    setReminderCooldowns(loadReminderCooldowns());
  }, []);

  const scopedMemberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const recentDateKeys = useMemo(
    () => getRecentDateKeys(reportDateOptions, selectedDate, 7),
    [reportDateOptions, selectedDate],
  );
  const trendDateKeys = useMemo(() => {
    if (trendRange === "month") {
      return reportDateOptions.filter((date) => date <= selectedDate && date.startsWith(selectedDate.slice(0, 7)));
    }

    return recentDateKeys;
  }, [recentDateKeys, reportDateOptions, selectedDate, trendRange]);
  const previousTrendDateKeys = useMemo(
    () => getPreviousTrendDateKeys(reportDateOptions, trendDateKeys),
    [reportDateOptions, trendDateKeys],
  );

  const memberCards = useMemo(
    () =>
      members.map((member) => ({
        member,
        report: getMemberReportForDate(reportEntriesByDay, selectedDate, member.id),
        latestReport: getLatestMemberReportOnOrBeforeDate(
          reportEntriesByDay,
          reportDateOptions,
          selectedDate,
          member.id,
        ),
      })),
    [members, reportDateOptions, reportEntriesByDay, selectedDate],
  );

  const currentReports = useMemo(
    () => memberCards.map((item) => item.report).filter((report): report is ReportRecord => Boolean(report)),
    [memberCards],
  );

  const memberCardsWithState = useMemo(
    () =>
      memberCards.map((item) => {
        const reportId = item.report?.id ?? "";
        const evaluations = reportId ? evaluationsByReportId[reportId] ?? [] : [];
        const concernText = item.report ? getConcernText(item.report) : null;
        const mode: TeacherMemberCardMode = !item.report
          ? "missing"
          : composer?.reportId === item.report.id || expandedMemberId === item.member.id
            ? "expanded"
            : concernText
              ? "warning"
              : evaluations.length > 0
                ? "compact"
                : "collapsed";

        return {
          ...item,
          evaluations,
          concernText,
          mode,
        };
      }),
    [composer?.reportId, evaluationsByReportId, expandedMemberId, memberCards],
  );

  const pendingReviewCount = useMemo(
    () => memberCardsWithState.filter((item) => item.report && item.evaluations.length === 0).length,
    [memberCardsWithState],
  );
  const missingCount = useMemo(
    () => memberCardsWithState.filter((item) => !item.report).length,
    [memberCardsWithState],
  );

  const filteredCards = useMemo(() => {
    const keyword = resolvedSearch.trim().toLowerCase();

    return memberCardsWithState.filter(({ member, report, latestReport, evaluations }) => {
      const matchesSearch =
        keyword.length === 0 ||
        [
          member.name,
          member.systemRole,
          member.teamGroupName ?? "",
          report?.summary ?? "",
          report?.nextPlan ?? "",
          latestReport?.summary ?? "",
          latestReport?.nextPlan ?? "",
          ...evaluations.map((item) => item.content),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      if (!matchesSearch) {
        return false;
      }

      if (memberFilter === "pending") {
        return Boolean(report) && evaluations.length === 0;
      }

      if (memberFilter === "missing") {
        return !report;
      }

      return true;
    });
  }, [memberCardsWithState, memberFilter, resolvedSearch]);

  const weeklyReportIds = useMemo(
    () =>
      recentDateKeys.flatMap((date) =>
        (reportEntriesByDay[date] ?? [])
          .filter((report) => scopedMemberIds.has(report.memberId))
          .map((report) => report.id)
          .filter((value): value is string => Boolean(value)),
      ),
    [recentDateKeys, reportEntriesByDay, scopedMemberIds],
  );

  useEffect(() => {
    const missingIds = [...new Set(weeklyReportIds)].filter((reportId) => !evaluationsByReportId[reportId]);
    if (missingIds.length === 0) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const responses = await Promise.all(
          missingIds.map((reportId) =>
            Workspace.requestJson<{ evaluations: ReportEvaluationItem[] }>(`/api/reports/${reportId}/evaluations?limit=20`),
          ),
        );

        if (!active) {
          return;
        }

        setEvaluationsByReportId((current) => {
          const next = { ...current };
          missingIds.forEach((reportId, index) => {
            next[reportId] = responses[index].evaluations;
          });
          return next;
        });
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "汇报评价加载失败");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [evaluationsByReportId, setLoadError, weeklyReportIds]);

  const attentionItems = useMemo(() => {
    const focusDateKeys = recentDateKeys.slice(0, 3);
    return members.flatMap((member) => {
      const todayReport = getMemberReportForDate(reportEntriesByDay, selectedDate, member.id);
      const alerts: Array<{
        id: string;
        tone: "danger" | "warning" | "normal";
        title: string;
        detail: string;
        member: ReportMember;
        action: "remind" | "detail" | "feedback";
      }> = [];

      const missingDays = getMissingDaysStreak(member.id, focusDateKeys, reportEntriesByDay, todayDateKey);
      if (missingDays >= 2) {
        alerts.push({
          id: `${member.id}-missing`,
          tone: "danger",
          title: `${member.name} 已连续 ${missingDays} 天未提交`,
          detail: "建议尽快催交并确认是否存在客观阻塞。",
          member,
          action: "remind",
        });
      }

      const concern = getConcernText(todayReport);
      if (concern && todayReport) {
        alerts.push({
          id: `${member.id}-concern`,
          tone: "warning",
          title: `${member.name} 汇报出现风险关键词`,
          detail: `检测到"${concern}"，建议查看详情并及时跟进。`,
          member,
          action: "detail",
        });
      }

      const noFeedbackDays = getNoFeedbackStreak(member.id, focusDateKeys, reportEntriesByDay);
      if (noFeedbackDays >= 3) {
        alerts.push({
          id: `${member.id}-feedback`,
          tone: "normal",
          title: `${member.name} 连续 ${noFeedbackDays} 天未收到评价`,
          detail: "建议补充点评，避免成员长期缺少反馈闭环。",
          member,
          action: "feedback",
        });
      }

      return alerts;
    });
  }, [members, recentDateKeys, reportEntriesByDay, selectedDate, todayDateKey]);

  const trendSeries = useMemo(
    () =>
      buildTrendSeries({
        dateKeys: trendDateKeys,
        members,
        reportEntriesByDay,
        evaluationsByReportId,
        todayDateKey,
      }),
    [evaluationsByReportId, members, trendDateKeys, reportEntriesByDay, todayDateKey],
  );
  const previousTrendSeries = useMemo(
    () =>
      buildTrendSeries({
        dateKeys: previousTrendDateKeys,
        members,
        reportEntriesByDay,
        evaluationsByReportId,
        todayDateKey,
      }),
    [evaluationsByReportId, members, previousTrendDateKeys, reportEntriesByDay, todayDateKey],
  );
  const trendAverage = useMemo(() => getAverageSubmitRate(trendSeries), [trendSeries]);
  const previousTrendAverage = useMemo(() => getAverageSubmitRate(previousTrendSeries), [previousTrendSeries]);
  const trendPraiseTotal = useMemo(() => getTrendTotal(trendSeries, (point) => point.praiseCount), [trendSeries]);
  const previousTrendPraiseTotal = useMemo(
    () => getTrendTotal(previousTrendSeries, (point) => point.praiseCount),
    [previousTrendSeries],
  );
  const trendEvaluationTotal = useMemo(
    () => getTrendTotal(trendSeries, (point) => point.evaluationCount),
    [trendSeries],
  );

  const handleSendReminder = useCallback(
    async (member: ReportMember) => {
      if (!permissions.canSendDirective) {
        setLoadError("当前账号没有发送提醒的权限");
        return;
      }

      const cooldownKey = getReminderCooldownKey(member.id, selectedDate);
      if ((reminderCooldowns[cooldownKey] ?? 0) > Date.now()) {
        return;
      }

      setSendingReminderId(member.id);
      try {
        const payload = await Workspace.requestJson<Workspace.DirectReminderResponse>("/api/notifications", {
          method: "POST",
          body: JSON.stringify({
            userId: member.id,
            title: `汇报催交：${Workspace.formatShortDate(selectedDate)} 日程汇报待提交`,
            detail: `请及时补交 ${Workspace.formatShortDate(selectedDate)} 的工作汇报，提交后教师会继续跟进点评。`,
            targetTab: "reports",
          }),
        });

        const expiresAt = Date.now() + REPORT_REMINDER_COOLDOWN_MS;
        setReminderCooldowns((current) => {
          const next = { ...current, [cooldownKey]: expiresAt };
          persistReminderCooldowns(next);
          return next;
        });

        showSuccessToast(
          "催交已发送",
          Workspace.getReminderDeliveryDetail(payload.delivery, `已提醒 ${member.name} 尽快补交当日汇报。`),
        );
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "催交发送失败");
      } finally {
        setSendingReminderId(null);
      }
    },
    [permissions.canSendDirective, reminderCooldowns, selectedDate, setLoadError, showSuccessToast],
  );

  const handleCreateEvaluation = useCallback(
    async (reportId: string, type: ReportEvaluationItem["type"], content?: string) => {
      setSubmittingEvaluationKey(`${reportId}:${type}`);
      try {
        const payload = await Workspace.requestJson<{ evaluation: ReportEvaluationItem }>(`/api/reports/${reportId}/evaluations`, {
          method: "POST",
          body: JSON.stringify({ type, content }),
        });

        setEvaluationsByReportId((current) => ({
          ...current,
          [reportId]: [payload.evaluation, ...(current[reportId] ?? [])],
        }));
        setComposer(null);
        showSuccessToast("评价已发送", "学生端将收到新的汇报评价提醒。");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "评价发送失败");
      } finally {
        setSubmittingEvaluationKey(null);
      }
    },
    [setLoadError, showSuccessToast],
  );

  const handleRevokeEvaluation = useCallback(
    async (reportId: string, evaluationId: string) => {
      setRevokingEvaluationId(evaluationId);
      try {
        await Workspace.requestJson<{ success: boolean }>(`/api/reports/${reportId}/evaluations/${evaluationId}`, {
          method: "DELETE",
        });
        setEvaluationsByReportId((current) => ({
          ...current,
          [reportId]: (current[reportId] ?? []).filter((item) => item.id !== evaluationId),
        }));
        showSuccessToast("评价已撤回", "该评价已从学生可见记录中移除。");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "评价撤回失败");
      } finally {
        setRevokingEvaluationId(null);
      }
    },
    [setLoadError, showSuccessToast],
  );

  return (
    <div className="space-y-4">
      {showOverviewHeader ? (
        <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">{title}</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{groupName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-md bg-[var(--color-bg-subtle)] px-3 py-1 text-xs text-[var(--color-text-secondary)]">
                今日提交 {currentReports.length}/{members.length}
              </span>
              <div className="w-full min-w-64 lg:w-72">
                <SearchBar
                  onChange={handleSearchChange}
                  placeholder="搜索组内成员或汇报关键词"
                  value={resolvedSearch}
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-slate-900">需要关注</h3>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">系统自动识别未提交、关键词预警和长期缺少反馈的成员。</p>
          </div>
          <span className="rounded-md bg-[var(--color-danger-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-danger)]">
            {attentionItems.length} 条预警
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {attentionItems.length > 0 ? (
            attentionItems.map((item) => {
              const cooldownKey = getReminderCooldownKey(item.member.id, selectedDate);
              const coolingDown = (reminderCooldowns[cooldownKey] ?? 0) > Date.now();

              return (
                <div
                  className={`rounded-md px-3 py-2 ${
                    item.tone === "danger"
                      ? "bg-[var(--color-danger-soft)]"
                      : item.tone === "warning"
                        ? "bg-[var(--color-warning-soft)]"
                        : "bg-[var(--color-bg-subtle)]"
                  }`}
                  key={item.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs font-medium ${
                            item.tone === "danger"
                              ? "text-[var(--color-danger)]"
                              : item.tone === "warning"
                                ? "text-[var(--color-warning)]"
                                : "text-[var(--color-text-secondary)]"
                          }`}
                        >
                          {item.action === "remind" ? "连续未提交" : item.action === "detail" ? "关键词预警" : "待补反馈"}
                        </span>
                        <p className="text-sm text-slate-700">{item.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{item.detail}</p>
                    </div>
                    <div className="shrink-0">
                      {item.action === "remind" ? (
                        <button
                          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            coolingDown
                              ? "cursor-not-allowed border border-[var(--color-line)] bg-[var(--color-bg-subtle)] text-[var(--color-text-tertiary)]"
                              : "bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:opacity-80"
                          }`}
                          disabled={coolingDown}
                          onClick={() => void handleSendReminder(item.member)}
                          type="button"
                        >
                          <Workspace.BellPlus className="h-4 w-4" />
                          {sendingReminderId === item.member.id ? "发送中..." : coolingDown ? "2 小时内已催交" : "一键催交"}
                        </button>
                      ) : item.action === "detail" ? (
                        <button
                          className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-subtle)]"
                          onClick={() => handleSearchChange(item.member.name)}
                          type="button"
                        >
                          查看详情
                        </button>
                      ) : (
                        <button
                          className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-subtle)]"
                          onClick={() => handleSearchChange(item.member.name)}
                          type="button"
                        >
                          去评价
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed border-[var(--color-line)] bg-[var(--color-bg-subtle)] px-4 py-6 text-center text-sm text-[var(--color-text-tertiary)]">
              当前没有需要额外关注的成员，组内状态平稳。
            </div>
          )}
        </div>
      </article>

      <div className="space-y-3">
        <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-slate-900">成员汇报</h3>
              <p className="sr-only">成员汇报列表</p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                {currentReports.length}/{members.length} 已提交 · 支持 ▲ 点赞 / 待改进 / 批注
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {([
                  { key: "all", label: "全部" },
                  { key: "pending", label: `待点评 ${pendingReviewCount}` },
                  { key: "missing", label: `未提交 ${missingCount}` },
                ] as const).map((filter) => (
                  <button
                    key={filter.key}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      memberFilter === filter.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                    onClick={() => setMemberFilter(filter.key)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {filteredCards.map(({ member, report, evaluations }) => {
              const cooldownKey = getReminderCooldownKey(member.id, selectedDate);
              return (
                <TeacherMemberReportCard
                  composer={composer}
                  currentMemberId={currentMemberId}
                  evaluations={evaluations}
                  isExpanded={expandedMemberId === member.id}
                  key={member.id}
                  member={member}
                  onCloseComposer={() => setComposer(null)}
                  onComposerChange={(value) => setComposer((current) => (current ? { ...current, value } : current))}
                  onOpenComposer={(type) => {
                    if (!report?.id) {
                      return;
                    }
                    setExpandedMemberId(member.id);
                    setComposer({ reportId: report.id, type, value: "" });
                  }}
                  onRevokeEvaluation={handleRevokeEvaluation}
                  onSendReminder={() => void handleSendReminder(member)}
                  onSubmitComposer={(type) => {
                    if (!report?.id) {
                      return;
                    }
                    void handleCreateEvaluation(report.id, type, composer?.value);
                  }}
                  onToggleExpand={() => {
                    setComposer((current) => (current?.reportId === report?.id ? null : current));
                    setExpandedMemberId((current) => (current === member.id ? "" : member.id));
                  }}
                  reminderCoolingDown={(reminderCooldowns[cooldownKey] ?? 0) > Date.now()}
                  report={report}
                  revokingEvaluationId={revokingEvaluationId}
                  selectedDate={selectedDate}
                  sendingReminder={sendingReminderId === member.id}
                  composerSubmitting={Boolean(
                    report?.id &&
                      submittingEvaluationKey?.startsWith(`${report.id}:`),
                  )}
                  todayDateKey={todayDateKey}
                />
              );
            })}
            {filteredCards.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--color-line)] bg-[var(--color-bg-subtle)] px-4 py-6 text-center text-sm text-[var(--color-text-tertiary)]">
                当前筛选条件下暂无成员汇报
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-slate-900">本组本周趋势</h3>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                {trendDateKeys[trendDateKeys.length - 1]?.replaceAll("-", "/") ?? "--"} - {trendDateKeys[0]?.replaceAll("-", "/") ?? "--"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(["week", "month"] as const).map((range) => (
                <button
                  key={range}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                    trendRange === range
                      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                      : "border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]"
                  }`}
                  onClick={() => setTrendRange(range)}
                  type="button"
                >
                  {range === "week" ? "本周" : "本月"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="rounded-md bg-[var(--color-bg-subtle)] px-3 py-2">
                <p className="text-[11px] text-[var(--color-text-secondary)]">本周平均提交率</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{trendAverage}%</p>
                <p className={`mt-1 text-[11px] ${trendAverage >= previousTrendAverage ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                  {formatTrendDelta(trendAverage - previousTrendAverage, "%", "与上期持平")}
                </p>
              </div>
              <div className="rounded-md bg-[var(--color-bg-subtle)] px-3 py-2">
                <p className="text-[11px] text-[var(--color-text-secondary)]">本周累计获赞</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{trendPraiseTotal}</p>
                <p className={`mt-1 text-[11px] ${trendPraiseTotal >= previousTrendPraiseTotal ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                  {formatTrendDelta(trendPraiseTotal - previousTrendPraiseTotal, "", "与上期持平")}
                </p>
              </div>
              <div className="rounded-md bg-[var(--color-bg-subtle)] px-3 py-2">
                <p className="text-[11px] text-[var(--color-text-secondary)]">本周点评发起</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{trendEvaluationTotal}</p>
                <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                  {trendEvaluationTotal > 0 ? `覆盖 ${currentReports.length} 份当日汇报` : "待教师启动"}
                </p>
              </div>
            </div>

            <div className="rounded-md bg-[var(--color-bg-subtle)] px-3 py-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-900">每日提交率</p>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">单位：%</span>
              </div>
              <MainTrendChart series={trendSeries} todayDateKey={todayDateKey} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const TeacherReportsView = () => {
  const {
    currentUser,
    members,
    reportDateOptions,
    reportEntriesByDay,
    selectedDate,
    selectedReportTeamGroupId,
    setSelectedDate,
    setSelectedReportTeamGroupId,
    teamGroups,
    todayDateKey,
    visibleReportMembers,
  } = Workspace.useWorkspaceContext();
  const [teacherSearch, setTeacherSearch] = useState("");
  const moreDateInputRef = useRef<HTMLInputElement | null>(null);
  const teacherGroupIds = [
    ...new Set(
      [
        ...visibleReportMembers
          .map((member) => member.teamGroupId)
          .filter((value): value is string => Boolean(value)),
        ...(currentUser?.teamGroupId ? [currentUser.teamGroupId] : []),
      ],
    ),
  ];
  const teacherGroups = teamGroups.filter((group) => teacherGroupIds.includes(group.id));

  useEffect(() => {
    if (teacherGroups.length === 0) {
      return;
    }

    const hasSelectedGroup = teacherGroups.some((group) => group.id === selectedReportTeamGroupId);
    if (!hasSelectedGroup) {
      setSelectedReportTeamGroupId(teacherGroups[0].id);
    }
  }, [selectedReportTeamGroupId, setSelectedReportTeamGroupId, teacherGroups]);

  const activeGroupId = teacherGroups.find((group) => group.id === selectedReportTeamGroupId)?.id ?? teacherGroups[0]?.id ?? "";
  const activeGroupName = teacherGroups.find((group) => group.id === activeGroupId)?.name ?? "当前项目组";
  const activeTeacherNames = useMemo(
    () =>
      [...new Set(
        members
          .filter((member) => member.systemRole === "指导教师" && member.teamGroupId === activeGroupId)
          .map((member) => member.name),
      )],
    [activeGroupId, members],
  );
  const overviewDateKeys = useMemo(
    () => getRecentDateKeys(reportDateOptions, selectedDate, 7),
    [reportDateOptions, selectedDate],
  );
  const selectedDateReports = useMemo(
    () =>
      (reportEntriesByDay[selectedDate] ?? []).filter((report) =>
        visibleReportMembers.some((member) => member.id === report.memberId),
      ),
    [reportEntriesByDay, selectedDate, visibleReportMembers],
  );
  const teacherOverviewSeries = useMemo(
    () =>
      buildTrendSeries({
        dateKeys: overviewDateKeys,
        members: visibleReportMembers,
        reportEntriesByDay,
        evaluationsByReportId: {},
        todayDateKey,
      }),
    [overviewDateKeys, reportEntriesByDay, todayDateKey, visibleReportMembers],
  );
  const weeklySubmitRate = useMemo(() => getAverageSubmitRate(teacherOverviewSeries), [teacherOverviewSeries]);
  const weeklyPraiseTotal = useMemo(
    () =>
      overviewDateKeys.reduce((sum, date) => {
        const dayReports = (reportEntriesByDay[date] ?? []).filter((report) =>
          visibleReportMembers.some((member) => member.id === report.memberId),
        );
        return sum + dayReports.reduce((daySum, report) => daySum + (report.praiseCount ?? 0), 0);
      }, 0),
    [overviewDateKeys, reportEntriesByDay, visibleReportMembers],
  );
  const projectRank = useMemo(() => {
    const reportMembers = members.filter(
      (member) =>
        (member.systemRole === "项目负责人" || member.systemRole === "团队成员") &&
        member.approvalStatus !== "pending" &&
        Boolean(member.teamGroupId),
    );

    const rankings = teamGroups
      .map((group) => {
        const groupMembers = reportMembers.filter((member) => member.teamGroupId === group.id);
        if (groupMembers.length === 0) {
          return null;
        }

        const submitValues = overviewDateKeys
          .map((date) => {
            if (isBeforeReportDeadline(date, todayDateKey)) {
              return null;
            }

            const submittedCount = (reportEntriesByDay[date] ?? []).filter((report) =>
              groupMembers.some((member) => member.id === report.memberId),
            ).length;

            return Math.round((submittedCount / groupMembers.length) * 100);
          })
          .filter((value): value is number => typeof value === "number");

        const average = submitValues.length > 0 ? Math.round(submitValues.reduce((sum, value) => sum + value, 0) / submitValues.length) : 0;
        const praiseTotal = overviewDateKeys.reduce((sum, date) => {
          const dayReports = (reportEntriesByDay[date] ?? []).filter((report) =>
            groupMembers.some((member) => member.id === report.memberId),
          );
          return sum + dayReports.reduce((daySum, report) => daySum + (report.praiseCount ?? 0), 0);
        }, 0);

        return {
          id: group.id,
          average,
          praiseTotal,
        };
      })
      .filter((item): item is { id: string; average: number; praiseTotal: number } => Boolean(item))
      .sort((left, right) => right.average - left.average || right.praiseTotal - left.praiseTotal || left.id.localeCompare(right.id));

    const currentRank = rankings.findIndex((item) => item.id === activeGroupId);
    return {
      rank: currentRank >= 0 ? currentRank + 1 : 0,
      total: rankings.length,
    };
  }, [activeGroupId, members, overviewDateKeys, reportEntriesByDay, teamGroups, todayDateKey]);
  const visibleDateChips = useMemo(() => {
    return getPinnedDateChips(reportDateOptions, selectedDate, todayDateKey, 5);
  }, [reportDateOptions, selectedDate, todayDateKey]);

  if (teacherGroups.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <span>管理中心</span>
          <span>/</span>
          <span>日程汇报</span>
          <span className="ml-auto">教师视角 · {currentUser?.name ?? "当前教师"}</span>
        </div>
        <section className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-paper)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">当前账号尚未绑定可查看的项目组。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        <span>管理中心</span>
        <span>/</span>
        <span>日程汇报</span>
        <span className="ml-auto">教师视角 · {currentUser?.name ?? "当前教师"}</span>
      </div>

      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-900">日期</span>
            <div className="flex flex-wrap items-center gap-2">
              {visibleDateChips.map((date) => {
                const isSelected = date === selectedDate;
                const label = date === todayDateKey ? `今天 ${getShortDateLabel(date)}` : getShortDateLabel(date);

                return (
                  <button
                    key={date}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      isSelected
                        ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                        : "border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]"
                    }`}
                    onClick={() => setSelectedDate(date)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
              <button
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-subtle)]"
                onClick={() => {
                  moreDateInputRef.current?.showPicker?.();
                  moreDateInputRef.current?.click();
                }}
                type="button"
              >
                更多 ▾
              </button>
              <input
                className="sr-only"
                max={todayDateKey}
                ref={moreDateInputRef}
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  if (event.target.value) {
                    setSelectedDate(event.target.value);
                  }
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="h-9 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-3 text-xs text-[var(--color-text-secondary)] outline-none transition focus:border-[var(--color-primary)]"
              value={activeGroupId}
              onChange={(event) => setSelectedReportTeamGroupId(event.target.value)}
            >
              {teacherGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <div className="flex h-9 w-full min-w-72 items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-3 sm:w-72">
              <Workspace.Search className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <input
                className="w-full bg-transparent text-xs text-slate-900 outline-none placeholder:text-[var(--color-text-tertiary)]"
                placeholder="搜索组内成员或汇报关键词"
                type="search"
                value={teacherSearch}
                onChange={(event) => setTeacherSearch(event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-4 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] xl:items-start">
          <div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">我负责的项目组</p>
            <p className="mt-1 text-base font-medium text-slate-900">{activeGroupName}</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              指导教师：{activeTeacherNames.length > 0 ? activeTeacherNames.join(" · ") : "未绑定"}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">今日提交</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {selectedDateReports.length}
              <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">/ {visibleReportMembers.length}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">本周提交率</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySubmitRate}%</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">本周获赞</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklyPraiseTotal}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">全校项目组排名</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-primary)]">
              {projectRank.rank || "--"}
              <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">/ {projectRank.total || "--"}</span>
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              每日 {REPORT_DEADLINE_HOUR}:00 截止统计
            </p>
          </div>
        </div>
      </section>

      <GroupOperationsBoard
        groupName={activeGroupName}
        members={visibleReportMembers}
        onSearchChange={setTeacherSearch}
        searchValue={teacherSearch}
      />
    </div>
  );
};

const AdminReportsView = (props: ReportsViewProps) => {
  const {
    members,
    teamGroups,
    reportEntriesByDay,
    reportDateOptions,
    selectedDate,
    selectedReportTeamGroupId,
    setSelectedReportTeamGroupId,
    selectedReportSubmittedCount,
    selectedReportExpectedCount,
    showSuccessToast,
    setLoadError,
    currentMemberId,
    removeTeamReports,
    reportDeleteTeamGroupId,
    setReportDeleteTeamGroupId,
    todayDateKey,
    currentUser,
    setConfirmDialog,
  } = Workspace.useWorkspaceContext();
  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [expandedGroupId, setExpandedGroupId] = useState<string>("");
  const [bulkRemindLoading, setBulkRemindLoading] = useState(false);
  const [trendRange, setTrendRange] = useState<"week" | "month">("week");
  const [notifyTeachersLoading, setNotifyTeachersLoading] = useState(false);
  const [studentDrawer, setStudentDrawer] = useState<{ open: boolean; memberId: string }>({ open: false, memberId: "" });
  const [teacherDrawer, setTeacherDrawer] = useState<{ open: boolean; memberId: string }>({ open: false, memberId: "" });

  const reportMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          (member.systemRole === "项目负责人" || member.systemRole === "团队成员") &&
          member.approvalStatus !== "pending" &&
          Boolean(member.teamGroupId),
      ),
    [members],
  );
  const teacherMembers = useMemo(
    () => members.filter((member) => member.systemRole === "指导教师"),
    [members],
  );
  const teacherFilterOptions = useMemo(
    () =>
      [...new Set(teacherMembers.map((member) => member.name).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [teacherMembers],
  );
  const recentDateKeys = useMemo(
    () => getRecentDateKeys(reportDateOptions, selectedDate, 7),
    [reportDateOptions, selectedDate],
  );

  const groupHealthItems = useMemo(() => {
    const teacherMap = teacherMembers.reduce((map, teacher) => {
      if (!teacher.teamGroupId) {
        return map;
      }

      const teacherNames = map.get(teacher.teamGroupId) ?? [];
      if (!teacherNames.includes(teacher.name)) {
        teacherNames.push(teacher.name);
      }
      map.set(teacher.teamGroupId, teacherNames);
      return map;
    }, new Map<string, string[]>());

    return teamGroups
      .map((group) => {
        const groupMembers = reportMembers.filter((member) => member.teamGroupId === group.id);
        const dayReports = (reportEntriesByDay[selectedDate] ?? []).filter((report) => report.teamGroupId === group.id);
        const submittedCount = dayReports.length;
        const expectedCount = groupMembers.length;
        const submitRate = expectedCount > 0 ? Math.round((submittedCount / expectedCount) * 100) : 0;
        const missingCount = Math.max(0, expectedCount - submittedCount);
        const concernCount = dayReports.filter((report) => Boolean(getConcernText(report))).length;
        const noFeedbackCount = groupMembers.filter(
          (member) => getNoFeedbackStreak(member.id, recentDateKeys.slice(0, 3), reportEntriesByDay) >= 3,
        ).length;
        const teacherNames = teacherMap.get(group.id) ?? [];

        const alerts = [
          missingCount > 0 ? `今日有 ${missingCount} 人未提交` : null,
          concernCount > 0 ? `${concernCount} 条汇报存在卡点关键词` : null,
          noFeedbackCount > 0 ? `${noFeedbackCount} 人连续 3 天未收到评价` : null,
          teacherNames.length > 0 ? `指导教师：${teacherNames.join("、")}` : null,
        ].filter((item): item is string => Boolean(item));

        const tone: GroupHealthItem["tone"] =
          missingCount >= 2 || concernCount > 0
            ? "danger"
            : missingCount > 0 || noFeedbackCount > 0 || submitRate < 80
              ? "warning"
              : "success";

        return {
          id: group.id,
          name: group.name,
          submittedCount,
          expectedCount,
          submitRate,
          tone,
          summary:
            tone === "danger"
              ? "存在明显异常，建议优先跟进。"
              : tone === "warning"
                ? "整体可控，但仍需继续关注。"
                : "提交和反馈节奏稳定。",
          alerts,
          members: groupMembers,
          reports: dayReports,
          teacherNames,
        };
      })
      .filter((group) => (selectedReportTeamGroupId ? group.id === selectedReportTeamGroupId : true))
      .filter((group) => (teacherFilter ? group.teacherNames.includes(teacherFilter) : true))
      .sort((left, right) => {
        const toneOrder: Record<GroupHealthItem["tone"], number> = { danger: 0, warning: 1, success: 2 };
        if (toneOrder[left.tone] !== toneOrder[right.tone]) {
          return toneOrder[left.tone] - toneOrder[right.tone];
        }

        return left.submitRate - right.submitRate;
      });
  }, [
    reportEntriesByDay,
    reportMembers,
    recentDateKeys,
    selectedDate,
    selectedReportTeamGroupId,
    teacherFilter,
    teacherMembers,
    teamGroups,
  ]);

  const activeGroupId = expandedGroupId || selectedReportTeamGroupId || groupHealthItems[0]?.id || "";
  const activeGroup = groupHealthItems.find((item) => item.id === activeGroupId) ?? null;

  const adminSearchResults = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return {
        groups: [] as GroupHealthItem[],
        teachers: [] as ReportMember[],
        students: [] as ReportMember[],
      };
    }

    return {
      groups: groupHealthItems.filter((group) => group.name.toLowerCase().includes(keyword)).slice(0, 5),
      teachers: teacherMembers.filter((member) => member.name.toLowerCase().includes(keyword)).slice(0, 5),
      students: reportMembers.filter((member) => member.name.toLowerCase().includes(keyword)).slice(0, 8),
    };
  }, [groupHealthItems, reportMembers, search, teacherMembers]);

  const globalRecentReportIds = useMemo(
    () =>
      recentDateKeys.flatMap((date) =>
        (reportEntriesByDay[date] ?? [])
          .map((report) => report.id)
          .filter((value): value is string => Boolean(value)),
      ),
    [recentDateKeys, reportEntriesByDay],
  );
  const [adminEvaluationsByReportId, setAdminEvaluationsByReportId] = useState<Record<string, ReportEvaluationItem[]>>({});

  useEffect(() => {
    const missingIds = [...new Set(globalRecentReportIds)].filter((reportId) => !adminEvaluationsByReportId[reportId]);
    if (missingIds.length === 0) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const responses = await Promise.all(
          missingIds.map((reportId) =>
            Workspace.requestJson<{ evaluations: ReportEvaluationItem[] }>(`/api/reports/${reportId}/evaluations?limit=20`),
          ),
        );

        if (!active) {
          return;
        }

        setAdminEvaluationsByReportId((current) => {
          const next = { ...current };
          missingIds.forEach((reportId, index) => {
            next[reportId] = responses[index].evaluations;
          });
          return next;
        });
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "全校评价统计加载失败");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [adminEvaluationsByReportId, globalRecentReportIds, setLoadError]);

  const teacherActivity = useMemo(() => {
    const entries = new Map<
      string,
      {
        name: string;
        commentCount: number;
        praiseCount: number;
        improveCount: number;
      }
    >();

    Object.values(adminEvaluationsByReportId)
      .flat()
      .forEach((evaluation) => {
        const current = entries.get(evaluation.evaluatorId) ?? {
          name: evaluation.evaluator.name,
          commentCount: 0,
          praiseCount: 0,
          improveCount: 0,
        };

        current.commentCount += 1;
        if (evaluation.type === "praise") {
          current.praiseCount += 1;
        }
        if (evaluation.type === "improve") {
          current.improveCount += 1;
        }

        entries.set(evaluation.evaluatorId, current);
      });

    return Array.from(entries.entries())
      .map(([id, value]) => ({
        id,
        ...value,
      }))
      .sort((left, right) => right.commentCount - left.commentCount);
  }, [adminEvaluationsByReportId]);

  const overallSubmitRate =
    selectedReportExpectedCount > 0 ? Math.round((selectedReportSubmittedCount / selectedReportExpectedCount) * 100) : 0;

  const isTodayBeforeDeadline = isBeforeReportDeadline(selectedDate, todayDateKey);

  const yesterdaySubmitRate = useMemo(() => {
    const yesterday = reportDateOptions.find((date) => date < selectedDate);
    if (!yesterday) {
      return 0;
    }

    const yesterdayReports = reportEntriesByDay[yesterday] ?? [];
    const expected = reportMembers.length || 1;
    return Math.round((yesterdayReports.length / expected) * 100);
  }, [reportDateOptions, reportEntriesByDay, reportMembers.length, selectedDate]);

  const canShowTeacherBoard = useMemo(
    () => currentUser?.roleLabel === "指导教师",
    [currentUser?.roleLabel],
  );

  const trendDateKeys = useMemo(() => {
    if (trendRange === "week") {
      return getRecentDateKeys(reportDateOptions, selectedDate, 7);
    }

    return reportDateOptions.filter((date) => date.startsWith(selectedDate.slice(0, 7)));
  }, [reportDateOptions, selectedDate, trendRange]);

  const previousWeekDateKeys = useMemo(
    () =>
      reportDateOptions.filter((date) => date < recentDateKeys[recentDateKeys.length - 1]).slice(0, 7),
    [recentDateKeys, reportDateOptions],
  );
  const currentWeekAverage = useMemo(() => {
    const total = recentDateKeys.reduce((sum, date) => {
      const expected = reportMembers.length || 1;
      return sum + Math.round((((reportEntriesByDay[date] ?? []).length) / expected) * 100);
    }, 0);
    return recentDateKeys.length > 0 ? Math.round(total / recentDateKeys.length) : 0;
  }, [recentDateKeys, reportEntriesByDay, reportMembers.length]);
  const previousWeekAverage = useMemo(() => {
    const total = previousWeekDateKeys.reduce((sum, date) => {
      const expected = reportMembers.length || 1;
      return sum + Math.round((((reportEntriesByDay[date] ?? []).length) / expected) * 100);
    }, 0);
    return previousWeekDateKeys.length > 0 ? Math.round(total / previousWeekDateKeys.length) : currentWeekAverage;
  }, [currentWeekAverage, previousWeekDateKeys, reportEntriesByDay, reportMembers.length]);
  const weekDelta = currentWeekAverage - previousWeekAverage;

  const adminWarnings = useMemo(() => {
    const warnings: Array<{
      id: string;
      title: string;
      detail: string;
      actionLabel: string;
      onAction: () => void;
    }> = [];

    groupHealthItems.forEach((group) => {
      const noSubmitThreeDays = group.members.every(
        (member) => getMissingDaysStreak(member.id, recentDateKeys.slice(0, 3), reportEntriesByDay, todayDateKey) >= 3,
      );
      if (noSubmitThreeDays && group.members.length > 0) {
        warnings.push({
          id: `${group.id}-nosubmit`,
          title: `${group.name} 已连续 3 天无提交`,
          detail: "建议立刻下钻查看详情并催交。",
          actionLabel: "查看详情",
          onAction: () => setExpandedGroupId(group.id),
        });
      }
    });

    teacherActivity
      .filter((teacher, index, source) => source.length > 1 && index >= source.length - 1)
      .forEach((teacher) => {
        warnings.push({
          id: `${teacher.id}-inactive`,
          title: `${teacher.name} 点评次数偏低`,
          detail: "本周点评活跃度落后，建议管理员关注。",
          actionLabel: "发通知",
          onAction: () => setSearch(teacher.name),
        });
      });

    if (weekDelta <= -5) {
      warnings.push({
        id: "week-delta",
        title: "全校提交率环比下降超过 5%",
        detail: `当前周均提交率 ${currentWeekAverage}% ，较上周下降 ${Math.abs(weekDelta)}%。`,
        actionLabel: "查看详情",
        onAction: () => setExpandedGroupId(groupHealthItems[0]?.id ?? ""),
      });
    }

    return warnings;
  }, [currentWeekAverage, groupHealthItems, recentDateKeys, reportEntriesByDay, teacherActivity, todayDateKey, weekDelta]);

  const adminTrendSeries = useMemo(
    () =>
      buildTrendSeries({
        dateKeys: trendDateKeys,
        members: reportMembers,
        reportEntriesByDay,
        evaluationsByReportId: adminEvaluationsByReportId,
        todayDateKey,
      }),
    [adminEvaluationsByReportId, trendDateKeys, reportEntriesByDay, reportMembers, todayDateKey],
  );

  const totalEvaluationCount = useMemo(
    () => adminTrendSeries.reduce((sum, point) => sum + point.evaluationCount, 0),
    [adminTrendSeries],
  );
  const totalPraiseCount = useMemo(
    () => adminTrendSeries.reduce((sum, point) => sum + point.praiseCount, 0),
    [adminTrendSeries],
  );

  const handleBulkRemind = useCallback(async () => {
    const missingMembers = reportMembers.filter(
      (member) => !getMemberReportForDate(reportEntriesByDay, selectedDate, member.id),
    );

    const recipientIds = missingMembers.map((member) => member.id).filter((memberId) => memberId !== currentMemberId);
    if (recipientIds.length === 0) {
      setLoadError("当前没有需要批量催交的成员");
      return;
    }

    setBulkRemindLoading(true);
    try {
      const responses = await Promise.all(
        recipientIds.map((userId) =>
          Workspace.requestJson<Workspace.DirectReminderResponse>("/api/notifications", {
            method: "POST",
            body: JSON.stringify({
              userId,
              title: `汇报催交：${Workspace.formatShortDate(selectedDate)} 日程汇报待提交`,
              detail: `请及时补交 ${Workspace.formatShortDate(selectedDate)} 的工作汇报，学校管理端已同步关注进度。`,
              targetTab: "reports",
            }),
          }),
        ),
      );

      showSuccessToast(
        "批量催交已发送",
        Workspace.getBatchReminderDeliveryDetail(
          responses.map((item) => item.delivery),
          `已提醒 ${recipientIds.length} 名成员尽快补交当日汇报。`,
        ),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "批量催交失败");
    } finally {
      setBulkRemindLoading(false);
    }
  }, [currentMemberId, reportEntriesByDay, reportMembers, selectedDate, setLoadError, showSuccessToast]);

  const handleNotifyAllTeachers = useCallback(async () => {
    const teacherIds = teacherMembers
      .map((member) => member.id)
      .filter((id) => id !== currentMemberId);

    if (teacherIds.length === 0) {
      setLoadError("当前没有可通知的指导教师");
      return;
    }

    setNotifyTeachersLoading(true);
    try {
      const responses = await Promise.all(
        teacherIds.map((userId) =>
          Workspace.requestJson<Workspace.DirectReminderResponse>("/api/notifications", {
            method: "POST",
            body: JSON.stringify({
              userId,
              title: "提醒：请及时使用点评功能",
              detail: "本周尚未发现您的点评记录，建议登录系统查看学生汇报并进行点评反馈。",
              targetTab: "reports",
            }),
          }),
        ),
      );

      showSuccessToast(
        "提醒已发送",
        Workspace.getBatchReminderDeliveryDetail(
          responses.map((item) => item.delivery),
          `已向 ${teacherIds.length} 位指导教师发送点评提醒。`,
        ),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "提醒发送失败");
    } finally {
      setNotifyTeachersLoading(false);
    }
  }, [currentMemberId, setLoadError, showSuccessToast, teacherMembers]);

  const handleCleanupClick = useCallback(() => {
    if (!reportDeleteTeamGroupId) {
      setLoadError("请先选择要清理的项目组");
      return;
    }

    const group = teamGroups.find((g) => g.id === reportDeleteTeamGroupId);
    setConfirmDialog({
      open: true,
      title: "确认删除",
      message: `确定要删除「${group?.name ?? "所选项目组"}」在 ${Workspace.formatShortDate(selectedDate)} 的全部汇报记录吗？此操作不可恢复。`,
      confirmLabel: "确认删除",
      confirmVariant: "danger",
      successTitle: "数据已清理",
      successDetail: "指定项目组的汇报记录已被删除。",
      onConfirm: async () => {
        await removeTeamReports();
      },
    });
  }, [reportDeleteTeamGroupId, selectedDate, setLoadError, setConfirmDialog, removeTeamReports, teamGroups]);

  return (
    <div className="admin-reports-dashboard space-y-5">
      <Workspace.SectionHeader
        description={props.viewDescription || "管理员视角聚焦全校提交健康度、教师点评活跃度和异常项目组，优先暴露学校级风险。"}
        title="日程汇报"
      />

      <section className={`admin-overview-card ${adminSurfaceCardClassName}`}>
        <div className="grid gap-5 xl:grid-cols-[minmax(220px,0.8fr)_minmax(220px,0.65fr)_minmax(360px,1.25fr)] xl:items-start">
          <div>
            <p className="text-base font-bold text-slate-900">全校概览</p>
            <div className="mt-4">
              <div>
                {isTodayBeforeDeadline ? (
                  <>
                    <p className="admin-overview-rate text-[42px] font-bold leading-none tracking-tight text-slate-900">
                      {selectedReportSubmittedCount}/{selectedReportExpectedCount}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-500">今日进度</p>
                  </>
                ) : (
                  <>
                    <p className="admin-overview-rate text-[42px] font-bold leading-none tracking-tight text-slate-900">{overallSubmitRate}%</p>
                    <p className="mt-2 text-sm font-medium text-slate-500">今日提交率</p>
                  </>
                )}
                <p className="mt-1 text-sm text-slate-500">昨日提交率 {yesterdaySubmitRate}%</p>
              </div>
            </div>
          </div>

          <div className={`admin-compare-card ${adminSubtlePanelClassName} px-5 py-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500">本周均值 vs 上周均值</p>
                <p className={`mt-3 text-2xl font-bold leading-none ${weekDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {weekDelta >= 0 ? "↑" : "↓"} {Math.abs(weekDelta)}%
                </p>
              </div>
              <span
                className="inline-flex h-6 w-6 cursor-help items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-400"
                title="按最近一周平均提交率与上一周平均提交率的差值计算"
              >
                ?
              </span>
            </div>
          </div>

          <div className="w-full space-y-3">
            <SearchBar onChange={setSearch} placeholder="搜索学生、教师、项目组名" value={search} />
            {search.trim() ? (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold text-slate-400">项目组</p>
                  <div className="mt-2 space-y-2">
                    {adminSearchResults.groups.map((group) => (
                      <button
                        className="block w-full rounded-lg bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-blue-200 hover:text-blue-600"
                        key={group.id}
                        onClick={() => {
                          setExpandedGroupId(group.id);
                          setSelectedReportTeamGroupId(group.id);
                        }}
                        type="button"
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400">教师</p>
                  <div className="mt-2 space-y-2">
                    {adminSearchResults.teachers.map((member) => (
                      <button
                        className="block w-full rounded-lg bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:text-blue-600"
                        key={member.id}
                        onClick={() => setTeacherDrawer({ open: true, memberId: member.id })}
                        type="button"
                      >
                        {member.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400">学生</p>
                  <div className="mt-2 space-y-2">
                    {adminSearchResults.students.map((member) => (
                      <button
                        className="block w-full rounded-lg bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:text-blue-600"
                        key={member.id}
                        onClick={() => setStudentDrawer({ open: true, memberId: member.id })}
                        type="button"
                      >
                        {member.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={adminSurfaceCardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">项目组健康度总览</h3>
            <p className="mt-1 text-sm text-slate-500">异常项目组自动置顶，支持直接展开查看该组详情。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Workspace.ActionButton
              className="h-11 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700"
              onClick={() => {
                const randomGroup = groupHealthItems[Math.floor(Math.random() * groupHealthItems.length)];
                if (randomGroup) {
                  setExpandedGroupId(randomGroup.id);
                }
              }}
            >
              <Workspace.Shuffle className="h-4 w-4" />
              随机抽查
            </Workspace.ActionButton>
            <select
              className={adminFieldCompactClassName}
              value={selectedReportTeamGroupId}
              onChange={(event) => setSelectedReportTeamGroupId(event.target.value)}
            >
              <option value="">全部项目组</option>
              {teamGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <select
              className={adminFieldCompactClassName}
              value={teacherFilter}
              onChange={(event) => setTeacherFilter(event.target.value)}
            >
              <option value="">全部指导教师</option>
              {teacherFilterOptions.map((teacherName) => (
                <option key={teacherName} value={teacherName}>
                  {teacherName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {groupHealthItems.map((group) => {
            const toneMeta = adminHealthToneMeta[group.tone];
            return (
              <div
                className="admin-health-row cursor-pointer rounded-2xl border border-slate-200 bg-white transition hover:border-blue-100 hover:bg-blue-50/20 hover:shadow-[0_8px_22px_rgba(16,24,40,0.06)]"
                key={group.id}
                onClick={() => setExpandedGroupId((current) => (current === group.id ? "" : group.id))}
                role="button"
                tabIndex={0}
              >
                <div className="grid w-full gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_300px_28px] xl:items-start">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${toneMeta.dotClassName}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{group.name}</p>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneMeta.badgeClassName}`}>
                          {toneMeta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {group.alerts.filter((alert) => !alert.startsWith("指导教师：")).join(" · ") || group.summary}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        {group.teacherNames.length > 0 ? `指导教师：${group.teacherNames.join("、")}` : "指导教师：未绑定"}
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <p className={`w-14 text-right text-lg font-bold ${group.tone === "danger" ? "text-rose-600" : "text-slate-900"}`}>
                        {group.submittedCount}/{group.expectedCount}
                      </p>
                      <div className="admin-health-progress h-2 min-w-0 flex-1 rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${toneMeta.progressClassName}`}
                          style={{ width: `${Math.min(100, Math.max(0, group.submitRate))}%` }}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-right text-xs text-slate-400">{group.summary}</p>
                  </div>
                  <Workspace.ChevronRight className="hidden h-5 w-5 text-slate-400 xl:block" />
                </div>

                {expandedGroupId === group.id ? (
                  <div className="border-t border-slate-100 px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-500">成员汇报列表</p>
                      <button
                        className="text-xs text-slate-500"
                        onClick={() => setExpandedGroupId("")}
                        type="button"
                      >
                        收起
                      </button>
                    </div>
                    <div className="space-y-3">
                      {group.members.map((member) => {
                        const memberReport = getMemberReportForDate(reportEntriesByDay, selectedDate, member.id);
                        return (
                          <AdminReadonlyReportCard
                            key={member.id}
                            date={selectedDate}
                            evaluations={memberReport?.id ? (adminEvaluationsByReportId[memberReport.id] ?? []) : []}
                            formatShortDate={props.formatShortDate}
                            member={member}
                            report={memberReport}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className={adminSurfaceCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">教师活跃度排行</h3>
              <p className="mt-1 text-sm text-slate-500">按本周点评次数排序，帮助管理员识别可能失管的教师。</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {teacherActivity.length > 0 ? (
              teacherActivity.map((teacher, index) => (
                <div className="admin-teacher-rank-card flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3" key={teacher.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-100 text-sm font-bold text-amber-700 shadow-[inset_0_0_0_3px_rgba(255,255,255,0.6)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{teacher.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        点评 {teacher.commentCount} 次 <span className="mx-2 text-slate-300">|</span> 点赞 {teacher.praiseCount} 次
                        <span className="mx-2 text-slate-300">|</span> 待改进 {teacher.improveCount} 次
                      </p>
                    </div>
                  </div>
                  {index === teacherActivity.length - 1 && teacher.commentCount <= 1 ? (
                    <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      ⚠️ 疑似失管
                    </span>
                  ) : (
                    <Workspace.Award className="h-5 w-5 shrink-0 text-amber-500" />
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                <p className="text-sm font-medium text-slate-500">本周尚无教师发起点评，建议督促各位指导教师开始使用点评功能。</p>
                <Workspace.ActionButton
                  className="mt-3 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  loading={notifyTeachersLoading}
                  loadingLabel="发送中..."
                  onClick={() => void handleNotifyAllTeachers()}
                >
                  <Workspace.BellPlus className="h-4 w-4" />
                  提醒全体指导教师
                </Workspace.ActionButton>
              </div>
            )}
          </div>
        </article>

        <article className={adminSurfaceCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">全校预警</h3>
              <p className="mt-1 text-sm text-slate-500">把最需要管理员处理的问题集中收口，不需要逐组翻找。</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {adminWarnings.length > 0 ? (
              adminWarnings.map((warning) => (
                <div className="admin-warning-soft-card rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3" key={warning.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                        <Workspace.AlertCircle className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{warning.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{warning.detail}</p>
                      </div>
                    </div>
                    <button
                      className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                      onClick={warning.onAction}
                      type="button"
                    >
                      {warning.actionLabel}
                      <Workspace.ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                当前没有学校级预警
              </div>
            )}
          </div>
        </article>
      </section>

      <section className={adminSurfaceCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">趋势分析</h3>
            <p className="mt-1 text-sm text-slate-500">按加权值看提交率、点评总数和点赞数量变化。</p>
          </div>
          <div className="flex gap-2">
            {(["week", "month"] as const).map((range) => (
              <button
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  trendRange === range
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
                key={range}
                onClick={() => setTrendRange(range)}
                type="button"
              >
                {range === "week" ? "本周" : "本月"}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-trend-layout mt-4 grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="admin-trend-stat-card rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Workspace.TrendingUp className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs text-slate-500">本周平均提交率</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{currentWeekAverage}%</p>
                </div>
              </div>
              <p className={`mt-3 text-xs font-medium ${weekDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {weekDelta >= 0 ? "↑" : "↓"} 较上周 {Math.abs(weekDelta)}%
              </p>
            </div>
            <div className="admin-trend-stat-card rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Workspace.MessageSquareText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs text-slate-500">本周总点评数</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{totalEvaluationCount}</p>
                </div>
              </div>
              {totalEvaluationCount === 0 ? (
                <p className="mt-3 text-xs text-slate-400">本周暂无点评活动</p>
              ) : null}
            </div>
            <div className="admin-trend-stat-card rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Workspace.Award className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs text-slate-500">本周总点赞数</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{totalPraiseCount}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <MainTrendChart series={adminTrendSeries} todayDateKey={todayDateKey} />
          </div>
        </div>
      </section>

      {activeGroup && canShowTeacherBoard ? (
        <GroupOperationsBoard groupName={activeGroup.name} members={activeGroup.members} title="我作为教师负责的项目组" />
      ) : null}

      <section className={`admin-management-tools ${adminSurfaceCardClassName}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">管理工具</h3>
            <p className="mt-1 text-sm text-slate-500">批量操作与数据导出，危险操作需要二次确认。</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Workspace.ActionButton
            className="h-11 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100"
            loading={bulkRemindLoading}
            loadingLabel="发送中..."
            onClick={() => void handleBulkRemind()}
          >
            <Workspace.BellPlus className="h-4 w-4" />
            批量催交
          </Workspace.ActionButton>
          <Workspace.ActionButton
            className="h-11 rounded-xl"
            onClick={() => {
              const csvRows = [
                ["项目组", "今日提交比", "健康度"],
                ...groupHealthItems.map((group) => [
                  group.name,
                  `${group.submittedCount}/${group.expectedCount}`,
                  group.tone,
                ]),
              ];
              const csv = csvRows.map((row) => row.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `reports-weekly-${selectedDate}.csv`;
              link.click();
              window.URL.revokeObjectURL(url);
            }}
          >
            <Workspace.Download className="h-4 w-4" />
            导出周报
          </Workspace.ActionButton>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={adminFieldCompactClassName}
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
            <Workspace.ActionButton
              className="h-11 rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              disabled={!reportDeleteTeamGroupId}
              onClick={handleCleanupClick}
            >
              <Workspace.Trash2 className="h-4 w-4" />
              数据清理
            </Workspace.ActionButton>
          </div>
        </div>
      </section>

      <RightDrawer
        open={studentDrawer.open}
        title="学生详情"
        onClose={() => setStudentDrawer({ open: false, memberId: "" })}
      >
        {(() => {
          const member = reportMembers.find((m) => m.id === studentDrawer.memberId);
          if (!member) return null;
          const memberReport = getMemberReportForDate(reportEntriesByDay, selectedDate, member.id);
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-slate-900">{member.name}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{member.systemRole}</span>
              </div>
              <AdminReadonlyReportCard
                date={selectedDate}
                evaluations={memberReport?.id ? (adminEvaluationsByReportId[memberReport.id] ?? []) : []}
                formatShortDate={props.formatShortDate}
                member={member}
                report={memberReport}
              />
            </div>
          );
        })()}
      </RightDrawer>

      <RightDrawer
        open={teacherDrawer.open}
        title="教师详情"
        onClose={() => setTeacherDrawer({ open: false, memberId: "" })}
      >
        {(() => {
          const member = teacherMembers.find((m) => m.id === teacherDrawer.memberId);
          if (!member) return null;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-slate-900">{member.name}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{member.systemRole}</span>
              </div>
              <p className="text-sm text-slate-500">指导项目组：{member.teamGroupName || "未绑定"}</p>
            </div>
          );
        })()}
      </RightDrawer>
    </div>
  );
};

export default function ScheduleTab() {
  const {
    currentUser,
    currentRole,
    teamGroups,
    reportEntriesByDay,
    selectedDate,
    setSelectedDate,
    selectedReportTeamGroupId,
    setSelectedReportTeamGroupId,
    reportDeleteTeamGroupId,
    setReportDeleteTeamGroupId,
    hasGlobalAdminRole,
    currentMemberId,
    permissions,
    reportEntryMap,
    todayDateKey,
    visibleReportMembers,
    reportDateOptions,
    selectedReportSubmittedCount,
    selectedReportExpectedCount,
    selectedReportMissingCount,
    currentUserSelectedReport,
    selectedDateHasSavedReports,
    sendReportReminder,
    openCreateReportModal,
    openEditReportModal,
    removeReport,
    removeTeamReports,
  } = Workspace.useWorkspaceContext();

  const {
    BellPlus,
    CalendarDays,
    getReportAttachmentNote,
    surfaceCardClassName,
    fieldClassName,
    formatShortDate,
    SectionHeader,
    EmptyState,
    ActionButton,
  } = Workspace;

  const [reportSearch, setReportSearch] = useState("");
  const reportsViewRole = getReportsViewRole(currentRole);

  const filteredReportMembers = useMemo(() => {
    const keyword = reportSearch.trim().toLowerCase();
    if (!keyword) {
      return visibleReportMembers;
    }

    return visibleReportMembers.filter((member) => {
      const report = reportEntryMap.get(member.id);
      const haystack = [
        member.name,
        member.systemRole,
        member.teamGroupName ?? "",
        report?.summary ?? "",
        report?.nextPlan ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [reportEntryMap, reportSearch, visibleReportMembers]);

  const sharedProps: ReportsViewProps = {
    ActionButton,
    BellPlus,
    CalendarDays,
    EmptyState,
    SectionHeader,
    currentMemberId,
    currentUserSelectedReport,
    fieldClassName,
    filteredReportMembers,
    formatShortDate,
    getReportAttachmentNote,
    hasGlobalAdminRole,
    openCreateReportModal,
    openEditReportModal,
    permissions,
    removeReport,
    removeTeamReports,
    reportDateOptions,
    reportDeleteTeamGroupId,
    reportEntriesByDay,
    reportEntryMap,
    reportSearch,
    reportSearchPlaceholder:
      reportsViewRole === "admin"
        ? "搜索成员、项目组或汇报内容"
        : "搜索组内成员或汇报内容",
    reportSearchScopeLabel:
      reportsViewRole === "admin"
        ? "管理员搜索范围：当前筛选项目组内的成员、汇报内容和项目组信息。"
        : "教师搜索范围：所绑定项目组内的成员姓名和汇报内容。",
    selectedDate,
    selectedDateHasSavedReports,
    selectedReportExpectedCount,
    selectedReportMissingCount,
    selectedReportSubmittedCount,
    selectedReportTeamGroupId,
    sendReportReminder,
    setReportDeleteTeamGroupId,
    setReportSearch,
    setSelectedDate,
    setSelectedReportTeamGroupId,
    surfaceCardClassName,
    teamGroups,
    todayDateKey,
    viewDescription:
      reportsViewRole === "admin"
        ? "按日期查看全校项目组汇报归档，可筛选项目组并全局搜索。"
        : reportsViewRole === "teacher"
          ? "按日期查看所绑定项目组的汇报归档，可搜索组内成员并定向提醒。"
          : `按日期查看${currentUser?.teamGroupName ?? "本项目组"}成员的汇报记录，并补交或修改自己的内容。`,
    visibleReportMembers,
  };

  if (reportsViewRole === "student") {
    return <StudentReportsView {...sharedProps} />;
  }

  if (reportsViewRole === "teacher") {
    return <TeacherReportsView />;
  }

  if (reportsViewRole === "admin") {
    return <AdminReportsView {...sharedProps} />;
  }

  return <StudentReportsView {...sharedProps} />;
}
