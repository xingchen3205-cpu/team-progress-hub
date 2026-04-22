"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  <div className="report-filter-column flex h-full flex-col space-y-4 self-stretch">
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
      {reportDateOptions.slice(0, 10).map((date) => {
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
      <div className="report-record-legend mt-auto rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3">
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
  type: "improve" | "comment";
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

const getSemesterStartDate = (todayKey: string) => {
  // Rough semester boundary heuristic without external config:
  // Spring semester: Feb 1 – Jul 31
  // Autumn semester: Sep 1 – Jan 31
  const month = Number(todayKey.slice(5, 7));
  const year = Number(todayKey.slice(0, 4));

  if (month >= 2 && month <= 7) {
    return `${year}-02-01`;
  }

  if (month >= 8) {
    return `${year}-09-01`;
  }

  return `${year - 1}-09-01`;
};

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
    icon: "🌟",
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
) => {
  let streak = 0;

  for (const date of dateKeys) {
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

const buildChartTicks = (maxValue: number) => {
  const safeMax = Math.max(1, maxValue);
  const middle = safeMax <= 1 ? 1 : Math.ceil(safeMax / 2);
  return [safeMax, middle, 0];
};

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

const buildLinePath = (series: TrendPoint[], accessor: (point: TrendPoint) => number | null, height = 84) => {
  if (series.length === 0) {
    return "";
  }

  const width = 100;
  const step = series.length === 1 ? width : width / (series.length - 1);
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let currentSegment: Array<{ x: number; y: number }> = [];

  series.forEach((point, index) => {
    const value = accessor(point);
    const x = Number((index * step).toFixed(2));

    if (value === null || value === undefined) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }

      return;
    }

    const y = Number((height - (Math.min(100, Math.max(0, value)) / 100) * height).toFixed(2));
    currentSegment.push({ x, y });
  });

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments
    .map((segment) =>
      segment.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
    )
    .join(" ");
};

const ChartEmptyState = ({ accumulatedDays, compact }: { accumulatedDays: number; compact?: boolean }) => (
  <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center ${compact ? "py-4" : "py-8"}`}>
    <Workspace.BarChart3 className={`text-slate-300 ${compact ? "mb-1 h-6 w-6" : "mb-2 h-8 w-8"}`} />
    <p className="text-sm font-medium text-slate-500">数据积累中，3 天后显示趋势</p>
    {!compact ? <p className="mt-1 text-xs text-slate-400">当前已积累 {accumulatedDays} 天数据</p> : null}
  </div>
);

const MiniTrendChart = ({
  series,
  lineClassName,
  accessor,
  fillClassName,
  todayDateKey,
}: {
  series: TrendPoint[];
  lineClassName: string;
  accessor: (point: TrendPoint) => number | null;
  fillClassName?: string;
  todayDateKey: string;
}) => {
  const path = buildLinePath(series, accessor);
  const effectiveDays = getEffectiveDataDays(
    series.map((s) => s.date),
    todayDateKey,
  );

  if (series.length === 0 || effectiveDays < 3) {
    return <ChartEmptyState accumulatedDays={effectiveDays} />;
  }

  const ticks = buildChartTicks(100);

  return (
    <div className="grid grid-cols-[38px_minmax(0,1fr)] gap-3">
      <div className="flex h-24 flex-col justify-between text-[11px] text-slate-400">
        {ticks.map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="space-y-3">
        <svg className="h-24 w-full overflow-visible" viewBox="0 0 100 84" preserveAspectRatio="none">
          <path d="M0 83.5 H100" className="stroke-slate-200" fill="none" strokeWidth="1" />
          <path d="M0 42 H100" className="stroke-slate-100" fill="none" strokeDasharray="3 3" strokeWidth="1" />
          {path ? (
            <>
              <path d={path} className={lineClassName} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              {fillClassName ? (
                <path
                  d={`${path} L 100 84 L 0 84 Z`}
                  className={fillClassName}
                  fillOpacity="0.08"
                  stroke="none"
                />
              ) : null}
            </>
          ) : null}
          {series.map((point, index) => {
            const value = accessor(point);
            const x = series.length === 1 ? 50 : Number(((index * 100) / (series.length - 1)).toFixed(2));

            if (value === null || value === undefined) {
              return (
                <g key={point.date}>
                  <circle className="fill-slate-100 stroke-slate-300" cx={x} cy={42} r="2.8" strokeWidth="1" strokeDasharray="2 2">
                    <title>{`${point.label} 数据待更新`}</title>
                  </circle>
                </g>
              );
            }

            const y = Number((84 - (Math.min(100, Math.max(0, value)) / 100) * 84).toFixed(2));
            return (
              <g key={point.date}>
                <circle className="fill-white stroke-blue-600" cx={x} cy={y} r="2.8" strokeWidth="2">
                  <title>{`${point.label} 提交率 ${value}%`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
        <div className="grid grid-cols-7 gap-2 text-center text-[11px] text-slate-400">
          {series.map((point) => (
            <span key={point.date}>{point.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

const MiniBarChart = ({
  series,
  accessor,
  barClassName,
  todayDateKey,
}: {
  series: TrendPoint[];
  accessor: (point: TrendPoint) => number;
  barClassName: string;
  todayDateKey: string;
}) => {
  const maxValue = Math.max(1, ...series.map(accessor));
  const effectiveDays = getEffectiveDataDays(
    series.map((s) => s.date),
    todayDateKey,
  );

  if (series.length === 0 || effectiveDays < 3) {
    return <ChartEmptyState accumulatedDays={effectiveDays} />;
  }

  const ticks = buildChartTicks(maxValue);

  return (
    <div className="grid grid-cols-[38px_minmax(0,1fr)] gap-3">
      <div className="flex h-24 flex-col justify-between text-[11px] text-slate-400">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <div className="space-y-3">
        <div className="grid h-24 grid-cols-7 items-end gap-2">
          {series.map((point) => {
            const value = accessor(point);
            return (
              <div className="flex h-full flex-col justify-end gap-2" key={point.date}>
                <div
                  className={`min-h-1 rounded-full ${barClassName}`}
                  style={{ height: `${Math.max(8, Math.round((value / maxValue) * 96))}px` }}
                  title={`${point.label} 数值 ${value}`}
                />
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-[11px] text-slate-400">
          {series.map((point) => (
            <span key={point.date}>{point.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

const MainTrendChart = ({
  series,
  todayDateKey,
}: {
  series: TrendPoint[];
  todayDateKey: string;
}) => {
  const accessor = (point: TrendPoint) => point.submitRate;
  const path = buildLinePath(series, accessor, 160);
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
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
        <Workspace.BarChart3 className="mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">本周数据平稳，暂无显著波动</p>
      </div>
    );
  }

  const ticks = buildChartTicks(100);
  const width = 100;
  const step = series.length === 1 ? width : width / (series.length - 1);

  return (
    <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-4">
      <div className="flex h-40 flex-col justify-between text-[11px] text-slate-400">
        {ticks.map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="space-y-3">
        <svg className="h-40 w-full overflow-visible" viewBox="0 0 100 160" preserveAspectRatio="none">
          <path d="M0 159.5 H100" className="stroke-slate-200" fill="none" strokeWidth="1" />
          <path d="M0 80 H100" className="stroke-slate-100" fill="none" strokeDasharray="3 3" strokeWidth="1" />
          {path ? (
            <>
              <path
                d={path}
                className="stroke-blue-600"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
              <path
                d={`${path} L 100 160 L 0 160 Z`}
                className="fill-blue-600"
                fillOpacity="0.15"
                stroke="none"
              />
            </>
          ) : null}
          {series.map((point, index) => {
            const value = accessor(point);
            const x = series.length === 1 ? 50 : Number(((index * 100) / (series.length - 1)).toFixed(2));
            if (value === null || value === undefined) {
              const prev = series[index - 1];
              const next = series[index + 1];
              const prevY = prev?.submitRate != null ? 160 - (Math.min(100, Math.max(0, prev.submitRate)) / 100) * 160 : null;
              const nextY = next?.submitRate != null ? 160 - (Math.min(100, Math.max(0, next.submitRate)) / 100) * 160 : null;
              const startY = prevY ?? nextY ?? 80;
              const endY = nextY ?? prevY ?? 80;
              return (
                <g key={point.date}>
                  {prevY != null && nextY != null ? (
                    <path
                      d={`M ${x - (step / 2)} ${prevY} L ${x + (step / 2)} ${nextY}`}
                      className="stroke-slate-300"
                      fill="none"
                      strokeDasharray="4 3"
                      strokeWidth="1.5"
                    />
                  ) : null}
                  <circle className="fill-slate-200 stroke-slate-300" cx={x} cy={(startY + endY) / 2} r="2.5" strokeWidth="1" />
                  <title>{`${point.label} 数据待更新`}</title>
                </g>
              );
            }
            const y = Number((160 - (Math.min(100, Math.max(0, value)) / 100) * 160).toFixed(2));
            return (
              <g key={point.date}>
                <circle className="fill-blue-600" cx={x} cy={y} r="3">
                  <title>{`${point.label} 提交率 ${value}%`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between text-center text-[11px] text-slate-400">
          {series.map((point) => (
            <span key={point.date}>{point.label}</span>
          ))}
        </div>
      </div>
    </div>
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
              {evaluation.content.trim() || (evaluation.type === "praise" ? "老师送出了一朵红花。" : "未填写详细内容")}
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
              <p className="mt-1 text-xs text-slate-500">红花数</p>
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
                      avatar={member.avatar}
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

const GroupOperationsBoard = ({
  groupName,
  members,
  searchEnabled,
  title = "我负责的项目组",
}: {
  groupName: string;
  members: ReportMember[];
  searchEnabled?: boolean;
  title?: string;
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
  const [search, setSearch] = useState("");
  const [evaluationsByReportId, setEvaluationsByReportId] = useState<Record<string, ReportEvaluationItem[]>>({});
  const [composer, setComposer] = useState<EvaluationComposerState | null>(null);
  const [submittingEvaluationKey, setSubmittingEvaluationKey] = useState<string | null>(null);
  const [revokingEvaluationId, setRevokingEvaluationId] = useState<string | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderCooldowns, setReminderCooldowns] = useState<Record<string, number>>({});

  useEffect(() => {
    setReminderCooldowns(loadReminderCooldowns());
  }, []);

  const scopedMemberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const recentDateKeys = useMemo(
    () => getRecentDateKeys(reportDateOptions, selectedDate, 7),
    [reportDateOptions, selectedDate],
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

  const filteredCards = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return memberCards;
    }

    return memberCards.filter(({ member, report, latestReport }) =>
      [
        member.name,
        member.systemRole,
        member.teamGroupName ?? "",
        report?.summary ?? "",
        report?.nextPlan ?? "",
        latestReport?.summary ?? "",
        latestReport?.nextPlan ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [memberCards, search]);

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

      const missingDays = getMissingDaysStreak(member.id, focusDateKeys, reportEntriesByDay);
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
          detail: `检测到“${concern}”，建议查看详情并及时跟进。`,
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
  }, [members, recentDateKeys, reportEntriesByDay, selectedDate]);

  const trendSeries = useMemo(
    () =>
      buildTrendSeries({
        dateKeys: recentDateKeys,
        members,
        reportEntriesByDay,
        evaluationsByReportId,
        todayDateKey,
      }),
    [evaluationsByReportId, members, recentDateKeys, reportEntriesByDay, todayDateKey],
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
      <section className={Workspace.surfaceCardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Workspace.Users className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{groupName}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                今日提交比 {currentReports.length}/{members.length}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600">
                本周组内排名 1/{Math.max(1, members.length)}
              </span>
            </div>
          </div>
          {searchEnabled ? (
            <div className="w-full max-w-sm">
              <SearchBar onChange={setSearch} placeholder="搜索组内成员或汇报关键词" value={search} />
            </div>
          ) : null}
        </div>
      </section>

      <article className={Workspace.surfaceCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">需要关注</h3>
            <p className="mt-1 text-sm text-slate-500">系统自动识别未提交、卡点和缺少反馈的成员。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            {attentionItems.length} 条预警
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {attentionItems.length > 0 ? (
            attentionItems.map((item) => {
              const cooldownKey = getReminderCooldownKey(item.member.id, selectedDate);
              const coolingDown = (reminderCooldowns[cooldownKey] ?? 0) > Date.now();

              return (
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    item.tone === "danger"
                      ? "border-rose-100 bg-rose-50/80"
                      : item.tone === "warning"
                        ? "border-amber-100 bg-amber-50/80"
                        : "border-slate-200 bg-slate-50/80"
                  }`}
                  key={item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                    </div>
                    <div className="shrink-0">
                      {item.action === "remind" ? (
                        <Workspace.ActionButton
                          disabled={coolingDown}
                          loading={sendingReminderId === item.member.id}
                          loadingLabel="发送中..."
                          onClick={() => void handleSendReminder(item.member)}
                        >
                          <Workspace.BellPlus className="h-4 w-4" />
                          {coolingDown ? "2 小时内已催交" : "一键催交"}
                        </Workspace.ActionButton>
                      ) : item.action === "detail" ? (
                        <button
                          className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
                          onClick={() => setSearch(item.member.name)}
                          type="button"
                        >
                          查看详情
                        </button>
                      ) : (
                        <button
                          className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
                          onClick={() => setSearch(item.member.name)}
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
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              当前没有需要额外关注的成员，组内状态平稳。
            </div>
          )}
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-[65%_1fr]">
        <section className={Workspace.surfaceCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">成员汇报列表</h3>
              <p className="mt-1 text-sm text-slate-500">支持快速点赞、待改进和详细批注，评价会直接通知到学生。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {filteredCards.length}/{members.length} 人
            </span>
          </div>

          <div className="mt-4 grid gap-4">
            {filteredCards.map(({ member, report, latestReport }) => {
            const activeReport = report ?? latestReport;
            const isHistoricalFallback = !report && Boolean(activeReport);
            const reportId = activeReport?.id ?? "";
            const evaluations = reportId ? evaluationsByReportId[reportId] ?? [] : [];
            const attachmentNote = Workspace.getReportAttachmentNote(activeReport?.attachment);

            return (
              <article className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm" key={member.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Workspace.UserAvatar
                      avatar={member.avatar}
                      avatarUrl={member.avatarUrl}
                      className="h-11 w-11 shrink-0 rounded-2xl bg-slate-100"
                      name={member.name}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-900">{member.name}</h4>
                        <span className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500">
                          {member.systemRole}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {report
                          ? `已于 ${Workspace.formatShortDate(report.date)} ${report.submittedAt} 提交`
                          : activeReport
                            ? `当前未提交，最近一次为 ${Workspace.formatShortDate(activeReport.date)} ${activeReport.submittedAt}`
                            : `尚无 ${Workspace.formatShortDate(selectedDate)} 之前的历史汇报`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      report ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {report ? "已提交" : "未提交"}
                  </span>
                </div>

                {activeReport ? (
                  <>
                    {isHistoricalFallback ? (
                      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-700">
                        当前日期未提交，以下展示最近一次汇报：{Workspace.formatShortDate(activeReport.date)}
                      </div>
                    ) : null}
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">
                          {report ? "今日完成" : "最近一次汇报"}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-slate-700">{activeReport.summary}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">
                          {report ? "明日计划" : "后续计划"}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-slate-700">{activeReport.nextPlan}</p>
                      </div>
                    </div>

                    {attachmentNote ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                        附件备注：{attachmentNote}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Workspace.ActionButton
                        loading={submittingEvaluationKey === `${reportId}:praise`}
                        loadingLabel="发送中..."
                        onClick={() => void handleCreateEvaluation(reportId, "praise")}
                      >
                        🌟 点赞
                      </Workspace.ActionButton>
                      <Workspace.ActionButton onClick={() => setComposer({ reportId, type: "improve", value: "" })}>
                        ⚠️ 待改进
                      </Workspace.ActionButton>
                      <Workspace.ActionButton onClick={() => setComposer({ reportId, type: "comment", value: "" })}>
                        💬 批注
                      </Workspace.ActionButton>
                    </div>

                    {composer?.reportId === reportId ? (
                      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {composer.type === "improve" ? "待改进理由" : "详细批注"}
                          </p>
                          <button
                            className="text-xs text-slate-400 transition hover:text-slate-600"
                            onClick={() => setComposer(null)}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                        <textarea
                          className="mt-3 min-h-24 w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-300"
                          placeholder={composer.type === "improve" ? "请写明具体待改进点" : "请写下详细批注"}
                          value={composer.value}
                          onChange={(event) => setComposer((current) => (current ? { ...current, value: event.target.value } : current))}
                        />
                        <div className="mt-3 flex justify-end">
                          <Workspace.ActionButton
                            loading={submittingEvaluationKey === `${reportId}:${composer.type}`}
                            loadingLabel="发送中..."
                            onClick={() => void handleCreateEvaluation(reportId, composer.type, composer.value)}
                            variant="primary"
                          >
                            发送评价
                          </Workspace.ActionButton>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">已评价</p>
                        <span className="text-xs text-slate-400">{evaluations.length} 条</span>
                      </div>
                      <EvaluationTimeline
                        currentMemberId={currentMemberId}
                        evaluations={evaluations}
                        onRevoke={handleRevokeEvaluation}
                        revokingEvaluationId={revokingEvaluationId}
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
                    <p className="text-sm text-slate-500">该成员当天尚未提交汇报，建议先催交再继续跟进点评。</p>
                    <div className="mt-3">
                      <Workspace.ActionButton
                        disabled={(reminderCooldowns[getReminderCooldownKey(member.id, selectedDate)] ?? 0) > Date.now()}
                        loading={sendingReminderId === member.id}
                        loadingLabel="发送中..."
                        onClick={() => void handleSendReminder(member)}
                      >
                        <Workspace.BellPlus className="h-4 w-4" />
                        {(reminderCooldowns[getReminderCooldownKey(member.id, selectedDate)] ?? 0) > Date.now()
                          ? "2 小时内已催交"
                          : "一键催交"}
                      </Workspace.ActionButton>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className={Workspace.surfaceCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">本组本周趋势</h3>
            <p className="mt-1 text-sm text-slate-500">查看每日提交率和红花变化，快速判断项目组健康度。</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">每日提交率</p>
              <span className="text-xs text-slate-400">折线图</span>
            </div>
            <MiniTrendChart
              accessor={(point) => point.submitRate}
              fillClassName="fill-blue-600"
              lineClassName="stroke-blue-600"
              series={trendSeries}
              todayDateKey={todayDateKey}
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">每日获得红花数</p>
              <span className="text-xs text-slate-400">柱状图</span>
            </div>
            <MiniBarChart
              accessor={(point) => point.praiseCount}
              barClassName="bg-amber-400"
              series={trendSeries}
              todayDateKey={todayDateKey}
            />
          </div>
        </div>
      </section>
      </div>
    </div>
  );
};

const TeacherReportsView = (props: ReportsViewProps) => {
  const {
    hasGlobalAdminRole,
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

  const teacherGroupIds = useMemo(
    () => [...new Set(visibleReportMembers.map((member) => member.teamGroupId).filter((value): value is string => Boolean(value)))],
    [visibleReportMembers],
  );
  const teacherGroups = useMemo(
    () => teamGroups.filter((group) => teacherGroupIds.includes(group.id)),
    [teacherGroupIds, teamGroups],
  );
  const activeGroupName =
    teacherGroups.find((group) => group.id === selectedReportTeamGroupId)?.name ??
    teacherGroups[0]?.name ??
    "当前项目组";

  return (
    <div className="space-y-4">
      <Workspace.SectionHeader
        description={props.viewDescription || "教师视角聚焦组内摘要、异常预警和快速点评，进入页面后可直接完成跟进闭环。"}
        title="日程汇报"
      />
      <section className={Workspace.surfaceCardClassName}>
        <DateSelector
          fieldClassName={Workspace.fieldClassName}
          formatShortDate={Workspace.formatShortDate}
          hasGlobalAdminRole={hasGlobalAdminRole && teacherGroups.length > 1}
          reportDateOptions={reportDateOptions}
          reportEntriesByDay={reportEntriesByDay}
          selectedDate={selectedDate}
          selectedReportTeamGroupId={selectedReportTeamGroupId}
          setSelectedDate={setSelectedDate}
          setSelectedReportTeamGroupId={setSelectedReportTeamGroupId}
          teamGroups={teacherGroups}
          todayDateKey={todayDateKey}
        />
      </section>
      <GroupOperationsBoard groupName={activeGroupName} members={visibleReportMembers} searchEnabled />
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
  const [trendRange, setTrendRange] = useState<"week" | "month" | "semester">("week");
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

    if (trendRange === "month") {
      return reportDateOptions.filter((date) => date.startsWith(selectedDate.slice(0, 7)));
    }

    // semester: fall back to all available dates back to the computed semester start
    const semesterStart = getSemesterStartDate(todayDateKey);
    return reportDateOptions.filter((date) => date >= semesterStart);
  }, [reportDateOptions, selectedDate, todayDateKey, trendRange]);

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
        (member) => getMissingDaysStreak(member.id, recentDateKeys.slice(0, 3), reportEntriesByDay) >= 3,
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
  }, [currentWeekAverage, groupHealthItems, recentDateKeys, reportEntriesByDay, teacherActivity, weekDelta]);

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
    <div className="space-y-4">
      <Workspace.SectionHeader
        description={props.viewDescription || "管理员视角聚焦全校提交健康度、教师点评活跃度和异常项目组，优先暴露学校级风险。"}
        title="日程汇报"
      />

      <section className={Workspace.surfaceCardClassName}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">全校概览</p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div>
                {isTodayBeforeDeadline ? (
                  <>
                    <p className="text-[32px] font-semibold text-slate-900">
                      {selectedReportSubmittedCount}/{selectedReportExpectedCount}
                    </p>
                    <p className="text-sm text-slate-500">今日进度</p>
                  </>
                ) : (
                  <>
                    <p className="text-[32px] font-semibold text-slate-900">{overallSubmitRate}%</p>
                    <p className="text-sm text-slate-500">今日提交率</p>
                  </>
                )}
                <p className="mt-1 text-xs text-slate-400">昨日提交率 {yesterdaySubmitRate}%</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-400">本周均值 vs 上周均值</p>
                <p className={`mt-1 text-sm font-semibold ${weekDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {weekDelta >= 0 ? "↑" : "↓"} {Math.abs(weekDelta)}%
                </p>
                <span
                  className="mt-1 inline-block cursor-help text-xs text-slate-400"
                  title="按最近一周平均提交率与上一周平均提交率的差值计算"
                >
                  ?
                </span>
              </div>
            </div>
          </div>
          <div className="w-full max-w-xl space-y-3">
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

      <section className={Workspace.surfaceCardClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">项目组健康度总览</h3>
            <p className="mt-1 text-sm text-slate-500">异常项目组自动置顶，支持直接展开查看该组详情。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Workspace.ActionButton
              onClick={() => {
                const randomGroup = groupHealthItems[Math.floor(Math.random() * groupHealthItems.length)];
                if (randomGroup) {
                  setExpandedGroupId(randomGroup.id);
                }
              }}
            >
              随机抽查
            </Workspace.ActionButton>
            <select
              className={Workspace.fieldClassName}
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
              className={Workspace.fieldClassName}
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
          {groupHealthItems.map((group) => (
            <div
              className="cursor-pointer rounded-2xl border border-slate-200 bg-white/90 transition hover:shadow-md"
              key={group.id}
              onClick={() => setExpandedGroupId((current) => (current === group.id ? "" : group.id))}
              role="button"
              tabIndex={0}
            >
              <div className="flex w-full items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${
                      group.tone === "danger" ? "bg-rose-500" : group.tone === "warning" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{group.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{group.alerts.join(" · ") || group.summary}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {group.submittedCount}/{group.expectedCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{group.summary}</p>
                </div>
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
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className={Workspace.surfaceCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">教师活跃度排行</h3>
              <p className="mt-1 text-sm text-slate-500">按本周点评次数排序，帮助管理员识别可能失管的教师。</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {teacherActivity.length > 0 ? (
              teacherActivity.map((teacher, index) => (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3" key={teacher.id}>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. {teacher.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      点评 {teacher.commentCount} 次 · 红花 {teacher.praiseCount} 次 · 待改进 {teacher.improveCount} 次
                    </p>
                  </div>
                  {index === teacherActivity.length - 1 && teacher.commentCount <= 1 ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      ⚠️ 疑似失管
                    </span>
                  ) : null}
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

        <article className={Workspace.surfaceCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">全校预警</h3>
              <p className="mt-1 text-sm text-slate-500">把最需要管理员处理的问题集中收口，不需要逐组翻找。</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {adminWarnings.length > 0 ? (
              adminWarnings.map((warning) => (
                <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3" key={warning.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{warning.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{warning.detail}</p>
                    </div>
                    <button
                      className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
                      onClick={warning.onAction}
                      type="button"
                    >
                      {warning.actionLabel}
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

      <section className={Workspace.surfaceCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">趋势分析</h3>
            <p className="mt-1 text-sm text-slate-500">叠加查看提交率、点评总数和红花数量变化。</p>
          </div>
          <div className="flex gap-2">
            {(["week", "month", "semester"] as const).map((range) => (
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
                {range === "week" ? "本周" : range === "month" ? "本月" : "本学期"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs text-slate-500">本周平均提交率</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{currentWeekAverage}%</p>
              <p className={`mt-1 text-xs font-medium ${weekDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {weekDelta >= 0 ? "↑" : "↓"} {Math.abs(weekDelta)}%
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs text-slate-500">本周总点评数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{totalEvaluationCount}</p>
              {totalEvaluationCount === 0 ? (
                <p className="mt-1 text-xs text-slate-400">本周暂无点评活动</p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs text-slate-500">本周总红花数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{totalPraiseCount}</p>
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

      <section className={Workspace.surfaceCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">管理工具</h3>
            <p className="mt-1 text-sm text-slate-500">批量操作与数据导出，危险操作需要二次确认。</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Workspace.ActionButton
            className="bg-blue-50 text-blue-700 hover:bg-blue-100"
            loading={bulkRemindLoading}
            loadingLabel="发送中..."
            onClick={() => void handleBulkRemind()}
          >
            <Workspace.BellPlus className="h-4 w-4" />
            批量催交
          </Workspace.ActionButton>
          <Workspace.ActionButton
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
              className={Workspace.fieldClassName}
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
              className="border border-rose-500 bg-white text-rose-600 hover:bg-rose-50"
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
    return <TeacherReportsView {...sharedProps} />;
  }

  if (reportsViewRole === "admin") {
    return <AdminReportsView {...sharedProps} />;
  }

  return <StudentReportsView {...sharedProps} />;
}
