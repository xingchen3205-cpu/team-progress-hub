import { createZipArchive } from "@/lib/zip";
import {
  buildTeacherTrainingSubmissionAttachmentDownloadUrl,
  decodeTeacherTrainingSubmissionAttachmentFile,
  getTeacherTrainingSubmissionAttachmentLabel,
  type TeacherTrainingSubmissionAttachmentItem,
} from "@/lib/teacher-training-submission-attachments";
import {
  buildTeacherTrainingLeaveAttachmentDownloadUrl,
  decodeTeacherTrainingLeaveAttachmentFile,
  getTeacherTrainingLeaveAttachmentLabel,
  type TeacherTrainingLeaveAttachmentItem,
} from "@/lib/teacher-training-leave-attachments";

export type TeacherTrainingAttendanceStatus = "present" | "leave" | "absent" | "online";

export const teacherTrainingAttendanceLabels: Record<TeacherTrainingAttendanceStatus, string> = {
  present: "已报到",
  leave: "请假",
  absent: "缺勤",
  online: "线上参训",
};

const attendanceRoomPattern = /^酒店房号\s*[：:]\s*(.*)$/;
const attendanceMaterialsPattern = /^材料齐全\s*[：:]\s*(.*)$/;
const attendanceRegistrationNotePattern = /^报到备注\s*[：:]\s*(.*)$/;
const attendanceStructuredNotePatterns = [
  attendanceRoomPattern,
  attendanceMaterialsPattern,
  attendanceRegistrationNotePattern,
];

export const teacherTrainingAttendancePendingLabel = "待报到";

export const parseTeacherTrainingAttendanceNote = (value?: string | null) => {
  let roomNumber = "";
  let materialsComplete: boolean | null = null;
  const noteLines: string[] = [];

  for (const rawLine of (value ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const roomMatch = line.match(attendanceRoomPattern);
    if (roomMatch) {
      roomNumber = roomMatch[1]?.trim() ?? "";
      continue;
    }

    const materialsMatch = line.match(attendanceMaterialsPattern);
    if (materialsMatch) {
      const normalized = (materialsMatch[1]?.trim() ?? "").toLowerCase();
      materialsComplete = ["是", "齐全", "yes", "true", "1"].includes(normalized)
        ? true
        : ["否", "不齐全", "no", "false", "0"].includes(normalized)
          ? false
          : null;
      continue;
    }

    const registrationNoteMatch = line.match(attendanceRegistrationNotePattern);
    if (registrationNoteMatch) {
      const note = registrationNoteMatch[1]?.trim();
      if (note) noteLines.push(note);
      continue;
    }

    if (!attendanceStructuredNotePatterns.some((pattern) => pattern.test(line))) {
      noteLines.push(line);
    }
  }

  return {
    roomNumber,
    materialsComplete,
    materialsCompleteLabel: materialsComplete === null ? "未确认" : materialsComplete ? "齐全" : "不齐全",
    registrationNote: noteLines.join("\n"),
  };
};

export const buildTeacherTrainingAttendanceNote = ({
  roomNumber = "",
  materialsComplete = null,
  registrationNote = "",
}: {
  roomNumber?: string | null;
  materialsComplete?: boolean | null;
  registrationNote?: string | null;
}) =>
  [
    roomNumber?.trim() ? `酒店房号：${roomNumber.trim()}` : "",
    materialsComplete === null ? "" : `材料齐全：${materialsComplete ? "是" : "否"}`,
    registrationNote?.trim() ? `报到备注：${registrationNote.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

export type TeacherTrainingAttendanceItem = {
  id: string;
  participantId: string;
  sessionDate: string;
  sessionLabel: string;
  status: TeacherTrainingAttendanceStatus;
  statusLabel: string;
  note: string;
  roomNumber: string;
  materialsComplete: boolean | null;
  materialsCompleteLabel: string;
  registrationNote: string;
  markedAt: string;
  markedByName: string;
};

export type TeacherTrainingSubmissionItem = {
  id: string;
  taskId: string;
  participantId: string;
  participantName: string;
  content: string;
  attachment: string;
  attachmentLabel: string;
  attachmentFile: TeacherTrainingSubmissionAttachmentItem | null;
  status: string;
  submittedAt: string;
  submittedByName: string;
  aiScore: number | null;
  aiComment: string;
  aiReviewedAt: string;
  finalScore: number | null;
  finalComment: string;
  finalReviewedById: string | null;
  finalReviewedByName: string;
  finalReviewedAt: string;
  reviewStatusLabel: string;
};

export type TeacherTrainingTaskReleaseMode = "immediate" | "after_course" | "scheduled";

export type TeacherTrainingTaskItem = {
  id: string;
  cohortId: string;
  courseSessionId: string | null;
  courseTitle: string;
  courseDate: string;
  courseTimeRange: string;
  title: string;
  description: string;
  dueDate: string | null;
  taskType: string;
  taskTypeLabel: string;
  releaseMode: TeacherTrainingTaskReleaseMode;
  releaseAt: string;
  availableAt: string;
  availableAtLabel: string;
  isReleased: boolean;
  releaseStatusLabel: string;
  requireAttachment: boolean;
  enableAiReview: boolean;
  scoringRubric: string;
  createdAt: string;
  createdByName: string;
  submissions: TeacherTrainingSubmissionItem[];
};

export type TeacherTrainingCourseSessionItem = {
  id: string;
  cohortId: string;
  title: string;
  courseDate: string;
  startTime: string;
  endTime: string;
  location: string;
  instructor: string;
  description: string;
  createdAt: string;
  createdByName: string;
};

export type TeacherTrainingCheckInRecordItem = {
  id: string;
  checkInTaskId: string;
  participantId: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  distanceMeters: number | null;
  status: string;
  note: string;
  signedAt: string;
  participantName: string;
};

export const getTeacherTrainingCheckInRecordStatusLabel = (status: string) =>
  status === "manual" ? "人工确认" : "已签到";

export type TeacherTrainingCheckInTaskItem = {
  id: string;
  cohortId: string;
  courseSessionId: string | null;
  title: string;
  signDate: string;
  startTime: string;
  endTime: string;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  isActive: boolean;
  createdAt: string;
  createdByName: string;
  records: TeacherTrainingCheckInRecordItem[];
};

export type TeacherTrainingApproverOptionItem = {
  id: string;
  name: string;
  username: string;
  role: string;
};

export type TeacherTrainingManagerAccountItem = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  responsibility: string;
  createdAt: string;
  managedCohorts: Array<{
    cohortId: string;
    cohortTitle: string;
    title: string;
  }>;
};

export type TeacherTrainingParticipantAccountOptionItem = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  responsibility: string;
};

export const teacherTrainingRoleTitleLabels: Record<string, string> = {
  admin: "系统管理员",
  school_admin: "校级管理员",
  message_admin: "消息管理员",
  teacher: "指导教师",
  leader: "项目负责人",
  member: "团队成员",
  training_teacher: "参训教师",
};

export type TeacherTrainingCohortManagerItem = {
  id: string;
  cohortId: string;
  userId: string;
  name: string;
  username: string;
  role: string;
  title: string;
  createdAt: string;
};

export type TeacherTrainingLeaveFlowStep = {
  key: string;
  name: string;
  approverIds: string[];
  requiredCount: number;
};

export type TeacherTrainingLeaveFlowItem = {
  id: string;
  cohortId: string;
  approvalSteps: TeacherTrainingLeaveFlowStep[];
  isEnabled: boolean;
  createdAt: string;
};

export type TeacherTrainingLeaveApprovalItem = {
  id: string;
  leaveRequestId: string;
  stepKey: string;
  stepName: string;
  stepIndex: number;
  approverId: string;
  approverTitle?: string;
  approverName: string;
  decision: string;
  comment: string;
  reviewedAt: string;
};

export type TeacherTrainingLeaveRequestItem = {
  id: string;
  cohortId: string;
  participantId: string;
  participantName: string;
  organization: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  sessionLabel: string;
  reason: string;
  attachment: string;
  attachmentLabel: string;
  attachmentFile: TeacherTrainingLeaveAttachmentItem | null;
  status: string;
  statusLabel: string;
  currentStepIndex: number;
  approvalSteps: TeacherTrainingLeaveFlowStep[];
  approvals: TeacherTrainingLeaveApprovalItem[];
  submittedAt: string;
  completedAt: string;
};

export type TeacherTrainingArrivalTransport = "" | "train" | "flight" | "self_drive" | "bus" | "other";

export const teacherTrainingArrivalTransportLabels: Record<Exclude<TeacherTrainingArrivalTransport, "">, string> = {
  train: "高铁/火车",
  flight: "飞机",
  self_drive: "自驾",
  bus: "大巴/客运",
  other: "其他",
};

export type TeacherTrainingArrivalInfoItem = {
  transportation: TeacherTrainingArrivalTransport | string;
  transportationLabel: string;
  arrivalAt: string;
  vehicleNo: string;
  departure: string;
  companions: string;
  lodging: string;
  note: string;
  isSubmitted: boolean;
};

export type TeacherTrainingParticipantItem = {
  id: string;
  cohortId: string;
  name: string;
  organization: string;
  phone: string;
  groupName: string;
  isGroupLeader: boolean;
  title: string;
  email: string;
  gender: string;
  age: string;
  personnelCategory: string;
  subject: string;
  professionalTitle: string;
  city: string;
  arrivalInfo: TeacherTrainingArrivalInfoItem;
  arrivalAt: string;
  arrivalTransportationLabel: string;
  accountUserId: string | null;
  accountName: string;
  accountUsername: string;
  accountRole: string;
  extraInfo: string;
  extraInfoLines: string[];
  note: string;
  attendances: TeacherTrainingAttendanceItem[];
  checkInRecords: TeacherTrainingCheckInRecordItem[];
  leaveRequests: TeacherTrainingLeaveRequestItem[];
};

export type TeacherTrainingCohortItem = {
  id: string;
  includeDetails?: boolean;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
  createdAt: string;
  createdByName: string;
  courseSessions: TeacherTrainingCourseSessionItem[];
  participants: TeacherTrainingParticipantItem[];
  attendances: TeacherTrainingAttendanceItem[];
  checkInTasks: TeacherTrainingCheckInTaskItem[];
  leaveFlow: TeacherTrainingLeaveFlowItem | null;
  leaveRequests: TeacherTrainingLeaveRequestItem[];
  managers: TeacherTrainingCohortManagerItem[];
  tasks: TeacherTrainingTaskItem[];
  stats: {
    participantCount: number;
    presentCount: number;
    leaveCount: number;
    absentCount: number;
    courseCount: number;
    checkInTaskCount: number;
    checkInRecordCount: number;
    leaveRequestCount: number;
    managerCount: number;
    taskCount: number;
    submissionCount: number;
  };
};

export type TeacherTrainingPayload = {
  cohorts: TeacherTrainingCohortItem[];
  approverOptions: TeacherTrainingApproverOptionItem[];
  managerOptions: TeacherTrainingApproverOptionItem[];
  managerAccountOptions: TeacherTrainingManagerAccountItem[];
  participantAccountOptions: TeacherTrainingParticipantAccountOptionItem[];
};

type TeacherTrainingRoleUser = {
  id: string;
  role?: string;
  roleLabel?: string;
  responsibility?: string;
  hasTeacherTrainingAccess?: boolean;
  hasTeacherTrainingManagerAccess?: boolean;
  teacherTrainingParticipantCount?: number;
  teacherTrainingManagedCohortCount?: number;
};

type TeacherTrainingRoleCohort = {
  id?: string;
  managers?: Array<{
    userId: string;
    title?: string | null;
  }>;
  participants?: Array<{
    accountUserId?: string | null;
    title?: string | null;
  }>;
};

export const getTeacherTrainingEffectiveRoleLabel = ({
  user,
  cohorts = [],
  activeCohortId = "",
}: {
  user: TeacherTrainingRoleUser | null | undefined;
  cohorts?: TeacherTrainingRoleCohort[];
  activeCohortId?: string;
}) => {
  if (!user) {
    return "省培用户";
  }

  if (user.role === "admin") {
    return teacherTrainingRoleTitleLabels[user.role] ?? user.roleLabel ?? "系统管理员";
  }

  const orderedCohorts = activeCohortId
    ? [
        ...cohorts.filter((cohort) => cohort.id === activeCohortId),
        ...cohorts.filter((cohort) => cohort.id !== activeCohortId),
      ]
    : cohorts;
  const managerTitle = orderedCohorts
    .flatMap((cohort) => cohort.managers ?? [])
    .find((manager) => manager.userId === user.id)
    ?.title?.trim();

  if (managerTitle) {
    return managerTitle.includes("班主任") ? "省培班主任" : managerTitle;
  }

  const accountResponsibility = user.responsibility?.trim();
  if (accountResponsibility === "省培负责人" || accountResponsibility === "省培班主任" || accountResponsibility === "班主任") {
    return accountResponsibility === "班主任" ? "省培班主任" : accountResponsibility;
  }

  if (user.hasTeacherTrainingManagerAccess || (user.teacherTrainingManagedCohortCount ?? 0) > 0) {
    return "省培管理人员";
  }

  const participantProfile = orderedCohorts
    .flatMap((cohort) => cohort.participants ?? [])
    .find((participant) => participant.accountUserId === user.id);

  // 普通参训教师统一显示角色“省培教师”，不再用其职务（如“教研室主任”）作为身份标签。
  const isParticipant = Boolean(participantProfile);
  if (
    user.role === "training_teacher" ||
    isParticipant ||
    (user.teacherTrainingParticipantCount ?? 0) > 0 ||
    user.hasTeacherTrainingAccess
  ) {
    return "省培教师";
  }

  return user.roleLabel || "省培用户";
};

const participantTitlePattern = /^(?:职务|个人职务)\s*[：:]\s*(.*)$/;
const participantEmailPattern = /^(?:邮箱|电子邮箱|个人邮箱)\s*[：:]\s*(.*)$/;
const participantGenderPattern = /^(?:性别|学员性别)\s*[：:]\s*(.*)$/;
const participantAgePattern = /^(?:年龄|学员年龄)\s*[：:]\s*(.*)$/;
const participantPersonnelCategoryPattern = /^(?:人员类别|人员类型|教师类别|学员类别)\s*[：:]\s*(.*)$/;
const participantSubjectPattern = /^(?:学科|专业学科|任教学科)\s*[：:]\s*(.*)$/;
const participantProfessionalTitlePattern = /^(?:职称|专业技术职称|教师职称)\s*[：:]\s*(.*)$/;
const participantCityPattern = /^(?:所属市|地市|所在市|城市)\s*[：:]\s*(.*)$/;
const participantGroupLeaderPattern = /^小组组长\s*[：:]\s*(是|否)$/;
const participantArrivalTransportationPattern = /^(?:交通方式|到达交通方式|预计到达交通方式)\s*[：:]\s*(.*)$/;
const participantArrivalAtPattern = /^(?:预计到达时间|预计报到时间|到达时间|报到时间)\s*[：:]\s*(.*)$/;
const participantArrivalVehicleNoPattern = /^(?:车次\/航班\/车牌|车次|航班|车牌|班次)\s*[：:]\s*(.*)$/;
const participantArrivalDeparturePattern = /^(?:出发地|出发城市|出发站点)\s*[：:]\s*(.*)$/;
const participantArrivalCompanionsPattern = /^(?:同行人数|随行人数)\s*[：:]\s*(.*)$/;
const participantArrivalLodgingPattern = /^(?:住宿需求|住宿安排)\s*[：:]\s*(.*)$/;
const participantArrivalNotePattern = /^(?:到达备注|报到备注|交通备注)\s*[：:]\s*(.*)$/;

const participantStructuredExtraPatterns = [
  participantTitlePattern,
  participantEmailPattern,
  participantGenderPattern,
  participantAgePattern,
  participantPersonnelCategoryPattern,
  participantSubjectPattern,
  participantProfessionalTitlePattern,
  participantCityPattern,
  participantGroupLeaderPattern,
  participantArrivalTransportationPattern,
  participantArrivalAtPattern,
  participantArrivalVehicleNoPattern,
  participantArrivalDeparturePattern,
  participantArrivalCompanionsPattern,
  participantArrivalLodgingPattern,
  participantArrivalNotePattern,
];

const normalizeTeacherTrainingArrivalTransportation = (value?: string | null): TeacherTrainingArrivalTransport | string => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const normalized = trimmed.toLowerCase();
  if (["train", "rail", "火车", "高铁", "动车", "高铁/火车", "铁路"].includes(normalized)) {
    return "train";
  }
  if (["flight", "plane", "air", "飞机", "航班"].includes(normalized)) {
    return "flight";
  }
  if (["self_drive", "self-drive", "car", "自驾", "开车"].includes(normalized)) {
    return "self_drive";
  }
  if (["bus", "coach", "大巴", "客运", "汽车"].includes(normalized)) {
    return "bus";
  }
  if (["other", "其他"].includes(normalized)) {
    return "other";
  }

  return trimmed;
};

export const getTeacherTrainingArrivalTransportationLabel = (value?: string | null) => {
  const normalized = normalizeTeacherTrainingArrivalTransportation(value);
  if (!normalized) return "";

  return teacherTrainingArrivalTransportLabels[normalized as Exclude<TeacherTrainingArrivalTransport, "">] ?? `${normalized}`;
};

export const normalizeTeacherTrainingArrivalAt = (value?: string | null) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const normalized = trimmed.replace(/\s+/, "T");
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) {
    return `${match[1]}T${match[2]}`;
  }

  return trimmed;
};

export const isTeacherTrainingArrivalAtValue = (value?: string | null) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalizeTeacherTrainingArrivalAt(value));

export const formatTeacherTrainingArrivalAt = (value?: string | null) =>
  normalizeTeacherTrainingArrivalAt(value).replace("T", " ");

export const parseTeacherTrainingArrivalInfo = (value?: string | null): TeacherTrainingArrivalInfoItem => {
  let transportation = "";
  let arrivalAt = "";
  let vehicleNo = "";
  let departure = "";
  let companions = "";
  let lodging = "";
  let note = "";

  for (const rawLine of (value ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const transportationMatch = line.match(participantArrivalTransportationPattern);
    if (transportationMatch) {
      transportation = `${normalizeTeacherTrainingArrivalTransportation(transportationMatch[1])}`;
      continue;
    }

    const arrivalAtMatch = line.match(participantArrivalAtPattern);
    if (arrivalAtMatch) {
      arrivalAt = normalizeTeacherTrainingArrivalAt(arrivalAtMatch[1]);
      continue;
    }

    const vehicleNoMatch = line.match(participantArrivalVehicleNoPattern);
    if (vehicleNoMatch) {
      vehicleNo = vehicleNoMatch[1]?.trim() ?? "";
      continue;
    }

    const departureMatch = line.match(participantArrivalDeparturePattern);
    if (departureMatch) {
      departure = departureMatch[1]?.trim() ?? "";
      continue;
    }

    const companionsMatch = line.match(participantArrivalCompanionsPattern);
    if (companionsMatch) {
      companions = companionsMatch[1]?.trim() ?? "";
      continue;
    }

    const lodgingMatch = line.match(participantArrivalLodgingPattern);
    if (lodgingMatch) {
      lodging = lodgingMatch[1]?.trim() ?? "";
      continue;
    }

    const noteMatch = line.match(participantArrivalNotePattern);
    if (noteMatch) {
      note = noteMatch[1]?.trim() ?? "";
    }
  }

  return {
    transportation,
    transportationLabel: getTeacherTrainingArrivalTransportationLabel(transportation),
    arrivalAt,
    vehicleNo,
    departure,
    companions,
    lodging,
    note,
    isSubmitted: Boolean(arrivalAt),
  };
};

export const parseTeacherTrainingParticipantExtraInfo = (value?: string | null) => {
  let title = "";
  let email = "";
  let gender = "";
  let age = "";
  let personnelCategory = "";
  let subject = "";
  let professionalTitle = "";
  let city = "";
  let isGroupLeader = false;
  const arrivalInfo = parseTeacherTrainingArrivalInfo(value);

  for (const rawLine of (value ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const titleMatch = line.match(participantTitlePattern);
    if (titleMatch) {
      title = titleMatch[1]?.trim() ?? "";
      continue;
    }

    const emailMatch = line.match(participantEmailPattern);
    if (emailMatch) {
      email = emailMatch[1]?.trim() ?? "";
      continue;
    }

    const genderMatch = line.match(participantGenderPattern);
    if (genderMatch) {
      gender = genderMatch[1]?.trim() ?? "";
      continue;
    }

    const ageMatch = line.match(participantAgePattern);
    if (ageMatch) {
      age = ageMatch[1]?.trim() ?? "";
      continue;
    }

    const personnelCategoryMatch = line.match(participantPersonnelCategoryPattern);
    if (personnelCategoryMatch) {
      personnelCategory = personnelCategoryMatch[1]?.trim() ?? "";
      continue;
    }

    const subjectMatch = line.match(participantSubjectPattern);
    if (subjectMatch) {
      subject = subjectMatch[1]?.trim() ?? "";
      continue;
    }

    const professionalTitleMatch = line.match(participantProfessionalTitlePattern);
    if (professionalTitleMatch) {
      professionalTitle = professionalTitleMatch[1]?.trim() ?? "";
      continue;
    }

    const cityMatch = line.match(participantCityPattern);
    if (cityMatch) {
      city = cityMatch[1]?.trim() ?? "";
      continue;
    }

    const groupLeaderMatch = line.match(participantGroupLeaderPattern);
    if (groupLeaderMatch) {
      isGroupLeader = groupLeaderMatch[1] === "是";
    }
  }

  return { title, email, gender, age, personnelCategory, subject, professionalTitle, city, isGroupLeader, arrivalInfo };
};

export const mergeTeacherTrainingParticipantExtraInfo = (
  value: string | null | undefined,
  fields: {
    title?: string | null;
    email?: string | null;
    gender?: string | null;
    age?: string | null;
    personnelCategory?: string | null;
    subject?: string | null;
    professionalTitle?: string | null;
    city?: string | null;
    isGroupLeader?: boolean;
    arrivalTransportation?: string | null;
    arrivalAt?: string | null;
    arrivalVehicleNo?: string | null;
    arrivalDeparture?: string | null;
  },
) => {
  const existing = parseTeacherTrainingParticipantExtraInfo(value);
  const title = fields.title === undefined ? existing.title : fields.title?.trim() ?? "";
  const email = fields.email === undefined ? existing.email : fields.email?.trim() ?? "";
  const gender = fields.gender === undefined ? existing.gender : fields.gender?.trim() ?? "";
  const age = fields.age === undefined ? existing.age : fields.age?.trim() ?? "";
  const personnelCategory =
    fields.personnelCategory === undefined ? existing.personnelCategory : fields.personnelCategory?.trim() ?? "";
  const subject = fields.subject === undefined ? existing.subject : fields.subject?.trim() ?? "";
  const professionalTitle =
    fields.professionalTitle === undefined ? existing.professionalTitle : fields.professionalTitle?.trim() ?? "";
  const city = fields.city === undefined ? existing.city : fields.city?.trim() ?? "";
  const isGroupLeader = fields.isGroupLeader === undefined ? existing.isGroupLeader : fields.isGroupLeader;
  const arrivalTransportation =
    fields.arrivalTransportation === undefined
      ? existing.arrivalInfo.transportation
      : normalizeTeacherTrainingArrivalTransportation(fields.arrivalTransportation);
  const arrivalAt =
    fields.arrivalAt === undefined ? existing.arrivalInfo.arrivalAt : normalizeTeacherTrainingArrivalAt(fields.arrivalAt);
  const arrivalVehicleNo =
    fields.arrivalVehicleNo === undefined ? existing.arrivalInfo.vehicleNo : fields.arrivalVehicleNo?.trim() ?? "";
  const arrivalDeparture =
    fields.arrivalDeparture === undefined ? existing.arrivalInfo.departure : fields.arrivalDeparture?.trim() ?? "";
  const customLines = (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !participantStructuredExtraPatterns.some((pattern) => pattern.test(line)));

  return [
    title ? `职务：${title}` : "",
    email ? `邮箱：${email}` : "",
    gender ? `性别：${gender}` : "",
    age ? `年龄：${age}` : "",
    personnelCategory ? `人员类别：${personnelCategory}` : "",
    subject ? `学科：${subject}` : "",
    professionalTitle ? `职称：${professionalTitle}` : "",
    city ? `所属市：${city}` : "",
    isGroupLeader ? "小组组长：是" : "",
    arrivalAt ? `预计到达时间：${arrivalAt}` : "",
    arrivalTransportation ? `交通方式：${getTeacherTrainingArrivalTransportationLabel(`${arrivalTransportation}`)}` : "",
    arrivalVehicleNo ? `车次/航班/车牌：${arrivalVehicleNo}` : "",
    arrivalDeparture ? `出发地：${arrivalDeparture}` : "",
    ...customLines,
  ]
    .filter(Boolean)
    .join("\n");
};

const toDateTimeLabel = (value: Date | string | null | undefined) => {
  if (!value) {
    return "";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const normalizeAttendanceStatus = (value?: string | null): TeacherTrainingAttendanceStatus => {
  if (value === "leave" || value === "absent" || value === "online") {
    return value;
  }

  return "present";
};

export const teacherTrainingLeaveStatusLabels: Record<string, string> = {
  pending: "审批中",
  approved: "已批准",
  rejected: "已驳回",
};

const teacherTrainingDateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const teacherTrainingTimeOnlyPattern = /^\d{2}:\d{2}$/;
const teacherTrainingDateTimePattern = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/;
const teacherTrainingMaxLeaveDays = 31;

export const teacherTrainingTaskReleaseModeLabels: Record<TeacherTrainingTaskReleaseMode, string> = {
  immediate: "立即开放",
  after_course: "课程结束后开放",
  scheduled: "指定时间开放",
};

export const teacherTrainingTaskTypeLabels: Record<string, string> = {
  cohort: "班级任务",
  course: "课程任务",
  stage: "阶段任务",
  group: "小组任务",
};

export const normalizeTeacherTrainingTaskReleaseMode = (value?: string | null): TeacherTrainingTaskReleaseMode => {
  if (value === "after_course" || value === "scheduled") {
    return value;
  }

  return "immediate";
};

export const normalizeTeacherTrainingTaskDateTime = (value?: string | null) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const dateTimeMatch = trimmed.match(teacherTrainingDateTimePattern);
  if (dateTimeMatch) {
    return `${dateTimeMatch[1]}T${dateTimeMatch[2]}`;
  }

  if (teacherTrainingDateOnlyPattern.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
};

const parseTeacherTrainingBeijingDateTime = (value?: string | null) => {
  const normalized = normalizeTeacherTrainingTaskDateTime(value);
  if (!normalized) return null;

  const dateTimeMatch = normalized.match(teacherTrainingDateTimePattern);
  const dateOnlyMatch = normalized.match(teacherTrainingDateOnlyPattern);
  const date = dateTimeMatch
    ? new Date(`${dateTimeMatch[1]}T${dateTimeMatch[2]}:00+08:00`)
    : dateOnlyMatch
      ? new Date(`${normalized}T00:00:00+08:00`)
      : new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatTeacherTrainingTaskDateTimeLabel = (value?: string | null) => {
  const parsed = parseTeacherTrainingBeijingDateTime(value);
  if (!parsed) return "";

  return toDateTimeLabel(parsed);
};

export const getTeacherTrainingTaskCourseTimeRange = (course?: {
  startTime?: string | null;
  endTime?: string | null;
} | null) => [course?.startTime ?? "", course?.endTime ?? ""].filter(Boolean).join("-");

export const getTeacherTrainingTaskAvailableAt = (task: {
  releaseMode?: string | null;
  releaseAt?: string | null;
  courseSession?: {
    courseDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
  } | null;
}) => {
  const releaseMode = normalizeTeacherTrainingTaskReleaseMode(task.releaseMode);
  if (releaseMode === "immediate") {
    return "";
  }

  if (releaseMode === "scheduled") {
    return normalizeTeacherTrainingTaskDateTime(task.releaseAt);
  }

  const courseDate = task.courseSession?.courseDate?.trim();
  if (!courseDate) {
    return normalizeTeacherTrainingTaskDateTime(task.releaseAt);
  }

  const releaseTime =
    task.courseSession?.endTime?.trim() || task.courseSession?.startTime?.trim() || "23:59";
  return `${courseDate}T${releaseTime}`;
};

export const isTeacherTrainingTaskReleased = (
  task: {
    releaseMode?: string | null;
    releaseAt?: string | null;
    courseSession?: {
      courseDate?: string | null;
      startTime?: string | null;
      endTime?: string | null;
    } | null;
  },
  now = new Date(),
) => {
  const releaseMode = normalizeTeacherTrainingTaskReleaseMode(task.releaseMode);
  if (releaseMode === "immediate") {
    return true;
  }

  const availableAt = getTeacherTrainingTaskAvailableAt(task);
  const releaseDate = parseTeacherTrainingBeijingDateTime(availableAt);
  if (!releaseDate) {
    return false;
  }

  return now.getTime() >= releaseDate.getTime();
};

export const validateTeacherTrainingLeaveRange = ({
  startDate,
  endDate,
  startTime,
  endTime,
}: {
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
}) => {
  if (!teacherTrainingDateOnlyPattern.test(startDate) || !teacherTrainingDateOnlyPattern.test(endDate)) {
    return "请假日期格式不正确";
  }

  if (
    (startTime && !teacherTrainingTimeOnlyPattern.test(startTime)) ||
    (endTime && !teacherTrainingTimeOnlyPattern.test(endTime))
  ) {
    return "请假时间格式不正确";
  }

  if (endDate < startDate || (startDate === endDate && startTime && endTime && endTime < startTime)) {
    return "请假结束时间不能早于开始时间";
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "请假日期格式不正确";
  }

  const leaveDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (leaveDays > teacherTrainingMaxLeaveDays) {
    return "单次请假最长不能超过31天";
  }

  return "";
};

export const parseTeacherTrainingLeaveSteps = (value?: string | null): TeacherTrainingLeaveFlowStep[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((step, index) => {
        const candidate = step as {
          key?: unknown;
          id?: unknown;
          name?: unknown;
          approverIds?: unknown;
          requiredCount?: unknown;
        };
        const approverIds = Array.isArray(candidate.approverIds)
          ? candidate.approverIds.map((item) => `${item}`.trim()).filter(Boolean)
          : [];
        const requiredCount = Math.min(
          Math.max(1, Number(candidate.requiredCount) || 1),
          Math.max(1, approverIds.length),
        );

        return {
          key: `${candidate.key ?? candidate.id ?? `step-${index + 1}`}`.trim() || `step-${index + 1}`,
          name: `${candidate.name ?? `第${index + 1}步审批`}`.trim() || `第${index + 1}步审批`,
          approverIds,
          requiredCount,
        };
      })
      .filter((step) => step.approverIds.length > 0);
  } catch {
    return [];
  }
};

export const serializeTeacherTrainingLeaveSteps = (steps: TeacherTrainingLeaveFlowStep[]) =>
  JSON.stringify(
    steps.map((step, index) => ({
      key: step.key || `step-${index + 1}`,
      name: step.name || `第${index + 1}步审批`,
      approverIds: Array.from(new Set(step.approverIds.map((id) => id.trim()).filter(Boolean))),
      requiredCount: Math.min(Math.max(1, step.requiredCount || 1), Math.max(1, step.approverIds.length)),
    })),
  );

export const calculateDistanceMeters = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) => {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(toLatitude - fromLatitude);
  const deltaLongitude = toRadians(toLongitude - fromLongitude);
  const latitude1 = toRadians(fromLatitude);
  const latitude2 = toRadians(toLatitude);
  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusMeters * c);
};

export const TEACHER_TRAINING_CHECK_IN_DEFAULT_RADIUS_METERS = 500;
export const TEACHER_TRAINING_CHECK_IN_MAX_GPS_TOLERANCE_METERS = 200;

export const getAllowedTeacherTrainingCheckInDistanceMeters = (radiusMeters: number, accuracy: number | null) => {
  const baseRadius = Number.isFinite(radiusMeters)
    ? Math.max(50, Math.round(radiusMeters))
    : TEACHER_TRAINING_CHECK_IN_DEFAULT_RADIUS_METERS;
  const accuracyTolerance =
    accuracy !== null && Number.isFinite(accuracy)
      ? Math.min(TEACHER_TRAINING_CHECK_IN_MAX_GPS_TOLERANCE_METERS, Math.max(0, Math.round(accuracy)))
      : 0;

  return baseRadius + accuracyTolerance;
};

export const isValidTeacherTrainingLatitude = (value: number | null) =>
  value === null || (value >= -90 && value <= 90);

export const isValidTeacherTrainingLongitude = (value: number | null) =>
  value === null || (value >= -180 && value <= 180);

export const areValidTeacherTrainingCoordinates = (latitude: number | null, longitude: number | null) =>
  isValidTeacherTrainingLatitude(latitude) && isValidTeacherTrainingLongitude(longitude);

export type TeacherTrainingCheckInWindowState = "not_started" | "open" | "ended" | "closed";

type TeacherTrainingCheckInWindowInput = {
  signDate: string;
  startTime?: string | null;
  endTime?: string | null;
  isActive?: boolean;
};

const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const getShanghaiDateParts = (date: Date) => {
  const shanghaiDate = new Date(date.getTime() + shanghaiOffsetMs);
  const year = shanghaiDate.getUTCFullYear();
  const month = `${shanghaiDate.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${shanghaiDate.getUTCDate()}`.padStart(2, "0");
  const hour = shanghaiDate.getUTCHours();
  const minute = shanghaiDate.getUTCMinutes();

  return {
    dateKey: `${year}-${month}-${day}`,
    minuteOfDay: hour * 60 + minute,
  };
};

export const parseTeacherTrainingTimeToMinutes = (value?: string | null) => {
  const match = value?.trim().match(timePattern);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

export const validateTeacherTrainingSessionTimeRange = (
  startTime?: string | null,
  endTime?: string | null,
) => {
  const normalizedStartTime = startTime?.trim() ?? "";
  const normalizedEndTime = endTime?.trim() ?? "";
  if (Boolean(normalizedStartTime) !== Boolean(normalizedEndTime)) {
    return "请同时填写开始时间和结束时间";
  }
  if (!normalizedStartTime && !normalizedEndTime) {
    return "";
  }

  const startMinutes = parseTeacherTrainingTimeToMinutes(normalizedStartTime);
  const endMinutes = parseTeacherTrainingTimeToMinutes(normalizedEndTime);
  if (startMinutes === null || endMinutes === null) {
    return "时间格式不正确";
  }
  if (endMinutes <= startMinutes) {
    return "结束时间必须晚于开始时间";
  }

  return "";
};

export const isTeacherTrainingDateKey = (value?: string | null) => Boolean(value && dateKeyPattern.test(value));

export type TeacherTrainingCourseWindowState = "not_started" | "in_progress" | "ended";

type TeacherTrainingCourseWindowInput = {
  courseDate: string;
  startTime?: string | null;
  endTime?: string | null;
};

export const getTeacherTrainingCourseWindowState = (
  course: TeacherTrainingCourseWindowInput,
  now = new Date(),
): TeacherTrainingCourseWindowState => {
  if (!isTeacherTrainingDateKey(course.courseDate)) {
    return "in_progress";
  }

  const current = getShanghaiDateParts(now);
  if (current.dateKey < course.courseDate) {
    return "not_started";
  }
  if (current.dateKey > course.courseDate) {
    return "ended";
  }

  const startMinutes = parseTeacherTrainingTimeToMinutes(course.startTime);
  const endMinutes = parseTeacherTrainingTimeToMinutes(course.endTime);
  if (startMinutes !== null && current.minuteOfDay < startMinutes) {
    return "not_started";
  }
  if (endMinutes !== null && current.minuteOfDay >= endMinutes) {
    return "ended";
  }

  return "in_progress";
};

export const getTeacherTrainingCheckInWindowState = (
  task: TeacherTrainingCheckInWindowInput,
  now = new Date(),
): TeacherTrainingCheckInWindowState => {
  if (task.isActive === false) {
    return "closed";
  }

  if (!isTeacherTrainingDateKey(task.signDate)) {
    return "open";
  }

  const current = getShanghaiDateParts(now);
  if (current.dateKey < task.signDate) {
    return "not_started";
  }
  if (current.dateKey > task.signDate) {
    return "ended";
  }

  const startMinutes = parseTeacherTrainingTimeToMinutes(task.startTime);
  const endMinutes = parseTeacherTrainingTimeToMinutes(task.endTime);
  if (startMinutes !== null && current.minuteOfDay < startMinutes) {
    return "not_started";
  }
  if (endMinutes !== null && current.minuteOfDay > endMinutes) {
    return "ended";
  }

  return "open";
};

export const teacherTrainingCheckInWindowLabels: Record<TeacherTrainingCheckInWindowState, string> = {
  not_started: "未开始",
  open: "进行中",
  ended: "已结束",
  closed: "已关闭",
};

export const teacherTrainingCheckInWindowMessages: Record<Exclude<TeacherTrainingCheckInWindowState, "open">, string> = {
  not_started: "签到尚未开始，请在规定时间内签到",
  ended: "签到已结束，请联系工作人员登记",
  closed: "签到任务已关闭",
};

export const getTeacherTrainingCheckInWindowLabel = (state: TeacherTrainingCheckInWindowState) =>
  teacherTrainingCheckInWindowLabels[state];

export const buildTeacherTrainingAccountMessage = ({
  cohortTitle,
  name,
  username,
  password,
  loginUrl,
}: {
  cohortTitle: string;
  name: string;
  username: string;
  password: string;
  loginUrl?: string;
}) =>
  [
    `${name}老师您好，您的省培账号已开通。`,
    `培训：${cohortTitle}`,
    `登录账号：${username}`,
    `临时密码：${password}`,
    `登录地址：${loginUrl || "https://xingchencxcy.com/login"}`,
    "请首次登录后先完整填写个人资料，并及时修改初始密码。",
  ].join("\n");

type TeacherTrainingCohortRecord = {
  id: string;
  title: string;
  location?: string | null;
  startDate: string;
  endDate: string;
  description?: string | null;
  createdAt: Date;
  creator?: { name: string } | null;
  participants?: Array<{
    id: string;
    cohortId: string;
    name: string;
    organization: string;
    phone?: string | null;
    groupName?: string | null;
    accountUserId?: string | null;
    extraInfo?: string | null;
    note?: string | null;
    accountUser?: { name: string; username?: string | null; role?: string | null } | null;
    attendances?: Array<TeacherTrainingAttendanceRecord>;
    checkInRecords?: Array<TeacherTrainingCheckInRecordRecord>;
    leaveRequests?: Array<TeacherTrainingLeaveRequestRecord>;
    submissions?: Array<TeacherTrainingSubmissionRecord>;
  }>;
  courseSessions?: Array<TeacherTrainingCourseSessionRecord>;
  attendances?: Array<TeacherTrainingAttendanceRecord>;
  checkInTasks?: Array<TeacherTrainingCheckInTaskRecord>;
  leaveFlow?: TeacherTrainingLeaveFlowRecord | null;
  leaveRequests?: Array<TeacherTrainingLeaveRequestRecord>;
  managers?: Array<TeacherTrainingCohortManagerRecord>;
  tasks?: Array<TeacherTrainingTaskRecord>;
};

type TeacherTrainingCohortManagerRecord = {
  id: string;
  cohortId: string;
  userId: string;
  title: string;
  createdAt: Date;
  user?: { id: string; name: string; username: string; role: string } | null;
};

type TeacherTrainingCourseSessionRecord = {
  id: string;
  cohortId: string;
  title: string;
  courseDate: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  instructor?: string | null;
  description?: string | null;
  createdAt: Date;
  creator?: { name: string } | null;
};

type TeacherTrainingAttendanceRecord = {
  id: string;
  participantId: string;
  sessionDate: string;
  sessionLabel: string;
  status: string;
  note?: string | null;
  markedAt: Date;
  markedBy?: { name: string } | null;
};

type TeacherTrainingCheckInTaskRecord = {
  id: string;
  cohortId: string;
  courseSessionId?: string | null;
  title: string;
  signDate: string;
  startTime?: string | null;
  endTime?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters: number;
  isActive: boolean;
  createdAt: Date;
  creator?: { name: string } | null;
  records?: Array<TeacherTrainingCheckInRecordRecord>;
};

type TeacherTrainingCheckInRecordRecord = {
  id: string;
  checkInTaskId: string;
  participantId: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  distanceMeters?: number | null;
  status: string;
  note?: string | null;
  signedAt: Date;
  participant?: { name: string } | null;
};

type TeacherTrainingLeaveFlowRecord = {
  id: string;
  cohortId: string;
  approvalSteps: string;
  isEnabled: boolean;
  createdAt: Date;
};

type TeacherTrainingLeaveApprovalRecord = {
  id: string;
  leaveRequestId: string;
  stepKey: string;
  stepName: string;
  stepIndex: number;
  approverId: string;
  decision: string;
  comment?: string | null;
  reviewedAt: Date;
  approver?: { name: string; role?: string | null } | null;
};

type TeacherTrainingLeaveRequestRecord = {
  id: string;
  cohortId: string;
  participantId: string;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  sessionLabel?: string | null;
  reason: string;
  attachment?: string | null;
  status: string;
  currentStepIndex: number;
  approvalStepsSnapshot: string;
  submittedAt: Date;
  completedAt?: Date | null;
  participant?: { name: string; organization?: string | null } | null;
  approvals?: Array<TeacherTrainingLeaveApprovalRecord>;
};

type TeacherTrainingTaskRecord = {
  id: string;
  cohortId: string;
  courseSessionId?: string | null;
  title: string;
  description: string;
  dueDate?: string | null;
  taskType?: string | null;
  releaseMode?: string | null;
  releaseAt?: string | null;
  requireAttachment: boolean;
  enableAiReview?: boolean | null;
  scoringRubric?: string | null;
  createdAt: Date;
  courseSession?: {
    title: string;
    courseDate: string;
    startTime?: string | null;
    endTime?: string | null;
  } | null;
  creator?: { name: string } | null;
  submissions?: Array<TeacherTrainingSubmissionRecord>;
};

type TeacherTrainingSubmissionRecord = {
  id: string;
  taskId: string;
  participantId: string;
  content: string;
  attachment?: string | null;
  status: string;
  aiScore?: number | null;
  aiComment?: string | null;
  aiReviewedAt?: Date | null;
  finalScore?: number | null;
  finalComment?: string | null;
  finalReviewedById?: string | null;
  finalReviewedAt?: Date | null;
  submittedAt: Date;
  participant?: { name: string } | null;
  submittedBy?: { name: string } | null;
  finalReviewer?: { name: string } | null;
};

export const serializeTeacherTrainingAttendance = (
  attendance: TeacherTrainingAttendanceRecord,
): TeacherTrainingAttendanceItem => {
  const status = normalizeAttendanceStatus(attendance.status);
  const attendanceNote = parseTeacherTrainingAttendanceNote(attendance.note);

  return {
    id: attendance.id,
    participantId: attendance.participantId,
    sessionDate: attendance.sessionDate,
    sessionLabel: attendance.sessionLabel,
    status,
    statusLabel: teacherTrainingAttendanceLabels[status],
    note: attendance.note ?? "",
    roomNumber: attendanceNote.roomNumber,
    materialsComplete: attendanceNote.materialsComplete,
    materialsCompleteLabel: attendanceNote.materialsCompleteLabel,
    registrationNote: attendanceNote.registrationNote,
    markedAt: toDateTimeLabel(attendance.markedAt),
    markedByName: attendance.markedBy?.name ?? "工作人员",
  };
};

export const serializeTeacherTrainingSubmission = (
  submission: TeacherTrainingSubmissionRecord,
): TeacherTrainingSubmissionItem => {
  const uploadedAttachment = decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment);

  return {
    id: submission.id,
    taskId: submission.taskId,
    participantId: submission.participantId,
    participantName: submission.participant?.name ?? "参训教师",
    content: submission.content,
    attachment: submission.attachment ?? "",
    attachmentLabel: getTeacherTrainingSubmissionAttachmentLabel(submission.attachment),
    attachmentFile: uploadedAttachment
      ? {
          fileName: uploadedAttachment.fileName,
          fileSize: uploadedAttachment.fileSize,
          mimeType: uploadedAttachment.mimeType,
          downloadUrl: buildTeacherTrainingSubmissionAttachmentDownloadUrl(submission.id),
        }
      : null,
    status: submission.status,
    submittedAt: toDateTimeLabel(submission.submittedAt),
    submittedByName: submission.submittedBy?.name ?? "工作人员",
    aiScore: typeof submission.aiScore === "number" ? submission.aiScore : null,
    aiComment: submission.aiComment ?? "",
    aiReviewedAt: toDateTimeLabel(submission.aiReviewedAt ?? null),
    finalScore: typeof submission.finalScore === "number" ? submission.finalScore : null,
    finalComment: submission.finalComment ?? "",
    finalReviewedById: submission.finalReviewedById ?? null,
    finalReviewedByName: submission.finalReviewer?.name ?? "",
    finalReviewedAt: toDateTimeLabel(submission.finalReviewedAt ?? null),
    reviewStatusLabel: typeof submission.finalScore === "number" ? "已确认终评分" : "待人工确认",
  };
};

export const serializeTeacherTrainingCourseSession = (
  courseSession: TeacherTrainingCourseSessionRecord,
): TeacherTrainingCourseSessionItem => ({
  id: courseSession.id,
  cohortId: courseSession.cohortId,
  title: courseSession.title,
  courseDate: courseSession.courseDate,
  startTime: courseSession.startTime ?? "",
  endTime: courseSession.endTime ?? "",
  location: courseSession.location ?? "",
  instructor: courseSession.instructor ?? "",
  description: courseSession.description ?? "",
  createdAt: toDateTimeLabel(courseSession.createdAt),
  createdByName: courseSession.creator?.name ?? "管理员",
});

export const serializeTeacherTrainingCheckInRecord = (
  record: TeacherTrainingCheckInRecordRecord,
): TeacherTrainingCheckInRecordItem => ({
  id: record.id,
  checkInTaskId: record.checkInTaskId,
  participantId: record.participantId,
  latitude: record.latitude ?? null,
  longitude: record.longitude ?? null,
  accuracy: record.accuracy ?? null,
  distanceMeters: record.distanceMeters ?? null,
  status: record.status,
  note: record.note ?? "",
  signedAt: toDateTimeLabel(record.signedAt),
  participantName: record.participant?.name ?? "参训教师",
});

export const serializeTeacherTrainingLeaveFlow = (
  flow?: TeacherTrainingLeaveFlowRecord | null,
): TeacherTrainingLeaveFlowItem | null => {
  if (!flow) {
    return null;
  }

  return {
    id: flow.id,
    cohortId: flow.cohortId,
    approvalSteps: parseTeacherTrainingLeaveSteps(flow.approvalSteps),
    isEnabled: flow.isEnabled,
    createdAt: toDateTimeLabel(flow.createdAt),
  };
};

export const serializeTeacherTrainingLeaveApproval = (
  approval: TeacherTrainingLeaveApprovalRecord,
): TeacherTrainingLeaveApprovalItem => ({
  id: approval.id,
  leaveRequestId: approval.leaveRequestId,
  stepKey: approval.stepKey,
  stepName: approval.stepName,
  stepIndex: approval.stepIndex,
  approverId: approval.approverId,
  approverName: approval.approver?.name ?? "审批人",
  decision: approval.decision,
  comment: approval.comment ?? "",
  reviewedAt: toDateTimeLabel(approval.reviewedAt),
});

export const serializeTeacherTrainingLeaveRequest = (
  request: TeacherTrainingLeaveRequestRecord,
): TeacherTrainingLeaveRequestItem => {
  const uploadedAttachment = decodeTeacherTrainingLeaveAttachmentFile(request.attachment);

  return {
    id: request.id,
    cohortId: request.cohortId,
    participantId: request.participantId,
    participantName: request.participant?.name ?? "参训教师",
    organization: request.participant?.organization ?? "",
    startDate: request.startDate,
    endDate: request.endDate,
    startTime: request.startTime ?? "",
    endTime: request.endTime ?? "",
    sessionLabel: request.sessionLabel ?? "请假",
    reason: request.reason,
    attachment: request.attachment ?? "",
    attachmentLabel: getTeacherTrainingLeaveAttachmentLabel(request.attachment),
    attachmentFile: uploadedAttachment
      ? {
          fileName: uploadedAttachment.fileName,
          fileSize: uploadedAttachment.fileSize,
          mimeType: uploadedAttachment.mimeType,
          downloadUrl: buildTeacherTrainingLeaveAttachmentDownloadUrl(request.id),
        }
      : null,
    status: request.status,
    statusLabel: teacherTrainingLeaveStatusLabels[request.status] ?? request.status,
    currentStepIndex: request.currentStepIndex,
    approvalSteps: parseTeacherTrainingLeaveSteps(request.approvalStepsSnapshot),
    approvals: (request.approvals ?? []).map(serializeTeacherTrainingLeaveApproval),
    submittedAt: toDateTimeLabel(request.submittedAt),
    completedAt: toDateTimeLabel(request.completedAt ?? null),
  };
};

export const serializeTeacherTrainingCohort = (
  cohort: TeacherTrainingCohortRecord,
): TeacherTrainingCohortItem => {
  const attendances = (cohort.attendances ?? []).map(serializeTeacherTrainingAttendance);
  const courseSessions = (cohort.courseSessions ?? []).map(serializeTeacherTrainingCourseSession);
  const leaveRequests = (cohort.leaveRequests ?? []).map(serializeTeacherTrainingLeaveRequest);
  const managers = (cohort.managers ?? []).map((manager) => ({
    id: manager.id,
    cohortId: manager.cohortId,
    userId: manager.userId,
    name: manager.user?.name ?? "工作人员",
    username: manager.user?.username ?? "",
    role: manager.user?.role ?? "",
    title: manager.title || "省培班主任",
    createdAt: toDateTimeLabel(manager.createdAt),
  }));
  const checkInTasks = (cohort.checkInTasks ?? []).map((task) => ({
    id: task.id,
    cohortId: task.cohortId,
    courseSessionId: task.courseSessionId ?? null,
    title: task.title,
    signDate: task.signDate,
    startTime: task.startTime ?? "",
    endTime: task.endTime ?? "",
    locationName: task.locationName ?? "",
    latitude: task.latitude ?? null,
    longitude: task.longitude ?? null,
    radiusMeters: task.radiusMeters,
    isActive: task.isActive,
    createdAt: toDateTimeLabel(task.createdAt),
    createdByName: task.creator?.name ?? "管理员",
    records: (task.records ?? []).map(serializeTeacherTrainingCheckInRecord),
  }));
  const tasks = (cohort.tasks ?? []).map((task) => {
    const releaseMode = normalizeTeacherTrainingTaskReleaseMode(task.releaseMode);
    const taskType = task.taskType || (task.courseSessionId ? "course" : "cohort");
    const availableAt = getTeacherTrainingTaskAvailableAt(task);
    const isReleased = isTeacherTrainingTaskReleased(task);
    const availableAtLabel = formatTeacherTrainingTaskDateTimeLabel(availableAt);

    return {
      id: task.id,
      cohortId: task.cohortId,
      courseSessionId: task.courseSessionId ?? null,
      courseTitle: task.courseSession?.title ?? "",
      courseDate: task.courseSession?.courseDate ?? "",
      courseTimeRange: getTeacherTrainingTaskCourseTimeRange(task.courseSession),
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ?? null,
      taskType,
      taskTypeLabel: teacherTrainingTaskTypeLabels[taskType] ?? "班级任务",
      releaseMode,
      releaseAt: normalizeTeacherTrainingTaskDateTime(task.releaseAt),
      availableAt,
      availableAtLabel,
      isReleased,
      releaseStatusLabel: isReleased
        ? "已开放"
        : availableAtLabel
          ? `${availableAtLabel} 开放`
          : teacherTrainingTaskReleaseModeLabels[releaseMode],
      requireAttachment: task.requireAttachment,
      enableAiReview: Boolean(task.enableAiReview),
      scoringRubric: task.scoringRubric ?? "",
      createdAt: toDateTimeLabel(task.createdAt),
      createdByName: task.creator?.name ?? "管理员",
      submissions: (task.submissions ?? []).map(serializeTeacherTrainingSubmission),
    };
  });
  const participants = (cohort.participants ?? []).map((participant) => {
    const profileExtra = parseTeacherTrainingParticipantExtraInfo(participant.extraInfo);
    const arrivalInfo = profileExtra.arrivalInfo;

    return {
      id: participant.id,
      cohortId: participant.cohortId,
      name: participant.name,
      organization: participant.organization,
      phone: participant.phone ?? "",
      groupName: participant.groupName ?? "",
      isGroupLeader: profileExtra.isGroupLeader,
      title: profileExtra.title,
      email: profileExtra.email,
      gender: profileExtra.gender,
      age: profileExtra.age,
      personnelCategory: profileExtra.personnelCategory,
      subject: profileExtra.subject,
      professionalTitle: profileExtra.professionalTitle,
      city: profileExtra.city,
      arrivalInfo,
      arrivalAt: arrivalInfo.arrivalAt,
      arrivalTransportationLabel: arrivalInfo.transportationLabel,
      accountUserId: participant.accountUserId ?? null,
      accountName: participant.accountUser?.name ?? "",
      accountUsername: participant.accountUser?.username ?? "",
      accountRole: participant.accountUser?.role ?? "",
      extraInfo: participant.extraInfo ?? "",
      extraInfoLines: (participant.extraInfo ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      note: participant.note ?? "",
      attendances: (participant.attendances ?? []).map(serializeTeacherTrainingAttendance),
      checkInRecords: (participant.checkInRecords ?? []).map(serializeTeacherTrainingCheckInRecord),
      leaveRequests: (participant.leaveRequests ?? []).map(serializeTeacherTrainingLeaveRequest),
    };
  });
  const leaveCount = attendances.filter((item) => item.status === "leave").length;
  const absentCount = attendances.filter((item) => item.status === "absent").length;
  const registeredParticipantIds = new Set(
    participants.flatMap((participant) => {
      const attendance = participant.attendances.find((item) => item.status === "present" && item.sessionLabel === "报到");
      return attendance ? [attendance.participantId] : [];
    }),
  );
  const submissionCount = tasks.reduce((total, task) => total + task.submissions.length, 0);
  const checkInRecordCount = checkInTasks.reduce((total, task) => total + task.records.length, 0);

  return {
    id: cohort.id,
    title: cohort.title,
    location: cohort.location ?? "",
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    description: cohort.description ?? "",
    createdAt: toDateTimeLabel(cohort.createdAt),
    createdByName: cohort.creator?.name ?? "管理员",
    courseSessions,
    participants,
    attendances,
    checkInTasks,
    leaveFlow: serializeTeacherTrainingLeaveFlow(cohort.leaveFlow),
    leaveRequests,
    managers,
    tasks,
    stats: {
      participantCount: participants.length,
      presentCount: registeredParticipantIds.size,
      leaveCount,
      absentCount,
      courseCount: courseSessions.length,
      checkInTaskCount: checkInTasks.length,
      checkInRecordCount,
      leaveRequestCount: leaveRequests.length,
      managerCount: managers.length,
      taskCount: tasks.length,
      submissionCount,
    },
  };
};

const csvEscape = (value: unknown) => `"${`${value ?? ""}`.replace(/"/g, '""')}"`;

const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvEscape).join(",")).join("\n");

const xmlEscape = (value: unknown) =>
  `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const wordRun = (value: string, options?: { bold?: boolean; color?: string }) => {
  const runProperties = [
    options?.bold ? "<w:b/>" : "",
    options?.color ? `<w:color w:val="${options.color}"/>` : "",
  ].filter(Boolean);

  return `<w:r>${runProperties.length ? `<w:rPr>${runProperties.join("")}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`;
};

const wordTextRuns = (value: unknown, options?: { bold?: boolean; color?: string }) => {
  const lines = `${value ?? ""}`.split(/\r?\n/);
  if (lines.length === 0 || lines.every((line) => !line.trim())) {
    return wordRun(" ", options);
  }

  return lines
    .map((line, index) => `${index > 0 ? "<w:r><w:br/></w:r>" : ""}${wordRun(line || " ", options)}`)
    .join("");
};

const wordParagraph = (
  value: unknown,
  options?: {
    style?: string;
    align?: "center" | "left";
    bold?: boolean;
    color?: string;
    spacingAfter?: number;
    keepNext?: boolean;
  },
) => {
  const paragraphProperties = [
    options?.style ? `<w:pStyle w:val="${options.style}"/>` : "",
    options?.align ? `<w:jc w:val="${options.align}"/>` : "",
    typeof options?.spacingAfter === "number" ? `<w:spacing w:after="${options.spacingAfter}"/>` : "",
    options?.keepNext ? "<w:keepNext/>" : "",
  ].filter(Boolean);

  return `<w:p>${paragraphProperties.length ? `<w:pPr>${paragraphProperties.join("")}</w:pPr>` : ""}${wordTextRuns(value, {
    bold: options?.bold,
    color: options?.color,
  })}</w:p>`;
};

const wordTableCell = ({
  content,
  width,
  fill,
}: {
  content: string;
  width: number;
  fill?: string;
}) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/>${
  fill ? `<w:shd w:fill="${fill}"/>` : ""
}<w:tcMar><w:top w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`;

const wordTable = (rows: Array<Array<{ content: string; width: number; fill?: string }>>) => {
  const grid = rows[0]?.map((cell) => `<w:gridCol w:w="${cell.width}"/>`).join("") ?? "";
  const rowXml = rows
    .map((row) => `<w:tr>${row.map((cell) => wordTableCell(cell)).join("")}</w:tr>`)
    .join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="9506" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders><w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`;
};

const wordKeyValueRow = (label: string, value: unknown) => [
  {
    width: 1900,
    fill: "F1F5F9",
    content: wordParagraph(label, { style: "TableLabel", bold: true, spacingAfter: 0 }),
  },
  {
    width: 7606,
    content: wordParagraph(value || " ", { style: "TableText", spacingAfter: 0 }),
  },
];

const buildTeacherTrainingSubmissionTaskBlock = (
  task: TeacherTrainingTaskItem,
  participant: TeacherTrainingParticipantItem,
  index: number,
) => {
  const submission = task.submissions.find((item) => item.participantId === participant.id);
  const rows = [
    wordKeyValueRow("任务名称", task.title),
    wordKeyValueRow("任务类型", task.taskTypeLabel),
    wordKeyValueRow("关联课程", task.courseTitle ? `${task.courseDate} ${task.courseTimeRange} ${task.courseTitle}`.trim() : "无"),
    wordKeyValueRow("开放状态", task.releaseStatusLabel),
    wordKeyValueRow("任务说明", task.description || "无"),
    wordKeyValueRow("截止日期", task.dueDate || "无截止日期"),
    wordKeyValueRow("提交状态", submission ? "已提交" : "未提交"),
    wordKeyValueRow("提交时间", submission?.submittedAt || "未提交"),
    wordKeyValueRow("汇报内容", submission?.content || "未提交汇报"),
    wordKeyValueRow("附件", submission?.attachmentLabel || (task.requireAttachment ? "需补充附件" : "无")),
    wordKeyValueRow("AI初评", submission?.aiScore === null || submission?.aiScore === undefined ? "未评分" : `${submission.aiScore} 分`),
    wordKeyValueRow("人工终评", submission?.finalScore === null || submission?.finalScore === undefined ? "未确认" : `${submission.finalScore} 分`),
    wordKeyValueRow("人工评语", submission?.finalComment || "无"),
  ];

  return `${wordParagraph(`${index + 1}. ${task.title}`, {
    style: "Heading1",
    keepNext: true,
    spacingAfter: 120,
  })}${wordTable(rows)}${wordParagraph("", { spacingAfter: 180 })}`;
};

const buildTeacherTrainingSubmissionDocumentXml = ({
  cohort,
  participant,
}: {
  cohort: TeacherTrainingCohortItem;
  participant: TeacherTrainingParticipantItem;
}) => {
  const metaRows = [
    wordKeyValueRow("培训班次", cohort.title),
    wordKeyValueRow("参训教师", participant.name),
    wordKeyValueRow("所在单位", participant.organization || "未填写"),
    wordKeyValueRow("分组", participant.groupName || "未分组"),
    wordKeyValueRow("职务", participant.title || "未填写"),
    wordKeyValueRow("联系方式", [participant.phone, participant.email].filter(Boolean).join(" / ") || "未填写"),
    wordKeyValueRow("导出时间", toDateTimeLabel(new Date())),
  ];
  const taskBlocks = cohort.tasks.length
    ? cohort.tasks.map((task, index) => buildTeacherTrainingSubmissionTaskBlock(task, participant, index)).join("")
    : wordParagraph("暂无任务汇报要求。", { style: "BodyText" });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${wordParagraph("省培任务汇报", { style: "Title", align: "center", spacingAfter: 120 })}
    ${wordParagraph(cohort.title, { style: "Subtitle", align: "center", spacingAfter: 360 })}
    ${wordParagraph("基本信息", { style: "Heading1", keepNext: true, spacingAfter: 120 })}
    ${wordTable(metaRows)}
    ${wordParagraph("", { spacingAfter: 240 })}
    ${wordParagraph("汇报明细", { style: "Heading1", keepNext: true, spacingAfter: 120 })}
    ${taskBlocks}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="312"/>
    </w:sectPr>
  </w:body>
</w:document>`;
};

const teacherTrainingSubmissionStylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="111827"/></w:rPr>
    </w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="42"/><w:szCs w:val="42"/><w:color w:val="111827"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="475569"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="120"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="0F172A"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableLabel"><w:name w:val="Table Label"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="334155"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="330" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="111827"/></w:rPr></w:style>
</w:styles>`;

export const buildTeacherTrainingSubmissionWordDocument = ({
  cohort,
  participant,
}: {
  cohort: TeacherTrainingCohortItem;
  participant: TeacherTrainingParticipantItem;
}) => {
  const createdAt = new Date().toISOString();

  return createZipArchive([
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      path: "word/_rels/document.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      path: "word/document.xml",
      content: buildTeacherTrainingSubmissionDocumentXml({ cohort, participant }),
    },
    {
      path: "word/styles.xml",
      content: teacherTrainingSubmissionStylesXml,
    },
    {
      path: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(participant.name)}省培任务汇报</dc:title>
  <dc:creator>省培管理平台</dc:creator>
  <cp:lastModifiedBy>省培管理平台</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`,
    },
    {
      path: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>省培管理平台</Application>
</Properties>`,
    },
  ]);
};

export const buildTeacherTrainingCsv = ({
  cohort,
  type,
}: {
  cohort: TeacherTrainingCohortItem;
  type: "participants" | "attendance" | "checkIns" | "leaves" | "submissions" | "arrivals";
}) => {
  const now = new Date();
  const isLeaveActive = (request: TeacherTrainingLeaveRequestItem) => {
    if (request.status !== "approved") return false;
    const start = new Date(`${request.startDate}T${request.startTime || "00:00"}:00`);
    const end = new Date(`${request.endDate}T${request.endTime || "23:59"}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return start.getTime() <= now.getTime() && now.getTime() <= end.getTime();
  };

  if (type === "arrivals") {
    return toCsv([
      [
        "班次",
        "姓名",
        "单位",
        "手机号",
        "性别",
        "年龄",
        "人员类别",
        "学科",
        "职称",
        "所属市",
        "分组",
        "预计到达时间",
        "交通方式",
        "车次/航班/车牌",
        "出发地",
        "账号状态",
      ],
      ...cohort.participants.map((participant) => [
        cohort.title,
        participant.name,
        participant.organization,
        participant.phone,
        participant.gender,
        participant.age,
        participant.personnelCategory,
        participant.subject,
        participant.professionalTitle,
        participant.city,
        participant.groupName,
        formatTeacherTrainingArrivalAt(participant.arrivalInfo.arrivalAt),
        participant.arrivalInfo.transportationLabel,
        participant.arrivalInfo.vehicleNo,
        participant.arrivalInfo.departure,
        participant.accountUserId ? `已分配账号：${participant.accountUsername || participant.accountName}` : "未分配账号",
      ]),
    ]);
  }

  if (type === "attendance") {
    return toCsv([
      [
        "班次",
        "姓名",
        "单位",
        "分组",
        "性别",
        "年龄",
        "人员类别",
        "学科",
        "职称",
        "所属市",
        "预计到达时间",
        "交通方式",
        "报到状态",
        "状态登记时间",
        "酒店房号",
        "材料齐全",
        "工作人员",
        "报到备注",
      ],
      ...cohort.participants.map((participant) => {
        const attendance =
          participant.attendances.find(
            (item) => (item.status === "present" || item.status === "online") && item.sessionLabel === "报到",
          ) ??
          cohort.attendances.find(
            (item) =>
              item.participantId === participant.id &&
              (item.status === "present" || item.status === "online") &&
              item.sessionLabel === "报到",
          );
        const activeLeave = participant.leaveRequests.find(isLeaveActive);
        return [
          cohort.title,
          participant.name,
          participant.organization,
          participant.groupName,
          participant.gender,
          participant.age,
          participant.personnelCategory,
          participant.subject,
          participant.professionalTitle,
          participant.city,
          formatTeacherTrainingArrivalAt(participant.arrivalInfo.arrivalAt),
          participant.arrivalInfo.transportationLabel,
          attendance ? attendance.statusLabel : activeLeave ? "请假中" : teacherTrainingAttendancePendingLabel,
          attendance?.markedAt ?? "",
          attendance?.roomNumber ?? "",
          attendance?.materialsCompleteLabel ?? "未确认",
          attendance?.markedByName ?? "",
          attendance?.registrationNote ?? "",
        ];
      }),
    ]);
  }

  if (type === "leaves") {
    return toCsv([
      [
        "班次",
        "姓名",
        "单位",
        "请假类型",
        "请假开始",
        "请假结束",
        "请假原因",
        "附件",
        "审批状态",
        "提交时间",
        "完成时间",
        "审批记录",
      ],
      ...cohort.leaveRequests.map((request) => [
        cohort.title,
        request.participantName,
        request.organization,
        request.sessionLabel,
        [request.startDate, request.startTime].filter(Boolean).join(" "),
        [request.endDate, request.endTime].filter(Boolean).join(" "),
        request.reason,
        request.attachmentLabel,
        request.statusLabel,
        request.submittedAt,
        request.completedAt,
        request.approvals.length
          ? request.approvals
              .map((approval) =>
                `${approval.stepName || `第${approval.stepIndex + 1}步`}：${approval.approverName} ${
                  approval.decision === "approve" ? "同意" : approval.decision === "reject" ? "驳回" : approval.decision
                }${
                  approval.comment ? `（${approval.comment}）` : ""
                } ${approval.reviewedAt}`,
              )
              .join("；")
          : "暂无审批记录",
      ]),
    ]);
  }

  if (type === "submissions") {
    return toCsv([
      [
        "班次",
        "任务类型",
        "关联课程",
        "任务",
        "开放状态",
        "姓名",
        "单位",
        "分组",
        "提交状态",
        "提交时间",
        "汇报内容",
        "附件备注",
        "AI初评分",
        "AI初评意见",
        "人工终评分",
        "人工评语",
        "终评确认人",
        "终评确认时间",
      ],
      ...cohort.tasks.flatMap((task) =>
        task.submissions.map((submission) => {
          const participant = cohort.participants.find((item) => item.id === submission.participantId);
          return [
            cohort.title,
            task.taskTypeLabel,
            task.courseTitle ? `${task.courseDate} ${task.courseTimeRange} ${task.courseTitle}`.trim() : "",
            task.title,
            task.releaseStatusLabel,
            participant?.name ?? submission.participantName,
            participant?.organization ?? "",
            participant?.groupName ?? "",
            submission.status,
            submission.submittedAt,
            submission.content,
            submission.attachmentLabel,
            submission.aiScore ?? "",
            submission.aiComment,
            submission.finalScore ?? "",
            submission.finalComment,
            submission.finalReviewedByName,
            submission.finalReviewedAt,
          ];
        }),
      ),
    ]);
  }

  if (type === "checkIns") {
    return toCsv([
      [
        "班次",
        "签到任务",
        "日期",
        "时间",
        "地点",
        "姓名",
        "登录账号",
        "单位",
        "分组",
        "性别",
        "年龄",
        "人员类别",
        "学科",
        "职称",
        "所属市",
        "签到状态",
        "签到时间",
        "距离米",
        "定位精度米",
        "备注",
      ],
      ...cohort.checkInTasks.flatMap((task) =>
        cohort.participants.map((participant) => {
          const record = task.records.find((item) => item.participantId === participant.id);
          return [
            cohort.title,
            task.title,
            task.signDate,
            [task.startTime, task.endTime].filter(Boolean).join("-"),
            task.locationName,
            participant.name,
            participant.accountUsername,
            participant.organization,
            participant.groupName,
            participant.gender,
            participant.age,
            participant.personnelCategory,
            participant.subject,
            participant.professionalTitle,
            participant.city,
            record ? getTeacherTrainingCheckInRecordStatusLabel(record.status) : "未签到",
            record?.signedAt ?? "",
            record?.distanceMeters ?? "",
            record?.accuracy ?? "",
            record?.note ?? "",
          ];
        }),
      ),
    ]);
  }

  return toCsv([
    [
      "班次",
      "姓名",
      "单位",
      "手机号",
      "性别",
      "年龄",
      "人员类别",
      "学科",
      "职称",
      "所属市",
      "分组",
      "账号状态",
      "预计到达时间",
      "交通方式",
      "车次/航班/车牌",
      "出发地",
      "预录扩展信息",
      "备注",
    ],
    ...cohort.participants.map((participant) => [
      cohort.title,
      participant.name,
      participant.organization,
      participant.phone,
      participant.gender,
      participant.age,
      participant.personnelCategory,
      participant.subject,
      participant.professionalTitle,
      participant.city,
      participant.groupName,
      participant.accountUserId ? `已分配账号：${participant.accountUsername || participant.accountName}` : "未分配账号",
      formatTeacherTrainingArrivalAt(participant.arrivalInfo.arrivalAt),
      participant.arrivalInfo.transportationLabel,
      participant.arrivalInfo.vehicleNo,
      participant.arrivalInfo.departure,
      participant.extraInfo,
      participant.note,
    ]),
  ]);
};
