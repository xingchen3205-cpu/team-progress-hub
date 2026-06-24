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

type TeacherTrainingExportType = "participants" | "arrivals" | "attendance" | "checkIns" | "submissions";

const teacherTrainingExportItems: Array<{
  label: string;
  type: TeacherTrainingExportType;
  description: string;
}> = [
  { label: "导出名单", type: "participants", description: "参训教师、单位、账号和预录信息" },
  { label: "导出到达信息", type: "arrivals", description: "预计到达时间、交通方式和车次信息" },
  { label: "导出报到信息", type: "attendance", description: "报到状态、时间、房号和材料情况" },
  { label: "导出课程签到", type: "checkIns", description: "定位签到任务和签到明细" },
  { label: "导出汇报", type: "submissions", description: "任务完成情况和汇报内容" },
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
    { key: "email", label: "邮箱列", fallbackIndex: 5 },
    { key: "arrivalAt", label: "到达时间列", fallbackIndex: 6 },
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
  const missingRequiredCount = rows.filter((row) => !row.name.trim() || !row.organization.trim()).length;
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
  radiusMeters: "300",
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
const teacherTrainingFieldShellWideClassName = `${teacherTrainingFieldShellClassName} sm:col-span-2`;
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

const teacherTrainingManagerRoleOptions = [
  {
    title: "省培负责人",
    accountLabel: "选择省培负责人账号",
    buttonLabel: "设置省培负责人",
    description: "班次统筹人员，列表中显示在班主任前面。",
  },
  {
    title: "班主任",
    accountLabel: "选择班主任账号",
    buttonLabel: "设置班主任",
    description: "班级日常管理人员，和负责人拥有相同省培管理权限。",
  },
];

const getTeacherTrainingManagerRoleRank = (title: string) => {
  if (title.includes("负责人")) return 0;
  if (title.includes("班主任")) return 1;
  return 2;
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
    steps: ["建立班次和地点", "设置负责人和班主任", "两者权限一致"],
  },
  participants: {
    title: "参训教师",
    steps: ["录入教师信息", "可绑定已有账号", "复制账号消息"],
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
    steps: ["教师选择任务", "填写汇报内容", "管理员统一导出汇总"],
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
    steps: ["选择当前班次", "按名单/签到/汇报导出", "下载后可直接归档"],
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
  reason: string,
  canManage = false,
) => {
  const participantReason = getTeacherTrainingParticipantDisabledReason(hasParticipant, canManage);
  if (participantReason) return participantReason;

  if (!leaveFlow?.isEnabled || leaveFlow.approvalSteps.length === 0) {
    return "管理员尚未配置请假审批流程，请联系省培负责人、班主任或管理员";
  }

  if (!reason.trim()) {
    return "请填写请假原因后再提交";
  }

  return "";
};

const getTeacherTrainingSubmissionDisabledReason = (
  hasTask: boolean,
  hasParticipant: boolean,
  content: string,
  canManage = false,
  requiresAttachment = false,
  hasAttachment = false,
) => {
  const participantReason = getTeacherTrainingParticipantDisabledReason(hasParticipant, canManage);
  if (participantReason) return participantReason;

  if (!hasTask) {
    return "暂无省培任务，请等待管理员发布任务";
  }

  if (!content.trim()) {
    return "请填写汇报内容后再保存";
  }

  if (requiresAttachment && !hasAttachment) {
    return "该任务要求上传 Word/PDF 附件，请先选择附件";
  }

  return "";
};

const getTeacherTrainingProfileDisabledReason = (draft: Workspace.TeacherTrainingProfileDraft) => {
  const participantReason = getTeacherTrainingParticipantDisabledReason(Boolean(draft.participantId));
  if (participantReason) return participantReason;

  const requiredFields = [
    draft.name,
    draft.organization,
    draft.phone,
    draft.groupName,
    draft.title,
    draft.email,
    draft.arrivalAt,
    draft.arrivalTransportation,
    draft.arrivalVehicleNo,
    draft.arrivalDeparture,
  ];
  if (requiredFields.some((value) => !value.trim())) {
    return "请填写完整个人资料后再保存";
  }

  return "";
};

export default function TeacherTrainingTab() {
  const {
    currentUser,
    teacherTrainingCohorts,
    teacherTrainingApproverOptions,
    teacherTrainingManagerOptions,
    hasGlobalAdminRole,
    canManageTeacherTraining,
    activeTeacherTrainingSection,
    setActiveTeacherTrainingSection,
    activeTeacherTrainingCohortId,
    setActiveTeacherTrainingCohortId,
    isSaving,
    createTeacherTrainingCohort,
    deleteTeacherTrainingCohort,
    addTeacherTrainingParticipant,
    importTeacherTrainingParticipants,
    createTeacherTrainingCourseSession,
    importTeacherTrainingCourses,
    deleteTeacherTrainingCourseSession,
    createTeacherTrainingCheckInTask,
    deleteTeacherTrainingCheckInTask,
    signTeacherTrainingCheckIn,
    markTeacherTrainingAttendance,
    generateTeacherTrainingAccountMessage,
    updateTeacherTrainingParticipantAccount,
    deleteTeacherTrainingParticipantAccount,
    deleteTeacherTrainingParticipant,
    assignTeacherTrainingCohortManager,
    removeTeacherTrainingCohortManager,
    updateTeacherTrainingLeaveFlow,
    submitTeacherTrainingLeaveRequest,
    reviewTeacherTrainingLeaveRequest,
    createTeacherTrainingTask,
    deleteTeacherTrainingTask,
    saveTeacherTrainingSubmission,
    updateTeacherTrainingProfile,
    loadTeacherTrainingCohortDetails,
  } = Workspace.useWorkspaceContext();
  const {
    ActionButton,
    CalendarDays,
    ChevronDown,
    CheckCircle2,
    ClipboardCheck,
    Copy,
    Download,
    EmptyState,
    FileCheck,
    FileText,
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
  const teacherTrainingListCardClassName = "tt-card flex min-h-0 flex-col p-5";
  const teacherTrainingFillingListClassName =
    "min-h-0 flex-1 max-h-[min(68vh,760px)] overflow-y-auto pr-1 overscroll-contain";

  const selectedCohortId = activeTeacherTrainingCohortId;
  const setSelectedCohortId = setActiveTeacherTrainingCohortId;
  const [cohortDraft, setCohortDraft] = useState<Workspace.TeacherTrainingCohortDraft>(createDefaultCohortDraft);
  // 班次管理页：新建/修改表单与辅助信息默认折叠，让页面以班次列表为主、更清爽。
  const [cohortFormOpen, setCohortFormOpen] = useState(false);
  const [cohortConfigOpen, setCohortConfigOpen] = useState(false);
  const [participantDraft, setParticipantDraft] = useState<Workspace.TeacherTrainingParticipantDraft>({
    cohortId: "",
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
    accountUsername: "",
    accountPassword: "",
    extraInfo: "",
    note: "",
  });
  const [participantImportText, setParticipantImportText] = useState("");
  const [participantImportStatus, setParticipantImportStatus] = useState("");
  const [participantImportLoading, setParticipantImportLoading] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantAccountFilter, setParticipantAccountFilter] = useState<"all" | "unbound">("all");
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
  const [leaveReviewComment, setLeaveReviewComment] = useState("");
  const [activeLeavePanel, setActiveLeavePanel] = useState<TeacherTrainingLeavePanelKey>("pending");
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
  const [taskDraft, setTaskDraft] = useState<Workspace.TeacherTrainingTaskDraft>({
    cohortId: "",
    title: "",
    description: "",
    dueDate: "",
    requireAttachment: false,
  });
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
  const [submissionAttachmentProgress, setSubmissionAttachmentProgress] = useState<number | null>(null);
  const [submissionAttachmentError, setSubmissionAttachmentError] = useState("");
  const [submissionSaveStatus, setSubmissionSaveStatus] = useState("");
  const [isSubmissionAttachmentUploading, setIsSubmissionAttachmentUploading] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setCheckInClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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
  const selectedTask = selectedCohort?.tasks.find((task) => task.id === submissionDraft.taskId) ?? selectedCohort?.tasks[0] ?? null;
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
          note: selectedParticipant.note,
        }
      : profileDraft;
  const exportBaseUrl = selectedCohort
    ? `/api/teacher-training/export?cohortId=${encodeURIComponent(selectedCohort.id)}`
    : "";
  const canManage = canManageTeacherTraining;
  const showTeacherTrainingSubmissionForm = !canManage;
  const canManageGlobal = hasGlobalAdminRole;
  const canCreateTeacherTrainingCohort = currentUser?.role === "admin";
  const canShowCohortDraftForm = canCreateTeacherTrainingCohort || Boolean(cohortDraft.id);
  const canConfigureTeacherTrainingLeaveFlow = currentUser?.role === "admin";
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
    if (participantAccountFilter === "unbound" && participant.accountUserId) return false;
    if (!participantSearchKeyword) return true;
    return [
      participant.name,
      participant.organization,
      participant.phone,
      participant.groupName,
      participant.title,
      participant.email,
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
      { label: "原平台账号", value: platformCount, tone: "slate" },
    ];
  }, [selectedCohort?.participants]);
  const getParticipantAccountTypeLabel = (participant: Workspace.TeacherTrainingParticipantItem) => {
    if (!participant.accountUserId) return "未绑定账号";
    return participant.accountRole === "training_teacher" ? "省培专用账号" : "原平台账号";
  };
  const getParticipantAccountTypeClassName = (participant: Workspace.TeacherTrainingParticipantItem) => {
    if (!participant.accountUserId) return "bg-amber-50 text-amber-700";
    return participant.accountRole === "training_teacher"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-slate-100 text-slate-600";
  };
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
      ...task.submissions.flatMap((submission) => {
        const participant = participantById.get(submission.participantId);
        return [
          submission.participantName,
          participant?.organization ?? "",
          participant?.groupName ?? "",
          participant?.title ?? "",
          participant?.email ?? "",
          submission.content,
          submission.attachment,
          submission.attachmentLabel,
          submission.submittedAt,
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
            submission.content,
            submission.attachment,
            submission.attachmentLabel,
            submission.submittedAt,
          ]
            .join(" ")
            .toLocaleLowerCase("zh-CN")
            .includes(submissionSearchKeyword);
        })
      : task.submissions;

    return submissions.slice(0, submissionSearchKeyword ? 8 : 3);
  };
  const filteredSubmissionTasks = (selectedCohort?.tasks ?? []).filter(matchesSubmissionSearch);
  const filteredCheckInTasks = (selectedCohort?.checkInTasks ?? []).filter((task) => {
    if (!checkInSearchKeyword) return true;
    return [
      task.title,
      task.signDate,
      task.locationName,
      ...task.records.flatMap((record) => {
        const participant = participantById.get(record.participantId);
        return [
          record.participantName,
          participant?.organization ?? "",
          participant?.groupName ?? "",
          participant?.title ?? "",
          participant?.email ?? "",
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
  const teacherSubmittedTaskIds = new Set(
    (selectedCohort?.tasks ?? [])
      .filter((task) => task.submissions.some((submission) => submission.participantId === selectedParticipant?.id))
      .map((task) => task.id),
  );
  const teacherPendingTaskCount =
    !canManage && selectedCohort
      ? selectedCohort.tasks.filter((task) => !teacherSubmittedTaskIds.has(task.id)).length
      : 0;
  const teacherTaskProgressItems = (selectedCohort?.tasks ?? []).map((task) => {
    const submission = task.submissions.find((item) => item.participantId === selectedParticipant?.id) ?? null;

    return {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
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
      label: "预计到达",
      isComplete: Boolean(effectiveProfileDraft.arrivalAt.trim()),
      completeLabel: "预计到达时间已填写",
      incompleteLabel: "预计到达时间待补充",
      required: true,
    },
    {
      label: "交通方式",
      isComplete: Boolean(effectiveProfileDraft.arrivalTransportation.trim()),
      completeLabel: "交通方式已填写",
      incompleteLabel: "交通方式待补充",
      required: true,
    },
    {
      label: "车次/航班/车牌",
      isComplete: Boolean(effectiveProfileDraft.arrivalVehicleNo.trim()),
      completeLabel: "车次信息已填写",
      incompleteLabel: "车次信息待补充",
      required: true,
    },
    {
      label: "出发地",
      isComplete: Boolean(effectiveProfileDraft.arrivalDeparture.trim()),
      completeLabel: "出发地已填写",
      incompleteLabel: "出发地待补充",
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
  ];
  const teacherProfileCompletedCount = teacherProfileCompletionItems.filter((item) => item.isComplete).length;
  const teacherProfileCompletionPercent = Math.round(
    (teacherProfileCompletedCount / Math.max(1, teacherProfileCompletionItems.length)) * 100,
  );
  const teacherRequiredProfileItems = teacherProfileCompletionItems.filter((item) => item.required);
  const teacherProfileNeedsAttention =
    !hasSelectedParticipant || teacherRequiredProfileItems.some((item) => !item.isComplete);
  const teacherProfileStatusText = teacherProfileNeedsAttention ? "资料待完善" : "资料已完整";
  const teacherInitialProfileRequired = !canManage && hasSelectedParticipant && teacherProfileNeedsAttention;

  useEffect(() => {
    if (teacherInitialProfileRequired && activeTeacherTrainingSection !== "profile") {
      setActiveTeacherTrainingSection("profile");
    }
  }, [activeTeacherTrainingSection, setActiveTeacherTrainingSection, teacherInitialProfileRequired]);

  const leaveDisabledReason = getTeacherTrainingLeaveDisabledReason(
    hasSelectedParticipant,
    selectedCohort?.leaveFlow,
    leaveDraft.reason,
    canManage,
  );
  const profileDisabledReason = getTeacherTrainingProfileDisabledReason(effectiveProfileDraft);
  const submissionDisabledReason = getTeacherTrainingSubmissionDisabledReason(
    Boolean(selectedTask),
    hasSelectedParticipant,
    submissionDraft.content,
    canManage,
    Boolean(selectedTask?.requireAttachment),
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
        value: `${filteredSubmissionTasks.length}/${selectedCohort?.tasks.length ?? 0} 个任务`,
      },
    ].filter(Boolean) as TeacherTrainingFilterSummaryItem[],
  };
  const teacherLeaveRequests = [...(selectedParticipant?.leaveRequests ?? [])].sort((first, second) =>
    second.submittedAt.localeCompare(first.submittedAt),
  );
  const teacherLatestLeaveRequest = teacherLeaveRequests[0] ?? null;
  const approverLabelById = useMemo(() => {
    const labels = new Map(
      teacherTrainingApproverOptions.map((option) => [
        option.id,
        formatTeacherTrainingApproverLabel(Workspace.teacherTrainingRoleTitleLabels[option.role] ?? "工作人员", option.name),
      ]),
    );

    selectedCohort?.managers.forEach((manager) => {
      labels.set(manager.userId, formatTeacherTrainingApproverLabel(manager.title || "班主任", manager.name));
    });

    return labels;
  }, [selectedCohort?.managers, teacherTrainingApproverOptions]);
  const selectedManagerRoleOption =
    teacherTrainingManagerRoleOptions.find((option) => option.title === managerDraft.title) ??
    teacherTrainingManagerRoleOptions[0];
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
        title: "班主任",
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
        label: "班主任",
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
        label: "班主任",
        done: classTeachers.length > 0,
        severity: "required",
        detail: classTeachers.map((manager) => manager.name).join("、") || "班主任未设置，日常管理责任不清楚",
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

  const submitParticipant = async () => {
    if (!selectedCohort) return;
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
      setTaskDraft({ cohortId: "", title: "", description: "", dueDate: "", requireAttachment: false });
    }
  };

  const editTask = (task: Workspace.TeacherTrainingTaskItem) => {
    setTaskDraft({
      id: task.id,
      cohortId: task.cohortId,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ?? "",
      requireAttachment: task.requireAttachment,
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
      setSubmissionAttachmentError(validationError);
      return;
    }

    setSubmissionAttachmentFile(file);
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

  const useCurrentLocationForCheckInTask = () => {
    if (!navigator.geolocation) {
      setLocationMessage("当前浏览器不支持定位，可手动填写经纬度。");
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
            ? "定位权限被拒绝，请在浏览器地址栏允许本网站使用位置，或手动填写经纬度。"
            : "定位失败，请检查网络和设备定位后重试，或手动填写经纬度。",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const signWithCurrentLocation = (checkInTaskId: string) => {
    if (!selectedParticipant) return;
    if (!navigator.geolocation) {
      setLocationMessage("当前浏览器不支持定位签到。");
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
            ? "定位权限被拒绝，请在浏览器地址栏允许本网站使用位置后重试。"
            : "定位失败，请检查网络和设备定位后重试。",
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
        firstMessage: `确认解绑省培账号“${participant.accountUsername}”？\n\n解绑后，该教师将不能再通过此参训档案进入省培系统；参训教师档案、报到、请假和汇报记录会保留。`,
        secondMessage: participant.accountRole === "training_teacher"
          ? "只删除省培专用登录账号，不删除参训教师档案。"
          : "只解绑账号，不删除档案，也不删除原平台账号。",
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
        secondMessage: "该操作会从当前省培班次名单中移除这名教师；如果是省培专用账号，系统会同步删除该账号。",
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

  const getPhoneAccountUsername = (participant: Workspace.TeacherTrainingParticipantItem) => {
    const digits = participant.phone.replace(/\D/g, "");
    return digits ? `sp${digits.slice(-8)}` : "";
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
    await submitTeacherTrainingLeaveRequest({
      ...leaveDraft,
      participantId: selectedParticipant?.id ?? leaveDraft.participantId,
    });
  };

  const reviewLeaveRequest = async (leaveRequestId: string, decision: "approve" | "reject") => {
    const targetRequest = selectedCohort?.leaveRequests.find((request) => request.id === leaveRequestId);
    if (!window.confirm(`确认${decision === "approve" ? "通过" : "驳回"}${targetRequest?.participantName ?? "该教师"}的请假申请？`)) {
      return;
    }

    await reviewTeacherTrainingLeaveRequest({
      leaveRequestId,
      decision,
      comment: leaveReviewComment,
    });
    setLeaveReviewComment("");
  };

  const openTeacherTrainingSection = (
    key: Workspace.TeacherTrainingSectionKey,
    options: { keepDetailViewTitle?: boolean } = {},
  ) => {
    if (teacherInitialProfileRequired && key !== "profile") {
      setActiveTeacherTrainingSection("profile");
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

  const metricCards: Array<{ label: string; value: number; Icon: typeof Users; onClick: () => void; title: string }> = [
    {
      label: "参训教师",
      value: selectedCohort?.stats.participantCount ?? 0,
      Icon: Users,
      onClick: () => openOverviewMetric({ detailViewTitle: "全部参训教师", section: "participants" }),
      title: "查看参训教师名单",
    },
    {
      label: "负责人/班主任",
      value: selectedCohort?.stats.managerCount ?? 0,
      Icon: User,
      onClick: () => openOverviewMetric({ detailViewTitle: "负责人/班主任", section: "cohorts" }),
      title: "查看负责人/班主任设置",
    },
    {
      label: "课程",
      value: selectedCohort?.stats.courseCount ?? 0,
      Icon: CalendarDays,
      onClick: () => openOverviewMetric({ detailViewTitle: "课程安排", section: "courses" }),
      title: "查看课程安排",
    },
    {
      label: "已报到",
      value: selectedCohort?.stats.presentCount ?? 0,
      Icon: CheckCircle2,
      onClick: () => openOverviewMetric({ attendanceFilter: "registered", detailViewTitle: "已报到教师", section: "attendance" }),
      title: "查看已报到教师",
    },
    {
      label: "请假",
      value: selectedCohort?.stats.leaveCount ?? 0,
      Icon: CalendarDays,
      onClick: () => openOverviewMetric({ attendanceFilter: "leave", detailViewTitle: "请假教师", section: "attendance" }),
      title: "查看请假教师",
    },
    {
      label: "缺勤",
      value: selectedCohort?.stats.absentCount ?? 0,
      Icon: FileCheck,
      onClick: () => openOverviewMetric({ attendanceFilter: "absent", detailViewTitle: "缺勤教师", section: "attendance" }),
      title: "查看缺勤教师",
    },
    {
      label: "课程签到",
      value: selectedCohort?.stats.checkInRecordCount ?? 0,
      Icon: MapPin,
      onClick: () => openOverviewMetric({ detailViewTitle: "课程签到记录", section: "checkins" }),
      title: "查看课程签到记录",
    },
    {
      label: "任务",
      value: selectedCohort?.stats.taskCount ?? 0,
      Icon: FileText,
      onClick: () => openOverviewMetric({ detailViewTitle: "全部任务", section: "tasks", submissionFilter: "all" }),
      title: "查看任务列表",
    },
    {
      label: "汇报",
      value: selectedCohort?.stats.submissionCount ?? 0,
      Icon: Send,
      onClick: () => openOverviewMetric({ detailViewTitle: "已提交汇报", section: "tasks", submissionFilter: "submitted" }),
      title: "查看已提交汇报",
    },
  ];
  const overviewSummaryCards = [
    {
      label: "参训教师",
      value: selectedCohort?.stats.participantCount ?? 0,
      helper: "名单与账号",
      onClick: () => openOverviewMetric({ detailViewTitle: "全部参训教师", section: "participants" }),
      title: "查看参训教师名单",
    },
    {
      label: "课程安排",
      value: selectedCohort?.stats.courseCount ?? 0,
      helper: "课程表",
      onClick: () => openOverviewMetric({ detailViewTitle: "课程安排", section: "courses" }),
      title: "查看课程安排",
    },
    {
      label: "任务汇报",
      value: selectedCohort?.stats.submissionCount ?? 0,
      helper: "已提交",
      onClick: () => openOverviewMetric({ detailViewTitle: "已提交汇报", section: "tasks", submissionFilter: "submitted" }),
      title: "查看已提交汇报",
    },
  ];
  const todayOverviewCards = [
    {
      label: "课程安排",
      value: selectedCohort?.stats.courseCount ?? 0,
      Icon: CalendarDays,
      onClick: () => openOverviewMetric({ detailViewTitle: "课程安排", section: "courses" }),
      title: "查看课程安排",
    },
    {
      label: "签到记录",
      value: selectedCohort?.stats.checkInRecordCount ?? 0,
      Icon: MapPin,
      onClick: () => openOverviewMetric({ detailViewTitle: "课程签到记录", section: "checkins" }),
      title: "查看签到记录",
    },
    {
      label: "任务汇报",
      value: selectedCohort?.stats.submissionCount ?? 0,
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
    { label: "参训教师", helper: "名单、账号、预录信息", Icon: Users, onClick: () => openTeacherTrainingSection("participants") },
    { label: "课程安排", helper: "课程表和授课信息", Icon: CalendarDays, onClick: () => openTeacherTrainingSection("courses") },
    { label: "报到签到", helper: "报到登记和课程签到", Icon: MapPin, onClick: () => openTeacherTrainingSection("attendance") },
    { label: "请假审批", helper: "待审批和全部申请", Icon: FileCheck, onClick: () => openTeacherTrainingSection("leave") },
    { label: "任务汇报", helper: "发布任务和查看提交", Icon: Send, onClick: () => openTeacherTrainingSection("tasks") },
    { label: "导出归档", helper: "名单、签到、汇报导出", Icon: Download, onClick: () => openTeacherTrainingSection("exports") },
  ];
  const teacherTrainingSectionCounts: Partial<Record<Workspace.TeacherTrainingSectionKey, number>> = {
    cohorts: selectedCohort?.stats.managerCount ?? 0,
    participants: selectedCohort?.stats.participantCount ?? 0,
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
  const teacherMobileFocusItems =
    teacherMobilePriorityItems.length > 0
      ? teacherMobilePriorityItems
      : [
          {
            label: "今日事项已处理",
            value: "已完成",
            helper: "可继续查看课程安排",
            Icon: CheckCircle2,
            section: "courses" as const,
            tone: "emerald" as const,
          },
        ];
  const teacherCommandTodoCards: Array<{
    label: string;
    value: string;
    helper: string;
    Icon: typeof Users;
    section: Workspace.TeacherTrainingSectionKey;
    tone: "amber" | "blue" | "emerald";
  }> = [
    {
      label: "今日课程",
      value: teacherNextCourse ? "已发布" : "待发布",
      helper: teacherNextCourse
        ? [teacherNextCourse.courseDate, [teacherNextCourse.startTime, teacherNextCourse.endTime].filter(Boolean).join("-")]
            .filter(Boolean)
            .join(" · ")
        : "等待管理员发布课程安排",
      Icon: CalendarDays,
      section: "courses",
      tone: teacherNextCourse ? "blue" : "amber",
    },
    {
      label: "定位签到",
      value: teacherPendingCheckInCount > 0 ? `${teacherPendingCheckInCount} 项` : "已处理",
      helper: teacherCheckInQuickActionHelper,
      Icon: MapPin,
      section: "checkins",
      tone: teacherPendingCheckInCount > 0 ? "amber" : "emerald",
    },
    {
      label: "任务汇报",
      value: teacherPendingTaskCount > 0 ? `${teacherPendingTaskCount} 项` : "已处理",
      helper: teacherTaskQuickActionHelper,
      Icon: Send,
      section: "tasks",
      tone: teacherPendingTaskCount > 0 ? "amber" : "emerald",
    },
    {
      label: "临时请假",
      value: `${selectedParticipant?.leaveRequests.length ?? 0} 条`,
      helper: selectedCohort?.leaveFlow?.isEnabled ? "提交或查看审批进度" : "等待审批规则配置",
      Icon: FileCheck,
      section: "leave",
      tone: selectedCohort?.leaveFlow?.isEnabled ? "blue" : "amber",
    },
    {
      label: "个人信息",
      value: teacherProfileNeedsAttention ? "待完善" : "已完善",
      helper: teacherProfileNeedsAttention ? "请补齐报到所需资料" : "资料状态正常",
      Icon: User,
      section: "profile",
      tone: teacherProfileNeedsAttention ? "amber" : "emerald",
    },
  ];
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
  const teacherHomeQuickActions = [
    {
      label: "课程安排",
      value: courseSessions.length,
      helper: courseSessions.length > 0 ? "查看课程时间地点" : "等待管理员发布",
      Icon: CalendarDays,
      onClick: () => openTeacherTrainingSection("courses"),
    },
    {
      label: "课程签到",
      value: selectedCohort?.checkInTasks.length ?? 0,
      helper: canManage ? "查看签到进度" : teacherCheckInQuickActionHelper,
      Icon: MapPin,
      onClick: () => openTeacherTrainingSection("checkins"),
    },
    {
      label: "任务汇报",
      value: selectedCohort?.tasks.length ?? 0,
      helper: canManage ? "查看提交进度" : teacherTaskQuickActionHelper,
      Icon: Send,
      onClick: () => openTeacherTrainingSection("tasks"),
    },
    {
      label: "临时请假",
      value: selectedParticipant?.leaveRequests.length ?? 0,
      helper: selectedCohort?.leaveFlow?.isEnabled ? "提交或查看进度" : "等待流程配置",
      Icon: FileCheck,
      onClick: () => openTeacherTrainingSection("leave"),
    },
    {
      label: "个人信息",
      value: hasSelectedParticipant ? "已绑定" : "待确认",
      helper: hasSelectedParticipant ? "核对资料和预计到达时间" : "联系管理员绑定",
      Icon: User,
      onClick: () => openTeacherTrainingSection("profile"),
    },
  ];
  const ActiveTeacherTrainingIcon = activeTeacherTrainingSectionMeta?.Icon ?? ClipboardCheck;
  const showTeacherTrainingSection = (...keys: Workspace.TeacherTrainingSectionKey[]) =>
    keys.includes(effectiveTeacherTrainingSection);
  const teacherTrainingManagementGridClassName =
    canManage && showTeacherTrainingSection("cohorts")
      ? "items-start xl:grid-cols-1"
      : canManage && showTeacherTrainingSection("participants")
        ? "items-stretch xl:grid-cols-[420px_minmax(0,1fr)]"
        : "items-start";
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
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="省培平台独立管理班次、参训教师、课程签到、任务汇报、请假审批和导出归档。"
          title="江苏省职业院校创新创业教育（竞赛）指导能力提升培训"
        />
        <div className="min-w-[180px] rounded-2xl border border-blue-100 bg-white/80 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">当前模块</p>
          <p className="mt-1 text-sm font-bold text-slate-950">{activeTeacherTrainingSectionMeta?.label ?? "工作台"}</p>
          <p className="mt-1 max-w-56 text-xs leading-5 text-slate-500">
            {activeTeacherTrainingSectionMeta?.description ?? "查看省培平台运行情况。"}
          </p>
        </div>
      </div>

      <div key={effectiveTeacherTrainingSection} className="tt-fade-in space-y-4" id="teacher-training-content">
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

          {!canManage && teacherMobileNavigationSections.length > 1 ? (
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
                            : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
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
            <section
              aria-label="我的省培入口"
              className="rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-[0_18px_42px_rgba(26,111,212,0.10)] backdrop-blur"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-950">我的省培入口</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    先处理下一步事项，再查看课程、请假和个人信息。
                  </p>
                </div>
                <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  教师端常用操作
                </span>
              </div>
              <div
                aria-label="省培今日待办"
                className="mt-3 rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.92)_46%,rgba(20,184,166,0.08))] p-3 shadow-inner shadow-white/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-950">我的待办</p>
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-blue-700">
                    {teacherMobilePriorityItems.length > 0 ? `${teacherMobilePriorityItems.length} 项待处理` : "状态正常"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {teacherCommandTodoCards.map((item) => (
                    <button
                      key={item.label}
                      aria-label={`处理省培${item.label}`}
                      className="tt-action-card group flex min-h-[74px] items-center gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                      onClick={() => openTeacherTrainingSection(item.section)}
                      title={`处理省培${item.label}`}
                      type="button"
                    >
                      <span
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${
                          item.tone === "amber"
                            ? "bg-amber-50 text-amber-700"
                            : item.tone === "emerald"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        <item.Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-slate-950">{item.label}</span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            {item.value}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{item.helper}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div
                aria-label="省培下一节课"
                className="mt-3 rounded-2xl border border-slate-200/80 bg-white/86 p-3 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-blue-700">今日课程</p>
                    {teacherNextCourse ? (
                      <>
                        <p className="mt-1 truncate text-base font-black text-slate-950">{teacherNextCourse.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {[
                            teacherNextCourse.courseDate,
                            [teacherNextCourse.startTime, teacherNextCourse.endTime].filter(Boolean).join("-"),
                            teacherNextCourse.location,
                            teacherNextCourse.instructor,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm font-semibold text-slate-500">后续课程待发布</p>
                    )}
                  </div>
                  <button
                    aria-label="按时间顺序查看全部课程"
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                    onClick={() => openTeacherTrainingSection("courses")}
                    title="按时间顺序查看全部课程"
                    type="button"
                  >
                    按时间顺序查看全部课程
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {teacherHomeQuickActions.map((item) => (
                  <button
                    key={item.label}
                    aria-label={`进入省培${item.label}`}
                    className="tt-action-card group grid min-h-[92px] gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                    onClick={item.onClick}
                    title={`进入省培${item.label}`}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-[#1a6fd4] group-hover:text-white">
                        <item.Icon className="h-4 w-4" />
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                        {item.value}
                      </span>
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-slate-950">{item.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{item.helper}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {showTeacherTrainingSection("overview") ? (
            selectedCohort && selectedCohort.includeDetails === false ? (
              <TeacherTrainingCohortDetailLoadingBanner />
            ) : null
          ) : null}

          {canManage && showTeacherTrainingSection("overview") ? (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="省培详细数据">
              {metricCards.map(({ label, value, Icon, onClick, title }) => (
                <button
                  key={label}
                  aria-label={`查看省培${label}明细`}
                  className="tt-stat group text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                  onClick={onClick}
                  title={title}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3 pl-1.5">
                    <p className="tt-stat-label">{label}</p>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4] transition group-hover:bg-[#1a6fd4] group-hover:text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="tt-stat-value mt-2 pl-1.5">{value}</p>
                </button>
              ))}
            </section>
          ) : null}

          {canManage && showTeacherTrainingSection("overview") ? (
            <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]" aria-label="班次指挥台">
              <div className="tt-card-accent flex flex-col gap-5 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1a6fd4]">班次指挥台</p>
                    <h3 className="mt-2 text-2xl font-bold leading-8 text-slate-950">
                      {selectedCohort?.title ?? "暂无省培班次"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {selectedCohort
                        ? `${selectedCohort.startDate} 至 ${selectedCohort.endDate}${selectedCohort.location ? ` · ${selectedCohort.location}` : ""}`
                        : "系统管理员可先创建班次，再维护名单、课程、签到、汇报和请假流程。"}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200/70 bg-white/85 px-4 py-2 text-xs font-bold text-blue-700 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {selectedCohort ? "当前班次运行中" : "待建班"}
                  </span>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  {overviewSummaryCards.map((item) => (
                    <button
                      key={item.label}
                      aria-label={item.title}
                      className="tt-action-card px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                      onClick={item.onClick}
                      title={item.title}
                      type="button"
                    >
                      <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                      <p className="mt-1.5 text-[26px] font-extrabold leading-none tracking-tight text-slate-950">{item.value}</p>
                      <p className="mt-1.5 text-xs leading-4 text-slate-400">{item.helper}</p>
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="tt-block-title">核心待办</p>
                    <span className="tt-pill tt-pill-neutral">按当前班次统计</span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {managerCommandTodoCards.map((item) => (
                    <button
                      key={item.label}
                      aria-label={`查看省培${item.label}`}
                      className="tt-action-card group p-4 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                      onClick={item.onClick}
                      title={`查看省培${item.label}`}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${
                            item.tone === "amber"
                              ? "bg-amber-50 text-amber-700"
                              : item.tone === "rose"
                                ? "bg-rose-50 text-rose-700"
                                : item.tone === "emerald"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          <item.Icon className="h-4 w-4" />
                        </span>
                        <span className="text-[26px] font-extrabold leading-none tracking-tight text-slate-950">{item.value}</span>
                      </div>
                      <p className="mt-3 text-sm font-bold text-slate-950">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.helper}</p>
                    </button>
                  ))}
                  </div>
                </div>
              </div>

              <div className="tt-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="tt-block-title">快捷入口</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">常用管理动作集中进入。</p>
                  </div>
                  <span className="tt-pill">{managerCommandQuickLinks.length} 项</span>
                </div>
                <div className="mt-4 grid flex-1 content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {managerCommandQuickLinks.map((item) => (
                    <button
                      key={item.label}
                      aria-label={`进入省培${item.label}`}
                      className="tt-action-card group flex items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                      onClick={item.onClick}
                      title={`进入省培${item.label}`}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-[#1a6fd4] group-hover:text-white">
                          <item.Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-950">{item.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{item.helper}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-blue-700 transition group-hover:translate-x-0.5">进入 →</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <div className={`grid gap-4 ${teacherTrainingManagementGridClassName}`}>
        {canManage && showTeacherTrainingSection("cohorts", "participants") ? (
          <aside className="tt-card space-y-5 self-start p-5">
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
                  <span className="tt-pill">{teacherTrainingCohorts.length} 个</span>
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
                              <span className="block truncate text-sm font-bold text-slate-950">{cohort.title}</span>
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
              <div className="tt-subcard p-4">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                    <Users className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[15px] font-bold text-slate-950">参训教师中心</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">新增省培教师账号，也可绑定已有平台账号。</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>参训教师姓名</span>
                    <input
                      id="tt-participant-name-input"
                      className={fieldClassName}
                      {...fieldHint("参训教师姓名")}
                      onChange={(event) => setParticipantDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="姓名"
                      value={participantDraft.name}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>参训教师单位</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("参训教师单位")}
                      onChange={(event) => setParticipantDraft((current) => ({ ...current, organization: event.target.value }))}
                      placeholder="单位"
                      value={participantDraft.organization}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>参训教师手机</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("参训教师手机")}
                        onChange={(event) => setParticipantDraft((current) => ({ ...current, phone: event.target.value }))}
                        placeholder="手机"
                        value={participantDraft.phone}
                      />
                    </label>
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>参训教师分组</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("参训教师分组")}
                        onChange={(event) => setParticipantDraft((current) => ({ ...current, groupName: event.target.value }))}
                        placeholder="分组"
                        value={participantDraft.groupName}
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>参训教师职务</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("参训教师职务")}
                        onChange={(event) => setParticipantDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="职务"
                        value={participantDraft.title}
                      />
                    </label>
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>参训教师邮箱</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("参训教师邮箱")}
                        onChange={(event) => setParticipantDraft((current) => ({ ...current, email: event.target.value }))}
                        placeholder="邮箱"
                        value={participantDraft.email}
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>省培登录账号</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("省培登录账号")}
                        onChange={(event) => setParticipantDraft((current) => ({ ...current, accountUsername: event.target.value }))}
                        placeholder="省培登录账号；填已有平台账号可直接绑定"
                        value={participantDraft.accountUsername}
                      />
                    </label>
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>省培初始密码</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("省培初始密码")}
                        onChange={(event) => setParticipantDraft((current) => ({ ...current, accountPassword: event.target.value }))}
                        placeholder="初始密码，不填则自动生成"
                        value={participantDraft.accountPassword}
                      />
                    </label>
                  </div>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>参训教师预录扩展信息</span>
                    <textarea
                      className={`${textareaClassName} min-h-20`}
                      {...fieldHint("参训教师预录扩展信息")}
                      onChange={(event) => setParticipantDraft((current) => ({ ...current, extraInfo: event.target.value }))}
                      placeholder="预录扩展信息，例如职务、住宿、发票、培训材料领取情况等；每行一项。"
                      value={participantDraft.extraInfo}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>参训教师备注</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("参训教师备注")}
                      onChange={(event) => setParticipantDraft((current) => ({ ...current, note: event.target.value }))}
                      placeholder="备注"
                      value={participantDraft.note}
                    />
                  </label>
                  <ActionButton
                    aria-label="将参训教师加入当前省培班次"
                    className="w-full"
                    disabled={!selectedCohort}
                    loading={isSaving}
                    onClick={() => void submitParticipant()}
                    title="将参训教师加入当前省培班次"
                    variant="primary"
                  >
                    加入名单
                  </ActionButton>
                  <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3">
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-blue-700" />
                      <p className="text-xs font-bold text-blue-700">一键导入参训教师</p>
                    </div>
                    <label
                      className={`mt-3 flex items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50 ${
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
                    {participantImportStatus ? (
                      <p className="mt-2 rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-5 text-blue-700">
                        {participantImportStatus}
                      </p>
                    ) : null}
                    {participantImportPreview.totalCount > 0 ? (
                      <div className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-5 ${getImportPreviewToneClassName(participantImportPreview)}`}>
                        <p className="font-bold">导入预览：将新增 {participantImportPreview.readyCount} 位参训教师</p>
                        <p className="mt-1">
                          共识别 {participantImportPreview.totalCount} 行；缺姓名或单位 {participantImportPreview.missingRequiredCount} 行；名单内重复 {participantImportPreview.duplicateInFileCount} 组；当前班次已存在 {participantImportPreview.existingConflictCount} 行。
                        </p>
                      </div>
                    ) : null}
                    <TeacherTrainingImportFieldSummary items={participantImportFieldSummary} />
                    <textarea
                      className={`${textareaClassName} mt-3 min-h-24 bg-white/90`}
                      {...fieldHint("一键导入参训教师")}
                      onChange={(event) => setParticipantImportText(event.target.value)}
                      placeholder="可上传 Excel 名单自动识别，也可粘贴：姓名，单位，手机，分组，职务，邮箱，预计到达时间，交通方式，车次/航班/车牌，出发地，扩展信息，备注"
                      value={participantImportText}
                    />
                    <ActionButton
                      aria-label="一键导入参训教师"
                      className="mt-3 w-full"
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
                    <p className="text-[15px] font-bold text-slate-950">班次负责人/班主任设置</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      负责人显示在班主任前面；两者省培管理权限一致，请假审批顺序以请假审批模块配置为准。
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
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-100 hover:bg-blue-50/40"
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
                      <option value="">选择已有平台账号</option>
                      {teacherTrainingManagerOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} · {option.username}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>省培职务</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("省培职务")}
                      onChange={(event) => setManagerDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="职务，例如省培负责人、班主任、会务负责人"
                      value={managerDraft.title}
                    />
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
                    <p className="text-xs text-slate-400">暂未设置省培负责人或班主任。</p>
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
                                onClick={() =>
                                  void removeTeacherTrainingCohortManager({
                                    cohortId: selectedCohort.id,
                                    userId: manager.userId,
                                  })
                                }
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
              <section className="tt-card p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#1a6fd4]">当前班次</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-950">{selectedCohort.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {selectedCohort.startDate} 至 {selectedCohort.endDate}
                      {selectedCohort.location ? ` · ${selectedCohort.location}` : ""}
                    </p>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                    {activeTeacherTrainingSectionMeta?.label ?? (canManage ? "省培管理" : "我的省培")}
                  </div>
                </div>
                {!canManage && teacherTrainingCohorts.length > 1 ? (
                  <label className={`${teacherTrainingFieldShellClassName} mt-4 max-w-md`}>
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
                    <span className="tt-pill">{courseSessions.length} 节</span>
                  </div>
                  <div className={`mt-4 grid gap-3 ${teacherTrainingFillingListClassName}`}>
                    {courseSessions.length === 0 ? (
                      <div className="tt-empty-fill">
                        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#1a6fd4]">
                          <CalendarDays className="h-6 w-6" />
                        </span>
                        <p className="text-sm font-semibold text-slate-700">暂无课程安排</p>
                        <p className="max-w-[260px] text-xs leading-5 text-slate-400">
                          在右侧添加课程后，教师端会同步显示课程表。
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
                  <span className="tt-pill">{selectedCohort.checkInTasks.length} 个任务</span>
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
                            return (
                              <article
                                key={task.id}
                                className="rounded-2xl border border-slate-200/75 bg-white/82 p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/8"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
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
                              disabled={Boolean(checkInDisabledReason) || isSaving || isSigningThisTask}
                              onClick={() => signWithCurrentLocation(task.id)}
                              title={checkInDisabledReason || "定位签到，浏览器会请求当前位置权限"}
                              type="button"
                            >
                              {isSigningThisTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                              {isSigningThisTask
                                ? "定位中"
                                : isWindowOpen
                                  ? signedRecord
                                    ? "重新定位签到"
                                    : "定位签到"
                                  : Workspace.getTeacherTrainingCheckInWindowLabel(windowState)}
                            </button>
                            {checkInDisabledReason ? (
                              <p className={`${teacherTrainingDisabledHintClassName} lg:col-start-2 lg:max-w-56`}>
                                {checkInDisabledReason}
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
                    <div className="rounded-2xl border border-slate-200/75 bg-white/80 p-5 shadow-sm shadow-blue-100/50">
                      <p className="text-sm font-semibold text-slate-900">
                        {activeLeavePanel === "pending" ? "待审批申请" : "全部请假申请"}
                      </p>
                      <label className={`${teacherTrainingFieldShellClassName} mt-3`}>
                        <span className={teacherTrainingFieldLabelClassName}>请假审批意见</span>
                        <textarea
                          className={`${textareaClassName} min-h-20`}
                          {...fieldHint("请假审批意见")}
                          onChange={(event) => setLeaveReviewComment(event.target.value)}
                          placeholder="审批意见，可选"
                          value={leaveReviewComment}
                        />
                      </label>
                      <label className={`${teacherTrainingFieldShellClassName} mt-3`}>
                        <span className={teacherTrainingFieldLabelClassName}>搜索请假教师</span>
                        <input
                          className={fieldClassName}
                          {...fieldHint("搜索请假教师")}
                          onChange={(event) => setLeaveSearch(event.target.value)}
                          placeholder="按教师姓名、单位、请假原因或审批状态搜索"
                          value={leaveSearch}
                        />
                      </label>
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
                        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                          {teacherTrainingDownloadStatus}
                        </p>
                      ) : null}
                      <div className="mt-3 space-y-3">
                        {displayedManagerLeaveRequests.length === 0 ? (
                          <EmptyState description="教师提交临时请假后，会进入这里等待审批和导出。" icon={FileCheck} title="暂无请假申请" />
                        ) : (
                          displayedManagerLeaveRequests.map((request) => {
                            const step = request.status === "pending" ? request.approvalSteps[request.currentStepIndex] : null;
                            const reviewedApproverLabels = request.approvals
                              .map((approval) => approverLabelById.get(approval.approverId) ?? approval.approverName)
                              .filter(Boolean);
                            const currentApproverLabels =
                              step?.approverIds.map((id) => approverLabelById.get(id) ?? "未配置审批人").filter(Boolean) ?? [];
                            const approverSummary = reviewedApproverLabels.length
                              ? `已审批：${reviewedApproverLabels.join("、")}`
                              : request.status === "pending"
                                ? `当前审批人：${currentApproverLabels.join("、") || "未配置审批人"}`
                                : "暂无审批记录";
                            return (
                              <div key={request.id} className="rounded-2xl border border-slate-200/70 bg-white px-4 py-4 shadow-sm">
                                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">{request.participantName}</p>
                                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                        {request.startDate} 至 {request.endDate}
                                      </span>
                                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                                        {request.status === "approved" ? "审批完成" : step?.name ?? request.statusLabel}
                                      </span>
                                      {request.status === "pending" && step ? (
                                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                                          需 {step.requiredCount} 人通过
                                        </span>
                                      ) : null}
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                        {request.statusLabel}
                                      </span>
                                    </div>
                                    <p className="mt-2 break-words text-xs leading-5 text-slate-500">
                                      {approverSummary}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                    {request.status === "approved" ? (
                                      <button
                                        className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 disabled:cursor-wait disabled:opacity-60"
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
                                        导出PDF请假单
                                      </button>
                                    ) : (
                                      <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">
                                        审批完成后可导出PDF
                                      </span>
                                    )}
                                    {request.status === "pending" && step?.approverIds.includes(currentUser?.id ?? "") ? (
                                      <>
                                        <button
                                          className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"
                                          aria-label={`通过${request.participantName}的请假申请`}
                                          disabled={isSaving}
                                          onClick={() => void reviewLeaveRequest(request.id, "approve")}
                                          title={`通过${request.participantName}的请假申请`}
                                          type="button"
                                        >
                                          通过
                                        </button>
                                        <button
                                          className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600"
                                          aria-label={`驳回${request.participantName}的请假申请`}
                                          disabled={isSaving}
                                          onClick={() => void reviewLeaveRequest(request.id, "reject")}
                                          title={`驳回${request.participantName}的请假申请`}
                                          type="button"
                                        >
                                          驳回
                                        </button>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    ) : null}
                  </div>
                  </>
                ) : (
                  <div className="mt-4 grid items-start gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                    <div className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                      <p className="text-sm font-semibold text-slate-900">提交请假</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>请假开始日期</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("请假开始日期")}
                            onChange={(event) => setLeaveDraft((current) => ({ ...current, startDate: event.target.value }))}
                            type="date"
                            value={leaveDraft.startDate}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>请假结束日期</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("请假结束日期")}
                            onChange={(event) => setLeaveDraft((current) => ({ ...current, endDate: event.target.value }))}
                            type="date"
                            value={leaveDraft.endDate}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>请假开始时间</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("请假开始时间")}
                            onChange={(event) => setLeaveDraft((current) => ({ ...current, startTime: event.target.value }))}
                            type="time"
                            value={leaveDraft.startTime}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>请假结束时间</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("请假结束时间")}
                            onChange={(event) => setLeaveDraft((current) => ({ ...current, endTime: event.target.value }))}
                            type="time"
                            value={leaveDraft.endTime}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>请假场次</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("请假场次")}
                            onChange={(event) => setLeaveDraft((current) => ({ ...current, sessionLabel: event.target.value }))}
                            placeholder="请假场次"
                            value={leaveDraft.sessionLabel}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>请假人</span>
                          <input
                            className={fieldClassName}
                            {...fieldHint("请假人")}
                            disabled
                            value={selectedParticipant?.name ?? "参训教师"}
                          />
                        </label>
                        <label className={teacherTrainingFieldShellWideClassName}>
                          <span className={teacherTrainingFieldLabelClassName}>请假原因</span>
                          <textarea
                            className={`${textareaClassName} min-h-24`}
                            {...fieldHint("请假原因")}
                            onChange={(event) => setLeaveDraft((current) => ({ ...current, reason: event.target.value }))}
                            placeholder="请假原因"
                            value={leaveDraft.reason}
                          />
                        </label>
                      </div>
                      <ActionButton
                        aria-label="提交省培请假申请"
                        className="mt-3"
                        disabled={Boolean(leaveDisabledReason)}
                        loading={isSaving}
                        onClick={() => void submitLeaveRequest()}
                        title={leaveDisabledReason || "提交省培请假申请"}
                        variant="primary"
                      >
                        提交请假
                      </ActionButton>
                      {leaveDisabledReason ? (
                        <p className={`${teacherTrainingDisabledHintClassName} mt-3`}>
                          {leaveDisabledReason}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div
                        aria-label="省培请假进度"
                        className="rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.94)_48%,rgba(16,185,129,0.08))] p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-950">当前请假进度</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {teacherLatestLeaveRequest
                                ? `${teacherLatestLeaveRequest.startDate} 至 ${teacherLatestLeaveRequest.endDate} · ${teacherLatestLeaveRequest.sessionLabel}`
                                : "提交临时请假后，这里会显示审批步骤和当前状态。"}
                            </p>
                          </div>
                          <span className="w-fit rounded-full bg-white/82 px-3 py-1 text-xs font-bold text-blue-700">
                            {teacherLatestLeaveRequest?.statusLabel ?? "暂无请假"}
                          </span>
                        </div>
                        {teacherLatestLeaveRequest ? (
                          <div className="mt-3 grid gap-2">
                            <p className="text-xs font-bold text-slate-500">审批步骤</p>
                            {teacherLatestLeaveRequest.approvalSteps.length ? (
                              <div aria-label="请假审批步骤条" className="flex gap-2 overflow-x-auto pb-1">
                                {teacherLatestLeaveRequest.approvalSteps.map((step, index) => {
                                  const approvedCount = teacherLatestLeaveRequest.approvals.filter(
                                    (approval) => approval.stepKey === step.key && approval.decision === "approve",
                                  ).length;
                                  const stepState =
                                    teacherLatestLeaveRequest.status === "rejected" && index === teacherLatestLeaveRequest.currentStepIndex
                                      ? "已驳回"
                                      : approvedCount >= step.requiredCount || index < teacherLatestLeaveRequest.currentStepIndex
                                        ? "已通过"
                                        : index === teacherLatestLeaveRequest.currentStepIndex
                                          ? "等待审批"
                                          : "未到达";

                                  return (
                                    <div
                                      key={step.key}
                                      className="min-w-[210px] flex-1 rounded-2xl border border-white/80 bg-white/82 px-3 py-3 shadow-sm"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span
                                              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                                                stepState === "已通过"
                                                  ? "bg-emerald-600 text-white"
                                                  : stepState === "等待审批"
                                                    ? "bg-amber-500 text-white"
                                                    : stepState === "已驳回"
                                                      ? "bg-rose-600 text-white"
                                                      : "bg-slate-200 text-slate-500"
                                              }`}
                                            >
                                              {index + 1}
                                            </span>
                                            <p className="truncate text-sm font-semibold text-slate-950">{step.name}</p>
                                          </div>
                                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                                            {step.approverIds
                                              .map((approverId) => approverLabelById.get(approverId) ?? "未配置审批人")
                                              .join("、") || "未配置审批人"}
                                          </p>
                                        </div>
                                        <span
                                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                                            stepState === "已通过"
                                              ? "bg-emerald-50 text-emerald-700"
                                              : stepState === "等待审批"
                                                ? "bg-amber-50 text-amber-700"
                                                : stepState === "已驳回"
                                                  ? "bg-rose-50 text-rose-700"
                                                  : "bg-slate-100 text-slate-500"
                                          }`}
                                        >
                                          {stepState}
                                        </span>
                                      </div>
                                      <p className="mt-2 text-xs text-slate-400">
                                        已通过 {approvedCount}/{step.requiredCount}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="rounded-xl bg-white/82 px-3 py-2 text-xs text-slate-500">
                                管理员尚未配置审批步骤。
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>

                    <div className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                      <p className="text-sm font-semibold text-slate-900">我的请假记录</p>
                      {teacherTrainingDownloadStatus ? (
                        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                          {teacherTrainingDownloadStatus}
                        </p>
                      ) : null}
                      <div className="mt-3 grid gap-2">
                        {teacherLeaveRequests.length ? (
                          teacherLeaveRequests.slice(0, 4).map((request) => (
                            <div key={request.id} className="rounded-lg bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">
                                  {request.startDate} 至 {request.endDate}
	                                </p>
	                                <div className="flex items-center gap-2">
	                                  {request.status === "approved" ? (
	                                    <button
	                                      className="text-xs font-semibold text-blue-700 disabled:cursor-wait disabled:text-blue-300"
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
	                                      导出PDF请假单
	                                    </button>
	                                  ) : (
	                                    <span className="text-xs font-semibold text-slate-400">审批完成后可导出PDF</span>
	                                  )}
	                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
	                                    {request.statusLabel}
	                                  </span>
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">{request.reason}</p>
                            </div>
                          ))
                        ) : (
                          <EmptyState description="临时请假提交后，审批进度会显示在这里。" icon={FileCheck} title="暂无请假记录" />
                        )}
                      </div>
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
                    <p className="text-sm font-bold text-amber-800">首次登录需先完成报到信息</p>
                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      请完整填写个人资料和预计到达信息；首次登录后请及时修改初始密码，保存后进入主界面。
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>个人姓名</span>
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
                    <span className={teacherTrainingFieldLabelClassName}>个人单位</span>
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
                    <span className={teacherTrainingFieldLabelClassName}>个人手机</span>
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
                    <span className={teacherTrainingFieldLabelClassName}>个人分组</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("个人分组")}
                      onChange={(event) => updateProfileDraftField("groupName", event.target.value)}
                      placeholder="分组"
                      required
                      value={effectiveProfileDraft.groupName}
                    />
                  </label>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>个人职务</span>
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
                    <span className={teacherTrainingFieldLabelClassName}>个人邮箱</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("个人邮箱")}
                      onChange={(event) => updateProfileDraftField("email", event.target.value)}
                      placeholder="邮箱"
                      required
                      value={effectiveProfileDraft.email}
                    />
                  </label>
                  <div className="md:col-span-2">
                    <div className="mb-1 flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-[#1a6fd4]" />
                      <p className="text-sm font-semibold text-slate-900">预计报到 / 到达信息</p>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">以下到达信息均为必填，用于报到统计、接站核对和现场联系。</p>
                  </div>
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>预计到达时间</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("预计到达时间")}
                      onChange={(event) => updateProfileDraftField("arrivalAt", event.target.value)}
                      required
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
                      required
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
                      required
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
                      required
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
                    <p className="tt-block-title">参训教师名单</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">集中查看省培教师、账号状态、预计到达和预录扩展信息。</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tt-pill">
                      {filteredParticipants.length}/{selectedCohort.participants.length} 人
                    </span>
                    <button
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
                      aria-label="批量按手机号分配账号"
                      disabled={isSaving || !selectedCohort.participants.some((participant) => !participant.accountUserId && getPhoneAccountUsername(participant))}
                      onClick={() => void batchGeneratePhoneAccounts()}
                      title="批量按手机号分配账号"
                      type="button"
                    >
                      <Copy className="h-4 w-4" />
                      批量按手机号分配账号
                    </button>
                  </div>
                </div>

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
                              : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
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

                <label className={`${teacherTrainingFieldShellClassName} mt-4`}>
                  <span className={teacherTrainingFieldLabelClassName}>搜索参训教师</span>
                  <input
                    className={fieldClassName}
                    {...fieldHint("搜索参训教师")}
                    onChange={(event) => setParticipantSearch(event.target.value)}
                    placeholder="按姓名、单位、分组、职务、邮箱或账号搜索"
                    value={participantSearch}
                  />
                </label>
                <TeacherTrainingFilterSummary
                  items={teacherTrainingFilterSummaries.participants}
                  onClear={
                    participantSearchKeyword || participantAccountFilter !== "all" || teacherTrainingDetailViewTitle
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
                        在左侧录入参训教师后，这里会显示账号和预录信息。
                      </p>
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#1a6fd4] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#155bb0]"
                        onClick={() => {
                          const input = document.getElementById("tt-participant-name-input");
                          input?.scrollIntoView({ behavior: "smooth", block: "center" });
                          window.setTimeout(() => (input as HTMLInputElement | null)?.focus(), 350);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        立即录入教师
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
                            <p className="max-w-full truncate whitespace-nowrap text-base font-semibold text-slate-950">
                              {participant.name}
                            </p>
                            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              {participant.groupName || "未分组"}
                            </span>
                            <span className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              {participant.accountUsername ? "已开通账号" : "待开通账号"}
                            </span>
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${getParticipantAccountTypeClassName(participant)}`}>
                              {getParticipantAccountTypeLabel(participant)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{participant.organization || "单位待补充"}</p>
                          {participant.accountUsername ? (
                            <p className="mt-1 text-xs text-slate-400">
                              省培账号：{participant.accountUsername}
                              {participant.accountRole !== "training_teacher" ? "（绑定原平台账号）" : ""}
                            </p>
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
                        </div>
                        {canManage ? (
                          <div className="grid gap-3 border-t border-slate-100 pt-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
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
                            <div className="rounded-xl border border-blue-100 bg-blue-50/35 p-3">
                              <p className="text-[11px] font-bold tracking-wide text-blue-600">省培账号处理</p>
                              <p className="mt-1 text-xs leading-5 text-blue-500">
                                只处理登录账号，不删除参训教师档案。
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                                  aria-label="复制省培账号通知消息"
                                  disabled={isSaving}
                                  onClick={() => void copyAccountMessage(participant.id)}
                                  title="复制省培账号通知消息"
                                  type="button"
                                >
                                  <Copy className="h-4 w-4 shrink-0" />
                                  <span className="truncate whitespace-nowrap">复制账号消息</span>
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
                                        <span className="truncate">原平台账号由团队账号管理维护</span>
                                      </span>
                                    )}
                                    <button
                                      className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                                      aria-label="解绑省培账号"
                                      disabled={isSaving}
                                      onClick={() => void removeParticipantAccount(participant)}
                                      title="解绑省培账号"
                                      type="button"
                                    >
                                      <Trash2 className="h-4 w-4 shrink-0" />
                                      <span className="truncate whitespace-nowrap">解绑省培账号</span>
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {accountEditParticipantId === participant.id ? (
                          <div className="lg:col-span-2 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                            <label className={teacherTrainingFieldShellClassName}>
                              <span className={teacherTrainingFieldLabelClassName}>省培登录账号</span>
                              <input
                                className={fieldClassName}
                                {...fieldHint("重置省培账号")}
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
                        {accountMessagesByParticipantId[participant.id] ? (
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
                    <p className="tt-block-title">参训教师报到</p>
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
                              : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
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
                    placeholder="按姓名、单位、分组、职务或邮箱搜索"
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
                            className={`grid gap-3 bg-white/72 p-4 lg:grid-cols-[minmax(0,1.4fr)_120px_120px_120px_auto] lg:items-center ${
                              attendance ? "border-l-4 border-emerald-400" : "border-l-4 border-amber-300"
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
              <section className={showTeacherTrainingSubmissionForm ? "grid items-stretch gap-4 xl:grid-cols-2" : "grid items-start gap-4"}>
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
                      <span className={teacherTrainingFieldLabelClassName}>省培任务名称</span>
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
                    <label className={`${teacherTrainingFieldShellClassName} lg:col-span-2`}>
                      <span className={teacherTrainingFieldLabelClassName}>省培任务说明</span>
                      <textarea
                        className={textareaClassName}
                        {...fieldHint("省培任务说明")}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))}
                        placeholder="任务说明"
                        value={taskDraft.description}
                      />
                    </label>
                    <div className="flex flex-col gap-3 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>省培任务附件要求</span>
                        <label className="mt-1.5 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
                          <input
                            checked={taskDraft.requireAttachment}
                            {...fieldHint("省培任务是否需要附件")}
                            onChange={(event) => setTaskDraft((current) => ({ ...current, requireAttachment: event.target.checked }))}
                            type="checkbox"
                          />
                          需要附件
                        </label>
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
                    {taskDraft.id ? (
                      <button
                        className="text-xs font-semibold text-slate-500 lg:col-span-2"
                        onClick={() =>
                          setTaskDraft({
                            cohortId: "",
                            title: "",
                            description: "",
                            dueDate: "",
                            requireAttachment: false,
                          })
                        }
                        type="button"
                      >
                        取消修改
                      </button>
                    ) : null}
                  </div>
                </div>
                ) : null}

                {showTeacherTrainingSubmissionForm ? (
                <div className="tt-card p-5" id="teacher-training-submission-form">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a6fd4]/10 text-[#1a6fd4]">
                      <Send className="h-4 w-4" />
                    </span>
                    <p className="text-[15px] font-bold text-slate-950">填写汇报</p>
                  </div>
                  {!canManage ? (
                    <div
                      aria-label="省培任务汇报进度"
                      className="mt-4 rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.96)_48%,rgba(20,184,166,0.08))] p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-950">我的汇报进度</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {teacherTaskSummaryText} · 已提交 {teacherTaskCompletedCount}/{teacherTaskProgressItems.length}
                          </p>
                        </div>
                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${teacherTaskSummaryToneClassName}`}
                        >
                          {teacherTaskSummaryText}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500"
                          style={{ width: `${teacherTaskCompletionPercent}%` }}
                        />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {teacherTaskProgressItems.length === 0 ? (
                          <div className="rounded-xl border border-slate-100 bg-white/76 px-3 py-2 text-xs font-semibold text-slate-500">
                            暂无任务发布
                          </div>
                        ) : (
                          teacherTaskProgressItems.map((item) => (
                            <button
                              key={item.id}
                              className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition hover:-translate-y-0.5 ${
                                item.isComplete
                                  ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                  : "border-amber-100 bg-amber-50 text-amber-700"
                              }`}
                              onClick={() => focusTeacherTaskSubmission(item.id)}
                              title={`${item.title}：${item.statusLabel}`}
                              type="button"
                            >
                              <span className="block truncate text-slate-900">{item.title}</span>
                              <span className="mt-1 block">{item.statusLabel}</span>
                              {item.submittedAt ? (
                                <span className="mt-1 block text-[11px] font-medium text-slate-500">{item.submittedAt}</span>
                              ) : item.dueDate ? (
                                <span className="mt-1 block text-[11px] font-medium text-slate-500">截止 {item.dueDate}</span>
                              ) : null}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>选择省培汇报任务</span>
                      <select
                        className={fieldClassName}
                        {...fieldHint("选择省培汇报任务")}
                        onChange={(event) => updateSubmissionSelection({ taskId: event.target.value })}
                        value={selectedTask?.id ?? ""}
                      >
                        {selectedCohort.tasks.length === 0 ? <option value="">暂无任务</option> : null}
                        {selectedCohort.tasks.map((task) => (
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
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>省培任务汇报内容</span>
                      <textarea
                        className={textareaClassName}
                        {...fieldHint("省培任务汇报内容")}
                        onChange={(event) => setSubmissionDraft((current) => ({ ...current, content: event.target.value }))}
                        placeholder="汇报内容"
                        value={submissionDraft.content}
                      />
                    </label>
                    <div className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>省培任务汇报附件</span>
                      <label className="mt-1.5 flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/35 px-4 py-4 text-center transition hover:border-blue-300 hover:bg-blue-50/70">
                        <Upload className="h-5 w-5 text-blue-600" />
                        <span className="mt-2 text-sm font-semibold text-slate-900">选择 Word 或 PDF 文件</span>
                        <span className="mt-1 text-xs leading-5 text-slate-500">
                          任务汇报附件仅支持 Word/PDF，单个 {Workspace.teacherTrainingSubmissionAttachmentMaxSizeLabel} 以内
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
                          <p className="text-xs leading-5 text-slate-500">
                            {selectedTask?.requireAttachment
                              ? "该任务要求上传 Word/PDF 附件。"
                              : "未上传附件，可直接保存文字汇报或先选择附件。"}
                          </p>
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

              {showTeacherTrainingSection("tasks") ? (
              <section className="tt-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="tt-block-title">任务汇报概览</p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {canManage ? "管理员可按班次导出全部任务完成情况。" : "查看我的任务提交记录和完成情况。"}
                    </p>
                  </div>
                  <span className="tt-pill tt-pill-neutral">{selectedCohort.tasks.length} 项任务</span>
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
                                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
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
                        placeholder="按教师姓名、单位、分组、任务或汇报内容搜索"
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

                      return (
                      <div key={task.id} className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-950">{task.title}</p>
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
                                  : "这项任务还没有提交，请填写汇报后保存。"}
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
                        {visibleSubmissions.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {visibleSubmissions.map((submission) => {
                              const attachmentFile = submission.attachmentFile;

                              return (
                                <div key={submission.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                  <span className="font-semibold text-slate-900">{submission.participantName}</span>
                                  {participantById.get(submission.participantId)?.organization ? (
                                    <>
                                      <span className="mx-2 text-slate-300">/</span>
                                      <span>{participantById.get(submission.participantId)?.organization}</span>
                                    </>
                                  ) : null}
                                  <span className="mx-2 text-slate-300">/</span>
                                  <span>{submission.submittedAt}</span>
                                  {attachmentFile ? (
                                    <button
                                      className="ml-0 mt-2 inline-flex w-fit items-center gap-1 rounded-md border border-blue-100 bg-white px-2 py-1 text-xs font-semibold text-blue-700 sm:ml-2 sm:mt-0"
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
                                      附件：{attachmentFile.fileName}
                                    </button>
                                  ) : submission.attachmentLabel ? (
                                    <span className="ml-0 mt-2 inline-flex w-fit rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-500 sm:ml-2 sm:mt-0">
                                      附件：{submission.attachmentLabel}
                                    </span>
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
                        导出名单、报到信息、课程签到和任务汇报，按当前班次生成归档材料。
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
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
