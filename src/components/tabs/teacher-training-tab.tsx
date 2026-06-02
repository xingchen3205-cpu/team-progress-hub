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
  splitTeacherTrainingImportLine,
  type TeacherTrainingParticipantImportRow,
} from "@/lib/teacher-training-participant-import";

type AttendanceStatus = Workspace.TeacherTrainingAttendanceStatus;
type AttendanceOverviewFilter = "all" | "registered" | "pending" | "leave" | "absent";
type CheckInWindowState = Workspace.TeacherTrainingCheckInWindowState;
type SubmissionOverviewFilter = "all" | "submitted";
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
    refreshWorkspace,
  } = Workspace.useWorkspaceContext();
  const {
    ActionButton,
    CalendarDays,
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
    surfaceCardClassName,
    textareaClassName,
  } = Workspace;

  const selectedCohortId = activeTeacherTrainingCohortId;
  const setSelectedCohortId = setActiveTeacherTrainingCohortId;
  const [cohortDraft, setCohortDraft] = useState<Workspace.TeacherTrainingCohortDraft>(createDefaultCohortDraft);
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
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceOverviewFilter, setAttendanceOverviewFilter] = useState<AttendanceOverviewFilter>("all");
  const [checkInSearch, setCheckInSearch] = useState("");
  const [leaveSearch, setLeaveSearch] = useState("");
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionOverviewFilter, setSubmissionOverviewFilter] = useState<SubmissionOverviewFilter>("all");
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
  const [recycleBinItems, setRecycleBinItems] = useState<Workspace.TeacherTrainingRecycleBinItem[]>([]);
  const [recycleBinStatus, setRecycleBinStatus] = useState("");
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);

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
  const courseImportPreview = useMemo(
    () => buildCourseImportPreview(parseCourseImportRows(courseImportText), courseSessions),
    [courseImportText, courseSessions],
  );
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
    await createTeacherTrainingCohort(cohortDraft);
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
  };

  const removeCohort = async (cohort: Workspace.TeacherTrainingCohortItem) => {
    if (
      !window.confirm(
        `确认将省培班次“${cohort.title}”移入回收站？\n\n参训教师 ${cohort.stats.participantCount} 人，课程 ${cohort.stats.courseCount} 节，签到 ${cohort.stats.checkInTaskCount} 个，请假 ${cohort.stats.leaveRequestCount} 条，任务 ${cohort.stats.taskCount} 个会从当前页面隐藏。\n\n任务汇报和附件不会立即删除，可在回收站恢复；永久删除后才会清理。`,
      )
    ) return;
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
    await createTeacherTrainingCourseSession({
      ...courseDraft,
      cohortId: selectedCohort.id,
    });
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
    if (!window.confirm(`确认将课程“${course.title}”移入回收站？\n\n移入后参训教师课程表会隐藏这节课，关联签到任务保留；需要时可从回收站恢复。`)) return;
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

  const refreshTeacherTrainingRecycleBin = async () => {
    if (!canManage) return;

    setRecycleBinLoading(true);
    setRecycleBinStatus("正在读取回收站...");
    try {
      const payload = await Workspace.requestJson<{ items: Workspace.TeacherTrainingRecycleBinItem[] }>(
        "/api/teacher-training/recycle-bin",
        undefined,
        { force: true, cacheTtlMs: 0, timeoutMs: 20_000 },
      );
      setRecycleBinItems(payload.items);
      setRecycleBinStatus(payload.items.length ? "" : "回收站暂无项目。");
    } catch (error) {
      setRecycleBinStatus(error instanceof Error ? error.message : "回收站读取失败");
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const restoreTeacherTrainingRecycleItem = async (item: Workspace.TeacherTrainingRecycleBinItem) => {
    if (!window.confirm(`确认恢复${item.typeLabel}“${item.title}”？\n\n恢复后会重新出现在当前省培管理页面。`)) {
      return;
    }

    setRecycleBinLoading(true);
    setRecycleBinStatus("正在恢复...");
    try {
      await Workspace.requestJson("/api/teacher-training/recycle-bin", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, type: item.type }),
      });
      setRecycleBinStatus(`${item.typeLabel}已恢复。`);
      refreshWorkspace("teacherTraining");
      await refreshTeacherTrainingRecycleBin();
    } catch (error) {
      setRecycleBinStatus(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const permanentlyDeleteTeacherTrainingRecycleItem = async (item: Workspace.TeacherTrainingRecycleBinItem) => {
    if (
      !window.confirm(
        `确认永久删除${item.typeLabel}“${item.title}”？\n\n永久删除后相关记录无法恢复；如果包含任务汇报附件，附件也会从文件库清理。`,
      )
    ) {
      return;
    }

    setRecycleBinLoading(true);
    setRecycleBinStatus("正在永久删除...");
    try {
      await Workspace.requestJson("/api/teacher-training/recycle-bin", {
        method: "DELETE",
        body: JSON.stringify({ id: item.id, type: item.type, confirmPermanent: true }),
      });
      setRecycleBinStatus(`${item.typeLabel}已永久删除。`);
      refreshWorkspace("teacherTraining");
      await refreshTeacherTrainingRecycleBin();
    } catch (error) {
      setRecycleBinStatus(error instanceof Error ? error.message : "永久删除失败");
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const submitTask = async () => {
    if (!selectedCohort) return;
    await createTeacherTrainingTask({
      ...taskDraft,
      cohortId: selectedCohort.id,
    });
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
      !window.confirm(
        `确认将省培任务“${task.title}”移入回收站？\n\n移入后参训教师不再看到该任务，已提交汇报和附件不会立即删除；永久删除后才会清理。`,
      )
    ) return;
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
    await createTeacherTrainingCheckInTask({
      ...checkInDraft,
      cohortId: selectedCohort.id,
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
    if (!window.confirm(`确认将签到任务“${task.title}”移入回收站？\n\n移入后教师端不再显示该签到，已签到记录不会立即删除；需要时可恢复。`)) return;
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
      !window.confirm(
        `确认删除省培账号“${participant.accountUsername}”？删除后该账号无法登录，参训教师档案和历史记录会保留。`,
      )
    ) {
      return;
    }
    await deleteTeacherTrainingParticipantAccount(participant.id);
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

  const openTeacherTrainingSection = (key: Workspace.TeacherTrainingSectionKey) => {
    if (teacherInitialProfileRequired && key !== "profile") {
      setActiveTeacherTrainingSection("profile");
      return;
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
    participantSearchValue = "",
    section,
    submissionFilter = "all",
  }: {
    attendanceFilter?: AttendanceOverviewFilter;
    participantSearchValue?: string;
    section: Workspace.TeacherTrainingSectionKey;
    submissionFilter?: SubmissionOverviewFilter;
  }) => {
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

    openTeacherTrainingSection(section);
  };

  const metricCards: Array<{ label: string; value: number; Icon: typeof Users; onClick: () => void; title: string }> = [
    {
      label: "参训教师",
      value: selectedCohort?.stats.participantCount ?? 0,
      Icon: Users,
      onClick: () => openOverviewMetric({ section: "participants" }),
      title: "查看参训教师名单",
    },
    {
      label: "负责人/班主任",
      value: selectedCohort?.stats.managerCount ?? 0,
      Icon: User,
      onClick: () => openOverviewMetric({ section: "cohorts" }),
      title: "查看负责人/班主任设置",
    },
    {
      label: "课程",
      value: selectedCohort?.stats.courseCount ?? 0,
      Icon: CalendarDays,
      onClick: () => openOverviewMetric({ section: "courses" }),
      title: "查看课程安排",
    },
    {
      label: "已报到",
      value: selectedCohort?.stats.presentCount ?? 0,
      Icon: CheckCircle2,
      onClick: () => openOverviewMetric({ attendanceFilter: "registered", section: "attendance" }),
      title: "查看已报到教师",
    },
    {
      label: "请假",
      value: selectedCohort?.stats.leaveCount ?? 0,
      Icon: CalendarDays,
      onClick: () => openOverviewMetric({ attendanceFilter: "leave", section: "attendance" }),
      title: "查看请假教师",
    },
    {
      label: "缺勤",
      value: selectedCohort?.stats.absentCount ?? 0,
      Icon: FileCheck,
      onClick: () => openOverviewMetric({ attendanceFilter: "absent", section: "attendance" }),
      title: "查看缺勤教师",
    },
    {
      label: "课程签到",
      value: selectedCohort?.stats.checkInRecordCount ?? 0,
      Icon: MapPin,
      onClick: () => openOverviewMetric({ section: "checkins" }),
      title: "查看课程签到记录",
    },
    {
      label: "任务",
      value: selectedCohort?.stats.taskCount ?? 0,
      Icon: FileText,
      onClick: () => openOverviewMetric({ section: "tasks", submissionFilter: "all" }),
      title: "查看任务列表",
    },
    {
      label: "汇报",
      value: selectedCohort?.stats.submissionCount ?? 0,
      Icon: Send,
      onClick: () => openOverviewMetric({ section: "tasks", submissionFilter: "submitted" }),
      title: "查看已提交汇报",
    },
  ];
  const overviewSummaryCards = [
    {
      label: "参训教师",
      value: selectedCohort?.stats.participantCount ?? 0,
      helper: "名单与账号",
      onClick: () => openOverviewMetric({ section: "participants" }),
      title: "查看参训教师名单",
    },
    {
      label: "课程安排",
      value: selectedCohort?.stats.courseCount ?? 0,
      helper: "课程表",
      onClick: () => openOverviewMetric({ section: "courses" }),
      title: "查看课程安排",
    },
    {
      label: "任务汇报",
      value: selectedCohort?.stats.submissionCount ?? 0,
      helper: "已提交",
      onClick: () => openOverviewMetric({ section: "tasks", submissionFilter: "submitted" }),
      title: "查看已提交汇报",
    },
  ];
  const todayOverviewCards = [
    {
      label: "课程安排",
      value: selectedCohort?.stats.courseCount ?? 0,
      Icon: CalendarDays,
      onClick: () => openOverviewMetric({ section: "courses" }),
      title: "查看课程安排",
    },
    {
      label: "签到记录",
      value: selectedCohort?.stats.checkInRecordCount ?? 0,
      Icon: MapPin,
      onClick: () => openOverviewMetric({ section: "checkins" }),
      title: "查看签到记录",
    },
    {
      label: "任务汇报",
      value: selectedCohort?.stats.submissionCount ?? 0,
      Icon: Send,
      onClick: () => openOverviewMetric({ section: "tasks", submissionFilter: "submitted" }),
      title: "查看已提交汇报",
    },
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
    if (section.globalOnly && !canManageGlobal) return false;
    if (section.managerOnly && !canManage) return false;
    if (section.teacherOnly && canManage) return false;
    return true;
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
  useEffect(() => {
    if (!canManage || effectiveTeacherTrainingSection !== "exports") {
      return;
    }

    let isMounted = true;
    setRecycleBinLoading(true);
    setRecycleBinStatus("正在读取回收站...");
    Workspace.requestJson<{ items: Workspace.TeacherTrainingRecycleBinItem[] }>(
      "/api/teacher-training/recycle-bin",
      undefined,
      { force: true, cacheTtlMs: 0, timeoutMs: 20_000 },
    )
      .then((payload) => {
        if (!isMounted) return;
        setRecycleBinItems(payload.items);
        setRecycleBinStatus(payload.items.length ? "" : "回收站暂无项目。");
      })
      .catch((error) => {
        if (!isMounted) return;
        setRecycleBinStatus(error instanceof Error ? error.message : "回收站读取失败");
      })
      .finally(() => {
        if (isMounted) {
          setRecycleBinLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canManage, effectiveTeacherTrainingSection]);
  const teacherTrainingManagementGridClassName =
    canManage && showTeacherTrainingSection("cohorts")
      ? "xl:grid-cols-1"
      : canManage && showTeacherTrainingSection("participants")
        ? "xl:grid-cols-[420px_minmax(0,1fr)]"
        : "";
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

      <div className="space-y-4 pb-16" id="teacher-training-content">
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
                  手机端常用操作
                </span>
              </div>
              <div
                aria-label="省培今日待办"
                className="mt-3 rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.92)_46%,rgba(20,184,166,0.08))] p-3 shadow-inner shadow-white/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-950">下一步</p>
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-blue-700">
                    {teacherMobilePriorityItems.length > 0 ? `${teacherMobilePriorityItems.length} 项待处理` : "状态正常"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {teacherMobileFocusItems.map((item) => (
                    <button
                      key={item.label}
                      aria-label={`处理省培${item.label}`}
                      className={`group flex min-h-[74px] items-center gap-3 rounded-2xl border bg-white/88 px-3 py-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70 ${
                        item.tone === "amber"
                          ? "border-amber-100 hover:border-amber-200"
                          : item.tone === "emerald"
                            ? "border-emerald-100 hover:border-emerald-200"
                            : "border-blue-100 hover:border-blue-200"
                      }`}
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
                    <p className="text-xs font-bold text-blue-700">下一节课</p>
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
                    className="group grid min-h-[92px] gap-2 rounded-2xl border border-slate-200/80 bg-white/82 px-3 py-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/60 hover:shadow-lg hover:shadow-blue-950/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                    onClick={item.onClick}
                    title={`进入省培${item.label}`}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-white">
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

          {showTeacherTrainingSection("overview") ? (
            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              {metricCards.map(({ label, value, Icon, onClick, title }) => (
                <button
                  key={label}
                  aria-label={`查看省培${label}明细`}
                  className="depth-subtle group rounded-2xl border border-white/70 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                  onClick={onClick}
                  title={title}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">{label}</p>
                    <Icon className="h-4 w-4 text-[#1a6fd4] transition group-hover:scale-110" />
                  </div>
                  <p className="mt-3 text-2xl font-bold text-slate-950">{value}</p>
                </button>
              ))}
            </section>
          ) : null}

          {showTeacherTrainingSection("overview") ? (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
              <div className="depth-card overflow-hidden rounded-2xl border border-blue-100/80 bg-[linear-gradient(135deg,rgba(26,111,212,0.10),rgba(255,255,255,0.92)_42%,rgba(20,184,166,0.10))] p-5 shadow-[0_22px_60px_rgba(26,111,212,0.13)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1a6fd4]">省培运行总览</p>
                    <h3 className="mt-2 text-2xl font-bold leading-8 text-slate-950">
                      {selectedCohort?.title ?? "暂无省培班次"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {selectedCohort
                        ? `${selectedCohort.startDate} 至 ${selectedCohort.endDate}${selectedCohort.location ? ` · ${selectedCohort.location}` : ""}`
                        : "系统管理员可先创建班次，再维护名单、课程、签到、汇报和请假流程。"}
                    </p>
                  </div>
                  <span className="inline-flex min-w-[76px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-blue-200 bg-white/78 px-4 py-2 text-xs font-bold text-blue-700">
                    {canManage ? "管理端" : "教师端"}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {overviewSummaryCards.map((item) => (
                    <button
                      key={item.label}
                      aria-label={item.title}
                      className="rounded-2xl border border-white/75 bg-white/72 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/65 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                      onClick={item.onClick}
                      title={item.title}
                      type="button"
                    >
                      <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                      <p className="mt-2 text-3xl font-black text-slate-950">{item.value}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.helper}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="depth-subtle rounded-2xl border border-slate-200/70 bg-white/86 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">今日运行</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">课程、签到和汇报状态集中展示。</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    {selectedCohort ? "运行中" : "待建班"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  {todayOverviewCards.map((item) => (
                    <button
                      key={item.label}
                      aria-label={item.title}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
                      onClick={item.onClick}
                      title={item.title}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-white">
                          <item.Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate text-sm font-semibold text-slate-700">{item.label}</span>
                      </span>
                      <span className="text-xl font-black text-slate-950">{item.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <div className={`grid gap-4 ${teacherTrainingManagementGridClassName}`}>
        {canManage && showTeacherTrainingSection("cohorts", "participants") ? (
          <aside className={`${surfaceCardClassName} space-y-5`}>
            <div>
              <p className="text-sm font-semibold text-slate-900">班次</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">按账号权限切换可管理或可参与的省培班次。</p>
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
            </div>

            {showTeacherTrainingSection("cohorts") ? (
              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">已设置班次</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      共 {teacherTrainingCohorts.length} 个班次，点击班次可切换到对应管理页。
                    </p>
                  </div>
                  <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-blue-50 px-3 text-xs font-bold text-blue-700">
                    班次总数 {teacherTrainingCohorts.length}
                  </span>
                </div>
                {teacherTrainingCohorts.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-xs text-slate-400">
                    暂无已设置班次。
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
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
            <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#1a6fd4]" />
                <p className="text-sm font-semibold text-slate-900">
                  {cohortDraft.id ? "正在修改班次" : "新建省培班次"}
                </p>
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
            ) : null}

            {canManage && showTeacherTrainingSection("participants") ? (
              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#1a6fd4]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">参训教师中心</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">新增省培教师账号，也可绑定已有平台账号。</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>参训教师姓名</span>
                    <input
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
              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[#1a6fd4]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">班次负责人/班主任设置</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      负责人显示在班主任前面；两者省培管理权限一致，请假审批顺序以请假审批模块配置为准。
                    </p>
                  </div>
                </div>
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
              </div>
            ) : null}
          </aside>
        ) : null}

        <div className="space-y-4">
          {!selectedCohort ? (
            <div className={surfaceCardClassName}>
              <EmptyState
                description="先创建一个省培班次，再维护名单、签到、任务和汇报。"
                icon={ClipboardCheck}
                title="还没有省培班次"
              />
            </div>
          ) : (
            <>
              {!showTeacherTrainingSection("overview") ? (
              <section className={surfaceCardClassName}>
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
                    {canManage ? "报到房号材料登记" : "我的省培任务"}
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
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,460px)]">
                <div className={surfaceCardClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">课程安排</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        参训教师登录省培账号后，只看到自己班次的课程设置安排。
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {courseSessions.length} 节
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {courseSessions.length === 0 ? (
                      <EmptyState description="在课程安排模块添加课程后，教师端会同步显示课程表。" icon={CalendarDays} title="暂无课程安排" />
                    ) : (
                      courseSessions.map((course) => (
                        <article key={course.id} className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                                  {course.courseDate}
                                  {course.startTime ? ` ${course.startTime}` : ""}
                                  {course.endTime ? `-${course.endTime}` : ""}
                                </span>
                                {course.location ? (
                                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                    {course.location}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-3 font-semibold text-slate-950">{course.title}</p>
                              {course.description ? (
                                <p className="mt-1 text-sm leading-6 text-slate-500">{course.description}</p>
                              ) : null}
                            </div>
                            {course.instructor ? (
                              <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                {course.instructor}
                              </span>
                            ) : null}
                            <div className="flex shrink-0 gap-2">
                              <button
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600"
                                onClick={() => editCourseSession(course)}
                                type="button"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                修改
                              </button>
                              <button
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600"
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

                <div className={surfaceCardClassName}>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[#1a6fd4]" />
                    <p className="text-sm font-semibold text-slate-900">新增课程</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>课程名称</span>
                      <input
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
              <section className={surfaceCardClassName}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">课程安排</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">按时间顺序查看全部课程、地点和授课教师。</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {courseSessions.length} 节
                  </span>
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
              <section className={surfaceCardClassName}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {canManage ? "发布签到任务" : "课程定位签到"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {canManage
                        ? "为当天课程发布定位签到，参训教师在省培账号里自行完成签到。"
                        : "到达授课地点后点击定位签到，管理员可导出最终课程签到名单。"}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {selectedCohort.checkInTasks.length} 个任务
                  </span>
                </div>

                {canManage ? (
                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                    <div className="grid gap-3 md:grid-cols-2">
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

                    <div className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-950">签到进度</p>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {selectedCohort.checkInTasks.length} 场
                        </span>
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
                      <div className="mt-3 space-y-3">
                        {filteredCheckInTasks.length === 0 ? (
                          <EmptyState description="发布后会在这里显示签到进度。" icon={MapPin} title="暂无课程签到" />
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
              <section className={surfaceCardClassName}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {canManage ? "请假审批" : "临时请假"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {canConfigureTeacherTrainingLeaveFlow
                        ? "系统管理员统一配置审批步骤、候选审批人和每步通过人数。"
                        : canManage
                          ? "查看当前班次请假申请、导出请假单，并按已配置流程处理审批。"
                        : "临时请假会按管理员配置的审批步骤流转，最终批准后自动写入请假签到记录。"}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                    {selectedCohort.leaveRequests.length} 条请假
                  </span>
                </div>

                {canManage ? (
                  <div
                    className={`mt-4 grid gap-4 ${
                      canConfigureTeacherTrainingLeaveFlow ? "xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.78fr)]" : ""
                    }`}
                  >
                    {canConfigureTeacherTrainingLeaveFlow ? (
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">请假流程设置</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            只在系统管理员账号下开放，避免班次工作人员误改全局审批规则。
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

                    <div className="rounded-2xl border border-slate-200/75 bg-white/80 p-5 shadow-sm shadow-blue-100/50">
                      <p className="text-sm font-semibold text-slate-900">
                        {canConfigureTeacherTrainingLeaveFlow ? "请假审批" : "请假申请汇总"}
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
                      {teacherTrainingDownloadStatus ? (
                        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                          {teacherTrainingDownloadStatus}
                        </p>
                      ) : null}
                      <div className="mt-3 space-y-3">
                        {managerVisibleLeaveRequests.length === 0 ? (
                          <EmptyState description="教师提交临时请假后，会进入这里等待审批和导出。" icon={FileCheck} title="暂无请假申请" />
                        ) : (
                          managerVisibleLeaveRequests.map((request) => {
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
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
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
              <section className={surfaceCardClassName}>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[#1a6fd4]" />
                  <p className="text-sm font-semibold text-slate-900">个人信息</p>
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
              <section className={surfaceCardClassName}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">参训教师名单</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">集中查看省培教师、账号状态、预计到达和预录扩展信息。</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
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

                <div className="mt-4 grid gap-3">
                  {filteredParticipants.length === 0 ? (
                    <EmptyState description="在参训教师模块添加名单后，这里会显示账号和预录信息。" icon={Users} title="名单为空" />
                  ) : (
                    filteredParticipants.map((participant) => (
                      <article
                        key={participant.id}
                        className="grid gap-3 rounded-2xl border border-slate-200/75 bg-white/78 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-950">{participant.name}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              {participant.groupName || "未分组"}
                            </span>
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              {participant.accountUsername ? "已开通账号" : "待开通账号"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{participant.organization || "单位待补充"}</p>
                          {participant.accountUsername ? (
                            <p className="mt-1 text-xs text-slate-400">省培账号：{participant.accountUsername}</p>
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
                          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                            <button
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                              aria-label="复制省培账号通知消息"
                              disabled={isSaving}
                              onClick={() => void copyAccountMessage(participant.id)}
                              title="复制省培账号通知消息"
                              type="button"
                            >
                              <Copy className="h-4 w-4" />
                              复制账号消息
                            </button>
                            {participant.accountUsername ? (
                              <>
                                <button
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                                  aria-label="重置账号密码"
                                  disabled={isSaving}
                                  onClick={() => editParticipantAccount(participant)}
                                  title="重置账号密码"
                                  type="button"
                                >
                                  <Pencil className="h-4 w-4" />
                                  重置账号密码
                                </button>
                                <button
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                                  aria-label="删除省培账号"
                                  disabled={isSaving}
                                  onClick={() => void removeParticipantAccount(participant)}
                                  title="删除省培账号"
                                  type="button"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  删除省培账号
                                </button>
                              </>
                            ) : null}
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
              <section className={surfaceCardClassName}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">参训教师报到</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      所有人默认待报到；点击报到后确认酒店房号和材料情况，系统自动记录报到时间。
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500">
                    已报到 {selectedCohort?.stats.presentCount ?? 0} / {selectedCohort?.stats.participantCount ?? 0}
                  </div>
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

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/75">
                  {filteredAttendanceParticipants.length === 0 ? (
                    <EmptyState description="在参训教师模块添加名单后，这里会出现报到登记列表。" icon={Users} title="名单为空" />
                  ) : (
                    <div className="divide-y divide-slate-100">
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
              <section className={showTeacherTrainingSubmissionForm ? "grid gap-4 xl:grid-cols-2" : "grid gap-4"}>
                {canManage ? (
                <div className={surfaceCardClassName}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">发布任务</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          管理者只发布任务，参训教师登录后自行填写汇报。
                        </p>
                      </div>
                    </div>
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                      {selectedCohort.tasks.length} 项任务
                    </span>
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
                <div className={surfaceCardClassName} id="teacher-training-submission-form">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-[#1a6fd4]" />
                    <p className="text-sm font-semibold text-slate-900">填写汇报</p>
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
                          已选择新附件，保存后会替换并删除原附件。
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
              <section className={surfaceCardClassName}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">任务汇报概览</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {canManage ? "管理员可按班次导出全部任务完成情况。" : "查看我的任务提交记录和完成情况。"}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                    {selectedCohort.tasks.length} 项任务
                  </span>
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
                <section className={surfaceCardClassName}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">导出归档</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        导出名单、报到信息、课程签到和任务汇报，按当前班次生成归档材料。
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        导出可能需要几十秒，按钮转圈时请不要重复点击。
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                      {selectedCohort.title}
                    </span>
                  </div>
                  {exportStatus ? (
                    <p className="mt-4 rounded-xl border border-blue-100 bg-white/80 px-4 py-3 text-xs font-semibold leading-5 text-blue-700">
                      {exportStatus}
                    </p>
                  ) : null}
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {teacherTrainingExportItems.map((item) => {
                      const isExporting = exportingTeacherTrainingType === item.type;
                      return (
                      <button
                        key={item.type}
                        className="group rounded-2xl border border-slate-200/75 bg-white/76 p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/10 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
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
                  <div className="mt-5 rounded-2xl border border-slate-200/75 bg-white/78 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">省培回收站</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          班次、课程、签到任务和省培任务删除后先进入这里；恢复不会丢汇报和附件，永久删除才会清理文件。
                        </p>
                      </div>
                      <ActionButton
                        aria-label="刷新省培回收站"
                        loading={recycleBinLoading}
                        loadingLabel="读取中..."
                        onClick={() => void refreshTeacherTrainingRecycleBin()}
                        title="刷新省培回收站"
                        variant="secondary"
                      >
                        刷新
                      </ActionButton>
                    </div>
                    {recycleBinStatus ? (
                      <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                        {recycleBinStatus}
                      </p>
                    ) : null}
                    {recycleBinItems.length ? (
                      <div className="mt-3 grid gap-2">
                        {recycleBinItems.map((item) => (
                          <div
                            key={`${item.type}-${item.id}`}
                            className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto]"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700">
                                  {item.typeLabel}
                                </span>
                                <p className="min-w-0 break-words text-sm font-bold text-slate-900">{item.title}</p>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {item.cohortTitle} / {item.detail} / {item.deletedAt} 由 {item.deletedByName} 移入
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                              <ActionButton
                                aria-label={`恢复${item.title}`}
                                disabled={recycleBinLoading}
                                onClick={() => void restoreTeacherTrainingRecycleItem(item)}
                                title={`恢复${item.title}`}
                                variant="secondary"
                              >
                                恢复
                              </ActionButton>
                              <ActionButton
                                aria-label={`永久删除${item.title}`}
                                disabled={recycleBinLoading}
                                onClick={() => void permanentlyDeleteTeacherTrainingRecycleItem(item)}
                                title={`永久删除${item.title}`}
                                variant="danger"
                              >
                                永久删除
                              </ActionButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
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
