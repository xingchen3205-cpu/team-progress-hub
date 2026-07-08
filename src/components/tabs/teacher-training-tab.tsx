"use client";

import { useEffect, useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";
import { TeacherTrainingCohortDetailLoadingBanner } from "@/components/teacher-training/cohort-detail-loading-banner";
import {
  getTeacherTrainingCheckInRecordStatusMeta,
  TeacherTrainingCheckInRecordStatusBadge,
} from "@/components/teacher-training/check-in-record-status-badge";
import {
  parseTeacherTrainingParticipantImportText,
  resolveTeacherTrainingParticipantImportColumn,
  splitTeacherTrainingImportLine,
  type TeacherTrainingParticipantImportRow,
} from "@/lib/teacher-training-participant-import";

type AttendanceStatus = Workspace.TeacherTrainingAttendanceStatus;
type AttendanceOverviewFilter = "all" | "registered" | "pending" | "leave" | "absent";
type CheckInWindowState = Workspace.TeacherTrainingCheckInWindowState;
type SubmissionOverviewFilter = "all" | "submitted";
type TeacherTrainingLeavePanelKey = "pending" | "all" | "rules";
type TeacherTrainingImportPreview<T> = {
  rows: T[];
  totalCount: number;
  readyCount: number;
  missingRequiredCount: number;
  duplicateInFileCount: number;
  existingConflictCount: number;
  canImport: boolean;
};
type TeacherTrainingCourseImportRow = Pick<
  Workspace.TeacherTrainingCourseSessionDraft,
  "title" | "courseDate" | "startTime" | "endTime" | "location" | "instructor" | "description"
>;
type TeacherTrainingExportRecord = {
  id: string;
  label: string;
  fileName: string;
  exportedAt: string;
};
type TeacherTrainingImportFieldSummaryItem = {
  key: string;
  label: string;
  value: string;
  done: boolean;
};
type TeacherTrainingFilterSummaryItem = {
  key: string;
  label: string;
  value: string;
};
type TeacherTrainingCohortHealthCheckItem = {
  label: string;
  done: boolean;
  severity: "required" | "recommended";
  detail: string;
};

const getDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTimeInputValue = (date: Date) => {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

const getDefaultEndDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return getDateInputValue(date);
};

const TEACHER_TRAINING_IMPORT_TIMEOUT_MS = 30_000;
const TEACHER_TRAINING_EXPORT_TIMEOUT_MS = 60_000;
const TEACHER_TRAINING_UPLOAD_URL_TIMEOUT_MS = 20_000;
const TEACHER_TRAINING_DOWNLOAD_TIMEOUT_MS = 60_000;
const teacherTrainingDefaultInitialPassword = "123456";

type TeacherTrainingExportType =
  | "participants"
  | "arrivals"
  | "attendance"
  | "checkIns"
  | "leaves"
  | "submissions"
  | "submissionScores";

const teacherTrainingExportItems: Array<{
  label: string;
  type: TeacherTrainingExportType;
  description: string;
}> = [
  { label: "导出名单", type: "participants", description: "参训教师、单位、预录信息和账号状态" },
  { label: "导出到达信息", type: "arrivals", description: "预计到达时间、交通方式和车次信息" },
  { label: "导出报到信息", type: "attendance", description: "报到状态、时间、房号和材料情况" },
  { label: "导出课程签到", type: "checkIns", description: "定位签到任务和签到明细" },
  { label: "导出请假审批", type: "leaves", description: "请假时间、原因、状态和审批记录" },
  { label: "导出汇报归档", type: "submissions", description: "每位教师一个 Word 汇报归档，附件打包进 ZIP" },
  { label: "导出汇报评分表", type: "submissionScores", description: "任务提交、AI 初评、人工终评和评语 CSV" },
];

const getFileNameFromContentDisposition = (contentDisposition: string | null, fallbackName: string) => {
  const encodedFileName = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedFileName) {
    try {
      return decodeURIComponent(encodedFileName);
    } catch {
      return fallbackName;
    }
  }

  const quotedFileName = contentDisposition?.match(/filename="([^"]+)"/i)?.[1];
  return quotedFileName || fallbackName;
};

const parseTeacherTrainingImportFile = async (kind: "participants" | "courses", file: File) => {
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", file);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TEACHER_TRAINING_IMPORT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/teacher-training/import", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("省培文件识别超时，请稍后重试");
    }
    throw new Error("省培文件识别失败，请检查网络后重试");
  } finally {
    window.clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => null)) as { text?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.message || "省培导入文件识别失败");
  }

  return payload?.text ?? "";
};

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase("zh-CN");
const normalizeImportKey = (value: string) => value.trim().toLocaleLowerCase("zh-CN");
const getParticipantImportIdentityKey = (participant: { name: string; organization: string }) =>
  `${normalizeImportKey(participant.name)}@@${normalizeImportKey(participant.organization)}`;
const getCourseImportIdentityKey = (course: Pick<TeacherTrainingCourseImportRow, "title" | "courseDate" | "startTime">) =>
  `${normalizeImportKey(course.title)}@@${normalizeImportKey(course.courseDate)}@@${normalizeImportKey(course.startTime)}`;

const countDuplicateKeys = (keys: string[]) => new Set(keys.filter((key, index) => keys.indexOf(key) !== index)).size;

const getNonEmptyImportRows = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => splitTeacherTrainingImportLine(line))
    .filter((parts) => parts.some((part) => part.trim()));

const formatImportFieldValue = (header: string | null, fallbackIndex: number, hasRows: boolean) => {
  if (header) return header;
  if (hasRows) return `按默认顺序第 ${fallbackIndex + 1} 列`;
  return "未识别";
};

const buildParticipantImportFieldSummary = (text: string): TeacherTrainingImportFieldSummaryItem[] => {
  const rows = getNonEmptyImportRows(text);
  const headerCells =
    rows.find((row) => {
      const columns = row.map(resolveTeacherTrainingParticipantImportColumn);
      return columns.includes("name") && columns.includes("organization");
    }) ?? null;
  const resolveHeader = (key: keyof TeacherTrainingParticipantImportRow, fallbackIndex: number) => {
    const header = headerCells?.find((cell) => resolveTeacherTrainingParticipantImportColumn(cell) === key) ?? null;
    return {
      value: formatImportFieldValue(header, fallbackIndex, rows.length > 0),
      done: Boolean(header || rows.length > 0),
    };
  };
  const fields: Array<{ key: keyof TeacherTrainingParticipantImportRow; label: string; fallbackIndex: number }> = [
    { key: "name", label: "姓名列", fallbackIndex: 0 },
    { key: "organization", label: "单位列", fallbackIndex: 1 },
    { key: "phone", label: "手机号列", fallbackIndex: 2 },
    { key: "gender", label: "性别列", fallbackIndex: 3 },
    { key: "age", label: "年龄列", fallbackIndex: 4 },
    { key: "personnelCategory", label: "人员类别列", fallbackIndex: 5 },
    { key: "subject", label: "学科列", fallbackIndex: 6 },
    { key: "professionalTitle", label: "职称列", fallbackIndex: 7 },
    { key: "city", label: "所属市列", fallbackIndex: 8 },
    { key: "email", label: "邮箱列", fallbackIndex: 9 },
    { key: "arrivalAt", label: "到达时间列", fallbackIndex: 10 },
  ];

  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    ...resolveHeader(field.key, field.fallbackIndex),
  }));
};

const teacherTrainingCourseImportColumnAliases = {
  title: ["课程名称", "课程", "授课主题", "主题", "名称"],
  courseDate: ["课程日期", "日期", "上课日期", "授课日期", "时间"],
  startTime: ["开始时间", "上课时间", "起始时间"],
  endTime: ["结束时间", "下课时间"],
  location: ["地点", "课程地点", "授课地点", "教室"],
  instructor: ["授课教师", "教师", "讲师", "主讲人"],
} as const;

type TeacherTrainingCourseImportColumn = keyof typeof teacherTrainingCourseImportColumnAliases;

const normalizeImportHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/[\s_*＊:：()（）/\\\-]/g, "")
    .toLocaleLowerCase("zh-CN");

const resolveTeacherTrainingCourseImportColumn = (header: string): TeacherTrainingCourseImportColumn | null => {
  const normalizedHeader = normalizeImportHeader(header);
  for (const [key, aliases] of Object.entries(teacherTrainingCourseImportColumnAliases)) {
    if (aliases.some((alias) => normalizeImportHeader(alias) === normalizedHeader)) {
      return key as TeacherTrainingCourseImportColumn;
    }
  }

  return null;
};

const buildCourseImportFieldSummary = (text: string): TeacherTrainingImportFieldSummaryItem[] => {
  const rows = getNonEmptyImportRows(text);
  const headerCells =
    rows.find((row) => {
      const columns = row.map(resolveTeacherTrainingCourseImportColumn);
      return columns.includes("title") && columns.includes("courseDate");
    }) ?? null;
  const resolveHeader = (key: TeacherTrainingCourseImportColumn, fallbackIndex: number) => {
    const header = headerCells?.find((cell) => resolveTeacherTrainingCourseImportColumn(cell) === key) ?? null;
    return {
      value: formatImportFieldValue(header, fallbackIndex, rows.length > 0),
      done: Boolean(header || rows.length > 0),
    };
  };
  const fields: Array<{ key: TeacherTrainingCourseImportColumn; label: string; fallbackIndex: number }> = [
    { key: "title", label: "课程名称列", fallbackIndex: 0 },
    { key: "courseDate", label: "课程日期列", fallbackIndex: 1 },
    { key: "startTime", label: "开始时间列", fallbackIndex: 2 },
    { key: "endTime", label: "结束时间列", fallbackIndex: 3 },
    { key: "location", label: "地点列", fallbackIndex: 4 },
    { key: "instructor", label: "授课教师列", fallbackIndex: 5 },
  ];

  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    ...resolveHeader(field.key, field.fallbackIndex),
  }));
};

const buildParticipantImportPreview = (
  rows: TeacherTrainingParticipantImportRow[],
  existingParticipants: Workspace.TeacherTrainingParticipantItem[],
): TeacherTrainingImportPreview<TeacherTrainingParticipantImportRow> => {
  const hasRequiredParticipantRosterFields = (row: TeacherTrainingParticipantImportRow) =>
    Boolean(row.name.trim() && row.organization.trim() && row.phone.trim() && (row.title.trim() || row.professionalTitle.trim()));
  const missingRequiredCount = rows.filter((row) => !hasRequiredParticipantRosterFields(row)).length;
  const identityKeys = rows
    .filter((row) => row.name.trim() && row.organization.trim())
    .map(getParticipantImportIdentityKey);
  const phoneKeys = rows.map((row) => normalizeImportKey(row.phone)).filter(Boolean);
  const existingIdentityKeys = new Set(existingParticipants.map(getParticipantImportIdentityKey));
  const existingPhoneKeys = new Set(existingParticipants.map((participant) => normalizeImportKey(participant.phone)).filter(Boolean));
  const existingConflictCount = rows.filter((row) => {
    const identityKey = row.name.trim() && row.organization.trim() ? getParticipantImportIdentityKey(row) : "";
    const phoneKey = normalizeImportKey(row.phone);
    return Boolean((identityKey && existingIdentityKeys.has(identityKey)) || (phoneKey && existingPhoneKeys.has(phoneKey)));
  }).length;
  const duplicateInFileCount = countDuplicateKeys(identityKeys) + countDuplicateKeys(phoneKeys);
  const readyCount = Math.max(0, rows.length - missingRequiredCount - existingConflictCount);

  return {
    rows,
    totalCount: rows.length,
    readyCount,
    missingRequiredCount,
    duplicateInFileCount,
    existingConflictCount,
    canImport: rows.length > 0 && missingRequiredCount === 0 && duplicateInFileCount === 0 && existingConflictCount === 0,
  };
};

const parseCourseImportRows = (text: string): TeacherTrainingCourseImportRow[] =>
  text
    .split(/\r?\n/)
    .map((line) => splitTeacherTrainingImportLine(line))
    .filter((parts) => parts.some(Boolean))
    .map(([title = "", courseDate = "", startTime = "", endTime = "", location = "", instructor = "", description = ""]) => ({
      title,
      courseDate,
      startTime,
      endTime,
      location,
      instructor,
      description,
    }));

const buildCourseImportPreview = (
  rows: TeacherTrainingCourseImportRow[],
  existingCourses: Workspace.TeacherTrainingCourseSessionItem[],
): TeacherTrainingImportPreview<TeacherTrainingCourseImportRow> => {
  const missingRequiredCount = rows.filter((row) => !row.title.trim() || !row.courseDate.trim()).length;
  const identityKeys = rows
    .filter((row) => row.title.trim() && row.courseDate.trim())
    .map(getCourseImportIdentityKey);
  const existingIdentityKeys = new Set(existingCourses.map(getCourseImportIdentityKey));
  const existingConflictCount = rows.filter((row) => {
    const identityKey = row.title.trim() && row.courseDate.trim() ? getCourseImportIdentityKey(row) : "";
    return Boolean(identityKey && existingIdentityKeys.has(identityKey));
  }).length;
  const duplicateInFileCount = countDuplicateKeys(identityKeys);
  const readyCount = Math.max(0, rows.length - missingRequiredCount - existingConflictCount);

  return {
    rows,
    totalCount: rows.length,
    readyCount,
    missingRequiredCount,
    duplicateInFileCount,
    existingConflictCount,
    canImport: rows.length > 0 && missingRequiredCount === 0 && duplicateInFileCount === 0 && existingConflictCount === 0,
  };
};

const getImportPreviewToneClassName = (preview: TeacherTrainingImportPreview<unknown>) =>
  preview.canImport
    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
    : "border-amber-100 bg-amber-50 text-amber-700";

const formatClientDateTime = (date: Date) =>
  date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function TeacherTrainingImportFieldSummary({ items }: { items: TeacherTrainingImportFieldSummaryItem[] }) {
  if (!items.some((item) => item.done)) return null;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white/84 px-3 py-2">
      <p className="text-xs font-bold text-slate-700">字段识别结果</p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
            <span className="font-semibold text-slate-500">{item.label}</span>
            <span className={item.done ? "font-bold text-slate-800" : "font-semibold text-amber-700"}>{item.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">导入前请核对识别字段和重复项，确认无误后再写入名单。</p>
    </div>
  );
}

function TeacherTrainingFilterSummary({
  items,
  onClear,
}: {
  items: TeacherTrainingFilterSummaryItem[];
  onClear?: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div
      aria-label="参训教师、报到、请假、汇报和课程签到列表共用筛选提示"
      className="mt-3 flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs leading-5 text-blue-700 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">当前筛选</span>
        {items.map((item) => (
          <span
            key={item.key}
            aria-label={item.key === "view" ? `当前查看：${item.value}` : `${item.label}：${item.value}`}
            className="rounded-full bg-white/85 px-2.5 py-1 font-semibold"
          >
            {item.label}：{item.value}
          </span>
        ))}
      </div>
      {onClear ? (
        <button className="w-fit font-bold text-blue-700 hover:text-blue-900" onClick={onClear} type="button">
          清除筛选
        </button>
      ) : null}
    </div>
  );
}

function TeacherTrainingCohortHealthCheck({ items }: { items: TeacherTrainingCohortHealthCheckItem[] }) {
  const requiredMissingCount = items.filter((item) => !item.done && item.severity === "required").length;
  const recommendedMissingCount = items.filter((item) => !item.done && item.severity === "recommended").length;

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold text-blue-700">班次配置体检</p>
        <span className="text-xs font-semibold text-slate-500">
          {requiredMissingCount > 0
            ? `${requiredMissingCount} 项影响使用`
            : recommendedMissingCount > 0
              ? `${recommendedMissingCount} 项建议补齐`
              : "关键配置已完成"}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={`rounded-lg border bg-white/84 px-3 py-2 ${
              item.done
                ? "border-emerald-100"
                : item.severity === "required"
                  ? "border-rose-100"
                  : "border-amber-100"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">{item.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  item.done
                    ? "bg-emerald-50 text-emerald-700"
                    : item.severity === "required"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {item.done ? "已完成" : item.severity === "required" ? "影响使用" : "建议补齐"}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const createDefaultCohortDraft = (): Workspace.TeacherTrainingCohortDraft => ({
  title: "2026 江苏省职业院校创新创业教育（竞赛）指导能力提升培训",
  location: "",
  startDate: getDateInputValue(new Date()),
  endDate: getDefaultEndDate(),
  description: "",
});

const createDefaultCourseSessionDraft = (): Workspace.TeacherTrainingCourseSessionDraft => ({
  cohortId: "",
  title: "",
  courseDate: getDateInputValue(new Date()),
  startTime: "09:00",
  endTime: "11:30",
  location: "",
  instructor: "",
  description: "",
});

const createDefaultCheckInTaskDraft = (): Workspace.TeacherTrainingCheckInTaskDraft => ({
  cohortId: "",
  courseSessionId: "",
  title: "课程签到",
  signDate: getDateInputValue(new Date()),
  startTime: "08:30",
  endTime: "09:00",
  locationName: "",
  latitude: "",
  longitude: "",
  radiusMeters: String(Workspace.TEACHER_TRAINING_CHECK_IN_DEFAULT_RADIUS_METERS),
});

const createDefaultTaskDraft = (): Workspace.TeacherTrainingTaskDraft => ({
  cohortId: "",
  courseSessionId: "",
  title: "",
  description: "",
  dueDate: "",
  taskType: "cohort",
  releaseMode: "immediate",
  releaseAt: "",
  requireAttachment: true,
  enableAiReview: false,
  scoringRubric: "",
});

const createDefaultManagerAccountDraft = (): Workspace.TeacherTrainingManagerAccountDraft => ({
  name: "",
  username: "",
  phone: "",
  email: "",
  password: "",
  managerIdentity: "省培负责人",
});

const statusStyleMap: Record<AttendanceStatus, string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-700",
  leave: "border-amber-200 bg-amber-50 text-amber-700",
  absent: "border-rose-200 bg-rose-50 text-rose-700",
};
const attendancePendingStyleClassName = "border-amber-200 bg-amber-50 text-amber-700";
const attendanceOverviewFilters: Array<{ key: AttendanceOverviewFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "registered", label: "已报到" },
  { key: "pending", label: "待报到" },
  { key: "leave", label: "请假" },
  { key: "absent", label: "缺勤" },
];
const submissionOverviewFilters: Array<{ key: SubmissionOverviewFilter; label: string }> = [
  { key: "all", label: "全部任务" },
  { key: "submitted", label: "已提交汇报" },
];

const checkInWindowStyleMap: Record<CheckInWindowState, string> = {
  not_started: "border-amber-200 bg-amber-50 text-amber-700",
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ended: "border-slate-200 bg-slate-100 text-slate-600",
  closed: "border-rose-200 bg-rose-50 text-rose-700",
};

const fieldHint = (label: string) => ({
  "aria-label": label,
  title: label,
});

const teacherTrainingFieldShellClassName = "block min-w-0";
const teacherTrainingFieldLabelClassName = "block text-xs font-semibold leading-5 text-slate-600";
const teacherTrainingDisabledHintClassName =
  "rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700";
const teacherMobileNavigationKeys: Workspace.TeacherTrainingSectionKey[] = [
  "overview",
  "courses",
  "checkins",
  "tasks",
  "leave",
  "profile",
];
const teacherMobileSectionLabels: Partial<Record<Workspace.TeacherTrainingSectionKey, string>> = {
  overview: "工作台",
  courses: "课程",
  checkins: "签到",
  tasks: "汇报",
  leave: "请假",
  profile: "信息",
};

const arrivalTransportationOptions = [
  { value: "", label: "请选择交通方式" },
  { value: "train", label: "高铁/火车" },
  { value: "flight", label: "飞机" },
  { value: "self_drive", label: "自驾" },
  { value: "bus", label: "大巴/客运" },
  { value: "other", label: "其他" },
];

const formatTeacherTrainingApproverLabel = (title: string, name: string) => {
  const normalizedTitle = title.trim();
  const normalizedName = name.trim();
  if (!normalizedTitle || normalizedTitle === normalizedName) {
    return normalizedName || "未配置审批人";
  }

  return `${normalizedTitle} ${normalizedName}`;
};

const formatTeacherTrainingLeaveDateTime = (date: string, time: string) =>
  time ? `${date} ${time}` : date;

const getTeacherTrainingLeaveDurationLabel = ({
  endDate,
  endTime,
  startDate,
  startTime,
}: {
  endDate: string;
  endTime: string;
  startDate: string;
  startTime: string;
}) => {
  if (!startDate || !endDate || !startTime || !endTime) return "待填写";

  const start = new Date(`${startDate}T${startTime}:00`);
  const end = new Date(`${endDate}T${endTime}:00`);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return "时间待校验";

  const dayCount = Math.floor(durationMinutes / 1_440);
  const hourCount = Math.floor((durationMinutes % 1_440) / 60);
  const minuteCount = durationMinutes % 60;
  const parts = [
    dayCount ? `${dayCount}天` : "",
    hourCount ? `${hourCount}小时` : "",
    minuteCount ? `${minuteCount}分钟` : "",
  ].filter(Boolean);

  return parts.join("") || "少于1分钟";
};

const teacherTrainingManagerRoleOptions = [
  {
    title: "省培负责人",
    accountLabel: "选择省培负责人账号",
    buttonLabel: "设置省培负责人",
    description: "班次统筹人员，列表中显示在省培班主任前面。",
  },
  {
    title: "省培班主任",
    accountLabel: "选择省培班主任账号",
    buttonLabel: "设置省培班主任",
    description: "班级日常管理人员，和负责人拥有相同省培管理权限。",
  },
];

const getTeacherTrainingManagerRoleRank = (title: string) => {
  if (title.includes("负责人")) return 0;
  if (title.includes("班主任")) return 1;
  return 2;
};

const normalizeTeacherTrainingManagerIdentity = (title?: string | null) => {
  const value = title?.trim() ?? "";
  if (value.includes("负责人")) return "省培负责人";
  if (value.includes("班主任")) return "省培班主任";
  return "";
};

const getTeacherTrainingLeaveFlowStepName = (stepIndex: number) =>
  stepIndex === 0 ? "请假审批" : `补充审批 ${stepIndex + 1}`;

const normalizeLeaveFlowStepsForConfirm = (steps: Workspace.TeacherTrainingLeaveFlowStep[]) =>
  steps.map((step) => ({
    name: step.name.trim(),
    requiredCount: step.requiredCount,
    approverIds: step.approverIds,
  }));

const teacherTrainingActionHints: Partial<Record<Workspace.TeacherTrainingSectionKey, { title: string; steps: string[] }>> = {
  overview: {
    title: "当前模块",
    steps: ["确认当前班次", "切换上方模块", "关键操作先确认"],
  },
  cohorts: {
    title: "班次设置",
    steps: ["建立班次和地点", "设置省培负责人和省培班主任", "两者权限一致"],
  },
  participants: {
    title: "参训教师",
    steps: ["录入教师信息", "可绑定已有账号", "复制账号消息"],
  },
  accounts: {
    title: "省培账号管理",
    steps: ["区分创赛原平台账号和省培专用账号", "已有账号只绑定省培身份", "共用账号只解绑不删除"],
  },
  courses: {
    title: "课程安排",
    steps: ["查看课程日期", "确认地点和授课教师", "手机端按时间顺序查看"],
  },
  checkins: {
    title: "手机端定位签到",
    steps: ["到达课程地点", "允许浏览器定位", "点击定位签到并等待结果"],
  },
  attendance: {
    title: "报到登记",
    steps: ["逐人确认已报到", "录入酒店房号和材料情况", "导出时报到状态完整带出"],
  },
  tasks: {
    title: "任务汇报",
    steps: ["教师选择任务", "上传 PDF 汇报", "管理员统一评分归档"],
  },
  leave: {
    title: "请假审批",
    steps: ["教师提交请假", "按流程审批", "可导出 PDF 请假单"],
  },
  profile: {
    title: "个人信息",
    steps: ["首次登录先完整填写资料", "补充交通和到达信息", "保存后进入主界面"],
  },
  exports: {
    title: "导出归档",
    steps: ["选择当前班次", "导出名单、报到信息、课程签到和任务汇报", "下载后可直接归档"],
  },
};

const getTeacherTrainingParticipantDisabledReason = (hasParticipant: boolean, canManage = false) => {
  if (!hasParticipant) {
    return canManage ? "暂无参训教师，请先在参训教师模块添加名单" : "未绑定参训教师，请联系管理员确认省培账号";
  }

  return "";
};

const getTeacherTrainingCheckInDisabledReason = (windowState: CheckInWindowState, hasParticipant: boolean) => {
  const participantReason = getTeacherTrainingParticipantDisabledReason(hasParticipant);
  if (participantReason) return participantReason;

  if (windowState === "open") {
    return "";
  }

  return Workspace.teacherTrainingCheckInWindowMessages[windowState];
};

const getTeacherTrainingLeaveDisabledReason = (
  hasParticipant: boolean,
  leaveFlow: Workspace.TeacherTrainingLeaveFlowItem | null | undefined,
  draft: Workspace.TeacherTrainingLeaveRequestDraft,
  canManage = false,
) => {
  const participantReason = getTeacherTrainingParticipantDisabledReason(hasParticipant, canManage);
  if (participantReason) return participantReason;

  if (!leaveFlow?.isEnabled || leaveFlow.approvalSteps.length === 0) {
    return "管理员尚未配置请假审批流程，请联系省培负责人、省培班主任或管理员";
  }

  if (!draft.startDate.trim() || !draft.endDate.trim() || !draft.startTime.trim() || !draft.endTime.trim()) {
    return "请填写请假开始和结束时间";
  }

  if (!draft.sessionLabel.trim()) {
    return "请选择或填写请假类型";
  }

  if (!draft.reason.trim()) {
    return "请填写请假原因后再提交";
  }

  return "";
};

const getTeacherTrainingSubmissionDisabledReason = (
  hasTask: boolean,
  hasParticipant: boolean,
  canManage = false,
  hasAttachment = false,
) => {
  const participantReason = getTeacherTrainingParticipantDisabledReason(hasParticipant, canManage);
  if (participantReason) return participantReason;

  if (!hasTask) {
    return "暂无省培任务，请等待管理员发布任务";
  }

  if (!hasAttachment) {
    return "请上传 PDF 汇报附件";
  }

  return "";
};

const getTeacherTrainingProfileDisabledReason = (
  draft: Workspace.TeacherTrainingProfileDraft,
  passwordRequired = false,
) => {
  const participantReason = getTeacherTrainingParticipantDisabledReason(Boolean(draft.participantId));
  if (participantReason) return participantReason;

  const requiredFields = [
    draft.name,
    draft.organization,
    draft.phone,
    draft.title,
    draft.email,
  ];
  if (requiredFields.some((value) => !value.trim())) {
    return "请填写完整个人资料后再保存";
  }

  if (passwordRequired) {
    const password = draft.password.trim();
    const passwordConfirm = draft.passwordConfirm.trim();
    if (!password || !passwordConfirm) {
      return "首次登录请设置新密码";
    }
    if (password !== passwordConfirm) {
      return "两次输入的新密码不一致";
    }
    if (password === teacherTrainingDefaultInitialPassword) {
      return "不能继续使用初始密码 123456";
    }
    if (password.length < 8) {
      return "密码至少需要 8 位";
    }
    if (password.length > 16) {
      return "密码不能超过 16 位";
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      return "密码需要包含大写字母、小写字母和数字";
    }
  }

  return "";
};

export default function TeacherTrainingTab() {
  const {
    currentUser,
    teacherTrainingCohorts,
    teacherTrainingApproverOptions,
    teacherTrainingManagerAccounts,
    teacherTrainingParticipantAccountOptions,
    canManageTeacherTraining,
    activeTeacherTrainingSection,
    setActiveTeacherTrainingSection,
    activeTeacherTrainingCohortId,
    setActiveTeacherTrainingCohortId,
    isSaving,
    createTeacherTrainingCohort,
    deleteTeacherTrainingCohort,
    deleteTeacherTrainingCohorts,
    addTeacherTrainingParticipant,
    importTeacherTrainingParticipants,
    createTeacherTrainingCourseSession,
    importTeacherTrainingCourses,
    deleteTeacherTrainingCourseSession,
    deleteTeacherTrainingCourseSessions,
    createTeacherTrainingCheckInTask,
    deleteTeacherTrainingCheckInTask,
    deleteTeacherTrainingCheckInTasks,
    signTeacherTrainingCheckIn,
    manualSignTeacherTrainingCheckIn,
    markTeacherTrainingAttendance,
    generateTeacherTrainingAccountMessage,
    updateTeacherTrainingParticipantAccount,
    deleteTeacherTrainingParticipantAccount,
    deleteTeacherTrainingParticipant,
    deleteTeacherTrainingParticipants,
    saveTeacherTrainingManagerAccount,
    deleteTeacherTrainingManagerAccounts,
    assignTeacherTrainingCohortManager,
    removeTeacherTrainingCohortManager,
    updateTeacherTrainingLeaveFlow,
    submitTeacherTrainingLeaveRequest,
    reviewTeacherTrainingLeaveRequest,
    createTeacherTrainingTask,
    deleteTeacherTrainingTask,
    deleteTeacherTrainingTasks,
    saveTeacherTrainingSubmission,
    reviewTeacherTrainingSubmission,
    runTeacherTrainingTaskAiReview,
    updateTeacherTrainingProfile,
    loadTeacherTrainingCohortDetails,
    setLoadError,
  } = Workspace.useWorkspaceContext();
  const {
    ActionButton,
    BarChart3,
    Bell,
    Bot,
    CalendarDays,
    ChevronDown,
    CheckCircle2,
    ClipboardCheck,
    Copy,
    Download,
    EmptyState,
    FileCheck,
    FileText,
    FolderOpen,
    HelpCircle,
    Home,
    Loader2,
    MapPin,
    Navigation,
    Pencil,
    Plus,
    SectionHeader,
    Send,
    Trash2,
    Upload,
    User,
    Users,
    fieldClassName,
    textareaClassName,
  } = Workspace;
  const teacherTrainingScrollableListClassName =
    "max-h-[min(68vh,760px)] overflow-y-auto pr-1 overscroll-contain";
  // 列表卡片在两栏布局里随对侧表单拉伸到等高，内部列表区填满剩余高度并自行滚动，
  // 避免短列表在表单旁留下大块空白。
  const teacherTrainingListCardClassName = "tt-card flex min-h-0 flex-col self-stretch p-5";
  const teacherTrainingFillingListClassName =
    "min-h-0 flex-1 max-h-[min(68vh,760px)] overflow-y-auto pr-1 overscroll-contain";
  const teacherTrainingRequiredMarkClassName = "ml-1 text-sm font-black leading-none text-rose-500";
  const teacherTrainingEitherRequiredMarkClassName =
    "ml-2 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-rose-600 ring-1 ring-rose-100";
  const RequiredFieldLabel = ({ children, either }: { children: string; either?: boolean }) => (
    <span className={teacherTrainingFieldLabelClassName}>
      {children}
      {either ? (
        <span className={teacherTrainingEitherRequiredMarkClassName}>至少一项</span>
      ) : (
        <span aria-hidden="true" className={teacherTrainingRequiredMarkClassName}>*</span>
      )}
    </span>
  );

  const selectedCohortId = activeTeacherTrainingCohortId;
  const setSelectedCohortId = setActiveTeacherTrainingCohortId;
  const [cohortDraft, setCohortDraft] = useState<Workspace.TeacherTrainingCohortDraft>(createDefaultCohortDraft);
  // 班次管理页：新建/修改表单与辅助信息默认折叠，让页面以班次列表为主、更清爽。
  const [cohortFormOpen, setCohortFormOpen] = useState(false);
  const [cohortConfigOpen, setCohortConfigOpen] = useState(false);
  // 参训教师页：名单是主视图，新增和导入只在右侧工作区按需展开。
  const [participantFormOpen, setParticipantFormOpen] = useState(false);
  const [participantImportOpen, setParticipantImportOpen] = useState(false);
  // 名单条目默认只显示核心信息，到达/交通/账号处理等细节按需展开。
  const [expandedParticipantIds, setExpandedParticipantIds] = useState<Set<string>>(new Set());
  const toggleParticipantExpanded = (id: string) =>
    setExpandedParticipantIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const [participantDraft, setParticipantDraft] = useState<Workspace.TeacherTrainingParticipantDraft>({
    cohortId: "",
    name: "",
    organization: "",
    phone: "",
    groupName: "",
    title: "",
    email: "",
    gender: "",
    age: "",
    personnelCategory: "",
    subject: "",
    professionalTitle: "",
    city: "",
    arrivalTransportation: "",
    arrivalAt: "",
    arrivalVehicleNo: "",
    arrivalDeparture: "",
    accountUsername: "",
    extraInfo: "",
    note: "",
  });
  const [participantImportText, setParticipantImportText] = useState("");
  const [participantImportStatus, setParticipantImportStatus] = useState("");
  const [participantImportLoading, setParticipantImportLoading] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantAccountFilter, setParticipantAccountFilter] = useState<"all" | "unbound">("all");
  const [managerAccountSearch, setManagerAccountSearch] = useState("");
  const [managerAccountDraft, setManagerAccountDraft] = useState<Workspace.TeacherTrainingManagerAccountDraft>(
    createDefaultManagerAccountDraft,
  );
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceOverviewFilter, setAttendanceOverviewFilter] = useState<AttendanceOverviewFilter>("all");
  const [checkInSearch, setCheckInSearch] = useState("");
  const [leaveSearch, setLeaveSearch] = useState("");
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionOverviewFilter, setSubmissionOverviewFilter] = useState<SubmissionOverviewFilter>("all");
  const [teacherTrainingDetailViewTitle, setTeacherTrainingDetailViewTitle] = useState("");
  const [accountEditParticipantId, setAccountEditParticipantId] = useState("");
  const [accountEditDraft, setAccountEditDraft] = useState({
    accountUsername: "",
    accountPassword: "",
  });
  const [managerDraft, setManagerDraft] = useState<Workspace.TeacherTrainingCohortManagerDraft>({
    cohortId: "",
    userId: "",
    title: "省培负责人",
  });
  const [courseDraft, setCourseDraft] = useState<Workspace.TeacherTrainingCourseSessionDraft>(
    createDefaultCourseSessionDraft,
  );
  const [checkInDraft, setCheckInDraft] = useState<Workspace.TeacherTrainingCheckInTaskDraft>(
    createDefaultCheckInTaskDraft,
  );
  const [locationMessage, setLocationMessage] = useState("");
  const [accountMessagesByParticipantId, setAccountMessagesByParticipantId] = useState<Record<string, string>>({});
  const [checkInSigningId, setCheckInSigningId] = useState("");
  const [manualCheckInDraft, setManualCheckInDraft] = useState<Workspace.TeacherTrainingManualCheckInDraft>({
    checkInTaskId: "",
    participantId: "",
    note: "定位失败，现场人工确认",
  });
  const [checkInClock, setCheckInClock] = useState(() => Date.now());
  const [leaveFlowSteps, setLeaveFlowSteps] = useState<Workspace.TeacherTrainingLeaveFlowStep[]>([]);
  const [leaveDraft, setLeaveDraft] = useState<Workspace.TeacherTrainingLeaveRequestDraft>({
    participantId: "",
    startDate: getDateInputValue(new Date()),
    endDate: getDateInputValue(new Date()),
    startTime: "",
    endTime: "",
    sessionLabel: "请假",
    reason: "",
  });
  const [leaveReviewCommentsById, setLeaveReviewCommentsById] = useState<Record<string, string>>({});
  const [activeLeaveReviewAction, setActiveLeaveReviewAction] = useState<{
    leaveRequestId: string;
    decision: "approve" | "reject";
  } | null>(null);
  const [activeLeavePanel, setActiveLeavePanel] = useState<TeacherTrainingLeavePanelKey>("pending");
  const [teacherLeaveFormOpen, setTeacherLeaveFormOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Workspace.TeacherTrainingProfileDraft>({
    participantId: "",
    name: "",
    organization: "",
    phone: "",
    groupName: "",
    title: "",
    email: "",
    arrivalTransportation: "",
    arrivalAt: "",
    arrivalVehicleNo: "",
    arrivalDeparture: "",
    password: "",
    passwordConfirm: "",
    note: "",
  });
  const [attendanceRegistrationDraft, setAttendanceRegistrationDraft] = useState<{
    participantId: string;
    roomNumber: string;
    materialsComplete: "" | "yes" | "no";
    note: string;
  }>({
    participantId: "",
    roomNumber: "",
    materialsComplete: "",
    note: "",
  });
  const [taskDraft, setTaskDraft] = useState<Workspace.TeacherTrainingTaskDraft>(createDefaultTaskDraft);
  const [submissionReviewDrafts, setSubmissionReviewDrafts] = useState<
    Record<string, { finalScore: string; finalComment: string }>
  >({});
  const [previewTeacherTrainingSubmissionId, setPreviewTeacherTrainingSubmissionId] = useState("");
  const [courseImportText, setCourseImportText] = useState("");
  const [courseImportStatus, setCourseImportStatus] = useState("");
  const [courseImportLoading, setCourseImportLoading] = useState(false);
  const [exportingTeacherTrainingType, setExportingTeacherTrainingType] = useState<TeacherTrainingExportType | "">("");
  const [exportStatus, setExportStatus] = useState("");
  const [recentExportRecords, setRecentExportRecords] = useState<TeacherTrainingExportRecord[]>([]);
  const [downloadingTeacherTrainingFile, setDownloadingTeacherTrainingFile] = useState("");
  const [teacherTrainingDownloadStatus, setTeacherTrainingDownloadStatus] = useState("");
  const [submissionDraft, setSubmissionDraft] = useState<Workspace.TeacherTrainingSubmissionDraft>({
    taskId: "",
    participantId: "",
    content: "",
    attachment: "",
  });
  const [submissionAttachmentFile, setSubmissionAttachmentFile] = useState<File | null>(null);
  const [submissionAttachmentPreviewUrl, setSubmissionAttachmentPreviewUrl] = useState("");
  const [submissionAttachmentProgress, setSubmissionAttachmentProgress] = useState<number | null>(null);
  const [submissionAttachmentError, setSubmissionAttachmentError] = useState("");
  const [submissionSaveStatus, setSubmissionSaveStatus] = useState("");
  const [isSubmissionAttachmentUploading, setIsSubmissionAttachmentUploading] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [selectedCohortIds, setSelectedCohortIds] = useState<string[]>([]);
  const [selectedCourseSessionIds, setSelectedCourseSessionIds] = useState<string[]>([]);
  const [selectedCheckInTaskIds, setSelectedCheckInTaskIds] = useState<string[]>([]);
  const [selectedTeacherTrainingTaskIds, setSelectedTeacherTrainingTaskIds] = useState<string[]>([]);
  const [selectedManagerAccountIds, setSelectedManagerAccountIds] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setCheckInClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (submissionAttachmentPreviewUrl) {
        URL.revokeObjectURL(submissionAttachmentPreviewUrl);
      }
    };
  }, [submissionAttachmentPreviewUrl]);

  const selectedCohort = useMemo(() => {
    if (selectedCohortId) {
      return teacherTrainingCohorts.find((cohort) => cohort.id === selectedCohortId) ?? teacherTrainingCohorts[0] ?? null;
    }

    return teacherTrainingCohorts[0] ?? null;
  }, [selectedCohortId, teacherTrainingCohorts]);

  useEffect(() => {
    if (selectedCohort && selectedCohort.includeDetails === false) {
      void loadTeacherTrainingCohortDetails(selectedCohort.id);
    }
  }, [loadTeacherTrainingCohortDetails, selectedCohort]);

  const participantById = useMemo(
    () => new Map((selectedCohort?.participants ?? []).map((participant) => [participant.id, participant])),
    [selectedCohort?.participants],
  );
  const selectedCohortTasksForCurrentUser = useMemo(
    () =>
      canManageTeacherTraining
        ? selectedCohort?.tasks ?? []
        : (selectedCohort?.tasks ?? []).filter((task) => task.isReleased),
    [canManageTeacherTraining, selectedCohort?.tasks],
  );
  const selectedTask =
    selectedCohortTasksForCurrentUser.find((task) => task.id === submissionDraft.taskId) ??
    selectedCohortTasksForCurrentUser[0] ??
    null;
  const selectedParticipant =
    selectedCohort?.participants.find((participant) => participant.id === submissionDraft.participantId) ??
    selectedCohort?.participants[0] ??
    null;
  const selectedSubmission =
    selectedTask?.submissions.find((submission) => submission.participantId === selectedParticipant?.id) ?? null;
  const savedSubmissionAttachment = selectedSubmission?.attachment ?? "";
  const savedSubmissionAttachmentFile = selectedSubmission?.attachmentFile ?? null;
  const currentSubmissionAttachmentLabel = Workspace.getTeacherTrainingSubmissionAttachmentLabel(submissionDraft.attachment);
  const currentSubmissionAttachmentFile =
    savedSubmissionAttachment === submissionDraft.attachment ? savedSubmissionAttachmentFile : null;
  const isReplacingSavedSubmissionAttachment = Boolean(submissionAttachmentFile && savedSubmissionAttachmentFile);
  const isRemovingSavedSubmissionAttachment = Boolean(
    savedSubmissionAttachmentFile && !submissionAttachmentFile && savedSubmissionAttachment !== submissionDraft.attachment,
  );
  const hasSelectedParticipant = Boolean(selectedParticipant);
  const courseSessions = useMemo(() => selectedCohort?.courseSessions ?? [], [selectedCohort?.courseSessions]);
  const participantImportPreview = useMemo(
    () => buildParticipantImportPreview(parseTeacherTrainingParticipantImportText(participantImportText), selectedCohort?.participants ?? []),
    [participantImportText, selectedCohort?.participants],
  );
  const participantImportFieldSummary = useMemo(
    () => buildParticipantImportFieldSummary(participantImportText),
    [participantImportText],
  );
  const courseImportPreview = useMemo(
    () => buildCourseImportPreview(parseCourseImportRows(courseImportText), courseSessions),
    [courseImportText, courseSessions],
  );
  const courseImportFieldSummary = useMemo(() => buildCourseImportFieldSummary(courseImportText), [courseImportText]);
  const checkInNow = useMemo(() => new Date(checkInClock), [checkInClock]);
  const currentCourseDateKey = getDateInputValue(checkInNow);
  const currentCourseTimeKey = getTimeInputValue(checkInNow);
  const teacherCourseTimeline = [...courseSessions].sort((first, second) =>
    `${first.courseDate} ${first.startTime || "00:00"}`.localeCompare(
      `${second.courseDate} ${second.startTime || "00:00"}`,
    ),
  );
  const teacherNextCourse =
    teacherCourseTimeline.find((course) => {
      if (course.courseDate > currentCourseDateKey) return true;
      if (course.courseDate < currentCourseDateKey) return false;

      return (course.endTime || course.startTime || "23:59") >= currentCourseTimeKey;
    }) ?? null;
  const effectiveProfileDraft =
    selectedParticipant && profileDraft.participantId !== selectedParticipant.id
      ? {
          participantId: selectedParticipant.id,
          name: selectedParticipant.name,
          organization: selectedParticipant.organization,
          phone: selectedParticipant.phone,
          groupName: selectedParticipant.groupName,
          title: selectedParticipant.title,
          email: selectedParticipant.email,
          arrivalTransportation: selectedParticipant.arrivalInfo.transportation,
          arrivalAt: selectedParticipant.arrivalInfo.arrivalAt,
          arrivalVehicleNo: selectedParticipant.arrivalInfo.vehicleNo,
          arrivalDeparture: selectedParticipant.arrivalInfo.departure,
          password: "",
          passwordConfirm: "",
          note: selectedParticipant.note,
        }
      : profileDraft;
  const exportBaseUrl = selectedCohort
    ? `/api/teacher-training/export?cohortId=${encodeURIComponent(selectedCohort.id)}`
    : "";
  const canManage = canManageTeacherTraining;
  const showTeacherTrainingSubmissionForm = !canManage;
  const canManageGlobal = currentUser?.role === "admin";
  const canCreateTeacherTrainingCohort = currentUser?.role === "admin";
  const canShowCohortDraftForm = canCreateTeacherTrainingCohort || Boolean(cohortDraft.id);
  const canConfigureTeacherTrainingLeaveFlow = currentUser?.role === "admin";
  const isAccountManagementSection = activeTeacherTrainingSection === "accounts";
  const participantSearchKeyword = normalizeSearchText(participantSearch);
  const attendanceSearchKeyword = normalizeSearchText(attendanceSearch);
  const checkInSearchKeyword = normalizeSearchText(checkInSearch);
  const leaveSearchKeyword = normalizeSearchText(leaveSearch);
  const submissionSearchKeyword = normalizeSearchText(submissionSearch);
  const getParticipantAttendanceRecord = (
    participant: Workspace.TeacherTrainingParticipantItem,
    status: AttendanceStatus,
    sessionLabel?: string,
  ) =>
    participant.attendances.find(
      (attendance) => attendance.status === status && (!sessionLabel || attendance.sessionLabel === sessionLabel),
    ) ??
    selectedCohort?.attendances.find(
      (attendance) =>
        attendance.participantId === participant.id &&
        attendance.status === status &&
        (!sessionLabel || attendance.sessionLabel === sessionLabel),
    ) ??
    null;
  const matchesAttendanceOverviewFilter = (participant: Workspace.TeacherTrainingParticipantItem) => {
    const registered = Boolean(getParticipantAttendanceRecord(participant, "present", "报到"));

    if (attendanceOverviewFilter === "registered") {
      return registered;
    }
    if (attendanceOverviewFilter === "pending") {
      return !registered;
    }
    if (attendanceOverviewFilter === "leave" || attendanceOverviewFilter === "absent") {
      return Boolean(getParticipantAttendanceRecord(participant, attendanceOverviewFilter));
    }

    return true;
  };
  const filteredParticipants = (selectedCohort?.participants ?? []).filter((participant) => {
    if (!participantSearchKeyword) return true;
    return [
      participant.name,
      participant.organization,
      participant.phone,
      participant.groupName,
      participant.title,
      participant.email,
      participant.gender,
      participant.age,
      participant.personnelCategory,
      participant.subject,
      participant.professionalTitle,
      participant.city,
      participant.arrivalInfo.arrivalAt,
      participant.arrivalInfo.transportationLabel,
      participant.arrivalInfo.vehicleNo,
      participant.arrivalInfo.departure,
      participant.accountUsername,
      participant.extraInfo,
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(participantSearchKeyword);
  });
  const participantAccountStatusSummary = useMemo(() => {
    const participants = selectedCohort?.participants ?? [];
    const boundCount = participants.filter((participant) => participant.accountUserId).length;
    const dedicatedCount = participants.filter((participant) => participant.accountRole === "training_teacher").length;
    const platformCount = participants.filter(
      (participant) => participant.accountUserId && participant.accountRole !== "training_teacher",
    ).length;
    const unboundCount = Math.max(0, participants.length - boundCount);

    return [
      { label: "已绑定账号", value: boundCount, tone: "blue" },
      { label: "未绑定账号", value: unboundCount, tone: unboundCount > 0 ? "amber" : "emerald" },
      { label: "省培专用账号", value: dedicatedCount, tone: "emerald" },
      { label: "创赛原平台共用账号", value: platformCount, tone: "slate" },
    ];
  }, [selectedCohort?.participants]);
  const boundParticipantAccountUserIds = useMemo(
    () => new Set((selectedCohort?.participants ?? []).map((participant) => participant.accountUserId).filter(Boolean)),
    [selectedCohort?.participants],
  );
  const availableParticipantAccountOptions = useMemo(
    () =>
      teacherTrainingParticipantAccountOptions.filter(
        (account) => !boundParticipantAccountUserIds.has(account.id) || account.username === participantDraft.accountUsername,
      ),
    [boundParticipantAccountUserIds, participantDraft.accountUsername, teacherTrainingParticipantAccountOptions],
  );
  const getParticipantAccountTypeLabel = (participant: Workspace.TeacherTrainingParticipantItem) => {
    if (!participant.accountUserId) return "未绑定账号";
    return participant.accountRole === "training_teacher" ? "省培专用账号" : "创赛原平台账号";
  };
  const getParticipantAccountTypeClassName = (participant: Workspace.TeacherTrainingParticipantItem) => {
    if (!participant.accountUserId) return "bg-amber-50 text-amber-700";
    return participant.accountRole === "training_teacher"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-slate-100 text-slate-600";
  };
  const getParticipantAccountBoundaryText = (participant: Workspace.TeacherTrainingParticipantItem) => {
    if (!participant.accountUserId) {
      return "未绑定登录账号：可绑定创赛原平台账号，或生成省培专用账号。";
    }

    return participant.accountRole === "training_teacher"
      ? "省培专用账号：只用于省培系统，可在省培里重置密码或删除账号。"
      : "创赛原平台共用账号：只在这里增加省培身份；密码、姓名等基础账号信息由创赛账号管理维护。";
  };
  const getParticipantAccountRemoveLabel = (participant: Workspace.TeacherTrainingParticipantItem) =>
    participant.accountRole === "training_teacher" ? "删除省培专用账号" : "解除省培绑定";
  const filteredAttendanceParticipants = (selectedCohort?.participants ?? []).filter((participant) => {
    if (!matchesAttendanceOverviewFilter(participant)) return false;
    if (!attendanceSearchKeyword) return true;
    return [
      participant.name,
      participant.organization,
      participant.phone,
      participant.groupName,
      participant.title,
      participant.email,
      participant.gender,
      participant.age,
      participant.personnelCategory,
      participant.subject,
      participant.professionalTitle,
      participant.city,
      getParticipantAttendanceRecord(participant, "present", "报到")?.statusLabel ?? Workspace.teacherTrainingAttendancePendingLabel,
      getParticipantAttendanceRecord(participant, "leave")?.statusLabel ?? "",
      getParticipantAttendanceRecord(participant, "absent")?.statusLabel ?? "",
      participant.arrivalInfo.arrivalAt,
      participant.arrivalInfo.transportationLabel,
      participant.arrivalInfo.vehicleNo,
      participant.arrivalInfo.departure,
      participant.extraInfo,
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(attendanceSearchKeyword);
  });
  const matchesLeaveSearch = (request: Workspace.TeacherTrainingLeaveRequestItem) => {
    if (!leaveSearchKeyword) return true;
    return [
      request.participantName,
      request.organization,
      request.sessionLabel,
      request.reason,
      request.statusLabel,
      request.startDate,
      request.endDate,
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(leaveSearchKeyword);
  };
  const matchesSubmissionSearch = (task: Workspace.TeacherTrainingTaskItem) => {
    if (submissionOverviewFilter === "submitted" && task.submissions.length === 0) {
      return false;
    }
    if (!submissionSearchKeyword) return true;
    return [
      task.title,
      task.description,
      task.taskTypeLabel,
      task.courseTitle,
      task.courseDate,
      task.courseTimeRange,
      task.releaseStatusLabel,
      ...task.submissions.flatMap((submission) => {
        const participant = participantById.get(submission.participantId);
        return [
          submission.participantName,
          participant?.organization ?? "",
          participant?.groupName ?? "",
          participant?.title ?? "",
          participant?.email ?? "",
          participant?.gender ?? "",
          participant?.age ?? "",
          participant?.personnelCategory ?? "",
          participant?.subject ?? "",
          participant?.professionalTitle ?? "",
          participant?.city ?? "",
          submission.content,
          submission.attachment,
          submission.attachmentLabel,
          submission.submittedAt,
          submission.finalScore === null ? "" : `${submission.finalScore}`,
          submission.finalComment,
          submission.reviewStatusLabel,
        ];
      }),
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(submissionSearchKeyword);
  };
  const getVisibleTaskSubmissions = (task: Workspace.TeacherTrainingTaskItem) => {
    const submissions = submissionSearchKeyword
      ? task.submissions.filter((submission) => {
          const participant = participantById.get(submission.participantId);
          return [
            submission.participantName,
            participant?.organization ?? "",
            participant?.groupName ?? "",
            participant?.title ?? "",
            participant?.email ?? "",
            participant?.gender ?? "",
            participant?.age ?? "",
            participant?.personnelCategory ?? "",
            participant?.subject ?? "",
            participant?.professionalTitle ?? "",
            participant?.city ?? "",
            submission.content,
            submission.attachment,
            submission.attachmentLabel,
            submission.submittedAt,
            submission.finalScore === null ? "" : `${submission.finalScore}`,
            submission.finalComment,
            submission.reviewStatusLabel,
          ]
            .join(" ")
            .toLocaleLowerCase("zh-CN")
            .includes(submissionSearchKeyword);
        })
      : task.submissions;

    return submissions.slice(0, canManage ? 80 : submissionSearchKeyword ? 8 : 3);
  };
  const submissionTaskPool = canManage ? selectedCohort?.tasks ?? [] : selectedCohortTasksForCurrentUser;
  const filteredSubmissionTasks = submissionTaskPool.filter(matchesSubmissionSearch);
  const filteredCheckInTasks = (selectedCohort?.checkInTasks ?? []).filter((task) => {
    if (!checkInSearchKeyword) return true;
    return [
      task.title,
      task.signDate,
      task.locationName,
      ...(selectedCohort?.participants ?? []).flatMap((participant) => [
        participant.name,
        participant.organization,
        participant.groupName,
        participant.title,
        participant.email,
        participant.gender,
        participant.age,
        participant.personnelCategory,
        participant.subject,
        participant.professionalTitle,
        participant.city,
      ]),
      ...task.records.flatMap((record) => {
        const participant = participantById.get(record.participantId);
        return [
          record.participantName,
          participant?.organization ?? "",
          participant?.groupName ?? "",
          participant?.title ?? "",
          participant?.email ?? "",
          participant?.gender ?? "",
          participant?.age ?? "",
          participant?.personnelCategory ?? "",
          participant?.subject ?? "",
          participant?.professionalTitle ?? "",
          participant?.city ?? "",
          record.signedAt,
          record.note,
        ];
      }),
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(checkInSearchKeyword);
  });
  const getVisibleCheckInRecords = (task: Workspace.TeacherTrainingCheckInTaskItem) => {
    const records = checkInSearchKeyword
      ? task.records.filter((record) => {
          const participant = participantById.get(record.participantId);
          return [
            record.participantName,
            participant?.organization ?? "",
            participant?.groupName ?? "",
            participant?.title ?? "",
            participant?.email ?? "",
            participant?.gender ?? "",
            participant?.age ?? "",
            participant?.personnelCategory ?? "",
            participant?.subject ?? "",
            participant?.professionalTitle ?? "",
            participant?.city ?? "",
            record.signedAt,
            record.note,
          ]
            .join(" ")
            .toLocaleLowerCase("zh-CN")
            .includes(checkInSearchKeyword);
        })
      : task.records;

    return records.slice(0, checkInSearchKeyword ? 8 : 3);
  };
  const getUnsignedCheckInParticipants = (task: Workspace.TeacherTrainingCheckInTaskItem) => {
    const signedParticipantIds = new Set(task.records.map((record) => record.participantId));
    const participants = (selectedCohort?.participants ?? []).filter((participant) => {
      if (signedParticipantIds.has(participant.id)) return false;
      if (!checkInSearchKeyword) return true;

      return [
        participant.name,
        participant.organization,
        participant.groupName,
        participant.title,
        participant.email,
        participant.gender,
        participant.age,
        participant.personnelCategory,
        participant.subject,
        participant.professionalTitle,
        participant.city,
      ]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(checkInSearchKeyword);
    });

    return participants.slice(0, checkInSearchKeyword ? 8 : 4);
  };
  const teacherReleasedTasks = (selectedCohort?.tasks ?? []).filter((task) => task.isReleased);
  const teacherWaitingReleaseTasks = (selectedCohort?.tasks ?? []).filter((task) => !task.isReleased);
  const teacherSubmittedTaskIds = new Set(
    teacherReleasedTasks
      .filter((task) => task.submissions.some((submission) => submission.participantId === selectedParticipant?.id))
      .map((task) => task.id),
  );
  const teacherPendingTaskCount =
    !canManage && selectedCohort
      ? teacherReleasedTasks.filter((task) => !teacherSubmittedTaskIds.has(task.id)).length
      : 0;
  const teacherTaskProgressItems = teacherReleasedTasks.map((task) => {
    const submission = task.submissions.find((item) => item.participantId === selectedParticipant?.id) ?? null;

    return {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      releaseStatusLabel: task.releaseStatusLabel,
      isComplete: Boolean(submission),
      statusLabel: submission ? "任务已提交" : "任务待提交",
      submittedAt: submission?.submittedAt ?? "",
    };
  });
  const teacherTaskCompletedCount = teacherTaskProgressItems.filter((item) => item.isComplete).length;
  const teacherTaskCompletionPercent = Math.round(
    (teacherTaskCompletedCount / Math.max(1, teacherTaskProgressItems.length)) * 100,
  );
  const teacherTaskSummaryText =
    teacherTaskProgressItems.length === 0
      ? "暂无任务发布"
      : teacherPendingTaskCount > 0
        ? `待提交 ${teacherPendingTaskCount} 项`
        : "全部汇报已提交";
  const teacherTaskSummaryToneClassName =
    teacherTaskProgressItems.length === 0
      ? "bg-slate-100 text-slate-600"
      : teacherPendingTaskCount > 0
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";
  const teacherSignedCheckInTaskIds = new Set(
    (selectedCohort?.checkInTasks ?? [])
      .filter((task) => task.records.some((record) => record.participantId === selectedParticipant?.id))
      .map((task) => task.id),
  );
  const teacherPendingCheckInCount =
    !canManage && selectedCohort
      ? selectedCohort.checkInTasks.filter((task) => !teacherSignedCheckInTaskIds.has(task.id)).length
      : 0;
  const teacherCheckInProgressItems = (selectedCohort?.checkInTasks ?? []).map((task) => {
    const signedRecord = task.records.find((record) => record.participantId === selectedParticipant?.id) ?? null;
    const windowState = Workspace.getTeacherTrainingCheckInWindowState(task, checkInNow);
    const isOpen = windowState === "open";

    return {
      id: task.id,
      title: task.title,
      detail:
        [task.signDate, [task.startTime, task.endTime].filter(Boolean).join("-"), task.locationName]
          .filter(Boolean)
          .join(" · ") || "地点待发布",
      hasSigned: Boolean(signedRecord),
      canSignNow: isOpen && !signedRecord,
      signedAt: signedRecord?.signedAt ?? "",
      statusLabel: signedRecord
        ? "已完成签到"
        : isOpen
          ? "现在可签到"
          : windowState === "not_started"
            ? "等待开放"
            : windowState === "ended"
              ? "签到已结束"
              : "签到不可用",
      toneClassName: signedRecord
        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
        : isOpen
          ? "border-blue-100 bg-blue-50 text-blue-700"
          : windowState === "not_started"
            ? "border-amber-100 bg-amber-50 text-amber-700"
            : "border-slate-100 bg-slate-50 text-slate-600",
    };
  });
  const teacherCheckInOpenCount = teacherCheckInProgressItems.filter((item) => item.canSignNow).length;
  const teacherCheckInCompletedCount = teacherCheckInProgressItems.filter((item) => item.hasSigned).length;
  const teacherCheckInCompletionPercent = Math.round(
    (teacherCheckInCompletedCount / Math.max(1, teacherCheckInProgressItems.length)) * 100,
  );
  const teacherCheckInSummaryText =
    teacherCheckInProgressItems.length === 0
      ? "暂无签到任务"
      : teacherCheckInOpenCount > 0
        ? `可签到 ${teacherCheckInOpenCount} 项`
        : teacherPendingCheckInCount > 0
          ? `待签到 ${teacherPendingCheckInCount} 项`
          : "已完成全部签到";
  const teacherCheckInProgressMetaText =
    teacherCheckInProgressItems.length === 0
      ? "等待管理员发布课程签到任务"
      : `已签到 ${teacherCheckInCompletedCount}/${teacherCheckInProgressItems.length}`;
  const teacherCheckInSummaryToneClassName =
    teacherCheckInProgressItems.length === 0
      ? "bg-slate-100 text-slate-600"
      : teacherCheckInOpenCount > 0
        ? "bg-blue-50 text-blue-700"
        : teacherPendingCheckInCount > 0
          ? "bg-amber-50 text-amber-700"
          : "bg-emerald-50 text-emerald-700";
  const teacherPasswordChangeRequired = !canManage && currentUser?.role === "training_teacher" && !currentUser.email;
  const teacherProfileCompletionItems = [
    {
      label: "姓名",
      isComplete: Boolean(effectiveProfileDraft.name.trim()),
      completeLabel: "姓名已填写",
      incompleteLabel: "姓名待补充",
      required: true,
    },
    {
      label: "单位",
      isComplete: Boolean(effectiveProfileDraft.organization.trim()),
      completeLabel: "单位已填写",
      incompleteLabel: "单位待补充",
      required: true,
    },
    {
      label: "手机号",
      isComplete: Boolean(effectiveProfileDraft.phone.trim()),
      completeLabel: "手机号已填写",
      incompleteLabel: "手机号待补充",
      required: true,
    },
    {
      label: "职务",
      isComplete: Boolean(effectiveProfileDraft.title.trim()),
      completeLabel: "职务已填写",
      incompleteLabel: "职务待补充",
      required: true,
    },
    {
      label: "邮箱",
      isComplete: Boolean(effectiveProfileDraft.email.trim()),
      completeLabel: "邮箱已填写",
      incompleteLabel: "邮箱待补充",
      required: true,
    },
    ...(teacherPasswordChangeRequired
      ? [
          {
            label: "登录密码",
            isComplete: Boolean(
              effectiveProfileDraft.password.trim() &&
                effectiveProfileDraft.password.trim() === effectiveProfileDraft.passwordConfirm.trim(),
            ),
            completeLabel: "新密码已填写",
            incompleteLabel: "初始密码待修改",
            required: true,
          },
        ]
      : []),
  ];
  const teacherProfileCompletedCount = teacherProfileCompletionItems.filter((item) => item.isComplete).length;
  const teacherProfileCompletionPercent = Math.round(
    (teacherProfileCompletedCount / Math.max(1, teacherProfileCompletionItems.length)) * 100,
  );
  const teacherRequiredProfileItems = teacherProfileCompletionItems.filter((item) => item.required);
  const teacherProfileNeedsAttention =
    !hasSelectedParticipant || teacherRequiredProfileItems.some((item) => !item.isComplete);
  const teacherProfileStatusText = teacherProfileNeedsAttention ? "资料待完善" : "资料已完整";
  const teacherInitialProfileRequired =
    !canManage && hasSelectedParticipant && (teacherProfileNeedsAttention || teacherPasswordChangeRequired);

  useEffect(() => {
    if (teacherInitialProfileRequired && activeTeacherTrainingSection !== "profile") {
      setActiveTeacherTrainingSection("profile");
    }
  }, [activeTeacherTrainingSection, setActiveTeacherTrainingSection, teacherInitialProfileRequired]);

  const leaveDisabledReason = getTeacherTrainingLeaveDisabledReason(
    hasSelectedParticipant,
    selectedCohort?.leaveFlow,
    leaveDraft,
    canManage,
  );
  const profileDisabledReason = getTeacherTrainingProfileDisabledReason(effectiveProfileDraft, teacherPasswordChangeRequired);
  const submissionDisabledReason = getTeacherTrainingSubmissionDisabledReason(
    Boolean(selectedTask),
    hasSelectedParticipant,
    canManage,
    Boolean(submissionAttachmentFile || currentSubmissionAttachmentFile),
  );
  const defaultLeaveFlowSteps = useMemo<Workspace.TeacherTrainingLeaveFlowStep[]>(
    () => [],
    [],
  );
  const pendingLeaveRequests = selectedCohort?.leaveRequests.filter((request) => request.status === "pending") ?? [];
  const filteredLeaveRequests = (selectedCohort?.leaveRequests ?? []).filter(matchesLeaveSearch);
  const managerVisibleLeaveRequests = leaveSearchKeyword
    ? filteredLeaveRequests
    : pendingLeaveRequests.length
      ? pendingLeaveRequests
      : selectedCohort?.leaveRequests.slice(0, 5) ?? [];
  const managerPendingLeaveRequests = managerVisibleLeaveRequests.filter((request) => request.status === "pending");
  const displayedManagerLeaveRequests =
    activeLeavePanel === "pending" ? managerPendingLeaveRequests : managerVisibleLeaveRequests;
  const teacherTrainingLeavePanelItems: Array<{
    key: TeacherTrainingLeavePanelKey;
    label: string;
    count: number | null;
    visible: boolean;
  }> = [
    { key: "pending", label: "待审批", count: pendingLeaveRequests.length, visible: canManage },
    { key: "all", label: "全部申请", count: selectedCohort?.leaveRequests.length ?? 0, visible: canManage },
    { key: "rules", label: "审批规则", count: null, visible: canConfigureTeacherTrainingLeaveFlow },
  ];
  const attendanceFilterLabel =
    attendanceOverviewFilters.find((item) => item.key === attendanceOverviewFilter)?.label ?? "全部";
  const submissionFilterLabel =
    submissionOverviewFilters.find((item) => item.key === submissionOverviewFilter)?.label ?? "全部";
  const teacherTrainingFilterSummaries = {
    participants: [
      { key: "view", label: "当前查看", value: teacherTrainingDetailViewTitle || "全部参训教师" },
      participantSearchKeyword ? { key: "search", label: "搜索条件", value: participantSearch.trim() } : null,
      {
        key: "count",
        label: "结果",
        value: `${filteredParticipants.length}/${selectedCohort?.participants.length ?? 0} 人`,
      },
    ].filter(Boolean) as TeacherTrainingFilterSummaryItem[],
    attendance: [
      { key: "view", label: "当前查看", value: teacherTrainingDetailViewTitle || attendanceFilterLabel },
      { key: "status", label: "报到状态", value: attendanceFilterLabel },
      attendanceSearchKeyword ? { key: "search", label: "搜索条件", value: attendanceSearch.trim() } : null,
      {
        key: "count",
        label: "结果",
        value: `${filteredAttendanceParticipants.length}/${selectedCohort?.participants.length ?? 0} 人`,
      },
    ].filter(Boolean) as TeacherTrainingFilterSummaryItem[],
    checkins: [
      { key: "view", label: "当前查看", value: teacherTrainingDetailViewTitle || "课程签到记录" },
      checkInSearchKeyword ? { key: "search", label: "搜索条件", value: checkInSearch.trim() } : null,
      {
        key: "count",
        label: "结果",
        value: `${filteredCheckInTasks.length}/${selectedCohort?.checkInTasks.length ?? 0} 个任务`,
      },
    ].filter(Boolean) as TeacherTrainingFilterSummaryItem[],
    leave: [
      { key: "view", label: "当前查看", value: teacherTrainingDetailViewTitle || (canManage ? "请假申请" : "我的请假") },
      leaveSearchKeyword ? { key: "search", label: "搜索条件", value: leaveSearch.trim() } : null,
      {
        key: "count",
        label: "结果",
        value: `${displayedManagerLeaveRequests.length}/${selectedCohort?.leaveRequests.length ?? 0} 条`,
      },
    ].filter(Boolean) as TeacherTrainingFilterSummaryItem[],
    submissions: [
      { key: "view", label: "当前查看", value: teacherTrainingDetailViewTitle || "任务汇报" },
      { key: "status", label: "汇报状态", value: submissionFilterLabel },
      submissionSearchKeyword ? { key: "search", label: "搜索条件", value: submissionSearch.trim() } : null,
      {
        key: "count",
        label: "结果",
        value: `${filteredSubmissionTasks.length}/${submissionTaskPool.length} 个任务`,
      },
    ].filter(Boolean) as TeacherTrainingFilterSummaryItem[],
  };
  const teacherLeaveRequests = [...(selectedParticipant?.leaveRequests ?? [])].sort((first, second) =>
    second.submittedAt.localeCompare(first.submittedAt),
  );
  const approverLabelById = useMemo(() => {
    const labels = new Map(
      teacherTrainingApproverOptions.map((option) => [
        option.id,
        formatTeacherTrainingApproverLabel(Workspace.teacherTrainingRoleTitleLabels[option.role] ?? "工作人员", option.name),
      ]),
    );

    selectedCohort?.managers.forEach((manager) => {
      labels.set(manager.userId, formatTeacherTrainingApproverLabel(manager.title || "省培班主任", manager.name));
    });

    return labels;
  }, [selectedCohort?.managers, teacherTrainingApproverOptions]);
  const selectedManagerRoleOption =
    teacherTrainingManagerRoleOptions.find((option) => option.title === managerDraft.title) ??
    teacherTrainingManagerRoleOptions[0];
  const selectedManagerAccountOptions = teacherTrainingManagerAccounts.filter(
    (account) =>
      normalizeTeacherTrainingManagerIdentity(account.responsibility) === managerDraft.title ||
      account.managedCohorts.some((manager) => normalizeTeacherTrainingManagerIdentity(manager.title) === managerDraft.title),
  );
  const managerAccountSearchKeyword = normalizeSearchText(managerAccountSearch);
  const filteredManagerAccounts = teacherTrainingManagerAccounts.filter((account) => {
    if (!managerAccountSearchKeyword) return true;
    return [
      account.name,
      account.username,
      account.phone,
      account.email,
      account.responsibility,
      normalizeTeacherTrainingManagerIdentity(account.responsibility),
      ...account.managedCohorts.flatMap((manager) => [manager.title, manager.cohortTitle]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(managerAccountSearchKeyword);
  });
  const managerAccountCounts = useMemo(() => {
    const hasIdentity = (account: Workspace.TeacherTrainingManagerAccountItem, title: string) =>
      normalizeTeacherTrainingManagerIdentity(account.responsibility) === title ||
      account.managedCohorts.some((manager) => normalizeTeacherTrainingManagerIdentity(manager.title) === title);

    return {
      leader: teacherTrainingManagerAccounts.filter((account) => hasIdentity(account, "省培负责人")).length,
      classTeacher: teacherTrainingManagerAccounts.filter((account) => hasIdentity(account, "省培班主任")).length,
    };
  }, [teacherTrainingManagerAccounts]);
  const toggleSelectedId = (currentIds: string[], id: string) =>
    currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id];
  const setVisibleSelection = (
    visibleIds: string[],
    selectedIds: string[],
    setter: (ids: string[]) => void,
  ) => {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setter(allSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...selectedIds, ...visibleIds])));
  };
  const groupedCohortManagers = useMemo(() => {
    const managers = [...(selectedCohort?.managers ?? [])].sort((first, second) => {
      const rankDiff = getTeacherTrainingManagerRoleRank(first.title) - getTeacherTrainingManagerRoleRank(second.title);
      return rankDiff || first.name.localeCompare(second.name, "zh-CN");
    });

    return [
      {
        title: "省培负责人",
        items: managers.filter((manager) => getTeacherTrainingManagerRoleRank(manager.title) === 0),
      },
      {
        title: "省培班主任",
        items: managers.filter((manager) => getTeacherTrainingManagerRoleRank(manager.title) === 1),
      },
      {
        title: "其他工作人员",
        items: managers.filter((manager) => getTeacherTrainingManagerRoleRank(manager.title) === 2),
      },
    ].filter((group) => group.items.length > 0);
  }, [selectedCohort?.managers]);
  const teacherTrainingConfigStatusItems = useMemo(() => {
    const managers = selectedCohort?.managers ?? [];
    const leaders = managers.filter((manager) => getTeacherTrainingManagerRoleRank(manager.title) === 0);
    const classTeachers = managers.filter((manager) => getTeacherTrainingManagerRoleRank(manager.title) === 1);
    const leaveSteps = selectedCohort?.leaveFlow?.approvalSteps ?? [];
    const approvalReady = Boolean(selectedCohort?.leaveFlow?.isEnabled && leaveSteps.length > 0);
    const approverReady = approvalReady && leaveSteps.every((step) => step.approverIds.length > 0);

    return [
      {
        label: "省培负责人",
        done: leaders.length > 0,
        detail: leaders.map((manager) => manager.name).join("、") || "未设置",
      },
      {
        label: "省培班主任",
        done: classTeachers.length > 0,
        detail: classTeachers.map((manager) => manager.name).join("、") || "未设置",
      },
      {
        label: "请假流程",
        done: approvalReady,
        detail: approvalReady ? `${leaveSteps.length} 步审批已启用` : "未启用",
      },
      {
        label: "审批人",
        done: approverReady,
        detail: approverReady
          ? leaveSteps.map((step) => `${step.name} ${step.approverIds.length}人`).join("；")
          : "请在请假审批模块补齐",
      },
    ];
  }, [selectedCohort?.leaveFlow, selectedCohort?.managers]);
  const cohortHealthCheckItems = useMemo<TeacherTrainingCohortHealthCheckItem[]>(() => {
    const managers = selectedCohort?.managers ?? [];
    const leaders = managers.filter((manager) => getTeacherTrainingManagerRoleRank(manager.title) === 0);
    const classTeachers = managers.filter((manager) => getTeacherTrainingManagerRoleRank(manager.title) === 1);
    const leaveSteps = selectedCohort?.leaveFlow?.approvalSteps ?? [];
    const approvalReady = Boolean(selectedCohort?.leaveFlow?.isEnabled && leaveSteps.length > 0);
    const approverReady = approvalReady && leaveSteps.every((step) => step.approverIds.length > 0);

    return [
      {
        label: "教师名单",
        done: (selectedCohort?.participants.length ?? 0) > 0,
        severity: "required",
        detail: (selectedCohort?.participants.length ?? 0) > 0 ? `${selectedCohort?.participants.length ?? 0} 人已导入` : "没有教师名单，账号、报到、请假和汇报都无法开展",
      },
      {
        label: "课程安排",
        done: courseSessions.length > 0,
        severity: "recommended",
        detail: courseSessions.length > 0 ? `${courseSessions.length} 节课程已设置` : "课程未设置会影响课程签到和日程查看",
      },
      {
        label: "省培负责人",
        done: leaders.length > 0,
        severity: "recommended",
        detail: leaders.map((manager) => manager.name).join("、") || "建议至少设置一名省培负责人",
      },
      {
        label: "省培班主任",
        done: classTeachers.length > 0,
        severity: "required",
        detail: classTeachers.map((manager) => manager.name).join("、") || "省培班主任未设置，日常管理责任不清楚",
      },
      {
        label: "请假流程",
        done: approvalReady,
        severity: "required",
        detail: approvalReady ? `${leaveSteps.length} 步审批已启用` : "流程未启用时，教师不能正常提交请假",
      },
      {
        label: "请假审批人",
        done: approverReady,
        severity: "required",
        detail: approverReady
          ? leaveSteps.map((step) => `${step.name} ${step.approverIds.length} 人`).join("；")
          : "每个审批步骤都要选择审批人",
      },
    ];
  }, [courseSessions.length, selectedCohort?.leaveFlow, selectedCohort?.managers, selectedCohort?.participants.length]);
  const activeLeaveFlowSteps = leaveFlowSteps.length
    ? leaveFlowSteps
    : selectedCohort?.leaveFlow?.approvalSteps.length
      ? selectedCohort.leaveFlow.approvalSteps
      : defaultLeaveFlowSteps;
  const leaveFlowConfigurationInvalidReason = useMemo(() => {
    if (!activeLeaveFlowSteps.length) {
      return "请先增加至少一个审批步骤";
    }

    const emptyApproverStepIndex = activeLeaveFlowSteps.findIndex((step) => step.approverIds.length === 0);
    if (emptyApproverStepIndex >= 0) {
      return `${activeLeaveFlowSteps[emptyApproverStepIndex].name || "审批步骤"}至少选择一名审批人`;
    }

    const exceededStep = activeLeaveFlowSteps.find((step) => step.requiredCount > step.approverIds.length);
    if (exceededStep) {
      return `${exceededStep.name || "审批步骤"}的通过人数不能超过已选审批人数`;
    }

    return "";
  }, [activeLeaveFlowSteps]);

  const getArrivalRegistrationAttendance = (participant: Workspace.TeacherTrainingParticipantItem) =>
    getParticipantAttendanceRecord(participant, "present", "报到");
  const attendanceRegistrationParticipant =
    selectedCohort?.participants.find((participant) => participant.id === attendanceRegistrationDraft.participantId) ?? null;
  const attendanceRegistrationDisabledReason = !attendanceRegistrationDraft.roomNumber.trim()
    ? "请填写酒店房号"
    : !attendanceRegistrationDraft.materialsComplete
      ? "请选择材料是否齐全"
      : "";

  const submitCohort = async () => {
    if (!cohortDraft.id && !canCreateTeacherTrainingCohort) {
      return;
    }
    const ok = await createTeacherTrainingCohort(cohortDraft);
    if (ok) {
      setCohortDraft(createDefaultCohortDraft());
      setCohortFormOpen(false);
    }
  };

  const confirmTeacherTrainingPermanentDelete = (options: {
    title: string;
    firstMessage: string;
    secondMessage: string;
  }) => {
    if (!window.confirm(options.firstMessage)) {
      return false;
    }

    return window.confirm(`请再次确认永久删除“${options.title}”。\n\n${options.secondMessage}\n\n删除后无法恢复。`);
  };

  const editCohort = (cohort: Workspace.TeacherTrainingCohortItem) => {
    setSelectedCohortId(cohort.id);
    setCohortDraft({
      id: cohort.id,
      title: cohort.title,
      location: cohort.location,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      description: cohort.description,
    });
    setCohortFormOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById("tt-cohort-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const removeCohort = async (cohort: Workspace.TeacherTrainingCohortItem) => {
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: cohort.title,
        firstMessage: `确认删除省培班次“${cohort.title}”？\n\n该班次下有参训教师 ${cohort.stats.participantCount} 人、课程 ${cohort.stats.courseCount} 节、签到 ${cohort.stats.checkInTaskCount} 个、请假 ${cohort.stats.leaveRequestCount} 条、任务 ${cohort.stats.taskCount} 个。\n\n继续后会删除该班次及关联记录。`,
        secondMessage: "该班次、课程、签到、请假、任务汇报和相关附件都会被删除。",
      })
    ) {
      return;
    }
    const nextCohortIdAfterDelete = teacherTrainingCohorts.find((item) => item.id !== cohort.id)?.id ?? "";
    const deleted = await deleteTeacherTrainingCohort(cohort.id);
    if (!deleted) return;
    setSelectedCohortId(nextCohortIdAfterDelete);
    if (cohortDraft.id === cohort.id) {
      setCohortDraft(createDefaultCohortDraft());
    }
  };

  const removeSelectedCohorts = async () => {
    if (selectedCohortIds.length === 0) return;
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: `${selectedCohortIds.length} 个省培班次`,
        firstMessage: `确认批量删除 ${selectedCohortIds.length} 个省培班次？\n\n每个班次下的课程、签到、请假、汇报和附件都会同步删除。`,
        secondMessage: "这些班次及关联记录会从数据库中删除。",
      })
    ) {
      return;
    }
    const deleted = await deleteTeacherTrainingCohorts(selectedCohortIds);
    if (deleted) {
      setSelectedCohortIds([]);
      setSelectedCohortId(teacherTrainingCohorts.find((item) => !selectedCohortIds.includes(item.id))?.id ?? "");
    }
  };

  const openParticipantFormWorkspace = () => {
    setParticipantFormOpen(true);
    setParticipantImportOpen(false);
    window.requestAnimationFrame(() => {
      const input = document.getElementById("tt-participant-name-input");
      document.getElementById("tt-participant-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => (input as HTMLInputElement | null)?.focus(), 350);
    });
  };

  const openParticipantImportWorkspace = () => {
    setParticipantImportOpen(true);
    setParticipantFormOpen(false);
    window.requestAnimationFrame(() => {
      const textarea = document.getElementById("tt-participant-import-textarea");
      document.getElementById("tt-participant-import-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => (textarea as HTMLTextAreaElement | null)?.focus(), 350);
    });
  };

  const submitParticipant = async () => {
    if (!selectedCohort) return;
    if (
      !participantDraft.name.trim() ||
      !participantDraft.organization.trim() ||
      !participantDraft.phone.trim() ||
      !(participantDraft.title.trim() || participantDraft.professionalTitle.trim())
    ) {
      alert("请先补全参训教师档案必填项：姓名、单位、手机号，以及职务或职称。");
      return;
    }
    await addTeacherTrainingParticipant({
      ...participantDraft,
      cohortId: selectedCohort.id,
    });
  };

  const importParticipants = async () => {
    if (!selectedCohort) return;
    if (!participantImportPreview.canImport) {
      setParticipantImportStatus("导入预览中仍有缺字段、重复或已存在人员，请处理后再导入。");
      return;
    }
    if (!window.confirm(`确认导入 ${participantImportPreview.readyCount} 位参训教师？\n\n导入后将写入当前班次名单。`)) {
      return;
    }
    await importTeacherTrainingParticipants(selectedCohort.id, participantImportPreview.rows);
    setParticipantImportText("");
    setParticipantImportStatus("");
  };

  const handleParticipantImportFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.(xlsx|csv|tsv|txt)$/i.test(file.name)) {
      setParticipantImportStatus("参训教师导入支持 Excel(.xlsx)、CSV、TSV、TXT。");
      return;
    }

    setParticipantImportLoading(true);
    setParticipantImportStatus("正在识别参训教师名单，请稍候...");
    try {
      const text = await parseTeacherTrainingImportFile("participants", file);
      const participants = parseTeacherTrainingParticipantImportText(text);
      setParticipantImportText(text);
      setParticipantImportStatus(
        participants.length
          ? `已识别 ${participants.length} 位参训教师，可检查后点击一键导入参训教师。`
          : "未识别到参训教师，请确认文件包含姓名和单位。",
      );
    } catch (error) {
      setParticipantImportStatus(error instanceof Error ? error.message : "参训教师名单识别失败");
    } finally {
      setParticipantImportLoading(false);
    }
  };

  const submitManager = async () => {
    if (!selectedCohort) return;
    await assignTeacherTrainingCohortManager({
      ...managerDraft,
      cohortId: selectedCohort.id,
    });
  };

  const submitManagerAccount = async () => {
    const ok = await saveTeacherTrainingManagerAccount(managerAccountDraft);
    if (ok) {
      setManagerAccountDraft(createDefaultManagerAccountDraft());
      setSelectedManagerAccountIds([]);
    }
  };

  const editManagerAccount = (account: Workspace.TeacherTrainingManagerAccountItem) => {
    const accountIdentity =
      normalizeTeacherTrainingManagerIdentity(account.responsibility) === "省培班主任" ||
      account.managedCohorts.some((manager) => normalizeTeacherTrainingManagerIdentity(manager.title) === "省培班主任")
        ? "省培班主任"
        : "省培负责人";

    setManagerAccountDraft({
      id: account.id,
      name: account.name,
      username: account.username,
      phone: account.phone,
      email: account.email,
      password: "",
      managerIdentity: accountIdentity,
    });
    window.requestAnimationFrame(() => {
      document.getElementById("tt-manager-account-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const removeSelectedManagerAccounts = async (ids = selectedManagerAccountIds) => {
    if (ids.length === 0) return;
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: `${ids.length} 个省培管理账号`,
        firstMessage: `确认将 ${ids.length} 个账号移出省培账号池？\n\n移出后这些账号不再拥有省培负责人/省培班主任身份，也不能再被班次选择。`,
        secondMessage: "这里只解除省培管理身份并保留原账号和历史记录，不删除参训教师名单。",
      })
    ) {
      return;
    }
    const deleted = await deleteTeacherTrainingManagerAccounts(ids);
    if (deleted) {
      setSelectedManagerAccountIds([]);
      if (managerAccountDraft.id && ids.includes(managerAccountDraft.id)) {
        setManagerAccountDraft(createDefaultManagerAccountDraft());
      }
    }
  };

  const submitCourseSession = async () => {
    if (!selectedCohort) return;
    const ok = await createTeacherTrainingCourseSession({
      ...courseDraft,
      cohortId: selectedCohort.id,
    });
    if (ok) {
      setCourseDraft(createDefaultCourseSessionDraft());
    }
  };

  const editCourseSession = (course: Workspace.TeacherTrainingCourseSessionItem) => {
    setCourseDraft({
      id: course.id,
      cohortId: course.cohortId,
      title: course.title,
      courseDate: course.courseDate,
      startTime: course.startTime,
      endTime: course.endTime,
      location: course.location,
      instructor: course.instructor,
      description: course.description,
    });
  };

  const removeCourseSession = async (course: Workspace.TeacherTrainingCourseSessionItem) => {
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: course.title,
        firstMessage: `确认删除课程“${course.title}”？\n\n删除后参训教师课程表会同步移除这节课，关联签到任务会保留但不再绑定该课程。`,
        secondMessage: "这节课程安排会从当前班次中删除。",
      })
    ) {
      return;
    }
    await deleteTeacherTrainingCourseSession(course.id);
  };

  const removeSelectedCourseSessions = async () => {
    if (selectedCourseSessionIds.length === 0) return;
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: `${selectedCourseSessionIds.length} 节课程`,
        firstMessage: `确认批量删除 ${selectedCourseSessionIds.length} 节课程？\n\n删除后参训教师课程表会同步移除这些课程。`,
        secondMessage: "这些课程安排会从当前班次中删除。",
      })
    ) {
      return;
    }
    const deleted = await deleteTeacherTrainingCourseSessions(selectedCourseSessionIds);
    if (deleted) setSelectedCourseSessionIds([]);
  };

  const importCourses = async () => {
    if (!selectedCohort) return;
    if (!courseImportPreview.canImport) {
      setCourseImportStatus("导入预览中仍有缺字段、重复或已存在课程，请处理后再导入。");
      return;
    }
    if (!window.confirm(`确认导入 ${courseImportPreview.readyCount} 条课程？\n\n导入后将写入当前班次课程表。`)) {
      return;
    }
    await importTeacherTrainingCourses(selectedCohort.id, courseImportPreview.rows);
    setCourseImportText("");
    setCourseImportStatus("");
  };

  const handleCourseImportFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.(docx|pdf|xlsx|csv|tsv|txt)$/i.test(file.name)) {
      setCourseImportStatus("课程导入支持 Word(.docx)、PDF、Excel(.xlsx)、CSV、TSV、TXT。");
      return;
    }

    setCourseImportLoading(true);
    setCourseImportStatus("正在识别课程文件，请稍候...");
    try {
      const text = await parseTeacherTrainingImportFile("courses", file);
      const courses = parseCourseImportRows(text);
      setCourseImportText(text);
      setCourseImportStatus(
        courses.length ? `已识别 ${courses.length} 条课程，可检查后点击一键导入课程。` : "未识别到课程，请确认文件包含课程名称和日期。",
      );
    } catch (error) {
      setCourseImportStatus(error instanceof Error ? error.message : "课程文件识别失败");
    } finally {
      setCourseImportLoading(false);
    }
  };

  const downloadTeacherTrainingExport = async (type: TeacherTrainingExportType, label: string) => {
    if (!exportBaseUrl || !selectedCohort) return;

    setExportingTeacherTrainingType(type);
    setExportStatus(`${label}正在生成，请稍候...`);

    const exportController = new AbortController();
    const exportTimeoutId = window.setTimeout(() => exportController.abort(), TEACHER_TRAINING_EXPORT_TIMEOUT_MS);

    try {
      const response = await fetch(`${exportBaseUrl}&type=${type}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: exportController.signal,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || "导出失败，请稍后重试");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const fileName = getFileNameFromContentDisposition(contentDisposition, `${selectedCohort.title}-${label}.csv`);
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setExportStatus(`${label}已开始下载。`);
      setRecentExportRecords((current) => [
        {
          id: `${type}-${Date.now()}`,
          label,
          fileName,
          exportedAt: formatClientDateTime(new Date()),
        },
        ...current,
      ].slice(0, 5));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setExportStatus("导出生成超时，请稍后重试");
        return;
      }
      setExportStatus(error instanceof Error ? error.message : "导出失败，请稍后重试");
    } finally {
      window.clearTimeout(exportTimeoutId);
      setExportingTeacherTrainingType("");
    }
  };

  const downloadTeacherTrainingFile = async ({
    url,
    label,
    fallbackName,
  }: {
    url: string;
    label: string;
    fallbackName: string;
  }) => {
    setDownloadingTeacherTrainingFile(url);
    setTeacherTrainingDownloadStatus(`${label}正在准备下载，请稍候...`);

    const downloadController = new AbortController();
    const downloadTimeoutId = window.setTimeout(() => downloadController.abort(), TEACHER_TRAINING_DOWNLOAD_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        signal: downloadController.signal,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || "文件下载失败，请稍后重试");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const fileName = getFileNameFromContentDisposition(contentDisposition, fallbackName);
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setTeacherTrainingDownloadStatus(`${label}已开始下载。`);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setTeacherTrainingDownloadStatus(`${label}下载超时，请稍后重试`);
        return;
      }
      setTeacherTrainingDownloadStatus(error instanceof Error ? error.message : "文件下载失败，请稍后重试");
    } finally {
      window.clearTimeout(downloadTimeoutId);
      setDownloadingTeacherTrainingFile("");
    }
  };

  const submitTask = async () => {
    if (!selectedCohort) return;
    const ok = await createTeacherTrainingTask({
      ...taskDraft,
      cohortId: selectedCohort.id,
    });
    if (ok) {
      setTaskDraft(createDefaultTaskDraft());
    }
  };

  const editTask = (task: Workspace.TeacherTrainingTaskItem) => {
    setTaskDraft({
      id: task.id,
      cohortId: task.cohortId,
      courseSessionId: task.courseSessionId ?? "",
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ?? "",
      taskType: task.taskType,
      releaseMode: task.releaseMode,
      releaseAt: task.releaseAt,
      requireAttachment: true,
      enableAiReview: task.enableAiReview,
      scoringRubric: task.scoringRubric,
    });
  };

  const removeTask = async (task: Workspace.TeacherTrainingTaskItem) => {
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: task.title,
        firstMessage: `确认删除省培任务“${task.title}”？\n\n删除后参训教师不再看到该任务，已提交汇报和附件也会一起删除。`,
        secondMessage: "该任务、所有已提交汇报和相关附件都会被删除。",
      })
    ) {
      return;
    }
    await deleteTeacherTrainingTask(task.id);
  };

  const removeSelectedTasks = async () => {
    if (selectedTeacherTrainingTaskIds.length === 0) return;
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: `${selectedTeacherTrainingTaskIds.length} 个汇报任务`,
        firstMessage: `确认批量删除 ${selectedTeacherTrainingTaskIds.length} 个汇报任务？\n\n任务、已提交汇报和相关附件都会同步删除。`,
        secondMessage: "这些任务及已提交内容会从当前班次中删除。",
      })
    ) {
      return;
    }
    const deleted = await deleteTeacherTrainingTasks(selectedTeacherTrainingTaskIds);
    if (deleted) setSelectedTeacherTrainingTaskIds([]);
  };

  const buildSubmissionDraftForSelection = (taskId: string, participantId: string) => {
    const task = selectedCohort?.tasks.find((item) => item.id === taskId) ?? null;
    const existingSubmission = task?.submissions.find((item) => item.participantId === participantId) ?? null;

    return {
      taskId,
      participantId,
      content: existingSubmission?.content ?? "",
      attachment: existingSubmission?.attachment ?? "",
    };
  };

  const resetSubmissionAttachmentState = () => {
    setSubmissionAttachmentFile(null);
    setSubmissionAttachmentPreviewUrl("");
    setSubmissionAttachmentProgress(null);
    setSubmissionAttachmentError("");
    setSubmissionSaveStatus("");
    setIsSubmissionAttachmentUploading(false);
  };

  const updateSubmissionSelection = (next: { taskId?: string; participantId?: string }) => {
    const taskId = next.taskId ?? selectedTask?.id ?? submissionDraft.taskId;
    const participantId = next.participantId ?? selectedParticipant?.id ?? submissionDraft.participantId;
    setSubmissionDraft(buildSubmissionDraftForSelection(taskId, participantId));
    resetSubmissionAttachmentState();
  };

  const handleSubmissionAttachmentFile = (file: File | null) => {
    setSubmissionAttachmentProgress(null);
    if (!file) {
      setSubmissionAttachmentFile(null);
      setSubmissionAttachmentPreviewUrl("");
      setSubmissionAttachmentError("");
      return;
    }

    const validationError = Workspace.validateTeacherTrainingSubmissionAttachmentMeta({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
    });
    if (validationError) {
      setSubmissionAttachmentFile(null);
      setSubmissionAttachmentPreviewUrl("");
      setSubmissionAttachmentError(validationError);
      return;
    }

    setSubmissionAttachmentFile(file);
    setSubmissionAttachmentPreviewUrl(URL.createObjectURL(file));
    setSubmissionAttachmentError("");
    setSubmissionDraft((current) => ({ ...current, attachment: "" }));
  };

  const uploadSubmissionAttachmentIfNeeded = async (taskId: string, participantId: string) => {
    if (!submissionAttachmentFile) {
      return submissionDraft.attachment.trim();
    }

    const validationError = Workspace.validateTeacherTrainingSubmissionAttachmentMeta({
      fileName: submissionAttachmentFile.name,
      fileSize: submissionAttachmentFile.size,
      mimeType: submissionAttachmentFile.type || "application/octet-stream",
    });
    if (validationError) {
      throw new Error(validationError);
    }

    setIsSubmissionAttachmentUploading(true);
    setSubmissionAttachmentProgress(0);
    setSubmissionAttachmentError("");
    try {
      const uploadUrlController = new AbortController();
      const uploadUrlTimeoutId = window.setTimeout(
        () => uploadUrlController.abort(),
        TEACHER_TRAINING_UPLOAD_URL_TIMEOUT_MS,
      );
      let response: Response;
      try {
        response = await fetch("/api/teacher-training/submissions/upload-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: uploadUrlController.signal,
          body: JSON.stringify({
            taskId,
            participantId,
            fileName: submissionAttachmentFile.name,
            fileSize: submissionAttachmentFile.size,
            mimeType: submissionAttachmentFile.type || "application/octet-stream",
          }),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("附件上传准备超时，请稍后重试");
        }
        throw new Error("附件上传准备失败，请检查网络后重试");
      } finally {
        window.clearTimeout(uploadUrlTimeoutId);
      }
      const payload = (await response.json().catch(() => null)) as
        | {
            uploadUrl?: string;
            contentType?: string;
            attachment?: string;
            message?: string;
          }
        | null;
      if (!response.ok || !payload?.uploadUrl || !payload.attachment) {
        throw new Error(payload?.message || "任务汇报附件上传失败");
      }

      await Workspace.uploadFileDirectly({
        url: payload.uploadUrl,
        file: submissionAttachmentFile,
        contentType: payload.contentType || submissionAttachmentFile.type || "application/octet-stream",
        onProgress: setSubmissionAttachmentProgress,
      });
      setSubmissionAttachmentProgress(100);
      return payload.attachment;
    } finally {
      setIsSubmissionAttachmentUploading(false);
    }
  };

  const submitSubmission = async () => {
    const taskId = selectedTask?.id ?? submissionDraft.taskId;
    const participantId = selectedParticipant?.id ?? submissionDraft.participantId;

    try {
      if (submissionDisabledReason) {
        setSubmissionAttachmentError(submissionDisabledReason);
        return;
      }
      if (isReplacingSavedSubmissionAttachment && !window.confirm("确认保存并替换原附件？\n\n保存后将替换原附件，原附件会从系统文件库删除。")) {
        return;
      }
      if (isRemovingSavedSubmissionAttachment && !window.confirm("确认保存并删除原附件？\n\n保存后原附件会从系统文件库删除。")) {
        return;
      }
      const willUploadAttachment = Boolean(submissionAttachmentFile);
      const willReplaceAttachment = isReplacingSavedSubmissionAttachment;
      const willRemoveAttachment = isRemovingSavedSubmissionAttachment;
      setSubmissionSaveStatus(willUploadAttachment ? "正在上传附件..." : "正在保存汇报...");
      const attachment = await uploadSubmissionAttachmentIfNeeded(taskId, participantId);
      const saved = await saveTeacherTrainingSubmission({
        ...submissionDraft,
        taskId,
        participantId,
        attachment,
      });
      if (saved) {
        setSubmissionDraft((current) => ({ ...current, taskId, participantId, attachment }));
        setSubmissionAttachmentFile(null);
        setSubmissionAttachmentPreviewUrl("");
        setSubmissionAttachmentProgress(null);
        setSubmissionAttachmentError("");
        setSubmissionSaveStatus(
          willReplaceAttachment
            ? "汇报已保存，原附件已替换。"
            : willRemoveAttachment
              ? "汇报已保存，原附件已删除。"
              : willUploadAttachment
                ? "汇报已保存，附件已入库。"
                : "汇报已保存。",
        );
      }
    } catch (error) {
      setSubmissionAttachmentError(error instanceof Error ? error.message : "任务汇报附件上传失败");
      setSubmissionSaveStatus("");
    }
  };

  const getSubmissionReviewDraft = (submission: Workspace.TeacherTrainingSubmissionItem) =>
    submissionReviewDrafts[submission.id] ?? {
      finalScore: submission.finalScore === null ? "" : String(submission.finalScore),
      finalComment: submission.finalComment,
    };

  const updateSubmissionReviewDraft = (
    submission: Workspace.TeacherTrainingSubmissionItem,
    patch: Partial<{ finalScore: string; finalComment: string }>,
  ) => {
    setSubmissionReviewDrafts((current) => ({
      ...current,
      [submission.id]: {
        ...getSubmissionReviewDraft(submission),
        ...patch,
      },
    }));
  };

  const submitSubmissionReview = async (submission: Workspace.TeacherTrainingSubmissionItem) => {
    const draft = getSubmissionReviewDraft(submission);
    if (!draft.finalScore.trim() && !draft.finalComment.trim()) {
      if (!window.confirm(`确认清空“${submission.participantName}”的人工评分？`)) {
        return;
      }
    }

    await reviewTeacherTrainingSubmission({
      submissionId: submission.id,
      finalScore: draft.finalScore,
      finalComment: draft.finalComment,
    });
  };

  const updateProfileDraftField = <K extends keyof Workspace.TeacherTrainingProfileDraft>(
    key: K,
    value: Workspace.TeacherTrainingProfileDraft[K],
  ) => {
    setProfileDraft({
      ...effectiveProfileDraft,
      [key]: value,
    });
  };

  const submitProfile = async () => {
    const saved = await updateTeacherTrainingProfile(effectiveProfileDraft);
    if (saved?.ok) {
      const emailStatusText =
        saved.emailStatus === "sent"
          ? "邮件提醒已发送。"
          : saved.emailStatus === "failed"
            ? "资料已保存，邮件提醒发送失败，管理员可在日志中查看。"
            : saved.emailStatus === "not_configured"
              ? "资料已保存，当前未配置邮件发送。"
              : "资料已保存。";
        setProfileSaveStatus(emailStatusText);
        setProfileDraft((current) => ({
          ...current,
          password: "",
          passwordConfirm: "",
        }));
      }
    if (saved?.ok && !canManage) {
      setActiveTeacherTrainingSection("overview");
    }
  };

  const openAttendanceRegistration = (participant: Workspace.TeacherTrainingParticipantItem) => {
    const attendance = getArrivalRegistrationAttendance(participant);
    setAttendanceRegistrationDraft({
      participantId: participant.id,
      roomNumber: attendance?.roomNumber ?? "",
      materialsComplete: attendance?.materialsComplete === null ? "" : attendance?.materialsComplete ? "yes" : "no",
      note: attendance?.registrationNote ?? "",
    });
  };

  const closeAttendanceRegistration = () => {
    setAttendanceRegistrationDraft({
      participantId: "",
      roomNumber: "",
      materialsComplete: "",
      note: "",
    });
  };

  const submitAttendanceRegistration = async () => {
    if (!selectedCohort || !attendanceRegistrationParticipant || attendanceRegistrationDisabledReason) return;

    await markTeacherTrainingAttendance({
      cohortId: selectedCohort.id,
      participantId: attendanceRegistrationParticipant.id,
      sessionDate: selectedCohort.startDate || getDateInputValue(new Date()),
      sessionLabel: "报到",
      status: "present",
      roomNumber: attendanceRegistrationDraft.roomNumber,
      materialsComplete: attendanceRegistrationDraft.materialsComplete === "yes",
      note: attendanceRegistrationDraft.note,
    });
    closeAttendanceRegistration();
  };

  const submitCheckInTask = async () => {
    if (!selectedCohort) return;
    const ok = await createTeacherTrainingCheckInTask({
      ...checkInDraft,
      cohortId: selectedCohort.id,
    });
    if (ok) {
      setCheckInDraft(createDefaultCheckInTaskDraft());
    }
  };

  const openManualCheckIn = (
    task: Workspace.TeacherTrainingCheckInTaskItem,
    participant: Workspace.TeacherTrainingParticipantItem,
  ) => {
    setManualCheckInDraft({
      checkInTaskId: task.id,
      participantId: participant.id,
      note: "定位失败，现场人工确认",
    });
  };

  const submitManualCheckIn = async () => {
    if (!manualCheckInDraft.checkInTaskId || !manualCheckInDraft.participantId || !manualCheckInDraft.note.trim()) {
      return;
    }

    await manualSignTeacherTrainingCheckIn(manualCheckInDraft);
    setManualCheckInDraft({
      checkInTaskId: "",
      participantId: "",
      note: "定位失败，现场人工确认",
    });
  };

  const editCheckInTask = (task: Workspace.TeacherTrainingCheckInTaskItem) => {
    setCheckInDraft({
      id: task.id,
      cohortId: task.cohortId,
      courseSessionId: task.courseSessionId ?? "",
      title: task.title,
      signDate: task.signDate,
      startTime: task.startTime,
      endTime: task.endTime,
      locationName: task.locationName,
      latitude: task.latitude === null ? "" : String(task.latitude),
      longitude: task.longitude === null ? "" : String(task.longitude),
      radiusMeters: String(task.radiusMeters),
    });
  };

  const removeCheckInTask = async (task: Workspace.TeacherTrainingCheckInTaskItem) => {
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: task.title,
        firstMessage: `确认删除签到任务“${task.title}”？\n\n删除后教师端不再显示该签到，已签到记录也会一起删除。`,
        secondMessage: "该签到任务和已签到记录都会被删除。",
      })
    ) {
      return;
    }
    await deleteTeacherTrainingCheckInTask(task.id);
  };

  const removeSelectedCheckInTasks = async () => {
    if (selectedCheckInTaskIds.length === 0) return;
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: `${selectedCheckInTaskIds.length} 个签到任务`,
        firstMessage: `确认批量删除 ${selectedCheckInTaskIds.length} 个签到任务？\n\n删除后参训教师手机端将不再看到这些签到，已有签到记录也会同步删除。`,
        secondMessage: "这些签到任务及关联记录会从当前班次中删除。",
      })
    ) {
      return;
    }
    const deleted = await deleteTeacherTrainingCheckInTasks(selectedCheckInTaskIds);
    if (deleted) setSelectedCheckInTaskIds([]);
  };

  const useCurrentLocationForCheckInTask = () => {
    if (!navigator.geolocation) {
      setLocationMessage("当前浏览器不支持读取发布位置；可先不填经纬度发布，教师签到时仍需授权定位。");
      return;
    }

    setLocationMessage("正在读取当前位置...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCheckInDraft((current) => ({
          ...current,
          latitude: String(position.coords.latitude.toFixed(6)),
          longitude: String(position.coords.longitude.toFixed(6)),
        }));
        setLocationMessage("已填入当前位置，可直接发布签到任务。");
      },
      (error) =>
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? "定位权限被拒绝；可先不填经纬度发布，教师签到时仍需授权定位。"
            : "定位失败；可先不填经纬度发布，教师签到时仍需授权定位。",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const signWithCurrentLocation = (checkInTaskId: string) => {
    if (!selectedParticipant) return;
    if (!navigator.geolocation) {
      setLocationMessage("当前浏览器不支持定位签到，请更换浏览器或联系管理端人工补签。");
      return;
    }

    setCheckInSigningId(checkInTaskId);
    setLocationMessage("正在读取定位...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void signTeacherTrainingCheckIn({
          checkInTaskId,
          participantId: selectedParticipant.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        }).finally(() => {
          setCheckInSigningId("");
          setLocationMessage("");
        });
      },
      (error) => {
        setCheckInSigningId("");
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? "定位权限被拒绝，请在浏览器地址栏允许本网站使用位置后重试；仍失败时联系管理端人工补签。"
            : "定位失败，请检查网络和设备定位后重试；仍失败时联系管理端人工补签。",
        );
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const copyAccountMessage = async (participantId: string) => {
    const messageText = await generateTeacherTrainingAccountMessage({ participantId });
    if (!messageText) return;

    setAccountMessagesByParticipantId((current) => ({ ...current, [participantId]: messageText }));
    await navigator.clipboard?.writeText(messageText).catch(() => undefined);
  };

  const editParticipantAccount = (participant: Workspace.TeacherTrainingParticipantItem) => {
    setAccountEditParticipantId(participant.id);
    setAccountEditDraft({
      accountUsername: participant.accountUsername,
      accountPassword: "",
    });
  };

  const submitParticipantAccountEdit = async () => {
    if (!accountEditParticipantId) return;
    const participant = selectedCohort?.participants.find((item) => item.id === accountEditParticipantId);
    if (
      !window.confirm(
        `确认保存${participant?.name ?? "该教师"}的省培账号设置？\n\n重置密码后，请把新账号信息重新发给教师；未填写新密码时，只修改登录账号。`,
      )
    ) {
      return;
    }
    const messageText = await updateTeacherTrainingParticipantAccount({
      participantId: accountEditParticipantId,
      accountUsername: accountEditDraft.accountUsername,
      accountPassword: accountEditDraft.accountPassword,
    });
    if (messageText) {
      setAccountMessagesByParticipantId((current) => ({ ...current, [accountEditParticipantId]: messageText }));
      await navigator.clipboard?.writeText(messageText).catch(() => undefined);
    }
    setAccountEditParticipantId("");
    setAccountEditDraft({ accountUsername: "", accountPassword: "" });
  };

  const removeParticipantAccount = async (participant: Workspace.TeacherTrainingParticipantItem) => {
    if (!participant.accountUserId || !participant.accountUsername) return;
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: participant.accountUsername,
        firstMessage: `确认${getParticipantAccountRemoveLabel(participant)}“${participant.accountUsername}”？\n\n处理后，该教师将不能再通过此参训档案进入省培系统；参训教师档案、报到、请假和汇报记录会保留。`,
        secondMessage: participant.accountRole === "training_teacher"
          ? "删除省培专用账号：会删除该省培登录账号本体，不删除参训教师档案。"
          : "解除省培绑定：共用账号只解绑省培身份，不删除创赛系统账号。",
      })
    ) {
      return;
    }
    await deleteTeacherTrainingParticipantAccount(participant.id);
    if (accountEditParticipantId === participant.id) {
      setAccountEditParticipantId("");
      setAccountEditDraft({ accountUsername: "", accountPassword: "" });
    }
  };

  const removeParticipant = async (participant: Workspace.TeacherTrainingParticipantItem) => {
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: participant.name,
        firstMessage: `确认删除参训教师“${participant.name}”？\n\n删除后，这名教师的名单档案、报到状态、签到记录、请假申请和任务汇报会一起删除。`,
        secondMessage: "该操作会从当前省培班次名单中移除这名教师；如果绑定的是创赛原平台账号，只解除省培绑定；如果是省培专用账号，系统会同步删除该账号。",
      })
    ) {
      return;
    }

    await deleteTeacherTrainingParticipant(participant.id);
    setAccountMessagesByParticipantId((current) => {
      const next = { ...current };
      delete next[participant.id];
      return next;
    });
    if (accountEditParticipantId === participant.id) {
      setAccountEditParticipantId("");
      setAccountEditDraft({ accountUsername: "", accountPassword: "" });
    }
  };

  const removeSelectedParticipants = async () => {
    if (selectedParticipantIds.length === 0) return;
    if (
      !confirmTeacherTrainingPermanentDelete({
        title: `${selectedParticipantIds.length} 位参训教师`,
        firstMessage: `确认批量删除 ${selectedParticipantIds.length} 位参训教师？\n\n删除后这些教师的报到、签到、请假和汇报记录会同步删除。`,
        secondMessage: "这是删除参训教师档案，不是单纯解绑账号。",
      })
    ) {
      return;
    }
    const deleted = await deleteTeacherTrainingParticipants(selectedParticipantIds);
    if (deleted) setSelectedParticipantIds([]);
  };

  const getPhoneAccountUsername = (participant: Workspace.TeacherTrainingParticipantItem) => {
    const digits = participant.phone.replace(/\D/g, "");
    if (!/^1[3-9]\d{9}$/.test(digits)) return "";
    return digits;
  };

  const batchGeneratePhoneAccounts = async () => {
    if (!selectedCohort) return;

    const targets = selectedCohort.participants.filter(
      (participant) => !participant.accountUserId && getPhoneAccountUsername(participant),
    );
    if (targets.length === 0) {
      setAccountMessagesByParticipantId({});
      return;
    }

    const messages: Record<string, string> = {};
    for (const participant of targets) {
      const messageText = await generateTeacherTrainingAccountMessage({
        participantId: participant.id,
        accountUsername: getPhoneAccountUsername(participant),
        accountPassword: teacherTrainingDefaultInitialPassword,
      });
      if (messageText) {
        messages[participant.id] = messageText;
      }
    }

    setAccountMessagesByParticipantId((current) => ({ ...current, ...messages }));
    await navigator.clipboard?.writeText(Object.values(messages).join("\n\n---\n\n")).catch(() => undefined);
  };

  const updateLeaveFlowStep = (index: number, patch: Partial<Workspace.TeacherTrainingLeaveFlowStep>) => {
    setLeaveFlowSteps((current) =>
      (current.length ? current : activeLeaveFlowSteps).map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    );
  };

  const toggleLeaveApprover = (stepIndex: number, approverId: string) => {
    setLeaveFlowSteps((current) =>
      (current.length ? current : activeLeaveFlowSteps).map((step, index) => {
        if (index !== stepIndex) return step;
        const approverIds = step.approverIds.includes(approverId)
          ? step.approverIds.filter((id) => id !== approverId)
          : [...step.approverIds, approverId];
        return {
          ...step,
          approverIds,
          requiredCount: Math.min(Math.max(1, step.requiredCount), Math.max(1, approverIds.length)),
        };
      }),
    );
  };

  const saveLeaveFlow = async () => {
    if (!selectedCohort) return;
    const savedLeaveFlow = normalizeLeaveFlowStepsForConfirm(selectedCohort.leaveFlow?.approvalSteps ?? []);
    const nextLeaveFlow = normalizeLeaveFlowStepsForConfirm(activeLeaveFlowSteps);
    if (
      JSON.stringify(savedLeaveFlow) !== JSON.stringify(nextLeaveFlow) &&
      !window.confirm("确认保存请假审批流程？\n\n保存后，新提交的请假按新流程审批；已提交请假保留原流程记录。")
    ) {
      return;
    }
    await updateTeacherTrainingLeaveFlow({
      cohortId: selectedCohort.id,
      approvalSteps: activeLeaveFlowSteps,
    });
  };

  const submitLeaveRequest = async () => {
    const ok = await submitTeacherTrainingLeaveRequest({
      ...leaveDraft,
      participantId: selectedParticipant?.id ?? leaveDraft.participantId,
    });
    if (ok) {
      setTeacherLeaveFormOpen(false);
      setLeaveDraft((current) => ({
        ...current,
        startDate: getDateInputValue(new Date()),
        endDate: getDateInputValue(new Date()),
        startTime: "",
        endTime: "",
        sessionLabel: "请假",
        reason: "",
      }));
      window.requestAnimationFrame(() => {
        document.getElementById("tt-teacher-leave-records")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const reviewLeaveRequest = async (leaveRequestId: string, decision: "approve" | "reject") => {
    const targetRequest = selectedCohort?.leaveRequests.find((request) => request.id === leaveRequestId);
    if (activeLeaveReviewAction?.leaveRequestId !== leaveRequestId || activeLeaveReviewAction.decision !== decision) {
      setActiveLeaveReviewAction({ leaveRequestId, decision });
      return;
    }

    if (!window.confirm(`确认${decision === "approve" ? "通过" : "驳回"}${targetRequest?.participantName ?? "该教师"}的请假申请？`)) {
      return;
    }

    await reviewTeacherTrainingLeaveRequest({
      leaveRequestId,
      decision,
      comment: leaveReviewCommentsById[leaveRequestId] ?? "",
    });
    setLeaveReviewCommentsById((current) => {
      const nextComments = { ...current };
      delete nextComments[leaveRequestId];
      return nextComments;
    });
    setActiveLeaveReviewAction(null);
  };

  const openTeacherTrainingSection = (
    key: Workspace.TeacherTrainingSectionKey,
    options: { keepDetailViewTitle?: boolean } = {},
  ) => {
    if (teacherInitialProfileRequired && key !== "profile") {
      setActiveTeacherTrainingSection("profile");
      setLoadError("请先在“个人信息”里完善资料并保存，之后即可使用其他模块。");
      return;
    }

    if (!options.keepDetailViewTitle) {
      setTeacherTrainingDetailViewTitle("");
    }
    setActiveTeacherTrainingSection(key);

    window.requestAnimationFrame(() => {
      document.getElementById("teacher-training-content")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };
  const openOverviewMetric = ({
    attendanceFilter,
    detailViewTitle,
    participantSearchValue = "",
    section,
    submissionFilter = "all",
  }: {
    attendanceFilter?: AttendanceOverviewFilter;
    detailViewTitle?: string;
    participantSearchValue?: string;
    section: Workspace.TeacherTrainingSectionKey;
    submissionFilter?: SubmissionOverviewFilter;
  }) => {
    setTeacherTrainingDetailViewTitle(detailViewTitle ?? "");
    if (section === "attendance") {
      setAttendanceOverviewFilter(attendanceFilter ?? "all");
      setAttendanceSearch("");
    }
    if (section === "participants") {
      setParticipantSearch(participantSearchValue);
    }
    if (section === "tasks") {
      setSubmissionOverviewFilter(submissionFilter);
      setSubmissionSearch("");
    }

    openTeacherTrainingSection(section, { keepDetailViewTitle: true });
  };

  const managerOverviewStats: Array<{
    label: string;
    value: number;
    helper: string;
    Icon: typeof Users;
    onClick: () => void;
    title: string;
  }> = [
    {
      label: "参训教师",
      value: selectedCohort?.stats.participantCount ?? 0,
      helper: "名单",
      Icon: Users,
      onClick: () => openOverviewMetric({ detailViewTitle: "全部参训教师", section: "participants" }),
      title: "查看参训教师名单",
    },
    {
      label: "省培管理",
      value: selectedCohort?.stats.managerCount ?? 0,
      helper: "管理",
      Icon: User,
      onClick: () => openOverviewMetric({ detailViewTitle: "省培负责人/省培班主任", section: "cohorts" }),
      title: "查看省培负责人/省培班主任设置",
    },
    {
      label: "课程",
      value: selectedCohort?.stats.courseCount ?? 0,
      helper: "安排",
      Icon: CalendarDays,
      onClick: () => openOverviewMetric({ detailViewTitle: "课程安排", section: "courses" }),
      title: "查看课程安排",
    },
    {
      label: "已报到",
      value: selectedCohort?.stats.presentCount ?? 0,
      helper: "报到",
      Icon: CheckCircle2,
      onClick: () => openOverviewMetric({ attendanceFilter: "registered", detailViewTitle: "已报到教师", section: "attendance" }),
      title: "查看已报到教师",
    },
    {
      label: "请假",
      value: selectedCohort?.stats.leaveCount ?? 0,
      helper: "审批",
      Icon: CalendarDays,
      onClick: () => openOverviewMetric({ attendanceFilter: "leave", detailViewTitle: "请假教师", section: "attendance" }),
      title: "查看请假教师",
    },
    {
      label: "缺勤",
      value: selectedCohort?.stats.absentCount ?? 0,
      helper: "考勤",
      Icon: FileCheck,
      onClick: () => openOverviewMetric({ attendanceFilter: "absent", detailViewTitle: "缺勤教师", section: "attendance" }),
      title: "查看缺勤教师",
    },
    {
      label: "课程签到",
      value: selectedCohort?.stats.checkInRecordCount ?? 0,
      helper: "记录",
      Icon: MapPin,
      onClick: () => openOverviewMetric({ detailViewTitle: "课程签到记录", section: "checkins" }),
      title: "查看课程签到记录",
    },
    {
      label: "任务",
      value: selectedCohort?.stats.taskCount ?? 0,
      helper: "发布",
      Icon: FileText,
      onClick: () => openOverviewMetric({ detailViewTitle: "全部任务", section: "tasks", submissionFilter: "all" }),
      title: "查看任务列表",
    },
    {
      label: "汇报",
      value: selectedCohort?.stats.submissionCount ?? 0,
      helper: "提交",
      Icon: Send,
      onClick: () => openOverviewMetric({ detailViewTitle: "已提交汇报", section: "tasks", submissionFilter: "submitted" }),
      title: "查看已提交汇报",
    },
  ];
  const managerPendingAttendanceCount = selectedCohort
    ? Math.max(0, selectedCohort.stats.participantCount - selectedCohort.stats.presentCount)
    : 0;
  const managerMissingCheckInRecordCount = selectedCohort
    ? Math.max(0, selectedCohort.stats.participantCount * selectedCohort.stats.checkInTaskCount - selectedCohort.stats.checkInRecordCount)
    : 0;
  const managerMissingSubmissionCount = selectedCohort
    ? Math.max(0, selectedCohort.stats.participantCount * selectedCohort.stats.taskCount - selectedCohort.stats.submissionCount)
    : 0;
  const managerCommandTodoCards: Array<{
    label: string;
    value: number;
    helper: string;
    Icon: typeof Users;
    onClick: () => void;
    tone: "amber" | "blue" | "rose" | "emerald";
  }> = [
    {
      label: "待审批请假",
      value: pendingLeaveRequests.length,
      helper: pendingLeaveRequests.length > 0 ? "进入请假审批处理" : "暂无待审批申请",
      Icon: FileCheck,
      onClick: () => openTeacherTrainingSection("leave"),
      tone: pendingLeaveRequests.length > 0 ? "amber" : "emerald",
    },
    {
      label: "待报到教师",
      value: managerPendingAttendanceCount,
      helper: managerPendingAttendanceCount > 0 ? "核对房号和材料情况" : "报到登记已完成",
      Icon: CheckCircle2,
      onClick: () => openOverviewMetric({ attendanceFilter: "pending", detailViewTitle: "待报到教师", section: "attendance" }),
      tone: managerPendingAttendanceCount > 0 ? "blue" : "emerald",
    },
    {
      label: "未完成签到",
      value: managerMissingCheckInRecordCount,
      helper: managerMissingCheckInRecordCount > 0 ? "查看课程签到明细" : "签到记录完整",
      Icon: MapPin,
      onClick: () => openOverviewMetric({ detailViewTitle: "课程签到记录", section: "checkins" }),
      tone: managerMissingCheckInRecordCount > 0 ? "amber" : "emerald",
    },
    {
      label: "未提交任务",
      value: managerMissingSubmissionCount,
      helper: managerMissingSubmissionCount > 0 ? "查看任务汇报进度" : "任务汇报已完成",
      Icon: Send,
      onClick: () => openOverviewMetric({ detailViewTitle: "任务汇报", section: "tasks", submissionFilter: "all" }),
      tone: managerMissingSubmissionCount > 0 ? "rose" : "emerald",
    },
  ];
  const managerCommandQuickLinks: Array<{
    label: string;
    helper: string;
    Icon: typeof Users;
    onClick: () => void;
  }> = [
    { label: "参训教师", helper: "名单、账号和资料", Icon: Users, onClick: () => openTeacherTrainingSection("participants") },
    { label: "课程安排", helper: "课程表和签到任务", Icon: CalendarDays, onClick: () => openTeacherTrainingSection("courses") },
    { label: "请假审批", helper: "待审申请和流程", Icon: FileCheck, onClick: () => openTeacherTrainingSection("leave") },
    { label: "任务汇报", helper: "作业发布与评分", Icon: Send, onClick: () => openTeacherTrainingSection("tasks") },
  ];
  const managerPendingActionCount = managerCommandTodoCards.reduce((total, item) => total + item.value, 0);
  const teacherTrainingSectionCounts: Partial<Record<Workspace.TeacherTrainingSectionKey, number>> = {
    cohorts: selectedCohort?.stats.managerCount ?? 0,
    participants: selectedCohort?.stats.participantCount ?? 0,
    accounts: participantAccountStatusSummary[0]?.value ?? 0,
    courses: selectedCohort?.stats.courseCount ?? 0,
    checkins: selectedCohort?.stats.checkInRecordCount ?? 0,
    attendance: selectedCohort?.stats.presentCount ?? 0,
    tasks: selectedCohort?.stats.submissionCount ?? 0,
    leave: selectedCohort?.stats.leaveCount ?? 0,
  };
  const teacherTrainingSections = Workspace.teacherTrainingSectionTabs.map((section) => ({
    ...section,
    Icon: section.icon,
    count: teacherTrainingSectionCounts[section.key],
  }));
  const visibleTeacherTrainingSections = teacherTrainingSections.filter((section) => {
    if (teacherInitialProfileRequired) return section.key === "profile";
    if (canManage) {
      return Workspace.teacherTrainingManagerSectionKeys.has(section.key) && (!section.globalOnly || canManageGlobal);
    }

    return Workspace.teacherTrainingParticipantSectionKeys.has(section.key);
  });
  const effectiveTeacherTrainingSection = teacherInitialProfileRequired
    ? "profile"
    : visibleTeacherTrainingSections.some((section) => section.key === activeTeacherTrainingSection)
    ? activeTeacherTrainingSection
    : "overview";
  const activeTeacherTrainingSectionMeta =
    visibleTeacherTrainingSections.find((section) => section.key === effectiveTeacherTrainingSection) ??
    visibleTeacherTrainingSections[0];
  const baseTeacherTrainingActionHint =
    teacherTrainingActionHints[effectiveTeacherTrainingSection] ?? teacherTrainingActionHints.overview;
  const teacherTaskActionHint = {
    title: "任务汇报提示",
    steps: ["选择任务", "确认我的汇报身份", "填写后保存汇报"],
  };
  const activeTeacherTrainingActionHint =
    !canManage && effectiveTeacherTrainingSection === "tasks" ? teacherTaskActionHint : baseTeacherTrainingActionHint;
  const teacherMobileNavigationSections = visibleTeacherTrainingSections.filter((section) =>
    teacherMobileNavigationKeys.includes(section.key),
  );
  const teacherTaskQuickActionHelper =
    selectedCohort?.tasks.length
      ? teacherPendingTaskCount > 0
        ? `待提交 ${teacherPendingTaskCount} 项`
        : "已完成全部汇报"
      : "暂无汇报任务";
  const teacherCheckInQuickActionHelper =
    selectedCohort?.checkInTasks.length
      ? teacherPendingCheckInCount > 0
        ? `待签到 ${teacherPendingCheckInCount} 项`
        : "已完成全部签到"
      : "暂无签到任务";
  const selectedParticipantAttendanceLabel = selectedParticipant
    ? getParticipantAttendanceRecord(selectedParticipant, "present", "报到")?.statusLabel ??
      Workspace.teacherTrainingAttendancePendingLabel
    : "待确认";
  const teacherPortalServiceLinks: Array<{
    label: string;
    helper: string;
    Icon: typeof Users;
    onClick: () => void;
    count?: string;
  }> = [
    { label: "课程安排", helper: "查看日程", Icon: CalendarDays, onClick: () => openTeacherTrainingSection("courses") },
    {
      label: "课程签到",
      helper: teacherCheckInQuickActionHelper,
      Icon: MapPin,
      onClick: () => openTeacherTrainingSection("checkins"),
      count: teacherPendingCheckInCount > 0 ? `${teacherPendingCheckInCount}` : undefined,
    },
    {
      label: "任务汇报",
      helper: teacherTaskQuickActionHelper,
      Icon: Send,
      onClick: () => openTeacherTrainingSection("tasks"),
      count: teacherPendingTaskCount > 0 ? `${teacherPendingTaskCount}` : undefined,
    },
    { label: "请假申请", helper: "提交申请", Icon: FileCheck, onClick: () => openTeacherTrainingSection("leave") },
    { label: "报到信息", helper: selectedParticipantAttendanceLabel, Icon: CheckCircle2, onClick: () => openTeacherTrainingSection("profile") },
    { label: "个人信息", helper: teacherProfileNeedsAttention ? "待完善" : "已完善", Icon: User, onClick: () => openTeacherTrainingSection("profile") },
  ];
  const managerPortalServiceLinks: Array<{
    label: string;
    helper: string;
    Icon: typeof Users;
    onClick: () => void;
    count?: string;
  }> = [
    { label: "班次管理", helper: "配置班次", Icon: ClipboardCheck, onClick: () => openTeacherTrainingSection("cohorts") },
    ...managerCommandQuickLinks.map((item) => ({
      ...item,
      count:
        item.label === "参训教师"
          ? `${selectedCohort?.stats.participantCount ?? 0}`
          : item.label === "课程安排"
            ? `${selectedCohort?.stats.courseCount ?? 0}`
            : item.label === "请假审批" && pendingLeaveRequests.length > 0
              ? `${pendingLeaveRequests.length}`
              : undefined,
    })),
    ...(canManageGlobal
      ? [
          {
            label: "省培账号管理",
            helper: "负责人/班主任",
            Icon: ClipboardCheck,
            onClick: () => openTeacherTrainingSection("accounts"),
          },
        ]
      : []),
    {
      label: "报到登记",
      helper: "房号材料",
      Icon: CheckCircle2,
      onClick: () => openOverviewMetric({ attendanceFilter: "pending", detailViewTitle: "报到登记", section: "attendance" }),
      count: `${selectedCohort?.stats.presentCount ?? 0}`,
    },
    { label: "课程签到", helper: "定位记录", Icon: MapPin, onClick: () => openOverviewMetric({ detailViewTitle: "课程签到记录", section: "checkins" }) },
    { label: "导出归档", helper: "材料下载", Icon: Download, onClick: () => openTeacherTrainingSection("exports") },
  ];
  const teacherPortalDataItems = [
    { label: "签到状态", value: teacherPendingCheckInCount > 0 ? `待 ${teacherPendingCheckInCount}` : "已处理", helper: "课程签到" },
    { label: "汇报任务", value: teacherPendingTaskCount > 0 ? `待 ${teacherPendingTaskCount}` : "已提交", helper: "PDF 汇报" },
    { label: "请假记录", value: `${selectedParticipant?.leaveRequests.length ?? 0}`, helper: "申请次数" },
    { label: "报到状态", value: selectedParticipantAttendanceLabel, helper: "当前状态" },
  ];
  const managerPortalDataItems = [
    { label: "参训教师", value: `${selectedCohort?.stats.participantCount ?? 0}`, helper: "名单人数" },
    { label: "已报到", value: `${selectedCohort?.stats.presentCount ?? 0}`, helper: "报到完成" },
    { label: "今日签到", value: `${selectedCohort?.stats.checkInRecordCount ?? 0}`, helper: "签到记录" },
    { label: "汇报提交", value: `${selectedCohort?.stats.submissionCount ?? 0}`, helper: "任务汇报" },
  ];
  const teacherMobilePriorityItems = [
    ...(teacherPendingCheckInCount > 0
      ? [
          {
            label: "待完成签到",
            value: `${teacherPendingCheckInCount} 项`,
            helper: "到达课程地点后定位签到",
            Icon: MapPin,
            section: "checkins" as const,
            tone: "amber" as const,
          },
        ]
      : []),
    ...(teacherPendingTaskCount > 0
      ? [
          {
            label: "待提交汇报",
            value: `${teacherPendingTaskCount} 项`,
            helper: "填写任务汇报并保存",
            Icon: Send,
            section: "tasks" as const,
            tone: "blue" as const,
          },
        ]
      : []),
    ...(teacherProfileNeedsAttention
      ? [
          {
            label: "完善个人信息",
            value: "待核对",
            helper: "填写预计到达时间",
            Icon: User,
            section: "profile" as const,
            tone: "blue" as const,
          },
        ]
      : []),
  ];
  const teacherPrimaryAction:
    | {
        label: string;
        value: string;
        helper: string;
        actionLabel: string;
        Icon: typeof Users;
        section: Workspace.TeacherTrainingSectionKey;
        tone: "amber" | "blue" | "emerald";
      }
    | null = teacherPendingCheckInCount > 0
    ? {
        label: "现在处理签到",
        value: `${teacherPendingCheckInCount} 项待签到`,
        helper: "到达课程地点后打开定位签到，失败时可联系省培班主任处理。",
        actionLabel: "去签到",
        Icon: MapPin,
        section: "checkins",
        tone: "amber",
      }
    : teacherPendingTaskCount > 0
      ? {
          label: "继续提交汇报",
          value: `${teacherPendingTaskCount} 项待提交`,
          helper: "按课程或总任务上传 PDF 汇报。",
          actionLabel: "去填写",
          Icon: Send,
          section: "tasks",
          tone: "blue",
        }
      : teacherProfileNeedsAttention
        ? {
            label: "完善个人信息",
            value: "资料待核对",
            helper: "邮箱、密码和基本信息完善后，其他省培功能才完整开放。",
            actionLabel: "去完善",
            Icon: User,
            section: "profile",
            tone: "amber",
          }
        : teacherNextCourse
          ? {
              label: "查看今日课程",
              value: "课程已发布",
              helper: [teacherNextCourse.courseDate, [teacherNextCourse.startTime, teacherNextCourse.endTime].filter(Boolean).join("-")]
                .filter(Boolean)
                .join(" · "),
              actionLabel: "看课程",
              Icon: CalendarDays,
              section: "courses",
              tone: "blue",
            }
          : {
              label: "当前暂无待办",
              value: "状态正常",
              helper: "可以查看课程安排、请假记录或个人资料。",
              actionLabel: "查看课程",
              Icon: CheckCircle2,
              section: "courses",
              tone: "emerald",
            };
  const TeacherPortalPrimaryIcon = teacherPrimaryAction?.Icon ?? CalendarDays;
  const focusTeacherTaskSubmission = (taskId: string) => {
    const participantId = selectedParticipant?.id ?? submissionDraft.participantId;
    setSubmissionDraft(buildSubmissionDraftForSelection(taskId, participantId));
    resetSubmissionAttachmentState();

    window.requestAnimationFrame(() => {
      document.getElementById("teacher-training-submission-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };
  const focusTeacherCheckInTask = (taskId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(`teacher-training-checkin-${taskId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };
  const ActiveTeacherTrainingIcon = activeTeacherTrainingSectionMeta?.Icon ?? ClipboardCheck;
  const showTeacherTrainingSection = (...keys: Workspace.TeacherTrainingSectionKey[]) =>
    keys.includes(effectiveTeacherTrainingSection);
  const teacherTrainingManagementGridClassName =
    canManage && showTeacherTrainingSection("cohorts")
      ? "items-start xl:grid-cols-1"
      : canManage && showTeacherTrainingSection("participants")
        ? "items-stretch xl:grid-cols-[360px_minmax(0,1fr)]"
        : "items-start";
  const teacherTaskWorkbenchClassName =
    !canManage && showTeacherTrainingSubmissionForm
      ? "grid items-stretch gap-4 xl:grid-cols-[minmax(300px,0.38fr)_minmax(0,0.62fr)]"
      : "grid items-start gap-4";
  const getCheckInProgress = (task: Workspace.TeacherTrainingCheckInTaskItem) => {
    const total = selectedCohort?.participants.length ?? 0;
    const signed = task.records.length;
    const percent = total > 0 ? Math.round((signed / total) * 100) : 0;

    return {
      signed,
      total,
      unsigned: Math.max(0, total - signed),
      percent,
    };
  };
  const isTeacherTrainingOverview = showTeacherTrainingSection("overview");
  const currentCohortManagerIdentity = selectedCohort?.managers.find((manager) => manager.userId === currentUser?.id);
  const teacherTrainingPortalRoleLabel = canManageGlobal
    ? "系统管理员"
    : canManage
      ? normalizeTeacherTrainingManagerIdentity(currentCohortManagerIdentity?.title) || "省培管理人员"
      : "省培教师";
  const teacherTrainingPortalUserName = currentUser?.name || currentUser?.username || "当前用户";
  const teacherTrainingPortalNotificationCount = canManage ? managerPendingActionCount : teacherMobilePriorityItems.length;
  const teacherTrainingPortalNavItems: Array<{
    label: string;
    section: Workspace.TeacherTrainingSectionKey;
    Icon: typeof Users;
    caret?: boolean;
  }> = canManage
    ? [
        { label: "首页", section: "overview", Icon: Home },
        { label: "课程安排", section: "courses", Icon: CalendarDays },
        { label: "培训管理", section: "participants", Icon: ClipboardCheck, caret: true },
        { label: "数据统计", section: "exports", Icon: BarChart3, caret: true },
        { label: "资源中心", section: "tasks", Icon: FolderOpen },
        { label: "通知公告", section: "overview", Icon: Bell },
      ]
    : [
        { label: "首页", section: "overview", Icon: Home },
        { label: "课程安排", section: "courses", Icon: CalendarDays },
        { label: "课程签到", section: "checkins", Icon: MapPin },
        { label: "任务汇报", section: "tasks", Icon: Send },
        { label: "请假申请", section: "leave", Icon: FileCheck },
        { label: "个人信息", section: "profile", Icon: User },
      ];

  return (
    <div className={isTeacherTrainingOverview ? "tt-portal-overview-host" : "space-y-4"}>
      {!isTeacherTrainingOverview ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeader
            title="江苏省职业院校创新创业教育（竞赛）指导能力提升培训"
          />
          <div className="inline-flex w-fit min-w-[180px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <ActiveTeacherTrainingIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-slate-500">当前模块</p>
              <p className="whitespace-nowrap text-sm font-bold text-slate-950">{activeTeacherTrainingSectionMeta?.label ?? "工作台"}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div
        key={effectiveTeacherTrainingSection}
        className={isTeacherTrainingOverview ? "tt-fade-in" : "tt-fade-in space-y-4"}
        id="teacher-training-content"
      >
          {effectiveTeacherTrainingSection !== "overview" ? (
          <section
            aria-label="省培操作提示"
            className="teacher-training-mobile-guide rounded-2xl border border-blue-100 bg-white/86 p-4 shadow-[0_18px_42px_rgba(26,111,212,0.12)] backdrop-blur transition duration-300 sm:hidden"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)]">
                <ActiveTeacherTrainingIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-950">
                  {activeTeacherTrainingActionHint?.title ?? "省培操作提示"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {activeTeacherTrainingSectionMeta?.description ?? "按当前模块完成省培操作。"}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {(activeTeacherTrainingActionHint?.steps ?? []).map((step, index) => (
                <div key={step} className="flex items-center gap-2 rounded-xl bg-blue-50/70 px-3 py-2 text-xs font-semibold text-blue-800">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] text-blue-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </section>
          ) : null}

          {!isTeacherTrainingOverview && !canManage && teacherMobileNavigationSections.length > 1 ? (
            <nav
              aria-label="老师端省培快捷导航"
              className="teacher-training-teacher-mobile-nav sticky top-2 z-20 -mx-1 rounded-2xl border border-blue-100 bg-white/92 p-2 shadow-[0_14px_34px_rgba(26,111,212,0.12)] backdrop-blur sm:hidden"
            >
              <div className="overflow-x-auto">
                <div className="flex min-w-max gap-2">
                  {teacherMobileNavigationSections.map((section) => {
                    const isActive = section.key === effectiveTeacherTrainingSection;
                    const Icon = section.Icon;

                    return (
                      <button
                        key={section.key}
                        aria-label={`进入省培模块：${section.label}`}
                        aria-pressed={isActive}
                        className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70 ${
                          isActive
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/18"
                            : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-blue-700"
                        }`}
                        onClick={() => openTeacherTrainingSection(section.key)}
                        title={`进入省培模块：${section.label}`}
                        type="button"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{teacherMobileSectionLabels[section.key] ?? section.label}</span>
                        {typeof section.count === "number" && section.count > 0 ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                              isActive ? "bg-white/18 text-white" : "bg-white text-blue-700"
                            }`}
                          >
                            {section.count}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              {effectiveTeacherTrainingSection !== "overview" ? (
                <button
                  aria-label="返回省培工作台"
                  className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-xs font-bold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                  onClick={() => openTeacherTrainingSection("overview")}
                  title="返回省培工作台"
                  type="button"
                >
                  返回工作台
                </button>
              ) : null}
            </nav>
          ) : null}

          {!canManage && showTeacherTrainingSection("overview") ? (
            <section aria-label="省培教师首页" className="tt-portal-page-shell">
              <header className="tt-portal-topbar" aria-label="省培门户导航">
                <div className="tt-portal-topbar-inner">
                  <div className="tt-portal-brand">
                    <span className="tt-portal-brand-mark">
                      <ClipboardCheck className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <strong>省培管理平台</strong>
                      <small>江苏省职业院校教师培训管理系统</small>
                    </span>
                  </div>
                  <nav className="tt-portal-topnav" aria-label="省培首页导航">
                    {teacherTrainingPortalNavItems.map((item) => {
                      const isHomeActive = item.section === "overview" && item.label === "首页";
                      return (
                        <button
                          key={item.label}
                          aria-label={`进入${item.label}`}
                          className={`tt-portal-nav-item ${isHomeActive ? "is-active" : ""}`}
                          onClick={() => openTeacherTrainingSection(item.section)}
                          title={`进入${item.label}`}
                          type="button"
                        >
                          <item.Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                          {item.caret ? <ChevronDown className="h-3.5 w-3.5 opacity-80" /> : null}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="tt-portal-topuser">
                    <button aria-label="查看通知" className="tt-portal-icon-button" type="button">
                      <Bell className="h-4 w-4" />
                      {teacherTrainingPortalNotificationCount > 0 ? (
                        <span>{teacherTrainingPortalNotificationCount}</span>
                      ) : null}
                    </button>
                    <button aria-label="帮助" className="tt-portal-icon-button" type="button">
                      <HelpCircle className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="个人信息"
                      className="tt-portal-user-button"
                      onClick={() => openTeacherTrainingSection("profile")}
                      type="button"
                    >
                      <span className="tt-portal-avatar">{teacherTrainingPortalUserName.slice(0, 1)}</span>
                      <span className="min-w-0">
                        <strong>{teacherTrainingPortalUserName}</strong>
                        <small>{teacherTrainingPortalRoleLabel}</small>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-80" />
                    </button>
                  </div>
                </div>
              </header>

              <main className="tt-portal-page-main">
                <section className="tt-portal-hero" aria-label="当前培训班">
                  <div className="tt-portal-hero-copy">
                    <span className="tt-portal-kicker">江苏省职业院校教师培训服务系统</span>
                    <h3>
                      {selectedCohort?.title ??
                        "江苏省职业院校教师素质提高计划职业学校创新创业教育（竞赛）指导能力提升培训"}
                    </h3>
                    <div className="tt-portal-hero-meta">
                      <span>
                        <CalendarDays className="h-4 w-4" />
                        培训时间：{selectedCohort ? `${selectedCohort.startDate} 至 ${selectedCohort.endDate}` : "待发布"}
                      </span>
                      <span>
                        <MapPin className="h-4 w-4" />
                        培训地点：{selectedCohort?.location || "待发布"}
                      </span>
                    </div>
                  </div>
                  <button
                    aria-label="查看课程安排"
                    className="tt-portal-primary-button"
                    onClick={() => openTeacherTrainingSection(teacherPrimaryAction?.section ?? "courses")}
                    title="查看课程安排"
                    type="button"
                  >
                    <TeacherPortalPrimaryIcon className="h-4 w-4" />
                    <span>{teacherPrimaryAction?.actionLabel ?? "查看课程"}</span>
                  </button>
                </section>

                <div className="tt-portal-grid">
                  <div className="tt-portal-main">
                  <section aria-label="省培服务" className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <div>
                        <p className="tt-block-title">省培服务</p>
                      </div>
                    </div>
                    <div className="tt-portal-service-grid">
                      {teacherPortalServiceLinks.map((item) => (
                        <button
                          key={item.label}
                          aria-label={`进入省培${item.label}`}
                          className="tt-portal-service-card group"
                          onClick={item.onClick}
                          title={`进入省培${item.label}`}
                          type="button"
                        >
                          <span className="tt-portal-service-icon">
                            <item.Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-slate-950">{item.label}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">{item.helper}</span>
                          </span>
                          {item.count ? <span className="tt-portal-count">{item.count}</span> : null}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section aria-label="今日课程" className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">今日课程</p>
                      <button
                        aria-label="查看课程安排"
                        className="tt-portal-link"
                        onClick={() => openTeacherTrainingSection("courses")}
                        title="查看课程安排"
                        type="button"
                      >
                        查看课程
                      </button>
                    </div>
                    {teacherNextCourse ? (
                      <div className="tt-portal-course-row">
                        <span className="tt-portal-course-date">{teacherNextCourse.courseDate}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-950">{teacherNextCourse.title}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {[
                              [teacherNextCourse.startTime, teacherNextCourse.endTime].filter(Boolean).join("-"),
                              teacherNextCourse.location,
                              teacherNextCourse.instructor,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="tt-portal-empty">后续课程待发布</div>
                    )}
                  </section>
                </div>

                <aside aria-label="省培教师侧栏" className="tt-portal-side">
                  <section className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">我的待办</p>
                    </div>
                    <div className="tt-portal-list">
                      {teacherMobilePriorityItems.length > 0 ? (
                        teacherMobilePriorityItems.map((item) => (
                          <button
                            key={item.label}
                            aria-label={`处理省培${item.label}`}
                            className="tt-portal-list-item"
                            onClick={() => openTeacherTrainingSection(item.section)}
                            title={`处理省培${item.label}`}
                            type="button"
                          >
                            <item.Icon className="h-4 w-4 text-blue-700" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-slate-950">{item.label}</span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">{item.helper}</span>
                            </span>
                            <span className="text-xs font-bold text-blue-700">{item.value}</span>
                          </button>
                        ))
                      ) : (
                        <div className="tt-portal-empty">暂无待办</div>
                      )}
                    </div>
                  </section>

                  <section className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">培训通知</p>
                    </div>
                    <div className="tt-portal-notice-list">
                      <div className="tt-portal-notice-item">
                        <span className="tt-portal-notice-dot" />
                        <p>按课程窗口完成签到</p>
                        <time>2026-07-08</time>
                      </div>
                      <div className="tt-portal-notice-item">
                        <span className="tt-portal-notice-dot" />
                        <p>任务汇报仅提交 PDF</p>
                        <time>2026-07-03</time>
                      </div>
                      <div className="tt-portal-notice-item">
                        <span className="tt-portal-notice-dot" />
                        <p>请假按审批流程处理</p>
                        <time>2026-07-02</time>
                      </div>
                    </div>
                  </section>

                  <section className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">个人数据</p>
                    </div>
                    <div className="tt-portal-data-grid">
                      {teacherPortalDataItems.map((item) => (
                        <div key={item.label} className="tt-portal-data-tile">
                          <p>{item.label}</p>
                          <strong>{item.value}</strong>
                          <span>{item.helper}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </aside>
              </div>
              </main>
              <aside aria-label="门户快捷工具" className="tt-portal-floating-tools">
                <button type="button" onClick={() => openTeacherTrainingSection("tasks")}>
                  <Send className="h-4 w-4" />
                  <span>我的任务</span>
                </button>
                <button type="button" onClick={() => openTeacherTrainingSection("leave")}>
                  <FileCheck className="h-4 w-4" />
                  <span>我的请假</span>
                </button>
                <button type="button" onClick={() => openTeacherTrainingSection("profile")}>
                  <User className="h-4 w-4" />
                  <span>个人资料</span>
                </button>
              </aside>
            </section>
          ) : null}

          {showTeacherTrainingSection("overview") ? (
            selectedCohort && selectedCohort.includeDetails === false ? (
              <TeacherTrainingCohortDetailLoadingBanner />
            ) : null
          ) : null}

          {canManage && showTeacherTrainingSection("overview") ? (
            <section aria-label="省培管理端首页" className="tt-portal-page-shell">
              <header className="tt-portal-topbar" aria-label="省培门户导航">
                <div className="tt-portal-topbar-inner">
                  <div className="tt-portal-brand">
                    <span className="tt-portal-brand-mark">
                      <ClipboardCheck className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <strong>省培管理平台</strong>
                      <small>江苏省职业院校教师培训管理系统</small>
                    </span>
                  </div>
                  <nav className="tt-portal-topnav" aria-label="省培管理首页导航">
                    {teacherTrainingPortalNavItems.map((item) => {
                      const isHomeActive = item.section === "overview" && item.label === "首页";
                      return (
                        <button
                          key={item.label}
                          aria-label={`进入${item.label}`}
                          className={`tt-portal-nav-item ${isHomeActive ? "is-active" : ""}`}
                          onClick={() => openTeacherTrainingSection(item.section)}
                          title={`进入${item.label}`}
                          type="button"
                        >
                          <item.Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                          {item.caret ? <ChevronDown className="h-3.5 w-3.5 opacity-80" /> : null}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="tt-portal-topuser">
                    <button aria-label="查看待办" className="tt-portal-icon-button" type="button">
                      <Bell className="h-4 w-4" />
                      {teacherTrainingPortalNotificationCount > 0 ? (
                        <span>{teacherTrainingPortalNotificationCount}</span>
                      ) : null}
                    </button>
                    <button aria-label="帮助" className="tt-portal-icon-button" type="button">
                      <HelpCircle className="h-4 w-4" />
                    </button>
                    <button className="tt-portal-user-button" type="button">
                      <span className="tt-portal-avatar">{teacherTrainingPortalUserName.slice(0, 1)}</span>
                      <span className="min-w-0">
                        <strong>{teacherTrainingPortalUserName}</strong>
                        <small>{teacherTrainingPortalRoleLabel}</small>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-80" />
                    </button>
                  </div>
                </div>
              </header>

              <main className="tt-portal-page-main">
                <section className="tt-portal-hero tt-portal-hero-manager" aria-label="当前培训班">
                  <div className="tt-portal-hero-copy">
                    <span className="tt-portal-kicker">江苏省职业院校教师培训管理系统</span>
                    <h3>
                      {selectedCohort?.title ??
                        "江苏省职业院校教师素质提高计划职业学校创新创业教育（竞赛）指导能力提升培训"}
                    </h3>
                    <div className="tt-portal-hero-meta">
                      <span>
                        <CalendarDays className="h-4 w-4" />
                        培训时间：{selectedCohort ? `${selectedCohort.startDate} 至 ${selectedCohort.endDate}` : "待建班"}
                      </span>
                      <span>
                        <MapPin className="h-4 w-4" />
                        培训地点：{selectedCohort?.location || "待设置"}
                      </span>
                    </div>
                  </div>
                  <button
                    aria-label="发布课程签到"
                    className="tt-portal-primary-button"
                    onClick={() => openTeacherTrainingSection("checkins")}
                    title="发布课程签到"
                    type="button"
                  >
                    <MapPin className="h-4 w-4" />
                    <span>发布签到</span>
                  </button>
                </section>

                <div className="tt-portal-grid">
                  <div className="tt-portal-main">
                  <section aria-label="省培服务" className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">省培服务</p>
                      <span className="tt-pill">{managerPortalServiceLinks.length} 项</span>
                    </div>
                    <div className="tt-portal-service-grid">
                      {managerPortalServiceLinks.map((item) => (
                        <button
                          key={item.label}
                          aria-label={`进入省培${item.label}`}
                          className="tt-portal-service-card group"
                          onClick={item.onClick}
                          title={`进入省培${item.label}`}
                          type="button"
                        >
                          <span className="tt-portal-service-icon">
                            <item.Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-slate-950">{item.label}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">{item.helper}</span>
                          </span>
                          {item.count ? <span className="tt-portal-count">{item.count}</span> : null}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section aria-label="今日运行" className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">今日运行</p>
                      <button
                        aria-label="进入导出归档"
                        className="tt-portal-link"
                        onClick={() => openTeacherTrainingSection("exports")}
                        title="进入导出归档"
                        type="button"
                      >
                        导出归档
                      </button>
                    </div>
                    <div className="tt-portal-run-grid">
                      {managerOverviewStats.map((item) => (
                        <button
                          key={item.label}
                          aria-label={`查看省培${item.label}明细`}
                          className="tt-portal-run-card group"
                          onClick={item.onClick}
                          title={item.title}
                          type="button"
                        >
                          <span className="tt-portal-run-icon">
                            <item.Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-slate-500">{item.label}</span>
                            <span className="mt-1 block text-2xl font-black leading-none text-slate-950">{item.value}</span>
                            <span className="mt-1 block truncate text-[11px] font-semibold text-slate-400">{item.helper}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                <aside aria-label="省培管理侧栏" className="tt-portal-side">
                  <section className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">待处理事项</p>
                      <span className="tt-pill tt-pill-neutral">当前班次</span>
                    </div>
                    <div className="tt-portal-list">
                      {managerCommandTodoCards.map((item) => (
                        <button
                          key={item.label}
                          aria-label={`查看省培${item.label}`}
                          className="tt-portal-list-item"
                          onClick={item.onClick}
                          title={`查看省培${item.label}`}
                          type="button"
                        >
                          <span
                            className={`tt-portal-list-icon ${
                              item.tone === "amber"
                                ? "tt-portal-list-icon-warning"
                                : item.tone === "rose"
                                  ? "tt-portal-list-icon-danger"
                                  : item.tone === "emerald"
                                    ? "tt-portal-list-icon-success"
                                    : ""
                            }`}
                          >
                            <item.Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-slate-950">{item.label}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">{item.helper}</span>
                          </span>
                          <span className="text-xl font-black leading-none text-slate-950">{item.value}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">培训通知</p>
                    </div>
                    <div className="tt-portal-notice-list">
                      <div className="tt-portal-notice-item">
                        <span className="tt-portal-notice-dot" />
                        <p>名单和账号分开管理</p>
                        <time>2026-07-08</time>
                      </div>
                      <div className="tt-portal-notice-item">
                        <span className="tt-portal-notice-dot" />
                        <p>课程结束后提交 PDF 汇报</p>
                        <time>2026-07-03</time>
                      </div>
                      <div className="tt-portal-notice-item">
                        <span className="tt-portal-notice-dot" />
                        <p>请假单需全部审批通过</p>
                        <time>2026-07-02</time>
                      </div>
                    </div>
                  </section>

                  <section className="tt-portal-panel">
                    <div className="tt-portal-panel-header">
                      <p className="tt-block-title">班次数据</p>
                    </div>
                    <div className="tt-portal-data-grid">
                      {managerPortalDataItems.map((item) => (
                        <button
                          key={item.label}
                          aria-label={`查看${item.label}`}
                          className="tt-portal-data-tile text-left"
                          onClick={() => {
                            if (item.label === "参训教师") openTeacherTrainingSection("participants");
                            if (item.label === "已报到") {
                              openOverviewMetric({ attendanceFilter: "registered", detailViewTitle: "已报到教师", section: "attendance" });
                            }
                            if (item.label === "今日签到") {
                              openOverviewMetric({ detailViewTitle: "课程签到记录", section: "checkins" });
                            }
                            if (item.label === "汇报提交") {
                              openOverviewMetric({ detailViewTitle: "已提交汇报", section: "tasks", submissionFilter: "submitted" });
                            }
                          }}
                          title={`查看${item.label}`}
                          type="button"
                        >
                          <p>{item.label}</p>
                          <strong>{item.value}</strong>
                          <span>{item.helper}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                </aside>
              </div>
              </main>
              <aside aria-label="门户快捷工具" className="tt-portal-floating-tools">
                <button type="button" onClick={() => openTeacherTrainingSection("participants")}>
                  <Users className="h-4 w-4" />
                  <span>名单</span>
                </button>
                <button type="button" onClick={() => openTeacherTrainingSection("leave")}>
                  <FileCheck className="h-4 w-4" />
                  <span>审批</span>
                </button>
                <button type="button" onClick={() => openTeacherTrainingSection("exports")}>
                  <Download className="h-4 w-4" />
                  <span>归档</span>
                </button>
              </aside>
            </section>
          ) : null}

          {canManageGlobal && showTeacherTrainingSection("accounts") ? (
            <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(320px,0.42fr)_minmax(0,0.58fr)]" aria-label="省培系统账号管理">
              <div className="tt-card flex flex-col p-5" id="tt-manager-account-form">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="tt-block-title">省培系统账号管理</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      这里只维护省培负责人和省培班主任账号池；参训教师名单和学员账号在“参训教师”里处理。
                    </p>
                  </div>
                  <span className="tt-pill">{teacherTrainingManagerAccounts.length} 个</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className={teacherTrainingFieldShellClassName}>
                    <RequiredFieldLabel>姓名</RequiredFieldLabel>
                    <input
                      className={fieldClassName}
                      {...fieldHint("省培管理账号姓名")}
                      onChange={(event) => setManagerAccountDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="省培负责人或省培班主任姓名"
                      value={managerAccountDraft.name}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <RequiredFieldLabel>登录账号</RequiredFieldLabel>
                    <input
                      className={fieldClassName}
                      {...fieldHint("省培管理登录账号")}
                      onChange={(event) => setManagerAccountDraft((current) => ({ ...current, username: event.target.value }))}
                      placeholder="建议使用手机号或姓名拼音"
                      value={managerAccountDraft.username}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>手机号</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("省培管理账号手机号")}
                      onChange={(event) => setManagerAccountDraft((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="11 位手机号"
                      value={managerAccountDraft.phone}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>邮箱</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("省培管理账号邮箱")}
                      onChange={(event) => setManagerAccountDraft((current) => ({ ...current, email: event.target.value }))}
                      placeholder="用于通知，可选"
                      value={managerAccountDraft.email}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <RequiredFieldLabel>省培身份</RequiredFieldLabel>
                    <select
                      className={fieldClassName}
                      {...fieldHint("省培身份")}
                      onChange={(event) =>
                        setManagerAccountDraft((current) => ({
                          ...current,
                          managerIdentity: event.target.value === "省培班主任" ? "省培班主任" : "省培负责人",
                        }))
                      }
                      value={managerAccountDraft.managerIdentity}
                    >
                      <option value="省培负责人">省培负责人</option>
                      <option value="省培班主任">省培班主任</option>
                    </select>
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>密码</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("省培管理账号密码")}
                      onChange={(event) => setManagerAccountDraft((current) => ({ ...current, password: event.target.value }))}
                      placeholder={managerAccountDraft.id ? "留空则不修改密码" : "留空默认 123456"}
                      type="password"
                      value={managerAccountDraft.password}
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton
                    aria-label="保存省培管理账号"
                    loading={isSaving}
                    onClick={() => void submitManagerAccount()}
                    title="保存省培管理账号"
                    variant="primary"
                  >
                    {managerAccountDraft.id ? "保存账号修改" : "新增管理账号"}
                  </ActionButton>
                  {managerAccountDraft.id ? (
                    <button
                      className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
                      onClick={() => setManagerAccountDraft(createDefaultManagerAccountDraft())}
                      type="button"
                    >
                      取消修改
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="tt-card flex min-h-0 flex-col p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="tt-block-title">省培负责人/省培班主任账号池</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      班次管理只能从这里选择对应身份的账号；账号身份在此处统一维护。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="tt-pill">省培负责人 {managerAccountCounts.leader}</span>
                      <span className={managerAccountCounts.classTeacher > 0 ? "tt-pill" : "tt-pill border-amber-200 bg-amber-50 text-amber-700"}>
                        省培班主任 {managerAccountCounts.classTeacher}
                      </span>
                    </div>
                  </div>
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={selectedManagerAccountIds.length === 0 || isSaving}
                    onClick={() => void removeSelectedManagerAccounts()}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                    批量移出账号池
                  </button>
                </div>
                <label className={`${teacherTrainingFieldShellClassName} mt-4`}>
                  <span className={teacherTrainingFieldLabelClassName}>搜索账号</span>
                  <input
                    className={fieldClassName}
                    {...fieldHint("搜索省培管理账号")}
                    onChange={(event) => setManagerAccountSearch(event.target.value)}
                    placeholder="按姓名、账号、手机号、邮箱或身份搜索"
                    value={managerAccountSearch}
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    className="inline-flex h-8 items-center rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700"
                    onClick={() =>
                      setVisibleSelection(
                        filteredManagerAccounts.map((account) => account.id),
                        selectedManagerAccountIds,
                        setSelectedManagerAccountIds,
                      )
                    }
                    type="button"
                  >
                    全选/取消当前结果
                  </button>
                  <span className="tt-pill">
                    已选 {selectedManagerAccountIds.length} / 当前 {filteredManagerAccounts.length}
                  </span>
                </div>
                <div className={`mt-4 space-y-3 ${teacherTrainingScrollableListClassName}`}>
                  {filteredManagerAccounts.length === 0 ? (
                    <div className="tt-empty-fill">
                      <Users className="h-6 w-6 text-blue-600" />
                      <p className="text-sm font-semibold text-slate-700">暂无省培管理账号</p>
                      <p className="text-xs text-slate-400">先新增省培负责人或省培班主任，再到班次管理中选择。</p>
                    </div>
                  ) : (
                    filteredManagerAccounts.map((account) => {
                      const accountIdentities = Array.from(
                        new Set(
                          [
                            normalizeTeacherTrainingManagerIdentity(account.responsibility),
                            ...account.managedCohorts.map((manager) => normalizeTeacherTrainingManagerIdentity(manager.title)),
                          ].filter(Boolean),
                        ),
                      );
                      const visibleIdentities = accountIdentities.length > 0 ? accountIdentities : ["未设置省培身份"];

                      return (
                      <article key={account.id} className="tt-action-card p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <label className="flex min-w-0 items-start gap-3">
                            <input
                              checked={selectedManagerAccountIds.includes(account.id)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                              {...fieldHint(`选择省培管理账号：${account.name}`)}
                              onChange={() =>
                                setSelectedManagerAccountIds((current) => toggleSelectedId(current, account.id))
                              }
                              type="checkbox"
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-950">{account.name}</span>
                                {visibleIdentities.map((identity) => (
                                  <span
                                    key={identity}
                                    className={
                                      identity === "未设置省培身份"
                                        ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700"
                                        : "rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700"
                                    }
                                  >
                                    {identity}
                                  </span>
                                ))}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-slate-500">
                                账号：{account.username}
                                {account.phone ? ` · 手机：${account.phone}` : ""}
                                {account.email ? ` · 邮箱：${account.email}` : ""}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-slate-400">
                                已绑定班次：
                                {account.managedCohorts.length > 0
                                  ? account.managedCohorts.map((item) => `${item.cohortTitle}（${item.title}）`).join("、")
                                  : "暂无"}
                              </span>
                            </span>
                          </label>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
                              onClick={() => editManagerAccount(account)}
                              type="button"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              修改
                            </button>
                            <button
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600"
                              disabled={isSaving}
                              onClick={() => void removeSelectedManagerAccounts([account.id])}
                              type="button"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              移出
                            </button>
                          </div>
                        </div>
                      </article>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <div className={`grid gap-4 ${teacherTrainingManagementGridClassName}`}>
        {canManage && showTeacherTrainingSection("cohorts", "participants") ? (
          <aside
            className={`tt-card p-5 ${
              showTeacherTrainingSection("participants")
                ? "flex h-full min-h-[min(68vh,760px)] flex-col gap-5 self-stretch"
                : "space-y-5 self-start"
            }`}
          >
            <div>
              <p className="tt-block-title">班次</p>
              <p className="mt-1.5 text-xs leading-5 text-slate-500">按账号权限切换可管理或可参与的省培班次。</p>
              {/* cohorts 页下方已有可点击切换的“已设置班次”列表，无需重复的下拉；仅在参训教师页保留下拉用于切换。 */}
              {!showTeacherTrainingSection("cohorts") ? (
                <label className={`${teacherTrainingFieldShellClassName} mt-3`}>
                  <span className={teacherTrainingFieldLabelClassName}>选择省培班次</span>
                  <select
                    className={fieldClassName}
                    {...fieldHint("选择省培班次")}
                    onChange={(event) => {
                      setSelectedCohortId(event.target.value);
                      setLeaveFlowSteps([]);
                      setAccountMessagesByParticipantId({});
                    }}
                    value={selectedCohort?.id ?? ""}
                  >
                    {teacherTrainingCohorts.length === 0 ? <option value="">暂无班次</option> : null}
                    {teacherTrainingCohorts.map((cohort) => (
                      <option key={cohort.id} value={cohort.id}>
                        {cohort.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {showTeacherTrainingSection("cohorts") ? (
              <div className="tt-subcard p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="tt-block-title">已设置班次</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      共 {teacherTrainingCohorts.length} 个班次，点击班次可切换到对应管理页。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tt-pill">{teacherTrainingCohorts.length} 个</span>
                    <button
                      className="inline-flex h-8 items-center rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700"
                      disabled={teacherTrainingCohorts.length === 0}
                      onClick={() =>
                        setVisibleSelection(
                          teacherTrainingCohorts.map((cohort) => cohort.id),
                          selectedCohortIds,
                          setSelectedCohortIds,
                        )
                      }
                      type="button"
                    >
                      全选/取消
                    </button>
                    <button
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={selectedCohortIds.length === 0 || isSaving}
                      onClick={() => void removeSelectedCohorts()}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      批量删除班次
                    </button>
                  </div>
                </div>
                {teacherTrainingCohorts.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-xs text-slate-400">
                    暂无已设置班次。
                  </p>
                ) : (
                  <div className={`mt-3 space-y-3 ${teacherTrainingScrollableListClassName}`}>
                    {teacherTrainingCohorts.map((cohort) => (
                      <div
                        key={cohort.id}
                        className={`rounded-xl border p-3 transition ${
                          selectedCohort?.id === cohort.id
                            ? "border-blue-200 bg-blue-50/70 shadow-sm"
                            : "border-slate-200 bg-white/80"
                        }`}
                      >
                        <button
                          className="block w-full text-left"
                          onClick={() => {
                            setSelectedCohortId(cohort.id);
                            setLeaveFlowSteps([]);
                            setAccountMessagesByParticipantId({});
                          }}
                          title={`切换到${cohort.title}`}
                          type="button"
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="flex min-w-0 items-center gap-2">
                                <input
                                  checked={selectedCohortIds.includes(cohort.id)}
                                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600"
                                  {...fieldHint(`选择省培班次：${cohort.title}`)}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={() => setSelectedCohortIds((current) => toggleSelectedId(current, cohort.id))}
                                  type="checkbox"
                                />
                                <span className="block truncate text-sm font-bold text-slate-950">{cohort.title}</span>
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-slate-500">
                                {cohort.startDate} 至 {cohort.endDate}
                                {cohort.location ? ` · ${cohort.location}` : ""}
                              </span>
                            </span>
                            {selectedCohort?.id === cohort.id ? (
                              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-blue-700">
                                当前
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                            <span className="rounded-lg bg-slate-50 px-2 py-1">教师 {cohort.stats.participantCount}</span>
                            <span className="rounded-lg bg-slate-50 px-2 py-1">课程 {cohort.stats.courseCount}</span>
                            <span className="rounded-lg bg-slate-50 px-2 py-1">负责人 {cohort.stats.managerCount}</span>
                          </span>
                        </button>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
                            onClick={() => editCohort(cohort)}
                            title={`修改${cohort.title}`}
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            修改
                          </button>
                          <button
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600"
                            disabled={isSaving}
                            onClick={() => void removeCohort(cohort)}
                            title={`删除${cohort.title}`}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {canShowCohortDraftForm && showTeacherTrainingSection("cohorts") ? (
              cohortFormOpen || cohortDraft.id ? (
            <div className="tt-subcard p-4" id="tt-cohort-form">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                  <Plus className="h-4 w-4" />
                </span>
                <p className="text-[15px] font-bold text-slate-950">
                  {cohortDraft.id ? "正在修改班次" : "新建省培班次"}
                </p>
                </div>
                {!cohortDraft.id ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-400 transition hover:text-slate-600"
                    onClick={() => setCohortFormOpen(false)}
                    aria-label="收起新建班次表单"
                  >
                    收起
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className={`${teacherTrainingFieldShellClassName} md:col-span-2`}>
                  <span className={teacherTrainingFieldLabelClassName}>培训名称</span>
                  <input
                    className={fieldClassName}
                    {...fieldHint("培训名称")}
                    onChange={(event) => setCohortDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="培训名称"
                    value={cohortDraft.title}
                  />
                </label>
                <label className={teacherTrainingFieldShellClassName}>
                  <span className={teacherTrainingFieldLabelClassName}>培训地点</span>
                  <input
                    className={fieldClassName}
                    {...fieldHint("培训地点")}
                    onChange={(event) => setCohortDraft((current) => ({ ...current, location: event.target.value }))}
                    placeholder="培训地点"
                    value={cohortDraft.location}
                  />
                </label>
                <label className={teacherTrainingFieldShellClassName}>
                  <span className={teacherTrainingFieldLabelClassName}>培训开始日期</span>
                  <input
                    className={fieldClassName}
                    {...fieldHint("培训开始日期")}
                    onChange={(event) => setCohortDraft((current) => ({ ...current, startDate: event.target.value }))}
                    type="date"
                    value={cohortDraft.startDate}
                  />
                </label>
                <label className={teacherTrainingFieldShellClassName}>
                  <span className={teacherTrainingFieldLabelClassName}>培训结束日期</span>
                  <input
                    className={fieldClassName}
                    {...fieldHint("培训结束日期")}
                    onChange={(event) => setCohortDraft((current) => ({ ...current, endDate: event.target.value }))}
                    type="date"
                    value={cohortDraft.endDate}
                  />
                </label>
                <label className={`${teacherTrainingFieldShellClassName} md:col-span-2 xl:col-span-4`}>
                  <span className={teacherTrainingFieldLabelClassName}>培训说明</span>
                  <textarea
                    className={`${textareaClassName} min-h-20`}
                    {...fieldHint("培训说明")}
                    onChange={(event) => setCohortDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="培训说明"
                    value={cohortDraft.description}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-4">
                  <ActionButton
                    aria-label="创建新的省培班次"
                    className="min-w-[160px]"
                    loading={isSaving}
                    onClick={() => void submitCohort()}
                    title="创建新的省培班次"
                    variant="primary"
                  >
                    {cohortDraft.id ? "保存修改" : "创建班次"}
                  </ActionButton>
                  {cohortDraft.id ? (
                    <button
                      className="text-xs font-semibold text-slate-500"
                      onClick={() => setCohortDraft(createDefaultCohortDraft())}
                      type="button"
                    >
                      取消修改
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
              ) : (
                <button
                  type="button"
                  className="tt-action-card flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-[#1a6fd4]"
                  onClick={() => setCohortFormOpen(true)}
                  aria-label="展开新建省培班次表单"
                >
                  <Plus className="h-4 w-4" />
                  新建省培班次
                </button>
              )
            ) : null}

            {canManage && showTeacherTrainingSection("participants") ? (
              <div className="tt-subcard flex flex-1 flex-col p-4" id="tt-participant-tools">
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                    <Users className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-slate-950">参训教师工具箱</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">名单在右侧维护；这里仅保留常用入口。</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
                    <p className="text-[11px] font-semibold text-blue-500">当前名单</p>
                    <p className="mt-1 text-xl font-black leading-none text-blue-900">{selectedCohort?.participants.length ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white/80 px-3 py-2">
                    <p className="text-[11px] font-semibold text-slate-400">未开通账号</p>
                    <p className="mt-1 text-xl font-black leading-none text-slate-900">
                      {selectedCohort?.participants.filter((participant) => !participant.accountUserId).length ?? 0}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                      participantFormOpen
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-blue-900 hover:border-blue-100 hover:bg-blue-50/50"
                    }`}
                    onClick={openParticipantFormWorkspace}
                  >
                    <span>
                      <span className="block text-sm font-bold">录入单个教师</span>
                      <span className="mt-0.5 block text-xs text-slate-500">适合临时补录或修改前核对</span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                      participantImportOpen
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-blue-900 hover:border-blue-100 hover:bg-blue-50/50"
                    }`}
                    onClick={openParticipantImportWorkspace}
                  >
                    <span>
                      <span className="block text-sm font-bold">批量导入名单</span>
                      <span className="mt-0.5 block text-xs text-slate-500">上传 Excel 或粘贴名单文本</span>
                    </span>
                    <Upload className="h-4 w-4 shrink-0" />
                  </button>
                </div>
                <div className="mt-auto rounded-xl border border-blue-100 bg-blue-50/45 px-3 py-2 text-xs leading-5 text-blue-700">
                  <p className="font-bold">档案规则</p>
                  <p className="mt-1">姓名、单位、手机号必填；职务和职称至少填一项；分组可后续补充。账号可批量开通，也可在教师条目里单独开通。</p>
                </div>
              </div>
            ) : null}

            {canCreateTeacherTrainingCohort && selectedCohort && showTeacherTrainingSection("cohorts") ? (
              <div className="tt-subcard p-4">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 text-left"
                  onClick={() => setCohortConfigOpen((v) => !v)}
                  aria-expanded={cohortConfigOpen}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                    <User className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-slate-950">班次省培负责人/省培班主任设置</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      省培负责人显示在省培班主任前面；两者省培管理权限一致，请假审批顺序以请假审批模块配置为准。
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${cohortConfigOpen ? "rotate-180" : ""}`} />
                </button>
                {cohortConfigOpen ? (
                <>
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <p className="text-xs font-bold text-blue-700">班次配置状态</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {teacherTrainingConfigStatusItems.map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-lg border bg-white/84 px-3 py-2 ${
                          item.done ? "border-emerald-100 text-emerald-700" : "border-amber-100 text-amber-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">{item.label}</span>
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-bold">
                            {item.done ? "已配置" : "待配置"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <TeacherTrainingCohortHealthCheck items={cohortHealthCheckItems} />
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {teacherTrainingManagerRoleOptions.map((option) => {
                      const selected = managerDraft.title === option.title;
                      return (
                        <button
                          key={option.title}
                          className={`rounded-xl border px-3 py-2 text-left transition ${
                            selected
                              ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-100 hover:bg-slate-50 hover:text-blue-700"
                          }`}
                          onClick={() => setManagerDraft((current) => ({ ...current, title: option.title }))}
                          type="button"
                        >
                          <span className="block text-sm font-semibold">{option.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>{selectedManagerRoleOption.accountLabel}</span>
                    <select
                      className={fieldClassName}
                      {...fieldHint(selectedManagerRoleOption.accountLabel)}
                      onChange={(event) => setManagerDraft((current) => ({ ...current, userId: event.target.value }))}
                      value={managerDraft.userId}
                    >
                      <option value="">
                        {selectedManagerAccountOptions.length === 0
                          ? `请先到省培账号管理新增${managerDraft.title}`
                          : "选择已设置身份的账号"}
                      </option>
                      {selectedManagerAccountOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} · {option.username}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ActionButton
                    aria-label={`设置当前班次${managerDraft.title || "省培工作人员"}`}
                    className="w-full"
                    disabled={!managerDraft.userId}
                    loading={isSaving}
                    onClick={() => void submitManager()}
                    title={`设置当前班次${managerDraft.title || "省培工作人员"}`}
                    variant="primary"
                  >
                    {selectedManagerRoleOption.buttonLabel}
                  </ActionButton>
                </div>
                <div className="mt-4 space-y-2">
                  {selectedCohort.managers.length === 0 ? (
                    <p className="text-xs text-slate-400">暂未设置省培负责人或省培班主任。</p>
                  ) : (
                    groupedCohortManagers.map((group) => (
                      <div key={group.title} className="rounded-xl border border-slate-100 bg-white/80 p-2">
                        <p className="px-1 pb-2 text-xs font-semibold text-slate-500">{group.title}</p>
                        <div className="space-y-2">
                          {group.items.map((manager) => (
                            <div key={manager.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{manager.name}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {manager.title} · {manager.username}
                                </p>
                              </div>
                              <button
                                className="text-xs font-semibold text-rose-500"
                                aria-label={`移除${manager.name}的省培管理权限`}
                                disabled={isSaving}
                                onClick={() => {
                                  if (!window.confirm(`确认移除“${manager.name}”的省培管理权限？\n\n移除后该成员将无法再管理本班次（不影响其登录账号本身）。`)) {
                                    return;
                                  }
                                  void removeTeacherTrainingCohortManager({
                                    cohortId: selectedCohort.id,
                                    userId: manager.userId,
                                  });
                                }}
                                title={`移除${manager.name}的省培管理权限`}
                                type="button"
                              >
                                移除
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                </>
                ) : null}
              </div>
            ) : null}
          </aside>
        ) : null}

        <div className="space-y-4">
          {!selectedCohort ? (
            <div className="tt-card p-5">
              <EmptyState
                description="先创建一个省培班次，再维护名单、签到、任务和汇报。"
                icon={ClipboardCheck}
                title="还没有省培班次"
              />
            </div>
          ) : (
            <>
              {!showTeacherTrainingSection("overview") ? (
              <section className="tt-card flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="inline-flex h-7 shrink-0 items-center rounded-lg bg-[#1a6fd4]/10 px-2.5 text-xs font-bold text-[#1a6fd4]">
                    当前班次
                  </span>
                  <p className="min-w-0 truncate text-sm font-semibold text-slate-900" title={selectedCohort.title}>
                    {selectedCohort.title}
                    <span className="ml-2 font-normal text-slate-400">
                      {selectedCohort.startDate} 至 {selectedCohort.endDate}
                      {selectedCohort.location ? ` · ${selectedCohort.location}` : ""}
                    </span>
                  </p>
                </div>
                <span className="w-fit shrink-0 rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {activeTeacherTrainingSectionMeta?.label ?? (canManage ? "省培管理" : "我的省培")}
                </span>
                {!canManage && teacherTrainingCohorts.length > 1 ? (
                  <label className={`${teacherTrainingFieldShellClassName} w-full sm:max-w-[260px]`}>
                    <span className={teacherTrainingFieldLabelClassName}>选择我的省培班次</span>
                    <select
                      className={fieldClassName}
                      {...fieldHint("切换我的省培班次")}
                      onChange={(event) => {
                        setSelectedCohortId(event.target.value);
                        setLeaveFlowSteps([]);
                      }}
                      value={selectedCohort.id}
                    >
                      {teacherTrainingCohorts.map((cohort) => (
                        <option key={cohort.id} value={cohort.id}>
                          {cohort.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </section>
              ) : null}

              {showTeacherTrainingSection("courses") ? (
              canManage ? (
              <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,460px)]">
                <div className={teacherTrainingListCardClassName}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="tt-block-title">课程安排</p>
                      <p className="mt-1.5 text-xs leading-5 text-slate-500">
                        参训教师登录省培账号后，只看到自己班次的课程设置安排。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tt-pill">{courseSessions.length} 节</span>
                      <button
                        className="inline-flex h-8 items-center rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700"
                        disabled={courseSessions.length === 0}
                        onClick={() =>
                          setVisibleSelection(
                            courseSessions.map((course) => course.id),
                            selectedCourseSessionIds,
                            setSelectedCourseSessionIds,
                          )
                        }
                        type="button"
                      >
                        全选/取消
                      </button>
                      <button
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={selectedCourseSessionIds.length === 0 || isSaving}
                        onClick={() => void removeSelectedCourseSessions()}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        批量删除课程
                      </button>
                    </div>
                  </div>
                  <div className={`mt-4 grid gap-3 ${teacherTrainingFillingListClassName}`}>
                    {courseSessions.length === 0 ? (
                      <div className="tt-empty-fill">
                        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#1a6fd4]">
                          <CalendarDays className="h-6 w-6" />
                        </span>
                        <p className="text-sm font-semibold text-slate-700">暂无课程安排</p>
                        <p className="max-w-[260px] text-xs leading-5 text-slate-400">
                          添加课程后，教师端会同步显示课程表。
                        </p>
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#1a6fd4] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#155bb0]"
                          onClick={() => {
                            const input = document.getElementById("tt-course-title-input");
                            input?.scrollIntoView({ behavior: "smooth", block: "center" });
                            window.setTimeout(() => (input as HTMLInputElement | null)?.focus(), 350);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          立即添加课程
                        </button>
                      </div>
                    ) : (
                      courseSessions.map((course) => (
                        <article key={course.id} className="tt-action-card group p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  checked={selectedCourseSessionIds.includes(course.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                  {...fieldHint(`选择课程：${course.title}`)}
                                  onChange={() =>
                                    setSelectedCourseSessionIds((current) => toggleSelectedId(current, course.id))
                                  }
                                  type="checkbox"
                                />
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                                  {course.courseDate}
                                  {course.startTime ? ` ${course.startTime}` : ""}
                                  {course.endTime ? `-${course.endTime}` : ""}
                                </span>
                                {course.location ? (
                                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                    {course.location}
                                  </span>
                                ) : null}
                                {course.instructor ? (
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                    {course.instructor}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2.5 font-semibold text-slate-950">{course.title}</p>
                              {course.description ? (
                                <p className="mt-1 text-sm leading-6 text-slate-500">{course.description}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 gap-2 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                              <button
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                                onClick={() => editCourseSession(course)}
                                type="button"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                修改
                              </button>
                              <button
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                                onClick={() => void removeCourseSession(course)}
                                type="button"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                删除
                              </button>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>

                <div className="tt-card p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <p className="text-[15px] font-bold text-slate-950">新增课程</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>课程名称</span>
                      <input
                        id="tt-course-title-input"
                        className={fieldClassName}
                        {...fieldHint("课程名称")}
                        onChange={(event) => setCourseDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="课程名称"
                        value={courseDraft.title}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-[minmax(150px,1.2fr)_minmax(118px,.9fr)_minmax(118px,.9fr)]">
                      <label className={`${teacherTrainingFieldShellClassName} sm:col-span-2 2xl:col-span-1`}>
                        <span className={teacherTrainingFieldLabelClassName}>课程日期</span>
                        <input
                          className={`${fieldClassName} min-w-0`}
                          {...fieldHint("课程日期")}
                          onChange={(event) => setCourseDraft((current) => ({ ...current, courseDate: event.target.value }))}
                          type="date"
                          value={courseDraft.courseDate}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>课程开始时间</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("课程开始时间")}
                          onChange={(event) => setCourseDraft((current) => ({ ...current, startTime: event.target.value }))}
                          type="time"
                          value={courseDraft.startTime}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>课程结束时间</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("课程结束时间")}
                          onChange={(event) => setCourseDraft((current) => ({ ...current, endTime: event.target.value }))}
                          type="time"
                          value={courseDraft.endTime}
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>课程地点</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("课程地点")}
                          onChange={(event) => setCourseDraft((current) => ({ ...current, location: event.target.value }))}
                          placeholder="地点"
                          value={courseDraft.location}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>授课教师</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("授课教师")}
                          onChange={(event) => setCourseDraft((current) => ({ ...current, instructor: event.target.value }))}
                          placeholder="授课教师"
                          value={courseDraft.instructor}
                        />
                      </label>
                    </div>
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>课程说明</span>
                      <textarea
                        className={`${textareaClassName} min-h-20`}
                        {...fieldHint("课程说明")}
                        onChange={(event) => setCourseDraft((current) => ({ ...current, description: event.target.value }))}
                        placeholder="课程说明"
                        value={courseDraft.description}
                      />
                    </label>
                    <ActionButton
                      aria-label="保存省培课程安排"
                      loading={isSaving}
                      onClick={() => void submitCourseSession()}
                      title="保存省培课程安排"
                      variant="primary"
                    >
                      {courseDraft.id ? "保存课程修改" : "保存课程"}
                    </ActionButton>
                    {courseDraft.id ? (
                      <button
                        className="text-xs font-semibold text-slate-500"
                        onClick={() => setCourseDraft(createDefaultCourseSessionDraft())}
                        type="button"
                      >
                        取消修改
                      </button>
                    ) : null}
                    <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3">
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-blue-700" />
                        <p className="text-xs font-bold text-blue-700">一键导入课程</p>
                      </div>
                      <label
                        className={`mt-3 flex items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50 ${
                          courseImportLoading ? "cursor-wait opacity-75" : "cursor-pointer"
                        }`}
                      >
                        {courseImportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {courseImportLoading ? "正在识别..." : "上传课程文件"}
                        <input
                          accept=".docx,.pdf,.xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values,text/plain"
                          className="sr-only"
                          disabled={courseImportLoading}
                          {...fieldHint("上传课程文件")}
                          onChange={(event) => {
                            void handleCourseImportFile(event.target.files?.[0] ?? null);
                            event.currentTarget.value = "";
                          }}
                          type="file"
                        />
                      </label>
                      {courseImportStatus ? (
                        <p className="mt-2 rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-5 text-blue-700">
                          {courseImportStatus}
                        </p>
                      ) : null}
                      {courseImportPreview.totalCount > 0 ? (
                        <div className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-5 ${getImportPreviewToneClassName(courseImportPreview)}`}>
                          <p className="font-bold">导入预览：将新增 {courseImportPreview.readyCount} 条课程</p>
                          <p className="mt-1">
                            共识别 {courseImportPreview.totalCount} 行；缺课程名称或日期 {courseImportPreview.missingRequiredCount} 行；文件内重复 {courseImportPreview.duplicateInFileCount} 组；当前班次已存在 {courseImportPreview.existingConflictCount} 行。
                          </p>
                        </div>
                      ) : null}
                      <TeacherTrainingImportFieldSummary items={courseImportFieldSummary} />
                      <textarea
                        className={`${textareaClassName} mt-3 min-h-24 bg-white/90`}
                        {...fieldHint("一键导入课程")}
                        onChange={(event) => setCourseImportText(event.target.value)}
                        placeholder="可上传 Word/PDF/Excel 课程表自动识别，也可粘贴：课程名称，日期，开始时间，结束时间，地点，授课教师，说明"
                        value={courseImportText}
                      />
                      <ActionButton
                        aria-label="一键导入课程"
                        className="mt-3 w-full"
                        disabled={!courseImportPreview.canImport || courseImportLoading}
                        loading={isSaving || courseImportLoading}
                        onClick={() => void importCourses()}
                        title={courseImportPreview.canImport ? "一键导入课程" : "请先处理导入预览中的问题"}
                        variant="secondary"
                      >
                        一键导入课程
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </section>
              ) : (
              <section className="tt-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="tt-block-title">课程安排</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">按时间顺序查看全部课程、地点和授课教师。</p>
                  </div>
                  <span className="tt-pill">{courseSessions.length} 节</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {courseSessions.length === 0 ? (
                    <EmptyState description="管理员发布课程后，这里会显示你的课程安排。" icon={CalendarDays} title="暂无课程安排" />
                  ) : (
                    teacherCourseTimeline.map((course, index) => (
                      <article
                        key={course.id}
                        className="grid gap-3 rounded-2xl border border-slate-200/75 bg-white/78 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/8 sm:grid-cols-[88px_minmax(0,1fr)]"
                      >
                        <div className="flex items-center gap-2 sm:block">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-black text-blue-700">
                            {index + 1}
                          </span>
                          <div className="min-w-0 sm:mt-2">
                            <p className="truncate text-xs font-bold text-[#1a6fd4]">{course.courseDate}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {[course.startTime, course.endTime].filter(Boolean).join("-") || "时间待补充"}
                            </p>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-950">{course.title}</p>
                            {teacherNextCourse?.id === course.id ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                                下一节课
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {[course.location, course.instructor].filter(Boolean).join(" · ") || "课程信息待补充"}
                          </p>
                          {course.description ? (
                            <p className="mt-3 text-sm leading-6 text-slate-500">{course.description}</p>
                          ) : null}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
              )
              ) : null}

              {showTeacherTrainingSection("checkins") ? (
              <section className="tt-card p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="tt-block-title">
                      {canManage ? "发布签到任务" : "课程定位签到"}
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      {canManage
                        ? "为当天课程发布定位签到，参训教师在省培账号里自行完成签到。"
                        : "到达授课地点后点击定位签到，管理员可导出最终课程签到名单。"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tt-pill">{selectedCohort.checkInTasks.length} 个任务</span>
                    {canManage ? (
                      <>
                        <button
                          className="inline-flex h-8 items-center rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700"
                          disabled={filteredCheckInTasks.length === 0}
                          onClick={() =>
                            setVisibleSelection(
                              filteredCheckInTasks.map((task) => task.id),
                              selectedCheckInTaskIds,
                              setSelectedCheckInTaskIds,
                            )
                          }
                          type="button"
                        >
                          全选/取消当前结果
                        </button>
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={selectedCheckInTaskIds.length === 0 || isSaving}
                          onClick={() => void removeSelectedCheckInTasks()}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          批量删除签到任务
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {canManage ? (
                  <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                    <div className="grid content-start gap-3 md:grid-cols-2">
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>签到标题</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("签到标题")}
                          onChange={(event) => setCheckInDraft((current) => ({ ...current, title: event.target.value }))}
                          placeholder="签到标题"
                          value={checkInDraft.title}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>绑定课程</span>
                        <select
                          className={fieldClassName}
                          {...fieldHint("绑定课程")}
                          onChange={(event) => setCheckInDraft((current) => ({ ...current, courseSessionId: event.target.value }))}
                          value={checkInDraft.courseSessionId}
                        >
                          <option value="">不绑定课程</option>
                          {courseSessions.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.courseDate} · {course.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid gap-3 md:col-span-2">
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>签到日期</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("签到日期")}
                            onChange={(event) => setCheckInDraft((current) => ({ ...current, signDate: event.target.value }))}
                            type="date"
                            value={checkInDraft.signDate}
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className={teacherTrainingFieldShellClassName}>
                            <span className={teacherTrainingFieldLabelClassName}>签到开始时间</span>
                            <input
                              className={fieldClassName}
                              {...fieldHint("签到开始时间")}
                              onChange={(event) => setCheckInDraft((current) => ({ ...current, startTime: event.target.value }))}
                              type="time"
                              value={checkInDraft.startTime}
                            />
                          </label>
                          <label className={teacherTrainingFieldShellClassName}>
                            <span className={teacherTrainingFieldLabelClassName}>签到结束时间</span>
                            <input
                              className={fieldClassName}
                              {...fieldHint("签到结束时间")}
                              onChange={(event) => setCheckInDraft((current) => ({ ...current, endTime: event.target.value }))}
                              type="time"
                              value={checkInDraft.endTime}
                            />
                          </label>
                        </div>
                      </div>
                      <label className={`${teacherTrainingFieldShellClassName} md:col-span-2`}>
                        <span className={teacherTrainingFieldLabelClassName}>签到地点</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("签到地点")}
                          onChange={(event) => setCheckInDraft((current) => ({ ...current, locationName: event.target.value }))}
                          placeholder="签到地点"
                          value={checkInDraft.locationName}
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px] md:col-span-2">
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>签到地点纬度</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("签到地点纬度")}
                            onChange={(event) => setCheckInDraft((current) => ({ ...current, latitude: event.target.value }))}
                            placeholder="纬度"
                            value={checkInDraft.latitude}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>签到地点经度</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("签到地点经度")}
                            onChange={(event) => setCheckInDraft((current) => ({ ...current, longitude: event.target.value }))}
                            placeholder="经度"
                            value={checkInDraft.longitude}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>有效签到范围米数</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("有效签到范围米数")}
                            onChange={(event) => setCheckInDraft((current) => ({ ...current, radiusMeters: event.target.value }))}
                            placeholder="范围/米"
                            value={checkInDraft.radiusMeters}
                          />
                        </label>
                      </div>
                      <p className="rounded-xl border border-blue-100 bg-blue-50/75 px-3 py-2 text-xs leading-5 text-blue-700 md:col-span-2">
                        未填写经纬度时，教师仍需授权定位；系统记录教师当前位置但不做距离校验。定位失败时可由管理端人工补签。
                      </p>
                      <div className="flex flex-wrap gap-2 md:col-span-2">
                        <button
                          className="depth-button-secondary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold"
                          aria-label="使用当前位置填入签到坐标"
                          onClick={useCurrentLocationForCheckInTask}
                          title="使用当前位置填入签到坐标"
                          type="button"
                        >
                          <Navigation className="h-4 w-4" />
                          使用当前位置
                        </button>
                        <ActionButton
                          aria-label="发布课程定位签到任务"
                          loading={isSaving}
                          onClick={() => void submitCheckInTask()}
                          title="发布课程定位签到任务"
                          variant="primary"
                        >
                          {checkInDraft.id ? "保存签到修改" : "发布签到任务"}
                        </ActionButton>
                        {checkInDraft.id ? (
                          <button
                            className="depth-button-secondary inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold"
                            onClick={() => setCheckInDraft(createDefaultCheckInTaskDraft())}
                            type="button"
                          >
                            取消修改
                          </button>
                        ) : null}
                      </div>
                      {locationMessage ? <p className="text-xs text-slate-500 md:col-span-2">{locationMessage}</p> : null}
                    </div>

                    <div className="tt-subcard flex min-h-0 flex-col p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[15px] font-bold text-slate-950">签到进度</p>
                        <span className="tt-pill">{selectedCohort.checkInTasks.length} 场</span>
                      </div>
                      <label className={`${teacherTrainingFieldShellClassName} mt-3`}>
                        <span className={teacherTrainingFieldLabelClassName}>搜索课程签到教师</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("搜索课程签到教师")}
                          onChange={(event) => setCheckInSearch(event.target.value)}
                          placeholder="按教师姓名、单位、分组或签到记录搜索"
                          value={checkInSearch}
                        />
                      </label>
                      <TeacherTrainingFilterSummary
                        items={teacherTrainingFilterSummaries.checkins}
                        onClear={
                          checkInSearchKeyword || teacherTrainingDetailViewTitle
                            ? () => {
                                setCheckInSearch("");
                                setTeacherTrainingDetailViewTitle("");
                              }
                            : undefined
                        }
                      />
                      <div className={`mt-3 space-y-3 ${teacherTrainingFillingListClassName}`}>
                        {filteredCheckInTasks.length === 0 ? (
                          <div className="tt-empty-fill">
                            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#1a6fd4]">
                              <MapPin className="h-6 w-6" />
                            </span>
                            <p className="text-sm font-semibold text-slate-700">暂无课程签到</p>
                            <p className="max-w-[240px] text-xs leading-5 text-slate-400">发布签到任务后，这里会显示各场签到进度。</p>
                          </div>
                        ) : (
                          filteredCheckInTasks.map((task) => {
                            const windowState = Workspace.getTeacherTrainingCheckInWindowState(task, checkInNow);
                            const progress = getCheckInProgress(task);
                            const visibleRecords = getVisibleCheckInRecords(task);
                            const visibleUnsignedParticipants = getUnsignedCheckInParticipants(task);
                            const manualCheckInParticipant = selectedCohort.participants.find(
                              (participant) => participant.id === manualCheckInDraft.participantId,
                            );
                            const isManualCheckInOpen = manualCheckInDraft.checkInTaskId === task.id;
                            return (
                              <article
                                key={task.id}
                                className="rounded-2xl border border-slate-200/75 bg-white/82 p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/8"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {canManage ? (
                                        <input
                                          checked={selectedCheckInTaskIds.includes(task.id)}
                                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                          {...fieldHint(`选择签到任务：${task.title}`)}
                                          onChange={() =>
                                            setSelectedCheckInTaskIds((current) => toggleSelectedId(current, task.id))
                                          }
                                          type="checkbox"
                                        />
                                      ) : null}
                                      <p className="truncate text-sm font-bold text-slate-950">{task.title}</p>
                                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${checkInWindowStyleMap[windowState]}`}>
                                        {Workspace.getTeacherTrainingCheckInWindowLabel(windowState)}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                      {[task.signDate, [task.startTime, task.endTime].filter(Boolean).join("-"), task.locationName]
                                        .filter(Boolean)
                                        .join(" · ") || "未设置地点"}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-xs font-bold text-blue-700">
                                    {progress.signed}/{progress.total}
                                  </span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600"
                                    onClick={() => editCheckInTask(task)}
                                    type="button"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    修改
                                  </button>
                                  <button
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600"
                                    onClick={() => void removeCheckInTask(task)}
                                    type="button"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    删除
                                  </button>
                                </div>
                                <div className="mt-3 flex items-center gap-3">
                                  <div
                                    aria-label={`签到率 ${progress.percent}%`}
                                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
                                    style={{
                                      background: `conic-gradient(#2563eb ${progress.percent}%, #e2e8f0 0)`,
                                    }}
                                  >
                                    <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-900">
                                      {progress.percent}%
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500"
                                        style={{ width: `${progress.percent}%` }}
                                      />
                                    </div>
                                    <p className="mt-1 text-[11px] text-slate-400">课程开始后可快速判断未签到人员。</p>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span className="font-semibold text-slate-700">签到率 {progress.percent}%</span>
                                  <span className="text-slate-300">/</span>
                                  <span>已签到 {progress.signed} 人</span>
                                  <span className="text-slate-300">/</span>
                                  <span>未签到 {progress.unsigned} 人</span>
                                  <span className="text-slate-300">/</span>
                                  <span>范围 {task.radiusMeters} 米</span>
                                </div>
                                {visibleRecords.length > 0 ? (
                                  <div className="mt-3 grid gap-2">
                                    {visibleRecords.map((record) => {
                                      const participant = participantById.get(record.participantId);
                                      return (
                                        <div key={record.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                          <span className="font-semibold text-slate-900">{record.participantName}</span>
                                          <TeacherTrainingCheckInRecordStatusBadge className="ml-2" status={record.status} />
                                          {participant?.organization ? <span> · {participant.organization}</span> : null}
                                          <span> · {record.signedAt}</span>
                                          {record.accuracy !== null ? <span> · 精度 {Math.round(record.accuracy)} 米</span> : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : checkInSearchKeyword ? (
                                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                                    这个签到任务下没有匹配的教师记录。
                                  </p>
                                ) : null}
                                {visibleUnsignedParticipants.length > 0 ? (
                                  <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-bold text-amber-800">未签到教师</p>
                                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                        可人工补签
                                      </span>
                                    </div>
                                    <div className="mt-2 grid gap-2">
                                      {visibleUnsignedParticipants.map((participant) => (
                                        <div
                                          key={participant.id}
                                          className="flex flex-col gap-2 rounded-lg bg-white/86 px-3 py-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <span>
                                            <span className="font-semibold text-slate-900">{participant.name}</span>
                                            {participant.organization ? <span> · {participant.organization}</span> : null}
                                          </span>
                                          <button
                                            className="inline-flex h-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                                            onClick={() => openManualCheckIn(task, participant)}
                                            type="button"
                                          >
                                            人工补签
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                                {isManualCheckInOpen && manualCheckInParticipant ? (
                                  <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                                    <p className="text-xs font-bold text-blue-800">
                                      人工补签：{manualCheckInParticipant.name}
                                    </p>
                                    <textarea
                                      className={`${fieldClassName} mt-2 min-h-20`}
                                      {...fieldHint(`${manualCheckInParticipant.name}人工补签原因`)}
                                      onChange={(event) =>
                                        setManualCheckInDraft((current) => ({
                                          ...current,
                                          note: event.target.value,
                                        }))
                                      }
                                      placeholder="请填写原因，例如：定位失败，现场人工确认"
                                      value={manualCheckInDraft.note}
                                    />
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        className="inline-flex h-8 items-center justify-center rounded-lg bg-[#1f64f2] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                                        disabled={isSaving || !manualCheckInDraft.note.trim()}
                                        onClick={() => void submitManualCheckIn()}
                                        type="button"
                                      >
                                        确认补签
                                      </button>
                                      <button
                                        className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
                                        onClick={() =>
                                          setManualCheckInDraft({
                                            checkInTaskId: "",
                                            participantId: "",
                                            note: "定位失败，现场人工确认",
                                          })
                                        }
                                        type="button"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </article>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <div
                      aria-label="省培定位签到状态"
                      className="rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.96)_48%,rgba(14,165,233,0.08))] p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-950">我的签到状态</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {teacherCheckInSummaryText} · {teacherCheckInProgressMetaText}
                          </p>
                        </div>
                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${teacherCheckInSummaryToneClassName}`}
                        >
                          {teacherCheckInSummaryText}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500"
                          style={{ width: `${teacherCheckInCompletionPercent}%` }}
                        />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {teacherCheckInProgressItems.length === 0 ? (
                          <div className="rounded-xl border border-slate-100 bg-white/76 px-3 py-2 text-xs font-semibold text-slate-500">
                            暂无签到任务
                          </div>
                        ) : (
                          teacherCheckInProgressItems.map((item) => (
                            <button
                              key={item.id}
                              className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition hover:-translate-y-0.5 ${item.toneClassName}`}
                              onClick={() => focusTeacherCheckInTask(item.id)}
                              title={`${item.title}：${item.statusLabel}`}
                              type="button"
                            >
                              <span className="block truncate text-slate-900">{item.title}</span>
                              <span className="mt-1 block">{item.statusLabel}</span>
                              <span className="mt-1 block text-[11px] font-medium text-slate-500">
                                {item.signedAt || item.detail}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    {selectedCohort.checkInTasks.length === 0 ? (
                      <EmptyState description="管理员发布课程签到后，这里会显示定位签到入口。" icon={MapPin} title="暂无签到任务" />
                    ) : (
                      selectedCohort.checkInTasks.map((task) => {
                        const signedRecord = task.records.find((record) => record.participantId === selectedParticipant?.id);
                        const windowState = Workspace.getTeacherTrainingCheckInWindowState(task, checkInNow);
                        const isWindowOpen = windowState === "open";
                        const isSigningThisTask = checkInSigningId === task.id;
                        const checkInDisabledReason = getTeacherTrainingCheckInDisabledReason(windowState, hasSelectedParticipant);
                        const signedRecordStatus = signedRecord ? getTeacherTrainingCheckInRecordStatusMeta(signedRecord.status) : null;
                        const alreadySignedReason = signedRecord
                          ? signedRecord.status === "manual"
                            ? "管理员已补签，无需重复定位"
                            : "已完成签到，无需重复提交"
                          : "";
                        return (
                          <div
                            id={`teacher-training-checkin-${task.id}`}
                            key={task.id}
                            className="grid gap-3 rounded-2xl border border-slate-200/75 bg-white/78 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-950">{task.title}</p>
                                <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${checkInWindowStyleMap[windowState]}`}>
                                  {Workspace.getTeacherTrainingCheckInWindowLabel(windowState)}
                                </span>
                                {signedRecord ? (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                    已签到
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                                    未签到
                                  </span>
                                )}
                                {signedRecordStatus ? (
                                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${signedRecordStatus.className}`}>
                                    {signedRecordStatus.label}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-slate-500">
                                {[task.signDate, task.startTime, task.endTime, task.locationName].filter(Boolean).join(" · ")}
                              </p>
                              {signedRecord ? (
                                <p className="mt-1 text-xs text-slate-400">
                                  {signedRecord.signedAt}
                                  {signedRecord.distanceMeters !== null ? ` · 距离 ${signedRecord.distanceMeters} 米` : ""}
                                  {signedRecord.accuracy !== null ? ` · 精度 ${Math.round(signedRecord.accuracy)} 米` : ""}
                                </p>
                              ) : null}
                            </div>
                            <button
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1f64f2] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#174ecb] disabled:cursor-not-allowed disabled:bg-slate-300"
                              aria-label="定位签到，浏览器会请求当前位置权限"
                              disabled={Boolean(checkInDisabledReason || alreadySignedReason) || isSaving || isSigningThisTask}
                              onClick={() => signWithCurrentLocation(task.id)}
                              title={checkInDisabledReason || alreadySignedReason || "定位签到，浏览器会请求当前位置权限"}
                              type="button"
                            >
                              {isSigningThisTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                              {isSigningThisTask
                                ? "定位中"
                                : isWindowOpen
                                  ? signedRecord
                                    ? signedRecord.status === "manual"
                                      ? "已补签"
                                      : "已签到"
                                    : "定位签到"
                                  : Workspace.getTeacherTrainingCheckInWindowLabel(windowState)}
                            </button>
                            {checkInDisabledReason ? (
                              <p className={`${teacherTrainingDisabledHintClassName} lg:col-start-2 lg:max-w-56`}>
                                {checkInDisabledReason}
                              </p>
                            ) : null}
                            {!checkInDisabledReason && alreadySignedReason ? (
                              <p className={`${teacherTrainingDisabledHintClassName} lg:col-start-2 lg:max-w-56`}>
                                {alreadySignedReason}
                              </p>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    {locationMessage ? <p className="text-xs text-slate-500">{locationMessage}</p> : null}
                  </div>
                )}
              </section>
              ) : null}

              {showTeacherTrainingSection("leave") ? (
              <section className="tt-card p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="tt-block-title">
                      {canManage ? "请假审批" : "临时请假"}
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      {canConfigureTeacherTrainingLeaveFlow
                        ? "系统管理员维护审批规则，管理人员按规则处理请假申请。"
                        : canManage
                          ? "查看当前班次待审批和全部请假申请，按已配置流程处理审批。"
                        : "临时请假会按管理员配置的审批步骤流转，最终批准后自动写入请假签到记录。"}
                    </p>
                  </div>
                  <span className="tt-pill tt-pill-neutral">{selectedCohort.leaveRequests.length} 条请假</span>
                </div>

                {canManage ? (
                  <>
                  <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200/75 bg-slate-50/80 p-2">
                    {teacherTrainingLeavePanelItems
                      .filter((item) => item.visible)
                      .map((item) => {
                        const isActive =
                          activeLeavePanel === item.key ||
                          (!canConfigureTeacherTrainingLeaveFlow && activeLeavePanel === "rules" && item.key === "pending");
                        return (
                          <button
                            key={item.key}
                            className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                              isActive
                                ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-100"
                                : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                            }`}
                            aria-label={`查看省培请假${item.label}`}
                            onClick={() => setActiveLeavePanel(item.key)}
                            title={`查看省培请假${item.label}`}
                            type="button"
                          >
                            {item.label}
                            {item.count !== null ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                {item.count}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                  </div>
                  <div
                    className={`mt-4 grid gap-4 ${
                      canConfigureTeacherTrainingLeaveFlow && activeLeavePanel === "rules" ? "xl:grid-cols-[minmax(0,1fr)]" : ""
                    }`}
                  >
                    {canConfigureTeacherTrainingLeaveFlow && activeLeavePanel === "rules" ? (
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">请假流程设置</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            审批规则仅由系统管理员维护，保存后适用于当前班次请假申请流转。
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-slate-500">审批步骤</p>
                          <button
                            className="depth-button-secondary inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold"
                            aria-label="增加省培请假审批步骤"
                            onClick={() =>
                              setLeaveFlowSteps((current) => {
                                const baseSteps = current.length ? current : activeLeaveFlowSteps;
                                return [
                                  ...baseSteps,
                                  {
                                    key: `step-${baseSteps.length + 1}`,
                                    name: getTeacherTrainingLeaveFlowStepName(baseSteps.length),
                                    approverIds: [],
                                    requiredCount: 1,
                                  },
                                ];
                              })
                            }
                            title="增加省培请假审批步骤"
                            type="button"
                          >
                            增加步骤
                          </button>
                        </div>
                      {activeLeaveFlowSteps.length === 0 ? (
                        <EmptyState description="先增加审批步骤，再选择审批人和每步通过人数；保存后教师才能提交请假。" icon={FileCheck} title="未配置流程" />
                      ) : (
                        activeLeaveFlowSteps.map((step, index) => (
                          <div key={step.key} className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                            <div className="grid gap-3 md:grid-cols-[1fr_150px]">
                              <label className={teacherTrainingFieldShellClassName}>
                                <span className={teacherTrainingFieldLabelClassName}>请假审批步骤名称</span>
                                <input
                                  className={fieldClassName}
                                  {...fieldHint("请假审批步骤名称")}
                                  onChange={(event) => updateLeaveFlowStep(index, { name: event.target.value })}
                                  placeholder="步骤名称"
                                  value={step.name}
                                />
                              </label>
                              <label className={teacherTrainingFieldShellClassName}>
                                <span className={teacherTrainingFieldLabelClassName}>请假审批每步通过人数</span>
                                <input
                                  className={fieldClassName}
                                  {...fieldHint("请假审批每步通过人数")}
                                  min={1}
                                  max={Math.max(1, step.approverIds.length)}
                                  onChange={(event) =>
                                    updateLeaveFlowStep(index, { requiredCount: Number(event.target.value) || 1 })
                                  }
                                  placeholder="每步通过人数"
                                  type="number"
                                  value={step.requiredCount}
                                />
                              </label>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                已选 {step.approverIds.length} 人
                              </span>
                              {step.approverIds.length === 0 ? (
                                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                                  审批流程不完整
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {teacherTrainingApproverOptions.length === 0 ? (
                                <span className="text-xs text-slate-400">暂无可选审批人</span>
                              ) : (
                                teacherTrainingApproverOptions.map((approver) => {
                                  const approverLabel = approverLabelById.get(approver.id) ?? approver.name;
                                  return (
                                    <label
                                      key={approver.id}
                                      className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                                        step.approverIds.includes(approver.id)
                                          ? "border-blue-200 bg-blue-50 text-blue-700"
                                          : "border-slate-200 bg-white text-slate-500"
                                      }`}
                                    >
                                      <input
                                        checked={step.approverIds.includes(approver.id)}
                                        className="sr-only"
                                        {...fieldHint(`选择${approverLabel}作为${step.name || "当前步骤"}审批人`)}
                                        onChange={() => toggleLeaveApprover(index, approver.id)}
                                        type="checkbox"
                                      />
                                      {approverLabel}
                                    </label>
                                  );
                                })
                              )}
                            </div>
                            <button
                              className="mt-3 text-xs font-semibold text-rose-500"
                              aria-label={`删除${step.name || "当前"}审批步骤`}
                              onClick={() =>
                                setLeaveFlowSteps((current) =>
                                  (current.length ? current : activeLeaveFlowSteps).filter((_, stepIndex) => stepIndex !== index),
                                )
                              }
                              title={`删除${step.name || "当前"}审批步骤`}
                              type="button"
                            >
                              删除本步骤
                            </button>
                          </div>
                        ))
                      )}
                      <ActionButton
                        aria-label="保存省培请假审批流程"
                        disabled={!selectedCohort || Boolean(leaveFlowConfigurationInvalidReason)}
                        loading={isSaving}
                        onClick={() => void saveLeaveFlow()}
                        title={leaveFlowConfigurationInvalidReason || "保存省培请假审批流程"}
                        variant="primary"
                      >
                        保存请假流程
                      </ActionButton>
                      {leaveFlowConfigurationInvalidReason ? (
                        <p className={`${teacherTrainingDisabledHintClassName} mt-3`}>
                          {leaveFlowConfigurationInvalidReason}
                        </p>
                      ) : null}
                      </div>
                    ) : null}

                    {activeLeavePanel !== "rules" ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200/75 bg-white/92 shadow-sm shadow-blue-100/40">
                      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {activeLeavePanel === "pending" ? "待审批申请" : "全部请假申请"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            按请假申请表方式集中查看，全部审批通过后才允许导出 PDF 请假单。
                          </p>
                        </div>
                        <label className={`${teacherTrainingFieldShellClassName} w-full lg:max-w-[360px]`}>
                          <span className={teacherTrainingFieldLabelClassName}>搜索请假教师</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("搜索请假教师")}
                            onChange={(event) => setLeaveSearch(event.target.value)}
                            placeholder="姓名、单位、原因或审批状态"
                            value={leaveSearch}
                          />
                        </label>
                      </div>
                      <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                        <TeacherTrainingFilterSummary
                          items={teacherTrainingFilterSummaries.leave}
                          onClear={
                            leaveSearchKeyword || teacherTrainingDetailViewTitle
                              ? () => {
                                  setLeaveSearch("");
                                  setTeacherTrainingDetailViewTitle("");
                                }
                              : undefined
                          }
                        />
                        {teacherTrainingDownloadStatus ? (
                          <p className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs leading-5 text-blue-700">
                            {teacherTrainingDownloadStatus}
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 p-4">
                        {displayedManagerLeaveRequests.length === 0 ? (
                          <div className="py-12">
                            <EmptyState description="教师提交请假申请后，会进入这里等待审批。" icon={FileCheck} title="暂无请假申请" />
                          </div>
                        ) : (
                          displayedManagerLeaveRequests.map((request) => {
                                const step = request.status === "pending" ? request.approvalSteps[request.currentStepIndex] : null;
                                const reviewedApproverLabels = request.approvals
                                  .map((approval) => approverLabelById.get(approval.approverId) ?? approval.approverName)
                                  .filter(Boolean);
                                const currentApproverLabels =
                                  step?.approverIds.map((id) => approverLabelById.get(id) ?? "未配置审批人").filter(Boolean) ?? [];
                                const approverSummary = reviewedApproverLabels.length
                                  ? reviewedApproverLabels.join("、")
                                  : request.status === "pending"
                                    ? currentApproverLabels.join("、") || "未配置审批人"
                                    : "暂无审批记录";
                                const leaveStatusClassName =
                                  request.status === "approved"
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                    : request.status === "rejected"
                                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
                                const leaveStageLabel =
                                  request.status === "approved"
                                    ? "审批完成"
                                    : request.status === "rejected"
                                      ? "已驳回"
                                      : step
                                        ? `${step.name}（需${step.requiredCount}人）`
                                        : "待审批";
                                const canReviewThisRequest =
                                  request.status === "pending" && Boolean(step?.approverIds.includes(currentUser?.id ?? ""));
                                const activeReviewAction =
                                  activeLeaveReviewAction?.leaveRequestId === request.id ? activeLeaveReviewAction.decision : null;

                                return (
                                  <article
                                    key={request.id}
                                    className="rounded-2xl border border-slate-200/75 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md hover:shadow-blue-950/5"
                                  >
                                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(220px,0.7fr)_minmax(260px,0.8fr)]">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-base font-bold text-slate-950">{request.participantName}</p>
                                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                            {request.sessionLabel}
                                          </span>
                                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${leaveStatusClassName}`}>
                                            {request.statusLabel}
                                          </span>
                                        </div>
                                        <p className="mt-1 truncate text-xs text-slate-500" title={request.organization}>
                                          {request.organization}
                                        </p>
                                        <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                                            <p className="text-[11px] font-semibold text-slate-400">请假开始</p>
                                            <p className="mt-0.5 font-semibold">{formatTeacherTrainingLeaveDateTime(request.startDate, request.startTime)}</p>
                                          </div>
                                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                                            <p className="text-[11px] font-semibold text-slate-400">请假结束</p>
                                            <p className="mt-0.5 font-semibold">{formatTeacherTrainingLeaveDateTime(request.endDate, request.endTime)}</p>
                                          </div>
                                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                                            <p className="text-[11px] font-semibold text-slate-400">请假时长</p>
                                            <p className="mt-0.5 font-bold text-slate-950">{getTeacherTrainingLeaveDurationLabel(request)}</p>
                                          </div>
                                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                                            <p className="text-[11px] font-semibold text-slate-400">申请时间</p>
                                            <p className="mt-0.5 font-semibold">{request.submittedAt}</p>
                                          </div>
                                        </div>
                                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                                          <p className="text-[11px] font-semibold text-slate-400">请假原因</p>
                                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.reason}</p>
                                        </div>
                                      </div>

                                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                                        <p className="text-xs font-bold text-slate-500">审批状态</p>
                                        <p className="mt-2 text-sm font-bold text-slate-950">{leaveStageLabel}</p>
                                        <p className="mt-2 text-xs leading-5 text-slate-500" title={approverSummary}>
                                          {approverSummary}
                                        </p>
                                      </div>

                                      <div className="flex flex-col gap-3">
                                        {request.status === "approved" ? (
                                          <button
                                            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-700 disabled:cursor-wait disabled:opacity-60"
                                            aria-label={`导出${request.participantName}的 PDF 请假单`}
                                            disabled={downloadingTeacherTrainingFile === `/api/teacher-training/leave-requests/${request.id}/pdf`}
                                            onClick={() =>
                                              void downloadTeacherTrainingFile({
                                                url: `/api/teacher-training/leave-requests/${request.id}/pdf`,
                                                label: "PDF请假单",
                                                fallbackName: `${selectedCohort.title}-${request.participantName}-请假单.pdf`,
                                              })
                                            }
                                            title={`导出${request.participantName}的 PDF 请假单`}
                                            type="button"
                                          >
                                            导出PDF
                                          </button>
                                        ) : (
                                          <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">
                                            审批后导出
                                          </span>
                                        )}
                                        {canReviewThisRequest ? (
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"
                                              aria-label={`通过${request.participantName}的请假申请`}
                                              disabled={isSaving}
                                              onClick={() => void reviewLeaveRequest(request.id, "approve")}
                                              title={`通过${request.participantName}的请假申请`}
                                              type="button"
                                            >
                                              {activeReviewAction === "approve" ? "确认通过" : "通过"}
                                            </button>
                                            <button
                                              className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600"
                                              aria-label={`驳回${request.participantName}的请假申请`}
                                              disabled={isSaving}
                                              onClick={() => void reviewLeaveRequest(request.id, "reject")}
                                              title={`驳回${request.participantName}的请假申请`}
                                              type="button"
                                            >
                                              {activeReviewAction === "reject" ? "确认驳回" : "驳回"}
                                            </button>
                                          </div>
                                        ) : null}
                                        {canReviewThisRequest && activeReviewAction ? (
                                          <label className={teacherTrainingFieldShellClassName}>
                                            <span className={teacherTrainingFieldLabelClassName}>
                                              {activeReviewAction === "approve" ? "通过意见（可选）" : "驳回意见（建议填写）"}
                                            </span>
                                            <textarea
                                              className={`${textareaClassName} min-h-24 bg-white text-sm`}
                                              {...fieldHint(`${request.participantName}请假审批意见`)}
                                              onChange={(event) =>
                                                setLeaveReviewCommentsById((current) => ({
                                                  ...current,
                                                  [request.id]: event.target.value,
                                                }))
                                              }
                                              placeholder="可填写审批意见"
                                              value={leaveReviewCommentsById[request.id] ?? ""}
                                            />
                                          </label>
                                        ) : null}
                                      </div>
                                    </div>
                                  </article>
                                );
                              })
                            )}
                      </div>
                    </div>
                    ) : null}
                  </div>
                  </>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white/92 p-4">
                      <span className="inline-flex h-9 items-center rounded-b-xl bg-[#4f86e8] px-4 text-sm font-bold text-white">
                        首页指南
                      </span>
                      <div className="mt-4 space-y-2 text-sm leading-7 text-slate-700">
                        <p>欢迎使用省培请假管理。</p>
                        <p>请假申请提交后，将按当前班次的审批流程流转；审批通过后，可导出带电子签的 PDF 请假单。</p>
                      </div>
                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-[760px] text-left text-xs">
                          <thead className="border-y border-slate-200 bg-slate-50 text-slate-600">
                            <tr className="[&>th]:px-3 [&>th]:py-2">
                              <th>人员类别</th>
                              <th>请假类型</th>
                              <th>时间要求</th>
                              <th>审批流程</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-600">
                            <tr className="[&>td]:px-3 [&>td]:py-2">
                              <td>参训教师</td>
                              <td>请假</td>
                              <td>需填写开始和结束日期、时间</td>
                              <td>
                                {selectedCohort.leaveFlow?.isEnabled && selectedCohort.leaveFlow.approvalSteps.length
                                  ? selectedCohort.leaveFlow.approvalSteps.map((step) => step.name).join(" → ")
                                  : "管理员尚未配置审批流程"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/92 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex h-9 items-center rounded-b-xl bg-[#4f86e8] px-4 text-sm font-bold text-white">
                          默认分类
                        </span>
                        <button
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1f64f2] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#174ecb]"
                          onClick={() => setTeacherLeaveFormOpen(true)}
                          type="button"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          新增请假
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <button
                          className="group flex min-h-[96px] items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-left transition hover:border-blue-200 hover:bg-blue-50/70"
                          onClick={() => setTeacherLeaveFormOpen(true)}
                          type="button"
                        >
                          <span>
                            <span className="block text-lg font-semibold text-slate-900">请假申请</span>
                            <span className="mt-1 block text-sm text-slate-400">点击进入</span>
                          </span>
                          <span className="grid h-12 w-12 place-items-center rounded-full bg-sky-500 text-white transition group-hover:scale-105">
                            <FileCheck className="h-5 w-5" />
                          </span>
                        </button>
                        <button
                          className="group flex min-h-[96px] items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-left transition hover:border-blue-200 hover:bg-blue-50/70"
                          onClick={() =>
                            document.getElementById("tt-teacher-leave-records")?.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
                          type="button"
                        >
                          <span>
                            <span className="block text-lg font-semibold text-slate-900">我的请假记录</span>
                            <span className="mt-1 block text-sm text-slate-400">{teacherLeaveRequests.length} 条记录</span>
                          </span>
                          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f4c20d] text-white transition group-hover:scale-105">
                            <FileText className="h-5 w-5" />
                          </span>
                        </button>
                      </div>
                    </div>

                    {teacherLeaveFormOpen ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95" id="tt-teacher-leave-form">
                        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                          <span className="inline-flex h-9 items-center rounded-b-xl bg-[#4f86e8] px-4 text-sm font-bold text-white">
                            基本信息
                          </span>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {[
                              ["姓名", selectedParticipant?.name ?? "参训教师"],
                              ["单位", selectedParticipant?.organization ?? "未绑定单位"],
                              ["手机号", selectedParticipant?.phone ?? "未填写"],
                            ].map(([label, value]) => (
                              <label key={label} className={teacherTrainingFieldShellClassName}>
                                <span className={teacherTrainingFieldLabelClassName}>{label}</span>
                                <input aria-label={label} className={fieldClassName} disabled value={value} />
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="px-4 py-4">
                          <span className="inline-flex h-9 items-center rounded-b-xl bg-[#4f86e8] px-4 text-sm font-bold text-white">
                            请假申请信息
                          </span>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={`${teacherTrainingFieldLabelClassName} inline-flex items-center`}>
                                申请日期
                                <span aria-hidden="true" className={teacherTrainingRequiredMarkClassName}>*</span>
                              </span>
                              <input aria-label="请假申请日期" className={fieldClassName} disabled value={getDateInputValue(new Date())} />
                            </label>
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={`${teacherTrainingFieldLabelClassName} inline-flex items-center`}>
                                请假类型
                                <span aria-hidden="true" className={teacherTrainingRequiredMarkClassName}>*</span>
                              </span>
                              <select
                                className={fieldClassName}
                                {...fieldHint("请假类型")}
                                onChange={(event) => setLeaveDraft((current) => ({ ...current, sessionLabel: event.target.value }))}
                                value={leaveDraft.sessionLabel}
                              >
                                <option value="请假">请假</option>
                                <option value="事假">事假</option>
                                <option value="病假">病假</option>
                                <option value="公假">公假</option>
                                <option value="其他">其他</option>
                              </select>
                            </label>
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={`${teacherTrainingFieldLabelClassName} inline-flex items-center`}>
                                请假开始日期
                                <span aria-hidden="true" className={teacherTrainingRequiredMarkClassName}>*</span>
                              </span>
                              <input
                                className={fieldClassName}
                                {...fieldHint("请假开始日期")}
                                onChange={(event) => setLeaveDraft((current) => ({ ...current, startDate: event.target.value }))}
                                type="date"
                                value={leaveDraft.startDate}
                              />
                            </label>
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={`${teacherTrainingFieldLabelClassName} inline-flex items-center`}>
                                请假开始时间
                                <span aria-hidden="true" className={teacherTrainingRequiredMarkClassName}>*</span>
                              </span>
                              <input
                                className={fieldClassName}
                                {...fieldHint("请假开始时间")}
                                onChange={(event) => setLeaveDraft((current) => ({ ...current, startTime: event.target.value }))}
                                type="time"
                                value={leaveDraft.startTime}
                              />
                            </label>
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={`${teacherTrainingFieldLabelClassName} inline-flex items-center`}>
                                请假结束日期
                                <span aria-hidden="true" className={teacherTrainingRequiredMarkClassName}>*</span>
                              </span>
                              <input
                                className={fieldClassName}
                                {...fieldHint("请假结束日期")}
                                onChange={(event) => setLeaveDraft((current) => ({ ...current, endDate: event.target.value }))}
                                type="date"
                                value={leaveDraft.endDate}
                              />
                            </label>
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={`${teacherTrainingFieldLabelClassName} inline-flex items-center`}>
                                请假结束时间
                                <span aria-hidden="true" className={teacherTrainingRequiredMarkClassName}>*</span>
                              </span>
                              <input
                                className={fieldClassName}
                                {...fieldHint("请假结束时间")}
                                onChange={(event) => setLeaveDraft((current) => ({ ...current, endTime: event.target.value }))}
                                type="time"
                                value={leaveDraft.endTime}
                              />
                            </label>
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={teacherTrainingFieldLabelClassName}>请假时长</span>
                              <input aria-label="请假时长" className={fieldClassName} disabled value={getTeacherTrainingLeaveDurationLabel(leaveDraft)} />
                            </label>
                            <label className={`${teacherTrainingFieldShellClassName} md:col-span-2 xl:col-span-3`}>
                              <span className={`${teacherTrainingFieldLabelClassName} inline-flex items-center`}>
                                请假原因
                                <span aria-hidden="true" className={teacherTrainingRequiredMarkClassName}>*</span>
                              </span>
                              <textarea
                                className={`${textareaClassName} min-h-24`}
                                {...fieldHint("请假原因")}
                                onChange={(event) => setLeaveDraft((current) => ({ ...current, reason: event.target.value }))}
                                placeholder="请填写请假原因"
                                value={leaveDraft.reason}
                              />
                            </label>
                          </div>
                        </div>

                        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs leading-5 text-slate-500">
                            提交后进入审批流程，审批完成前不能导出 PDF 请假单。
                          </p>
                          <div className="flex gap-2">
                            <ActionButton onClick={() => setTeacherLeaveFormOpen(false)}>取消</ActionButton>
                            <ActionButton
                              aria-label="提交省培请假申请"
                              disabled={Boolean(leaveDisabledReason)}
                              loading={isSaving}
                              onClick={() => void submitLeaveRequest()}
                              title={leaveDisabledReason || "提交省培请假申请"}
                              variant="primary"
                            >
                              提交请假
                            </ActionButton>
                          </div>
                        </div>
                        {leaveDisabledReason ? (
                          <p className={`${teacherTrainingDisabledHintClassName} mx-4 mb-4`}>
                            {leaveDisabledReason}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/92" id="tt-teacher-leave-records">
                      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">我的请假记录</p>
                          <p className="mt-1 text-xs text-slate-500">请假审批完成后，可在对应记录中导出 PDF 请假单。</p>
                        </div>
                        {teacherTrainingDownloadStatus ? (
                          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                            {teacherTrainingDownloadStatus}
                          </p>
                        ) : null}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px] text-left text-sm">
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                            <tr className="[&>th]:px-4 [&>th]:py-3">
                              <th>申请日期</th>
                              <th>请假类型</th>
                              <th>请假开始时间</th>
                              <th>请假结束时间</th>
                              <th>请假时长</th>
                              <th>请假原因</th>
                              <th>状态</th>
                              <th className="text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {teacherLeaveRequests.length ? (
                              teacherLeaveRequests.map((request) => {
                                const leaveStatusClassName =
                                  request.status === "approved"
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                    : request.status === "rejected"
                                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
                                return (
                                  <tr key={request.id} className="align-top text-slate-700 [&>td]:px-4 [&>td]:py-3">
                                    <td className="whitespace-nowrap text-xs text-slate-500">{request.submittedAt}</td>
                                    <td className="whitespace-nowrap">{request.sessionLabel}</td>
                                    <td className="whitespace-nowrap">{formatTeacherTrainingLeaveDateTime(request.startDate, request.startTime)}</td>
                                    <td className="whitespace-nowrap">{formatTeacherTrainingLeaveDateTime(request.endDate, request.endTime)}</td>
                                    <td className="whitespace-nowrap font-semibold text-slate-900">
                                      {getTeacherTrainingLeaveDurationLabel(request)}
                                    </td>
                                    <td>
                                      <p className="line-clamp-2 max-w-[260px] text-xs leading-5 text-slate-600" title={request.reason}>
                                        {request.reason}
                                      </p>
                                    </td>
                                    <td>
                                      <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${leaveStatusClassName}`}>
                                        {request.statusLabel}
                                      </span>
                                    </td>
                                    <td>
                                      <div className="flex justify-end">
                                        {request.status === "approved" ? (
                                          <button
                                            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-700 disabled:cursor-wait disabled:opacity-60"
                                            aria-label={`导出${request.startDate}请假 PDF`}
                                            disabled={downloadingTeacherTrainingFile === `/api/teacher-training/leave-requests/${request.id}/pdf`}
                                            onClick={() =>
                                              void downloadTeacherTrainingFile({
                                                url: `/api/teacher-training/leave-requests/${request.id}/pdf`,
                                                label: "PDF请假单",
                                                fallbackName: `${selectedCohort.title}-${request.startDate}-请假单.pdf`,
                                              })
                                            }
                                            title={`导出${request.startDate}请假 PDF`}
                                            type="button"
                                          >
                                            导出PDF
                                          </button>
                                        ) : (
                                          <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">
                                            审批后导出
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={8} className="px-4 py-14">
                                  <EmptyState description="点击上方请假申请，提交后这里会显示审批进度。" icon={FileCheck} title="暂无请假记录" />
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </section>
              ) : null}

              {!canManage && showTeacherTrainingSection("profile") ? (
              <section className="tt-card p-5">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                    <User className="h-4 w-4" />
                  </span>
                  <p className="text-[15px] font-bold text-slate-950">个人信息</p>
                </div>
                <div
                  aria-label="省培个人资料状态"
                  className="mt-4 rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.94)_48%,rgba(20,184,166,0.08))] p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-950">资料状态</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {teacherProfileStatusText} · 已完成 {teacherProfileCompletedCount}/{teacherProfileCompletionItems.length}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                        teacherProfileNeedsAttention ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {teacherProfileStatusText}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/78">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500"
                      style={{ width: `${teacherProfileCompletionPercent}%` }}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {teacherProfileCompletionItems.map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                          item.isComplete
                            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                            : "border-amber-100 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {item.isComplete ? item.completeLabel : item.incompleteLabel}
                      </div>
                    ))}
                  </div>
                </div>
                {teacherInitialProfileRequired ? (
                  <div className="mt-4 border-y border-amber-100 bg-amber-50/60 px-1 py-3">
                    <p className="text-sm font-bold text-amber-800">首次登录需先完善账号资料</p>
                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      请填写个人联系方式和邮箱，并把初始密码 123456 改成新密码；到达信息可稍后补充。
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs leading-5 text-blue-700">
                  姓名、单位、手机号和职务已从导入名单带入，可按实际情况修改；保存后会同步到管理端参训教师列表。
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className={teacherTrainingFieldShellClassName}>
                    <RequiredFieldLabel>个人姓名</RequiredFieldLabel>
                    <input
                      className={fieldClassName}
                      {...fieldHint("个人姓名")}
                      onChange={(event) => updateProfileDraftField("name", event.target.value)}
                      placeholder="姓名"
                      required
                      value={effectiveProfileDraft.name}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <RequiredFieldLabel>个人单位</RequiredFieldLabel>
                    <input
                      className={fieldClassName}
                      {...fieldHint("个人单位")}
                      onChange={(event) => updateProfileDraftField("organization", event.target.value)}
                      placeholder="单位"
                      required
                      value={effectiveProfileDraft.organization}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <RequiredFieldLabel>个人手机</RequiredFieldLabel>
                    <input
                      className={fieldClassName}
                      {...fieldHint("个人手机")}
                      onChange={(event) => updateProfileDraftField("phone", event.target.value)}
                      placeholder="手机"
                      required
                      value={effectiveProfileDraft.phone}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <RequiredFieldLabel>个人职务</RequiredFieldLabel>
                    <input
                      className={fieldClassName}
                      {...fieldHint("个人职务")}
                      onChange={(event) => updateProfileDraftField("title", event.target.value)}
                      placeholder="职务"
                      required
                      value={effectiveProfileDraft.title}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <RequiredFieldLabel>个人邮箱</RequiredFieldLabel>
                    <input
                      className={fieldClassName}
                      {...fieldHint("个人邮箱")}
                      onChange={(event) => updateProfileDraftField("email", event.target.value)}
                      placeholder="邮箱"
                      required
                      value={effectiveProfileDraft.email}
                    />
                  </label>
                  {teacherPasswordChangeRequired ? (
                    <div className="md:col-span-2 rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className={teacherTrainingFieldShellClassName}>
                          <RequiredFieldLabel>设置新密码</RequiredFieldLabel>
                          <input
                            className={fieldClassName}
                            {...fieldHint("设置新密码")}
                            onChange={(event) => updateProfileDraftField("password", event.target.value)}
                            placeholder="8-16位，含大小写字母和数字"
                            type="password"
                            value={effectiveProfileDraft.password}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellClassName}>
                          <RequiredFieldLabel>再次输入新密码</RequiredFieldLabel>
                          <input
                            className={fieldClassName}
                            {...fieldHint("再次输入新密码")}
                            onChange={(event) => updateProfileDraftField("passwordConfirm", event.target.value)}
                            placeholder="再次输入新密码"
                            type="password"
                            value={effectiveProfileDraft.passwordConfirm}
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-amber-700">
                        初始密码为 123456，首次保存资料时必须改掉；新密码需 8-16 位，并同时包含大写字母、小写字母和数字。
                      </p>
                    </div>
                  ) : null}
                  <div className="md:col-span-2">
                    <div className="mb-1 flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-[#1a6fd4]" />
                      <p className="text-sm font-semibold text-slate-900">预计报到 / 到达信息</p>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">到达信息可稍后补充；填写后用于报到统计、接站核对和现场联系。</p>
                  </div>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>预计到达时间</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("预计到达时间")}
                      onChange={(event) => updateProfileDraftField("arrivalAt", event.target.value)}
                      type="datetime-local"
                      value={effectiveProfileDraft.arrivalAt}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>交通方式</span>
                    <select
                      className={fieldClassName}
                      {...fieldHint("交通方式")}
                      onChange={(event) => updateProfileDraftField("arrivalTransportation", event.target.value)}
                      value={effectiveProfileDraft.arrivalTransportation}
                    >
                      {arrivalTransportationOptions.map((option) => (
                        <option key={option.value || "empty"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>车次/航班/车牌</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("车次/航班/车牌")}
                      onChange={(event) => updateProfileDraftField("arrivalVehicleNo", event.target.value)}
                      placeholder="如 G1234、MU5678、苏A12345"
                      value={effectiveProfileDraft.arrivalVehicleNo}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>出发地</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("出发地")}
                      onChange={(event) => updateProfileDraftField("arrivalDeparture", event.target.value)}
                      placeholder="出发城市、站点或机场"
                      value={effectiveProfileDraft.arrivalDeparture}
                    />
                  </label>
                  <label className={`${teacherTrainingFieldShellClassName} md:col-span-2`}>
                    <span className={teacherTrainingFieldLabelClassName}>个人备注或培训需求</span>
                    <textarea
                      className={`${textareaClassName} min-h-20`}
                      {...fieldHint("个人备注或培训需求")}
                      onChange={(event) => updateProfileDraftField("note", event.target.value)}
                      placeholder="个人备注或培训需求"
                      value={effectiveProfileDraft.note}
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <ActionButton
                    aria-label="保存省培个人信息"
                    disabled={Boolean(profileDisabledReason)}
                    loading={isSaving}
                    onClick={() => void submitProfile()}
                    title={profileDisabledReason || "保存省培个人信息"}
                    variant="primary"
                  >
                    保存个人信息
                  </ActionButton>
                  {profileDisabledReason ? (
                    <p className={`${teacherTrainingDisabledHintClassName} mt-3`}>
                      {profileDisabledReason}
                    </p>
                  ) : null}
                  {profileSaveStatus ? (
                    <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                      邮件提醒状态：{profileSaveStatus}
                    </p>
                  ) : null}
                </div>
              </section>
              ) : null}

              {canManage && showTeacherTrainingSection("participants") ? (
              <section className={teacherTrainingListCardClassName}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="tt-block-title">{isAccountManagementSection ? "省培账号管理" : "参训教师名单"}</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      {isAccountManagementSection
                        ? "集中处理省培身份绑定、账号通知、密码重置和解绑；创赛原平台账号与省培专用账号分开标识。"
                        : "集中查看省培教师报名档案、预录扩展信息和预计到达信息。"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tt-pill">
                      {filteredParticipants.length}/{selectedCohort.participants.length} 人
                    </span>
                    <button
                      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${
                        participantFormOpen
                          ? "bg-blue-600 text-white shadow-sm shadow-blue-900/15"
                          : "border border-blue-100 bg-white text-blue-700 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                      onClick={openParticipantFormWorkspace}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      新增教师
                    </button>
                    <button
                      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${
                        participantImportOpen
                          ? "bg-blue-600 text-white shadow-sm shadow-blue-900/15"
                          : "border border-blue-100 bg-white text-blue-700 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                      onClick={openParticipantImportWorkspace}
                      type="button"
                    >
                      <Upload className="h-4 w-4" />
                      导入名单
                    </button>
                    <button
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
                      aria-label="一键用手机号开通省培账号"
                      disabled={isSaving || !selectedCohort.participants.some((participant) => !participant.accountUserId && getPhoneAccountUsername(participant))}
                      onClick={() => void batchGeneratePhoneAccounts()}
                      title="给还没有省培登录账号且手机号有效的教师，用手机号开通账号；初始密码统一为 123456。已有账号不受影响。"
                      type="button"
                    >
                      <Copy className="h-4 w-4" />
                      一键手机号开通账号
                    </button>
                    <button
                      className="inline-flex h-9 items-center rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700"
                      disabled={filteredParticipants.length === 0}
                      onClick={() =>
                        setVisibleSelection(
                          filteredParticipants.map((participant) => participant.id),
                          selectedParticipantIds,
                          setSelectedParticipantIds,
                        )
                      }
                      type="button"
                    >
                      全选/取消当前结果
                    </button>
                    <button
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={selectedParticipantIds.length === 0 || isSaving}
                      onClick={() => void removeSelectedParticipants()}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      批量删除参训教师
                    </button>
                  </div>
                </div>

                {participantFormOpen ? (
                  <div
                    className="mt-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/35 to-white p-4 shadow-[0_18px_45px_-34px_rgba(26,111,212,0.45)]"
                    id="tt-participant-workbench"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-950">新增参训教师档案</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          先维护报名档案；登录账号可以选择已有账号，也可以保存后到省培账号管理中用手机号开通。
                        </p>
                      </div>
                      <button
                        className="inline-flex h-8 w-fit items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                        onClick={() => setParticipantFormOpen(false)}
                        type="button"
                      >
                        收起
                      </button>
                    </div>
                    <div className="mt-3 rounded-xl border border-blue-100 bg-white/75 px-3 py-2">
                      <p className="text-xs font-bold text-blue-700">档案必填</p>
                      <p className="mt-1 text-xs leading-5 text-blue-600">姓名、单位、手机号必须填写；职务和职称至少填写一项；分组可后续补充。</p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className={teacherTrainingFieldShellClassName}>
                        <RequiredFieldLabel>参训教师姓名</RequiredFieldLabel>
                        <input
                          id="tt-participant-name-input"
                          className={fieldClassName}
                          {...fieldHint("参训教师姓名")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, name: event.target.value }))}
                          placeholder="姓名"
                          value={participantDraft.name}
                        />
                      </label>
                      <label className={`${teacherTrainingFieldShellClassName} md:col-span-2 xl:col-span-2`}>
                        <RequiredFieldLabel>所在单位</RequiredFieldLabel>
                        <input
                          className={fieldClassName}
                          {...fieldHint("参训教师单位")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, organization: event.target.value }))}
                          placeholder="单位"
                          value={participantDraft.organization}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <RequiredFieldLabel>报名手机号</RequiredFieldLabel>
                        <input
                          className={fieldClassName}
                          {...fieldHint("参训教师手机")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, phone: event.target.value }))}
                          placeholder="11 位手机号"
                          value={participantDraft.phone}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>参训教师分组</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("参训教师分组")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, groupName: event.target.value }))}
                          placeholder="如一组、二组"
                          value={participantDraft.groupName}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <RequiredFieldLabel either>参训教师职务</RequiredFieldLabel>
                        <input
                          className={fieldClassName}
                          {...fieldHint("参训教师职务")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, title: event.target.value }))}
                          placeholder="职务；职务和职称至少填一项"
                          value={participantDraft.title}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <RequiredFieldLabel either>职称</RequiredFieldLabel>
                        <input
                          className={fieldClassName}
                          {...fieldHint("职称")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, professionalTitle: event.target.value }))}
                          placeholder="职称；职务和职称至少填一项"
                          value={participantDraft.professionalTitle}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>性别</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("性别")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, gender: event.target.value }))}
                          placeholder="选填"
                          value={participantDraft.gender}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>年龄</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("年龄")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, age: event.target.value }))}
                          placeholder="选填"
                          value={participantDraft.age}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>人员类别</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("人员类别")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, personnelCategory: event.target.value }))}
                          placeholder="如专任教师"
                          value={participantDraft.personnelCategory}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>学科</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("学科")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, subject: event.target.value }))}
                          placeholder="学科"
                          value={participantDraft.subject}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>所属市</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("所属市")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, city: event.target.value }))}
                          placeholder="所属市"
                          value={participantDraft.city}
                        />
                      </label>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>参训教师邮箱</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("参训教师邮箱")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, email: event.target.value }))}
                          placeholder="选填，教师首次登录可补填"
                          value={participantDraft.email}
                        />
                      </label>
                      <label className={`${teacherTrainingFieldShellClassName} md:col-span-2`}>
                        <span className={teacherTrainingFieldLabelClassName}>绑定已有登录账号（选填）</span>
                        <select
                          className={fieldClassName}
                          {...fieldHint("绑定已有登录账号")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, accountUsername: event.target.value }))}
                          value={participantDraft.accountUsername}
                        >
                          <option value="">暂不绑定，保存档案后用名单顶部按钮开通</option>
                          {availableParticipantAccountOptions.map((account) => (
                            <option key={account.id} value={account.username}>
                              {account.name}（{account.username}）
                              {account.phone ? ` · ${account.phone}` : ""}
                              {account.role === "training_teacher" ? " · 省培账号" : " · 原平台账号"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={`${teacherTrainingFieldShellClassName} md:col-span-2`}>
                        <span className={teacherTrainingFieldLabelClassName}>参训教师备注</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("参训教师备注")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, note: event.target.value }))}
                          placeholder="备注"
                          value={participantDraft.note}
                        />
                      </label>
                      <label className={`${teacherTrainingFieldShellClassName} md:col-span-2 xl:col-span-4`}>
                        <span className={teacherTrainingFieldLabelClassName}>参训教师预录扩展信息</span>
                        <textarea
                          className={`${textareaClassName} min-h-20`}
                          {...fieldHint("参训教师预录扩展信息")}
                          onChange={(event) => setParticipantDraft((current) => ({ ...current, extraInfo: event.target.value }))}
                          placeholder="预录扩展信息，例如住宿、发票、培训材料领取情况等；每行一项。"
                          value={participantDraft.extraInfo}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-slate-500">
                        这里先保存教师档案。没有合适账号时，保存后可在该教师条目里单独开通账号，也可用名单顶部批量开通；初始密码统一为 123456。
                      </p>
                      <ActionButton
                        aria-label="将参训教师加入当前省培班次"
                        className="w-full sm:w-auto"
                        disabled={!selectedCohort}
                        loading={isSaving}
                        onClick={() => void submitParticipant()}
                        title="将参训教师加入当前省培班次"
                        variant="primary"
                      >
                        加入名单
                      </ActionButton>
                    </div>
                  </div>
                ) : null}

                {participantImportOpen ? (
                  <div
                    className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/35 p-4"
                    id="tt-participant-import-workbench"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-950">批量导入参训教师</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">上传 Excel 名单自动识别，也可以直接粘贴名单文本后预览导入。</p>
                      </div>
                      <label
                        className={`inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50 ${
                          participantImportLoading ? "cursor-wait opacity-75" : "cursor-pointer"
                        }`}
                      >
                        {participantImportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {participantImportLoading ? "正在识别..." : "上传名单文件"}
                        <input
                          accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values,text/plain"
                          className="sr-only"
                          disabled={participantImportLoading}
                          {...fieldHint("上传参训教师名单文件")}
                          onChange={(event) => {
                            void handleParticipantImportFile(event.target.files?.[0] ?? null);
                            event.currentTarget.value = "";
                          }}
                          type="file"
                        />
                      </label>
                    </div>
                    {participantImportStatus ? (
                      <p className="mt-3 rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-5 text-blue-700">
                        {participantImportStatus}
                      </p>
                    ) : null}
                    {participantImportPreview.totalCount > 0 ? (
                      <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${getImportPreviewToneClassName(participantImportPreview)}`}>
                        <p className="font-bold">导入预览：将新增 {participantImportPreview.readyCount} 位参训教师</p>
                        <p className="mt-1">
                          共识别 {participantImportPreview.totalCount} 行；缺必填信息 {participantImportPreview.missingRequiredCount} 行；名单内重复 {participantImportPreview.duplicateInFileCount} 组；当前班次已存在 {participantImportPreview.existingConflictCount} 行。
                        </p>
                      </div>
                    ) : null}
                    <TeacherTrainingImportFieldSummary items={participantImportFieldSummary} />
                    <textarea
                      id="tt-participant-import-textarea"
                      className={`${textareaClassName} mt-3 min-h-28 bg-white/90`}
                      {...fieldHint("一键导入参训教师")}
                      onChange={(event) => setParticipantImportText(event.target.value)}
                      placeholder="可上传 Excel 名单自动识别，也可粘贴：姓名，单位，手机，分组，职务，邮箱，预计到达时间，交通方式，车次/航班/车牌，出发地，扩展信息，备注"
                      value={participantImportText}
                    />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-slate-500">导入前请先看预览，系统会跳过缺必填、重复或已存在的行。</p>
                      <ActionButton
                        aria-label="一键导入参训教师"
                        className="w-full sm:w-auto"
                        disabled={!selectedCohort || !participantImportPreview.canImport || participantImportLoading}
                        loading={isSaving || participantImportLoading}
                        onClick={() => void importParticipants()}
                        title={participantImportPreview.canImport ? "一键导入参训教师" : "请先处理导入预览中的问题"}
                        variant="secondary"
                      >
                        一键导入参训教师
                      </ActionButton>
                    </div>
                  </div>
                ) : null}

                {isAccountManagementSection ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                      <p className="text-sm font-bold text-blue-800">绑定创赛原平台账号</p>
                      <p className="mt-1.5 text-xs leading-5 text-blue-700">
                        教师原来在创赛系统已有账号时，录入或编辑省培账号填写该用户名即可绑定；教师继续使用原密码登录，只新增省培入口。
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <p className="text-sm font-bold text-emerald-800">生成省培专用账号</p>
                      <p className="mt-1.5 text-xs leading-5 text-emerald-700">
                        教师没有原平台账号时，可用手机号批量生成或逐人生成省培专用账号；该账号只服务省培系统。
                      </p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                      <p className="text-sm font-bold text-amber-800">删除和解绑边界</p>
                      <p className="mt-1.5 text-xs leading-5 text-amber-700">
                        共用账号只解绑省培身份，不删除创赛系统账号；只有省培专用账号才允许删除账号本体。
                      </p>
                    </div>
                  </div>
                ) : null}

                {isAccountManagementSection ? (
                  <>
                    <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="参训教师账号状态总览">
                      {participantAccountStatusSummary.map((item) => (
                        <button
                          key={item.label}
                          className={`relative overflow-hidden rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(15,45,91,0.4)] ${
                            item.tone === "amber"
                              ? "border-amber-100 bg-amber-50/70 text-amber-800"
                              : item.tone === "emerald"
                                ? "border-emerald-100 bg-emerald-50/70 text-emerald-800"
                                : item.tone === "blue"
                                  ? "border-blue-100 bg-blue-50/70 text-blue-800"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                          onClick={() => setParticipantAccountFilter(item.label === "未绑定账号" ? "unbound" : "all")}
                          type="button"
                        >
                          <span className="text-xs font-semibold opacity-80">{item.label}</span>
                          <strong className="mt-1 block text-[26px] font-extrabold leading-none tracking-tight">{item.value}</strong>
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white/70 p-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="px-2 text-xs font-semibold text-slate-500">账号处理范围</span>
                      <div className="grid gap-2 sm:flex sm:flex-wrap">
                        {[
                          { key: "all", label: "全部参训教师" },
                          { key: "unbound", label: "筛选未绑定账号" },
                        ].map((item) => {
                          const isActive = participantAccountFilter === item.key;

                          return (
                            <button
                              key={item.key}
                              aria-pressed={isActive}
                              className={`h-9 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70 ${
                                isActive
                                  ? "bg-blue-600 text-white shadow-sm shadow-blue-900/15"
                                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50 hover:text-blue-700"
                              }`}
                              onClick={() => setParticipantAccountFilter(item.key as "all" | "unbound")}
                              type="button"
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : null}

                <label className={`${teacherTrainingFieldShellClassName} mt-4`}>
                  <span className={teacherTrainingFieldLabelClassName}>搜索参训教师</span>
                  <input
                    className={fieldClassName}
                    {...fieldHint("搜索参训教师")}
                    onChange={(event) => setParticipantSearch(event.target.value)}
                    placeholder={
                      isAccountManagementSection
                        ? "按姓名、单位、手机号或账号搜索"
                        : "按姓名、单位、所属市、学科或人员类别搜索"
                    }
                    value={participantSearch}
                  />
                </label>
                <TeacherTrainingFilterSummary
                  items={teacherTrainingFilterSummaries.participants}
                  onClear={
                    participantSearchKeyword ||
                    teacherTrainingDetailViewTitle
                      ? () => {
                          setParticipantSearch("");
                          setParticipantAccountFilter("all");
                          setTeacherTrainingDetailViewTitle("");
                        }
                      : undefined
                  }
                />

                <div className={`mt-4 grid gap-3 ${teacherTrainingFillingListClassName}`}>
                  {filteredParticipants.length === 0 ? (
                    <div className="tt-empty-fill">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#1a6fd4]">
                        <Users className="h-6 w-6" />
                      </span>
                      <p className="text-sm font-semibold text-slate-700">名单为空</p>
                      <p className="max-w-[260px] text-xs leading-5 text-slate-400">
                        {isAccountManagementSection
                          ? "请先到参训教师页录入名单，再回到这里处理账号绑定。"
                          : "点击上方新增教师或导入名单后，这里会显示报名档案和预录信息。"}
                      </p>
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#1a6fd4] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#155bb0]"
                        onClick={() => {
                          if (isAccountManagementSection) {
                            openTeacherTrainingSection("participants");
                          }
                          openParticipantFormWorkspace();
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {isAccountManagementSection ? "去录入教师" : "立即录入教师"}
                      </button>
                    </div>
                  ) : (
                    filteredParticipants.map((participant) => (
                      <article
                        key={participant.id}
                        className="tt-action-card flex flex-col gap-3 p-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              checked={selectedParticipantIds.includes(participant.id)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600"
                              {...fieldHint(`选择参训教师：${participant.name}`)}
                              onChange={() => setSelectedParticipantIds((current) => toggleSelectedId(current, participant.id))}
                              type="checkbox"
                            />
                            <p className="max-w-full truncate whitespace-nowrap text-base font-semibold text-slate-950">
                              {participant.name}
                            </p>
                            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              {participant.groupName || "未分组"}
                            </span>
                            {isAccountManagementSection ? (
                              <>
                                <span className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                  {participant.accountUsername ? "已开通账号" : "待开通账号"}
                                </span>
                                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${getParticipantAccountTypeClassName(participant)}`}>
                                  {getParticipantAccountTypeLabel(participant)}
                                </span>
                              </>
                            ) : (
                              <>
                                {participant.city ? (
                                  <span className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                    {participant.city}
                                  </span>
                                ) : null}
                                {participant.personnelCategory ? (
                                  <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                    {participant.personnelCategory}
                                  </span>
                                ) : null}
                              </>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{participant.organization || "单位待补充"}</p>
                          {isAccountManagementSection && participant.accountUsername ? (
                            <p className="mt-1 text-xs text-slate-400">
                              省培账号：{participant.accountUsername}
                              {participant.accountRole !== "training_teacher" ? "（绑定创赛原平台账号）" : ""}
                            </p>
                          ) : null}
                          {isAccountManagementSection ? (
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {getParticipantAccountBoundaryText(participant)}
                            </p>
                          ) : null}
                          {canManage ? (
                            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/35 p-3">
                              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold tracking-wide text-blue-600">省培账号</p>
                                  {participant.accountUsername ? (
                                    <div className="mt-1 space-y-0.5 text-xs leading-5 text-slate-600">
                                      <p className="font-semibold text-slate-800">账号：{participant.accountUsername}</p>
                                      <p>
                                        {participant.accountRole === "training_teacher"
                                          ? "初始密码：123456；如已重置，以最新通知为准。"
                                          : "绑定创赛原平台账号，密码由原平台账号管理维护。"}
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                      尚未开通省培账号。可用报名手机号单独开通，初始密码统一为 123456。
                                    </p>
                                  )}
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  <button
                                    className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-3 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
                                    aria-label={participant.accountUsername ? "复制省培账号通知消息" : "单独开通省培账号"}
                                    disabled={isSaving}
                                    onClick={() => void copyAccountMessage(participant.id)}
                                    title={participant.accountUsername ? "复制省培账号通知消息" : "单独开通省培账号"}
                                    type="button"
                                  >
                                    <Copy className="h-4 w-4 shrink-0" />
                                    <span className="truncate whitespace-nowrap">
                                      {participant.accountUsername ? "复制账号消息" : "单独开通账号"}
                                    </span>
                                  </button>
                                  {participant.accountUsername && participant.accountRole === "training_teacher" ? (
                                    <button
                                      className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                      aria-label="帮教师重置密码"
                                      disabled={isSaving}
                                      onClick={() => editParticipantAccount(participant)}
                                      title="帮教师重置密码"
                                      type="button"
                                    >
                                      <Pencil className="h-4 w-4 shrink-0" />
                                      <span className="truncate whitespace-nowrap">帮教师重置密码</span>
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#1a6fd4] transition hover:text-[#155bb0]"
                            onClick={() => toggleParticipantExpanded(participant.id)}
                            aria-expanded={expandedParticipantIds.has(participant.id)}
                          >
                            {expandedParticipantIds.has(participant.id)
                              ? "收起详情"
                              : isAccountManagementSection
                                ? "账号处理详情"
                                : "报名档案详情"}
                            <ChevronDown className={`h-3.5 w-3.5 transition ${expandedParticipantIds.has(participant.id) ? "rotate-180" : ""}`} />
                          </button>
                          {!isAccountManagementSection && expandedParticipantIds.has(participant.id) ? (
                            <>
                              {[
                                { label: "性别", value: participant.gender },
                                { label: "年龄", value: participant.age },
                                { label: "人员类别", value: participant.personnelCategory },
                                { label: "学科", value: participant.subject },
                                { label: "职称", value: participant.professionalTitle },
                                { label: "所属市", value: participant.city },
                              ].some((item) => item.value) ? (
                                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                  {[
                                    { label: "性别", value: participant.gender },
                                    { label: "年龄", value: participant.age },
                                    { label: "人员类别", value: participant.personnelCategory },
                                    { label: "学科", value: participant.subject },
                                    { label: "职称", value: participant.professionalTitle },
                                    { label: "所属市", value: participant.city },
                                  ]
                                    .filter((item) => item.value)
                                    .map((item) => (
                                      <div key={item.label} className="rounded-xl border border-blue-100 bg-blue-50/45 px-3 py-2">
                                        <p className="text-[11px] font-semibold text-blue-500">{item.label}</p>
                                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-700">{item.value}</p>
                                      </div>
                                    ))}
                                </div>
                              ) : null}
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                  <p className="text-[11px] font-semibold text-slate-400">预计到达时间</p>
                                  <p className="mt-0.5 text-xs font-semibold text-slate-700">
                                    {participant.arrivalInfo.arrivalAt ? Workspace.formatTeacherTrainingArrivalAt(participant.arrivalInfo.arrivalAt) : "未填写"}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                  <p className="text-[11px] font-semibold text-slate-400">交通方式</p>
                                  <p className="mt-0.5 text-xs font-semibold text-slate-700">
                                    {[
                                      participant.arrivalInfo.transportationLabel,
                                      participant.arrivalInfo.vehicleNo,
                                      participant.arrivalInfo.lodging,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ") || "未填写"}
                                  </p>
                                </div>
                              </div>
                              {participant.extraInfoLines.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {participant.extraInfoLines.slice(0, 5).map((line) => (
                                    <span key={line} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                      {line}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        {!isAccountManagementSection && expandedParticipantIds.has(participant.id) ? (
                          <div className="border-t border-slate-100 pt-3">
                            <div className="rounded-xl border border-rose-100 bg-rose-50/35 p-3">
                              <p className="text-[11px] font-bold tracking-wide text-rose-500">参训教师档案</p>
                              <p className="mt-1 text-xs leading-5 text-rose-500">
                                删除名单会同步删除该教师的报到、签到、请假和汇报记录。
                              </p>
                              <button
                                className="mt-2 inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                                aria-label="删除参训教师"
                                disabled={isSaving}
                                onClick={() => void removeParticipant(participant)}
                                title="删除参训教师"
                                type="button"
                              >
                                <Trash2 className="h-4 w-4 shrink-0" />
                                <span className="truncate whitespace-nowrap">删除参训教师</span>
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {isAccountManagementSection && expandedParticipantIds.has(participant.id) ? (
                          <div className="border-t border-slate-100 pt-3">
                            <div className="rounded-xl border border-blue-100 bg-blue-50/35 p-3">
                              <p className="text-[11px] font-bold tracking-wide text-blue-600">省培账号处理</p>
                              <p className="mt-1 text-xs leading-5 text-blue-500">
                                只处理账号与省培身份绑定，不删除参训教师档案。
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                                  aria-label={participant.accountUsername ? "复制省培账号通知消息" : "生成省培专用账号并复制通知消息"}
                                  disabled={isSaving}
                                  onClick={() => void copyAccountMessage(participant.id)}
                                  title={participant.accountUsername ? "复制省培账号通知消息" : "生成省培专用账号并复制通知消息"}
                                  type="button"
                                >
                                  <Copy className="h-4 w-4 shrink-0" />
                                  <span className="truncate whitespace-nowrap">
                                    {participant.accountUsername ? "复制账号消息" : "生成省培专用账号"}
                                  </span>
                                </button>
                                {participant.accountUsername ? (
                                  <>
                                    {participant.accountRole === "training_teacher" ? (
                                      <button
                                        className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                                        aria-label="重置账号密码"
                                        disabled={isSaving}
                                        onClick={() => editParticipantAccount(participant)}
                                        title="重置账号密码"
                                        type="button"
                                      >
                                        <Pencil className="h-4 w-4 shrink-0" />
                                        <span className="truncate whitespace-nowrap">重置账号密码</span>
                                      </button>
                                    ) : (
                                      <span className="inline-flex min-h-9 max-w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
                                        <span className="truncate">创赛原平台账号由创赛账号管理维护</span>
                                      </span>
                                    )}
                                    <button
                                      className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                                      aria-label={getParticipantAccountRemoveLabel(participant)}
                                      disabled={isSaving}
                                      onClick={() => void removeParticipantAccount(participant)}
                                      title={getParticipantAccountRemoveLabel(participant)}
                                      type="button"
                                    >
                                      <Trash2 className="h-4 w-4 shrink-0" />
                                      <span className="truncate whitespace-nowrap">{getParticipantAccountRemoveLabel(participant)}</span>
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {canManage && accountEditParticipantId === participant.id ? (
                          <div className="lg:col-span-2 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={teacherTrainingFieldLabelClassName}>省培专用登录账号</span>
                              <input
                                className={fieldClassName}
                                {...fieldHint("重置省培专用账号")}
                                onChange={(event) =>
                                  setAccountEditDraft((current) => ({ ...current, accountUsername: event.target.value }))
                                }
                                value={accountEditDraft.accountUsername}
                              />
                            </label>
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={teacherTrainingFieldLabelClassName}>新密码</span>
                              <input
                                className={fieldClassName}
                                {...fieldHint("省培账号重置密码")}
                                onChange={(event) =>
                                  setAccountEditDraft((current) => ({ ...current, accountPassword: event.target.value }))
                                }
                                placeholder="不填则仅修改账号名；填写后重置密码"
                                value={accountEditDraft.accountPassword}
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white"
                                disabled={isSaving || !accountEditDraft.accountUsername.trim()}
                                onClick={() => void submitParticipantAccountEdit()}
                                type="button"
                              >
                                保存
                              </button>
                              <button
                                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500"
                                onClick={() => {
                                  setAccountEditParticipantId("");
                                  setAccountEditDraft({ accountUsername: "", accountPassword: "" });
                                }}
                                type="button"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {canManage && accountMessagesByParticipantId[participant.id] ? (
                          <textarea
                            className={`${textareaClassName} lg:col-span-2 min-h-28 bg-blue-50/40`}
                            {...fieldHint(`${participant.name}省培账号通知消息`)}
                            onChange={(event) =>
                              setAccountMessagesByParticipantId((current) => ({
                                ...current,
                                [participant.id]: event.target.value,
                              }))
                            }
                            value={accountMessagesByParticipantId[participant.id]}
                          />
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </section>
              ) : null}

              {canManage && showTeacherTrainingSection("attendance") ? (
              <section className="tt-card p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="tt-block-title">报到登记</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      所有人默认待报到；点击报到后确认酒店房号和材料情况，系统自动记录报到时间。
                    </p>
                  </div>
                  <span className="tt-pill tt-pill-success">
                    已报到 {selectedCohort?.stats.presentCount ?? 0} / {selectedCohort?.stats.participantCount ?? 0}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white/70 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="px-2 text-xs font-semibold text-slate-500">快捷筛选</span>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    {attendanceOverviewFilters.map((item) => {
                      const isActive = attendanceOverviewFilter === item.key;

                      return (
                        <button
                          key={item.key}
                          aria-pressed={isActive}
                          className={`h-9 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70 ${
                            isActive
                              ? "bg-blue-600 text-white shadow-sm shadow-blue-900/15"
                              : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50 hover:text-blue-700"
                          }`}
                          onClick={() => setAttendanceOverviewFilter(item.key)}
                          type="button"
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className={`${teacherTrainingFieldShellClassName} mt-4`}>
                  <span className={teacherTrainingFieldLabelClassName}>搜索报到登记</span>
                  <input
                    className={fieldClassName}
                    {...fieldHint("搜索报到登记")}
                    onChange={(event) => setAttendanceSearch(event.target.value)}
                      placeholder="按姓名、单位、所属市、学科、人员类别或手机号搜索"
                    value={attendanceSearch}
                  />
                </label>
                <TeacherTrainingFilterSummary
                  items={teacherTrainingFilterSummaries.attendance}
                  onClear={
                    attendanceSearchKeyword || attendanceOverviewFilter !== "all" || teacherTrainingDetailViewTitle
                      ? () => {
                          setAttendanceOverviewFilter("all");
                          setAttendanceSearch("");
                          setTeacherTrainingDetailViewTitle("");
                        }
                      : undefined
                  }
                />

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/75">
                  {filteredAttendanceParticipants.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-12 text-center">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#1a6fd4]">
                        <Users className="h-6 w-6" />
                      </span>
                      <p className="text-sm font-semibold text-slate-700">名单为空</p>
                      <p className="max-w-[260px] text-xs leading-5 text-slate-400">在参训教师模块添加名单后，这里会出现报到登记列表。</p>
                    </div>
                  ) : (
                    <div className={`divide-y divide-slate-100 ${teacherTrainingScrollableListClassName}`}>
                      <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_120px_120px_auto] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 lg:grid">
                        <span>教师与单位</span>
                        <span>报到状态</span>
                        <span>酒店房号</span>
                        <span>材料状态</span>
                        <span className="text-right">操作</span>
                      </div>
                      {filteredAttendanceParticipants.map((participant) => {
                        const attendance = getArrivalRegistrationAttendance(participant);
                        const leaveAttendance = getParticipantAttendanceRecord(participant, "leave");
                        const absentAttendance = getParticipantAttendanceRecord(participant, "absent");

                        return (
                          <div
                            key={participant.id}
                            className={`grid gap-3 border p-4 lg:grid-cols-[minmax(0,1.4fr)_120px_120px_120px_auto] lg:items-center ${
                              attendance ? "border-emerald-100 bg-emerald-50/20" : "border-amber-100 bg-amber-50/20"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-950">{participant.name}</p>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                  {participant.groupName || "未分组"}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                    attendance ? statusStyleMap.present : attendancePendingStyleClassName
                                  }`}
                                >
                                  {attendance ? attendance.statusLabel : Workspace.teacherTrainingAttendancePendingLabel}
                                </span>
                                {leaveAttendance ? (
                                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyleMap.leave}`}>
                                    {leaveAttendance.statusLabel}
                                  </span>
                                ) : null}
                                {absentAttendance ? (
                                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyleMap.absent}`}>
                                    {absentAttendance.statusLabel}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-slate-500">{participant.organization}</p>
                              {attendance ? (
                                <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-3 lg:hidden">
                                  <span>报到时间：{attendance.markedAt || "未记录"}</span>
                                  <span>酒店房号：{attendance.roomNumber || "未填写"}</span>
                                  <span>材料齐全：{attendance.materialsCompleteLabel}</span>
                                  <span className="sm:col-span-3">工作人员：{attendance.markedByName}</span>
                                  {attendance.registrationNote ? <span className="sm:col-span-3">备注：{attendance.registrationNote}</span> : null}
                                </div>
                              ) : null}
                              {participant.accountUsername ? (
                                <p className="mt-1 text-xs text-slate-400">省培账号：{participant.accountUsername}</p>
                              ) : null}
                              <p className="mt-1 text-xs text-slate-400">
                                预计到达：
                                {participant.arrivalInfo.arrivalAt
                                  ? `${Workspace.formatTeacherTrainingArrivalAt(participant.arrivalInfo.arrivalAt)} ${participant.arrivalInfo.transportationLabel || ""}`.trim()
                                  : "未填写"}
                              </p>
                              {participant.extraInfoLines.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {participant.extraInfoLines.slice(0, 4).map((line) => (
                                    <span key={line} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                      {line}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className="hidden text-sm font-semibold text-slate-700 lg:block">
                              {attendance ? attendance.statusLabel : Workspace.teacherTrainingAttendancePendingLabel}
                            </div>
                            <div className="hidden text-sm text-slate-600 lg:block">
                              {attendance?.roomNumber || "未填写"}
                            </div>
                            <div className="hidden text-sm text-slate-600 lg:block">
                              {attendance?.materialsCompleteLabel || "待确认"}
                            </div>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              <button
                                className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                aria-label={`${participant.name}${attendance ? "修改报到信息" : "报到"}`}
                                disabled={isSaving}
                                onClick={() => openAttendanceRegistration(participant)}
                                title={`${participant.name}${attendance ? "修改报到信息" : "报到"}`}
                                type="button"
                              >
                                {attendance ? "修改报到" : "报到"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
              ) : null}

              {attendanceRegistrationParticipant ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
                  <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-slate-950">确认参训教师已报到</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          {attendanceRegistrationParticipant.name} · {attendanceRegistrationParticipant.organization}
                        </p>
                      </div>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                        aria-label="关闭报到确认弹窗"
                        onClick={closeAttendanceRegistration}
                        title="关闭报到确认弹窗"
                        type="button"
                      >
                        ×
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>酒店房号</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("酒店房号")}
                          onChange={(event) =>
                            setAttendanceRegistrationDraft((current) => ({ ...current, roomNumber: event.target.value }))
                          }
                          placeholder="如 1208、A座 803"
                          value={attendanceRegistrationDraft.roomNumber}
                        />
                      </label>
                      <div>
                        <span className={teacherTrainingFieldLabelClassName}>报到材料是否齐全</span>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          {[
                            { value: "yes", label: "材料齐全" },
                            { value: "no", label: "材料不齐全" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              className={`h-10 rounded-lg border text-sm font-semibold transition ${
                                attendanceRegistrationDraft.materialsComplete === option.value
                                  ? "border-blue-300 bg-blue-50 text-blue-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"
                              }`}
                              aria-pressed={attendanceRegistrationDraft.materialsComplete === option.value}
                              onClick={() =>
                                setAttendanceRegistrationDraft((current) => ({
                                  ...current,
                                  materialsComplete: option.value as "yes" | "no",
                                }))
                              }
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>报到备注</span>
                        <textarea
                          className={`${textareaClassName} min-h-20`}
                          {...fieldHint("报到备注")}
                          onChange={(event) => setAttendanceRegistrationDraft((current) => ({ ...current, note: event.target.value }))}
                          placeholder="可填写缺少材料、特殊住宿说明等"
                          value={attendanceRegistrationDraft.note}
                        />
                      </label>
                    </div>

                    {attendanceRegistrationDisabledReason ? (
                      <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {attendanceRegistrationDisabledReason}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={closeAttendanceRegistration}
                        type="button"
                      >
                        取消
                      </button>
                      <button
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={isSaving || Boolean(attendanceRegistrationDisabledReason)}
                        onClick={() => void submitAttendanceRegistration()}
                        type="button"
                      >
                        确认已报到
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {showTeacherTrainingSection("tasks") ? (
              <section className={teacherTaskWorkbenchClassName}>
                {canManage ? (
                <div className="tt-card p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[15px] font-bold text-slate-950">发布任务</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          管理者只发布任务，参训教师登录后自行填写汇报。
                        </p>
                      </div>
                    </div>
                    <span className="tt-pill tt-pill-neutral">{selectedCohort.tasks.length} 项任务</span>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <label className={teacherTrainingFieldShellClassName}>
                      <RequiredFieldLabel>省培任务名称</RequiredFieldLabel>
                      <input
                        className={fieldClassName}
                        {...fieldHint("省培任务名称")}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="任务名称"
                        value={taskDraft.title}
                      />
                    </label>
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>省培任务截止日期</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("省培任务截止日期")}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))}
                        type="date"
                        value={taskDraft.dueDate}
                      />
                    </label>
                    <label className={teacherTrainingFieldShellClassName}>
                      <RequiredFieldLabel>任务类型</RequiredFieldLabel>
                      <select
                        className={fieldClassName}
                        {...fieldHint("省培任务类型")}
                        onChange={(event) => {
                          const nextType = event.target.value;
                          setTaskDraft((current) => ({
                            ...current,
                            taskType: nextType,
                            courseSessionId:
                              nextType === "course" ? current.courseSessionId || courseSessions[0]?.id || "" : "",
                            releaseMode:
                              nextType === "course" ? current.releaseMode : current.releaseMode === "after_course" ? "immediate" : current.releaseMode,
                          }));
                        }}
                        value={taskDraft.taskType}
                      >
                        <option value="cohort">班级任务</option>
                        <option value="course">课程任务</option>
                        <option value="stage">阶段任务</option>
                      </select>
                    </label>
                    {taskDraft.taskType === "course" ? (
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>关联课程</span>
                        <select
                          className={fieldClassName}
                          {...fieldHint("关联课程")}
                          onChange={(event) => setTaskDraft((current) => ({ ...current, courseSessionId: event.target.value }))}
                          value={taskDraft.courseSessionId}
                        >
                          {courseSessions.length === 0 ? <option value="">暂无课程，请先添加课程</option> : null}
                          {courseSessions.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.courseDate} {course.startTime ? `${course.startTime} ` : ""}{course.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className={teacherTrainingFieldShellClassName}>
                      <RequiredFieldLabel>开放时间</RequiredFieldLabel>
                      <select
                        className={fieldClassName}
                        {...fieldHint("省培任务开放时间")}
                        onChange={(event) =>
                          setTaskDraft((current) => ({
                            ...current,
                            releaseMode: event.target.value as Workspace.TeacherTrainingTaskReleaseMode,
                          }))
                        }
                        value={taskDraft.releaseMode}
                      >
                        <option value="immediate">立即开放</option>
                        <option disabled={taskDraft.taskType !== "course"} value="after_course">
                          课程结束后开放
                        </option>
                        <option value="scheduled">指定时间开放</option>
                      </select>
                    </label>
                    {taskDraft.releaseMode === "scheduled" ? (
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>指定开放时间</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("指定开放时间")}
                          onChange={(event) => setTaskDraft((current) => ({ ...current, releaseAt: event.target.value }))}
                          type="datetime-local"
                          value={taskDraft.releaseAt}
                        />
                      </label>
                    ) : null}
                    <label className={`${teacherTrainingFieldShellClassName} lg:col-span-2`}>
                      <RequiredFieldLabel>省培任务说明</RequiredFieldLabel>
                      <textarea
                        className={textareaClassName}
                        {...fieldHint("省培任务说明")}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))}
                        placeholder="任务说明"
                        value={taskDraft.description}
                      />
                    </label>
                    <div className="flex flex-col gap-3 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="grid gap-3 sm:grid-cols-2">
                      <div className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>省培任务附件要求</span>
                        <div className="mt-1.5 inline-flex h-10 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
                          <FileText className="h-4 w-4" />
                          PDF 附件必交
                        </div>
                      </div>
                      <div className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>AI 辅助评分</span>
                        <label className="mt-1.5 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
                          <input
                            checked={taskDraft.enableAiReview}
                            {...fieldHint("是否开启 AI 辅助评分")}
                            onChange={(event) =>
                              setTaskDraft((current) => ({ ...current, enableAiReview: event.target.checked }))
                            }
                            type="checkbox"
                          />
                          管理端可用
                        </label>
                      </div>
                      </div>
                      <ActionButton
                        aria-label="发布省培任务汇报要求"
                        className="w-full lg:w-auto"
                        loading={isSaving}
                        onClick={() => void submitTask()}
                        title="发布省培任务汇报要求"
                        variant="primary"
                      >
                        {taskDraft.id ? "保存任务修改" : "发布任务"}
                      </ActionButton>
                    </div>
                    {taskDraft.enableAiReview ? (
                      <label className={`${teacherTrainingFieldShellClassName} lg:col-span-2`}>
                        <span className={teacherTrainingFieldLabelClassName}>评分细则</span>
                        <textarea
                          className={`${textareaClassName} min-h-24`}
                          {...fieldHint("AI辅助评分细则")}
                          onChange={(event) => setTaskDraft((current) => ({ ...current, scoringRubric: event.target.value }))}
                          placeholder="例如：课程理解40分、结合实际30分、结构表达20分、规范完成10分。未填写时按完成度和内容质量辅助判断。"
                          value={taskDraft.scoringRubric}
                        />
                      </label>
                    ) : null}
                    {taskDraft.id ? (
                      <button
                        className="text-xs font-semibold text-slate-500 lg:col-span-2"
                        onClick={() =>
                          setTaskDraft(createDefaultTaskDraft())
                        }
                        type="button"
                      >
                        取消修改
                      </button>
                    ) : null}
                  </div>
                </div>
                ) : null}

                {!canManage && showTeacherTrainingSubmissionForm ? (
                  <aside
                    aria-label="省培任务汇报进度"
                    className="tt-card p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between xl:flex-col">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-[15px] font-bold text-slate-950">我的任务</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">
                            已提交 {teacherTaskCompletedCount}/{teacherTaskProgressItems.length}
                          </p>
                        </div>
                      </div>
                      <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${teacherTaskSummaryToneClassName}`}>
                        {teacherTaskSummaryText}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500"
                        style={{ width: `${teacherTaskCompletionPercent}%` }}
                      />
                    </div>
                    <div className="mt-4 grid gap-2">
                      {teacherTaskProgressItems.length === 0 ? (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                          暂无任务
                        </div>
                      ) : (
                        teacherTaskProgressItems.map((item) => (
                          <button
                            key={item.id}
                            className={`rounded-xl border px-3 py-3 text-left transition hover:-translate-y-0.5 ${
                              item.isComplete
                                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                : "border-amber-100 bg-amber-50 text-amber-700"
                            }`}
                            onClick={() => focusTeacherTaskSubmission(item.id)}
                            title={`${item.title}：${item.statusLabel}`}
                            type="button"
                          >
                            <span className="block truncate text-sm font-bold text-slate-950">{item.title}</span>
                            <span className="mt-1 block text-xs font-semibold">{item.statusLabel}</span>
                            {item.submittedAt ? (
                              <span className="mt-1 block text-[11px] font-medium text-slate-500">{item.submittedAt}</span>
                            ) : item.dueDate ? (
                              <span className="mt-1 block text-[11px] font-medium text-slate-500">截止 {item.dueDate}</span>
                            ) : null}
                          </button>
                        ))
                      )}
                      {teacherWaitingReleaseTasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm"
                          title={`${task.title}：${task.releaseStatusLabel}`}
                        >
                          <span className="block truncate font-bold text-slate-950">{task.title}</span>
                          <span className="mt-1 block text-xs font-semibold text-slate-500">{task.releaseStatusLabel}</span>
                        </div>
                      ))}
                    </div>
                  </aside>
                ) : null}

                {showTeacherTrainingSubmissionForm ? (
                <div className="tt-card p-5" id="teacher-training-submission-form">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                      <Send className="h-4 w-4" />
                    </span>
                    <p className="text-[15px] font-bold text-slate-950">提交汇报</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>选择省培汇报任务</span>
                      <select
                        className={fieldClassName}
                        {...fieldHint("选择省培汇报任务")}
                        onChange={(event) => updateSubmissionSelection({ taskId: event.target.value })}
                        value={selectedTask?.id ?? ""}
                      >
                        {selectedCohortTasksForCurrentUser.length === 0 ? <option value="">暂无可填写任务</option> : null}
                        {selectedCohortTasksForCurrentUser.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {canManage ? (
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>选择省培汇报教师</span>
                        <select
                          className={fieldClassName}
                          {...fieldHint("选择省培汇报教师")}
                          onChange={(event) => updateSubmissionSelection({ participantId: event.target.value })}
                          value={selectedParticipant?.id ?? ""}
                        >
                          {selectedCohort.participants.length === 0 ? <option value="">暂无参训教师</option> : null}
                          {selectedCohort.participants.map((participant) => (
                            <option key={participant.id} value={participant.id}>
                              {participant.name} · {participant.organization}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>我的汇报身份</span>
                        <div className="mt-1 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2">
                          <p className="text-sm font-semibold text-slate-950">{selectedParticipant?.name ?? "未绑定参训教师"}</p>
                          <p className="mt-0.5 text-xs leading-5 text-slate-500">
                            {selectedParticipant?.organization || "单位待补充"} · 已按当前省培账号锁定
                          </p>
                        </div>
                      </div>
                    )}
                    <div className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>省培任务汇报附件</span>
                      <label className="mt-1.5 flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/35 px-4 py-4 text-center transition hover:border-blue-300 hover:bg-blue-50/70">
                        <Upload className="h-5 w-5 text-blue-600" />
                        <span className="mt-2 text-sm font-semibold text-slate-900">选择 PDF 文件</span>
                        <span className="mt-1 text-xs leading-5 text-slate-500">
                          任务汇报附件仅支持 PDF，单个 {Workspace.teacherTrainingSubmissionAttachmentMaxSizeLabel} 以内
                        </span>
                        <input
                          {...fieldHint("省培任务汇报附件")}
                          accept={Workspace.teacherTrainingSubmissionAttachmentAcceptAttribute}
                          className="sr-only"
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            handleSubmissionAttachmentFile(file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <div className="mt-2 rounded-xl border border-slate-100 bg-white px-3 py-2">
                        {submissionAttachmentFile ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{submissionAttachmentFile.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{Workspace.formatFileSize(submissionAttachmentFile.size)}</p>
                            </div>
                            <button
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600"
                              onClick={() => handleSubmissionAttachmentFile(null)}
                              type="button"
                            >
                              移除
                            </button>
                          </div>
                        ) : currentSubmissionAttachmentFile ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{currentSubmissionAttachmentFile.fileName}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                已上传 · {Workspace.formatFileSize(currentSubmissionAttachmentFile.fileSize)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 disabled:cursor-wait disabled:opacity-60"
                                disabled={downloadingTeacherTrainingFile === currentSubmissionAttachmentFile.downloadUrl}
                                onClick={() =>
                                  void downloadTeacherTrainingFile({
                                    url: currentSubmissionAttachmentFile.downloadUrl,
                                    label: "任务汇报附件",
                                    fallbackName: currentSubmissionAttachmentFile.fileName,
                                  })
                                }
                                type="button"
                              >
                                <Download className="h-3.5 w-3.5" />
                                下载
                              </button>
                              <button
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      "移除已上传附件？\n\n现在只会标记移除，点击保存汇报后，原附件会从系统文件库删除。",
                                    )
                                  ) {
                                    return;
                                  }
                                  setSubmissionDraft((current) => ({ ...current, attachment: "" }));
                                }}
                                type="button"
                              >
                                移除
                              </button>
                            </div>
                          </div>
                        ) : currentSubmissionAttachmentLabel ? (
                          <p className="text-xs leading-5 text-slate-500">已保留旧附件说明：{currentSubmissionAttachmentLabel}</p>
                        ) : (
                          <p className="text-xs leading-5 text-slate-500">请上传 PDF 汇报附件后保存。</p>
                        )}
                        {submissionAttachmentProgress !== null ? (
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>上传进度</span>
                              <span>{submissionAttachmentProgress}%</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-blue-600 transition-all"
                                style={{ width: `${submissionAttachmentProgress}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                        {submissionAttachmentPreviewUrl || currentSubmissionAttachmentFile ? (
                          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2">
                              <span className="text-xs font-bold text-slate-700">PDF 预览</span>
                              <span className="text-[11px] font-semibold text-slate-400">
                                {submissionAttachmentPreviewUrl ? "本地文件" : "已上传附件"}
                              </span>
                            </div>
                            <iframe
                              className="h-[420px] w-full bg-white"
                              src={submissionAttachmentPreviewUrl || currentSubmissionAttachmentFile!.downloadUrl}
                              title="PDF 预览"
                            />
                          </div>
                        ) : null}
                      </div>
                      {isReplacingSavedSubmissionAttachment ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                          已选择新附件，保存后会替换附件；替换附件会删除上一份附件。
                        </p>
                      ) : null}
                      {isRemovingSavedSubmissionAttachment ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                          已标记移除原附件，保存后会从系统文件库删除。
                        </p>
                      ) : null}
                      {submissionAttachmentError ? (
                        <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-600">
                          {submissionAttachmentError}
                        </p>
                      ) : null}
                      {submissionSaveStatus ? (
                        <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                          {submissionSaveStatus}
                        </p>
                      ) : null}
                      {teacherTrainingDownloadStatus ? (
                        <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                          {teacherTrainingDownloadStatus}
                        </p>
                      ) : null}
                    </div>
                    <ActionButton
                      aria-label="保存省培任务汇报"
                      disabled={Boolean(submissionDisabledReason) || isSubmissionAttachmentUploading}
                      loading={isSaving || isSubmissionAttachmentUploading}
                      onClick={() => void submitSubmission()}
                      title={submissionDisabledReason || (isSubmissionAttachmentUploading ? "附件正在上传" : "保存省培任务汇报")}
                      variant="primary"
                    >
                      保存汇报
                    </ActionButton>
                    {submissionDisabledReason ? (
                      <p className={teacherTrainingDisabledHintClassName}>
                        {submissionDisabledReason}
                      </p>
                    ) : null}
                  </div>
                </div>
                ) : null}
              </section>
              ) : null}

              {canManage && showTeacherTrainingSection("tasks") ? (
              <section className="tt-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="tt-block-title">任务汇报概览</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tt-pill tt-pill-neutral">{selectedCohort.tasks.length} 项任务</span>
                    {canManage ? (
                      <>
                        <button
                          className="inline-flex h-8 items-center rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700"
                          disabled={filteredSubmissionTasks.length === 0}
                          onClick={() =>
                            setVisibleSelection(
                              filteredSubmissionTasks.map((task) => task.id),
                              selectedTeacherTrainingTaskIds,
                              setSelectedTeacherTrainingTaskIds,
                            )
                          }
                          type="button"
                        >
                          全选/取消当前结果
                        </button>
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={selectedTeacherTrainingTaskIds.length === 0 || isSaving}
                          onClick={() => void removeSelectedTasks()}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          批量删除汇报任务
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {canManage ? (
                  <div className="mt-4 grid gap-3">
                    <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white/70 p-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="px-2 text-xs font-semibold text-slate-500">汇报筛选</span>
                      <div className="grid gap-2 sm:flex sm:flex-wrap">
                        {submissionOverviewFilters.map((item) => {
                          const isActive = submissionOverviewFilter === item.key;

                          return (
                            <button
                              key={item.key}
                              aria-pressed={isActive}
                              className={`h-9 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70 ${
                                isActive
                                  ? "bg-blue-600 text-white shadow-sm shadow-blue-900/15"
                                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50 hover:text-blue-700"
                              }`}
                              onClick={() => setSubmissionOverviewFilter(item.key)}
                              type="button"
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>搜索汇报教师</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("搜索汇报教师")}
                        onChange={(event) => setSubmissionSearch(event.target.value)}
                        placeholder="按教师姓名、单位、分组或任务搜索"
                        value={submissionSearch}
                      />
                    </label>
                    <TeacherTrainingFilterSummary
                      items={teacherTrainingFilterSummaries.submissions}
                      onClear={
                        submissionSearchKeyword || submissionOverviewFilter !== "all" || teacherTrainingDetailViewTitle
                          ? () => {
                              setSubmissionOverviewFilter("all");
                              setSubmissionSearch("");
                              setTeacherTrainingDetailViewTitle("");
                            }
                          : undefined
                      }
                    />
                  </div>
                ) : null}
                {canManage && teacherTrainingDownloadStatus ? (
                  <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                    {teacherTrainingDownloadStatus}
                  </p>
                ) : null}
                <div className="mt-4 grid gap-3">
                  {filteredSubmissionTasks.length === 0 ? (
                    <EmptyState
                      description={canManage ? "发布任务后，参训教师汇报会汇总在这里；可按教师姓名快速搜索。" : "管理员发布任务后，这里会显示我的任务和提交记录。"}
                      icon={FileText}
                      title="暂无任务"
                    />
                  ) : (
                    filteredSubmissionTasks.map((task) => {
                      const teacherSubmission = task.submissions.find(
                        (submission) => submission.participantId === selectedParticipant?.id,
                      );
                      const visibleSubmissions = getVisibleTaskSubmissions(task);
                      const rankedSubmissions = canManage
                        ? [...task.submissions]
                            .filter((submission) => submission.finalScore !== null || submission.aiScore !== null)
                            .sort(
                              (left, right) =>
                                (right.finalScore ?? right.aiScore ?? -1) - (left.finalScore ?? left.aiScore ?? -1),
                            )
                            .slice(0, 5)
                        : [];

                      return (
                      <div key={task.id} className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {canManage ? (
                                <input
                                  checked={selectedTeacherTrainingTaskIds.includes(task.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                  {...fieldHint(`选择汇报任务：${task.title}`)}
                                  onChange={() =>
                                    setSelectedTeacherTrainingTaskIds((current) => toggleSelectedId(current, task.id))
                                  }
                                  type="checkbox"
                                />
                              ) : null}
                              <p className="font-semibold text-slate-950">{task.title}</p>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                {task.taskTypeLabel}
                              </span>
                              {task.courseTitle ? (
                                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                                  {task.courseDate} {task.courseTimeRange ? `${task.courseTimeRange} ` : ""}{task.courseTitle}
                                </span>
                              ) : null}
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                task.isReleased ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                              }`}>
                                {task.releaseStatusLabel}
                              </span>
                              {task.enableAiReview && canManage ? (
                                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                                  AI 辅助评分
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{task.description}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                canManage || teacherSubmission
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {canManage
                                ? `${task.submissions.length}/${selectedCohort.participants.length} 份`
                                : teacherSubmission
                                  ? "已提交"
                                  : "待提交"}
                            </span>
                            {canManage ? (
                              <>
                                {task.enableAiReview ? (
                                  <button
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 disabled:cursor-wait disabled:opacity-60"
                                    disabled={isSaving || task.submissions.length === 0}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          `确认对“${task.title}”的 ${task.submissions.length} 份 PDF 汇报生成 AI 初评？\n\n系统会自动分批处理并读取 PDF 文本；AI 初评不会覆盖人工最终得分。`,
                                        )
                                      ) {
                                        return;
                                      }
                                      void runTeacherTrainingTaskAiReview(task.id);
                                    }}
                                    title={task.submissions.length === 0 ? "暂无已提交汇报" : "生成 AI 初评；超过 60 份会自动分批"}
                                    type="button"
                                  >
                                    <Bot className="h-3.5 w-3.5" />
                                    AI 初评
                                  </button>
                                ) : null}
                                <button
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600"
                                  onClick={() => editTask(task)}
                                  type="button"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  修改
                                </button>
                                <button
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600"
                                  onClick={() => void removeTask(task)}
                                  type="button"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  删除
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {!canManage ? (
                          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-xs leading-5 text-slate-600">
                                {teacherSubmission
                                  ? `已提交：${teacherSubmission.submittedAt}`
                                  : "这项任务还没有提交，请上传 PDF 汇报后保存。"}
                              </p>
                              <button
                                aria-label={`${teacherSubmission ? "更新" : "继续填写"}${task.title}省培任务汇报`}
                                className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-white px-3 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-100 sm:w-auto"
                                onClick={() => focusTeacherTaskSubmission(task.id)}
                                title={`${teacherSubmission ? "更新" : "继续填写"}${task.title}省培任务汇报`}
                                type="button"
                              >
                                {teacherSubmission ? "更新汇报" : "继续填写汇报"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {canManage && rankedSubmissions.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/55 px-3 py-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-xs font-bold text-blue-800">评分排名摘要</p>
                              <p className="text-[11px] text-blue-700">按人工终评分优先，未确认时参考 AI 初评分</p>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {rankedSubmissions.map((submission, index) => (
                                <span
                                  key={submission.id}
                                  className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                                >
                                  {index + 1}. {submission.participantName} {submission.finalScore ?? submission.aiScore}分
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {visibleSubmissions.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {visibleSubmissions.map((submission) => {
                              const attachmentFile = submission.attachmentFile;
                              const reviewDraft = getSubmissionReviewDraft(submission);
                              const participant = participantById.get(submission.participantId);
                              const previewOpen = previewTeacherTrainingSubmissionId === submission.id;

                              return (
                                <div key={submission.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm text-slate-600">
                                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-slate-900">{submission.participantName}</span>
                                        {participant?.organization ? (
                                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                                            {participant.organization}
                                          </span>
                                        ) : null}
                                        {canManage ? (
                                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                                            {submission.reviewStatusLabel}
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500">提交时间：{submission.submittedAt}</p>
                                      <p className="mt-2 text-xs leading-5 text-slate-500">
                                        {attachmentFile?.fileName ?? submission.attachmentLabel ?? "未上传附件"}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                      <button
                                        className="inline-flex h-8 w-fit items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                        onClick={() =>
                                          setPreviewTeacherTrainingSubmissionId((current) =>
                                            current === submission.id ? "" : submission.id,
                                          )
                                        }
                                        type="button"
                                      >
                                        <FileText className="h-3 w-3" />
                                        {previewOpen ? "收起预览" : "在线预览"}
                                      </button>
                                      {attachmentFile ? (
                                        <button
                                          className="inline-flex h-8 w-fit items-center gap-1 rounded-md border border-blue-100 bg-white px-2 py-1 text-xs font-semibold text-blue-700"
                                          disabled={downloadingTeacherTrainingFile === attachmentFile.downloadUrl}
                                          onClick={() =>
                                            void downloadTeacherTrainingFile({
                                              url: attachmentFile.downloadUrl,
                                              label: "任务汇报附件",
                                              fallbackName: attachmentFile.fileName,
                                            })
                                          }
                                          type="button"
                                        >
                                          <Download className="h-3 w-3" />
                                          附件
                                        </button>
                                      ) : submission.attachmentLabel ? (
                                        <span className="inline-flex h-8 w-fit items-center rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-500">
                                          附件：{submission.attachmentLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  {previewOpen ? (
                                    <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3">
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                          <p className="text-xs font-bold text-blue-700">汇报在线预览</p>
                                          <p className="mt-1 text-xs leading-5 text-slate-500">
                                            {submission.participantName}
                                            {participant?.organization ? ` · ${participant.organization}` : ""} · {submission.submittedAt}
                                          </p>
                                        </div>
                                        <span className="tt-pill">{submission.reviewStatusLabel}</span>
                                      </div>
                                      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                                        <div className="min-h-[420px] overflow-hidden rounded-lg border border-slate-100 bg-slate-50/75">
                                          {attachmentFile ? (
                                            <iframe
                                              className="h-[420px] w-full bg-white"
                                              src={attachmentFile.downloadUrl}
                                              title={`${submission.participantName} PDF 汇报预览`}
                                            />
                                          ) : (
                                            <div className="flex h-[420px] items-center justify-center px-4 text-center text-sm text-slate-500">
                                              暂无可预览的 PDF 附件
                                            </div>
                                          )}
                                        </div>
                                        <div className="grid gap-2 text-xs leading-5">
                                          <div className="rounded-lg border border-slate-100 bg-slate-50/75 p-3">
                                            <p className="font-bold text-slate-700">附件</p>
                                            <p className="mt-1 text-slate-500">
                                              {attachmentFile
                                                ? `${attachmentFile.fileName} · ${Workspace.formatFileSize(attachmentFile.fileSize)}`
                                                : submission.attachmentLabel || "未上传附件"}
                                            </p>
                                          </div>
                                          <div className="rounded-lg border border-indigo-100 bg-indigo-50/75 p-3 text-indigo-700">
                                            <p className="font-bold">AI 初评</p>
                                            <p className="mt-1">
                                              {submission.aiScore === null ? "尚未评分" : `${submission.aiScore} 分`}
                                            </p>
                                            {submission.aiComment ? <p className="mt-1 text-indigo-600">{submission.aiComment}</p> : null}
                                          </div>
                                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/75 p-3 text-emerald-700">
                                            <p className="font-bold">人工终评</p>
                                            <p className="mt-1">
                                              {submission.finalScore === null ? "待确认" : `${submission.finalScore} 分`}
                                            </p>
                                            {submission.finalComment ? <p className="mt-1 text-emerald-600">{submission.finalComment}</p> : null}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                  {canManage ? (
                                    <div className="mt-3 grid gap-2 rounded-lg border border-white bg-white/70 p-3 lg:grid-cols-[120px_minmax(0,1fr)_auto] lg:items-end">
                                      {task.enableAiReview ? (
                                        <div className="lg:col-span-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-700">
                                          AI 初评：{submission.aiScore === null ? "尚未评分" : `${submission.aiScore} 分`}
                                          {submission.aiComment
                                            ? ` · ${submission.aiComment}`
                                            : "。AI 读取 PDF 文本生成初评；最终以人工确认分为准。"}
                                        </div>
                                      ) : null}
                                      <label className={teacherTrainingFieldShellClassName}>
                                        <span className={teacherTrainingFieldLabelClassName}>最终得分</span>
                                        <input
                                          className={fieldClassName}
                                          inputMode="numeric"
                                          {...fieldHint(`${submission.participantName}最终得分`)}
                                          max={100}
                                          min={0}
                                          onChange={(event) =>
                                            updateSubmissionReviewDraft(submission, {
                                              finalScore: event.target.value.replace(/[^\d]/g, "").slice(0, 3),
                                            })
                                          }
                                          placeholder="0-100"
                                          type="text"
                                          value={reviewDraft.finalScore}
                                        />
                                      </label>
                                      <label className={teacherTrainingFieldShellClassName}>
                                        <span className={teacherTrainingFieldLabelClassName}>人工评语</span>
                                        <input
                                          className={fieldClassName}
                                          {...fieldHint(`${submission.participantName}人工评语`)}
                                          onChange={(event) =>
                                            updateSubmissionReviewDraft(submission, { finalComment: event.target.value })
                                          }
                                          placeholder="可选，填写最终评价或修改意见"
                                          value={reviewDraft.finalComment}
                                        />
                                      </label>
                                      <ActionButton
                                        aria-label={`保存${submission.participantName}任务汇报评分`}
                                        className="h-10"
                                        loading={isSaving}
                                        onClick={() => void submitSubmissionReview(submission)}
                                        title={`保存${submission.participantName}任务汇报评分`}
                                        variant="secondary"
                                      >
                                        保存评分
                                      </ActionButton>
                                      {submission.finalReviewedAt ? (
                                        <p className="lg:col-span-3 text-xs text-slate-500">
                                          已由 {submission.finalReviewedByName || "管理者"} 于 {submission.finalReviewedAt} 确认
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : submissionSearchKeyword ? (
                          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                            这个任务下没有匹配的教师汇报。
                          </p>
                        ) : null}
                      </div>
                      );
                    })
                  )}
                </div>
              </section>
              ) : null}

              {canManage && showTeacherTrainingSection("exports") ? (
                <section className="tt-card p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="tt-block-title">导出归档</p>
                      <p className="mt-1.5 text-xs leading-5 text-slate-500">
                        按当前班次分别导出名单、到达、报到、课程签到、请假审批和汇报归档。
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        导出可能需要几十秒，按钮转圈时请不要重复点击。
                      </p>
                    </div>
                    <span className="tt-pill">{selectedCohort.title}</span>
                  </div>
                  {exportStatus ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-semibold leading-5 text-blue-700">
                        {exportingTeacherTrainingType ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : null}
                        <span>{exportStatus}</span>
                      </div>
                      {exportingTeacherTrainingType ? (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-blue-100">
                          <div className="tt-progress-indeterminate h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                    {teacherTrainingExportItems.map((item) => {
                      const isExporting = exportingTeacherTrainingType === item.type;
                      return (
                      <button
                        key={item.type}
                        className="tt-action-card group p-4 text-left disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                        aria-label={`${item.label}：${item.description}`}
                        disabled={Boolean(exportingTeacherTrainingType)}
                        onClick={() => void downloadTeacherTrainingExport(item.type, item.label)}
                        title={`${item.label}：${item.description}`}
                        type="button"
                      >
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
                          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </span>
                        <span className="mt-4 block text-sm font-bold text-slate-950">{item.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {isExporting ? "正在生成下载文件..." : item.description}
                        </span>
                      </button>
                    );
                    })}
                  </div>
                  <div className="mt-5 rounded-2xl border border-slate-200/75 bg-white/78 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">本次浏览导出记录</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        {recentExportRecords.length} 条
                      </span>
                    </div>
                    {recentExportRecords.length ? (
                      <div className="mt-3 grid gap-2">
                        {recentExportRecords.map((record) => (
                          <div key={record.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                            <span className="font-bold text-slate-900">{record.label}</span>
                            <span className="mx-2 text-slate-300">/</span>
                            <span>{record.exportedAt}</span>
                            <span className="mx-2 text-slate-300">/</span>
                            <span className="break-all">{record.fileName}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                        当前页面还没有导出记录；导出成功后会显示文件名和时间。
                      </p>
                    )}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
