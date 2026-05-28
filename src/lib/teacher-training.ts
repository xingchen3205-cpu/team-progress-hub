export type TeacherTrainingAttendanceStatus = "present" | "leave" | "absent";

export const teacherTrainingAttendanceLabels: Record<TeacherTrainingAttendanceStatus, string> = {
  present: "已报到",
  leave: "请假",
  absent: "缺勤",
};

export type TeacherTrainingAttendanceItem = {
  id: string;
  participantId: string;
  sessionDate: string;
  sessionLabel: string;
  status: TeacherTrainingAttendanceStatus;
  statusLabel: string;
  note: string;
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
  status: string;
  submittedAt: string;
  submittedByName: string;
};

export type TeacherTrainingTaskItem = {
  id: string;
  cohortId: string;
  title: string;
  description: string;
  dueDate: string | null;
  requireAttachment: boolean;
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
  sessionLabel: string;
  reason: string;
  status: string;
  statusLabel: string;
  currentStepIndex: number;
  approvalSteps: TeacherTrainingLeaveFlowStep[];
  approvals: TeacherTrainingLeaveApprovalItem[];
  submittedAt: string;
  completedAt: string;
};

export type TeacherTrainingParticipantItem = {
  id: string;
  cohortId: string;
  name: string;
  organization: string;
  phone: string;
  groupName: string;
  accountUserId: string | null;
  accountName: string;
  accountUsername: string;
  extraInfo: string;
  extraInfoLines: string[];
  note: string;
  attendances: TeacherTrainingAttendanceItem[];
  checkInRecords: TeacherTrainingCheckInRecordItem[];
  leaveRequests: TeacherTrainingLeaveRequestItem[];
};

export type TeacherTrainingCohortItem = {
  id: string;
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
  if (value === "leave" || value === "absent") {
    return value;
  }

  return "present";
};

export const teacherTrainingLeaveStatusLabels: Record<string, string> = {
  pending: "审批中",
  approved: "已批准",
  rejected: "已驳回",
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
    "请首次登录后及时完善个人信息。",
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
    accountUser?: { name: string; username?: string | null } | null;
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
  approver?: { name: string } | null;
};

type TeacherTrainingLeaveRequestRecord = {
  id: string;
  cohortId: string;
  participantId: string;
  startDate: string;
  endDate: string;
  sessionLabel?: string | null;
  reason: string;
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
  title: string;
  description: string;
  dueDate?: string | null;
  requireAttachment: boolean;
  createdAt: Date;
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
  submittedAt: Date;
  participant?: { name: string } | null;
  submittedBy?: { name: string } | null;
};

export const serializeTeacherTrainingAttendance = (
  attendance: TeacherTrainingAttendanceRecord,
): TeacherTrainingAttendanceItem => {
  const status = normalizeAttendanceStatus(attendance.status);

  return {
    id: attendance.id,
    participantId: attendance.participantId,
    sessionDate: attendance.sessionDate,
    sessionLabel: attendance.sessionLabel,
    status,
    statusLabel: teacherTrainingAttendanceLabels[status],
    note: attendance.note ?? "",
    markedAt: toDateTimeLabel(attendance.markedAt),
    markedByName: attendance.markedBy?.name ?? "工作人员",
  };
};

export const serializeTeacherTrainingSubmission = (
  submission: TeacherTrainingSubmissionRecord,
): TeacherTrainingSubmissionItem => ({
  id: submission.id,
  taskId: submission.taskId,
  participantId: submission.participantId,
  participantName: submission.participant?.name ?? "参训教师",
  content: submission.content,
  attachment: submission.attachment ?? "",
  status: submission.status,
  submittedAt: toDateTimeLabel(submission.submittedAt),
  submittedByName: submission.submittedBy?.name ?? "工作人员",
});

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
): TeacherTrainingLeaveRequestItem => ({
  id: request.id,
  cohortId: request.cohortId,
  participantId: request.participantId,
  participantName: request.participant?.name ?? "参训教师",
  organization: request.participant?.organization ?? "",
  startDate: request.startDate,
  endDate: request.endDate,
  sessionLabel: request.sessionLabel ?? "请假",
  reason: request.reason,
  status: request.status,
  statusLabel: teacherTrainingLeaveStatusLabels[request.status] ?? request.status,
  currentStepIndex: request.currentStepIndex,
  approvalSteps: parseTeacherTrainingLeaveSteps(request.approvalStepsSnapshot),
  approvals: (request.approvals ?? []).map(serializeTeacherTrainingLeaveApproval),
  submittedAt: toDateTimeLabel(request.submittedAt),
  completedAt: toDateTimeLabel(request.completedAt ?? null),
});

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
    title: manager.title || "班主任",
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
  const tasks = (cohort.tasks ?? []).map((task) => ({
    id: task.id,
    cohortId: task.cohortId,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate ?? null,
    requireAttachment: task.requireAttachment,
    createdAt: toDateTimeLabel(task.createdAt),
    createdByName: task.creator?.name ?? "管理员",
    submissions: (task.submissions ?? []).map(serializeTeacherTrainingSubmission),
  }));
  const participants = (cohort.participants ?? []).map((participant) => ({
    id: participant.id,
    cohortId: participant.cohortId,
    name: participant.name,
    organization: participant.organization,
    phone: participant.phone ?? "",
    groupName: participant.groupName ?? "",
    accountUserId: participant.accountUserId ?? null,
    accountName: participant.accountUser?.name ?? "",
    accountUsername: participant.accountUser?.username ?? "",
    extraInfo: participant.extraInfo ?? "",
    extraInfoLines: (participant.extraInfo ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    note: participant.note ?? "",
    attendances: (participant.attendances ?? []).map(serializeTeacherTrainingAttendance),
    checkInRecords: (participant.checkInRecords ?? []).map(serializeTeacherTrainingCheckInRecord),
    leaveRequests: (participant.leaveRequests ?? []).map(serializeTeacherTrainingLeaveRequest),
  }));
  const presentCount = attendances.filter((item) => item.status === "present").length;
  const leaveCount = attendances.filter((item) => item.status === "leave").length;
  const absentCount = attendances.filter((item) => item.status === "absent").length;
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
      presentCount,
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

export const buildTeacherTrainingCsv = ({
  cohort,
  type,
}: {
  cohort: TeacherTrainingCohortItem;
  type: "participants" | "attendance" | "checkIns" | "submissions";
}) => {
  if (type === "attendance") {
    return toCsv([
      ["班次", "姓名", "单位", "分组", "日期", "场次", "状态", "工作人员", "记录时间", "备注"],
      ...cohort.attendances.map((attendance) => {
        const participant = cohort.participants.find((item) => item.id === attendance.participantId);
        return [
          cohort.title,
          participant?.name ?? "",
          participant?.organization ?? "",
          participant?.groupName ?? "",
          attendance.sessionDate,
          attendance.sessionLabel,
          attendance.statusLabel,
          attendance.markedByName,
          attendance.markedAt,
          attendance.note,
        ];
      }),
    ]);
  }

  if (type === "submissions") {
    return toCsv([
      ["班次", "任务", "姓名", "单位", "分组", "提交状态", "提交时间", "汇报内容", "附件备注"],
      ...cohort.tasks.flatMap((task) =>
        task.submissions.map((submission) => {
          const participant = cohort.participants.find((item) => item.id === submission.participantId);
          return [
            cohort.title,
            task.title,
            participant?.name ?? submission.participantName,
            participant?.organization ?? "",
            participant?.groupName ?? "",
            submission.status,
            submission.submittedAt,
            submission.content,
            submission.attachment,
          ];
        }),
      ),
    ]);
  }

  if (type === "checkIns") {
    return toCsv([
      ["班次", "签到任务", "日期", "时间", "地点", "姓名", "单位", "分组", "签到状态", "签到时间", "距离米", "定位精度米", "备注"],
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
            participant.organization,
            participant.groupName,
            record ? "已签到" : "未签到",
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
    ["班次", "姓名", "单位", "手机号", "分组", "账号状态", "预录扩展信息", "备注"],
    ...cohort.participants.map((participant) => [
      cohort.title,
      participant.name,
      participant.organization,
      participant.phone,
      participant.groupName,
      participant.accountUserId ? `已分配账号：${participant.accountUsername || participant.accountName}` : "未分配账号",
      participant.extraInfo,
      participant.note,
    ]),
  ]);
};
