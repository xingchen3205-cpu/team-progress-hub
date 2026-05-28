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
  note: string;
  attendances: TeacherTrainingAttendanceItem[];
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
  tasks: TeacherTrainingTaskItem[];
  stats: {
    participantCount: number;
    presentCount: number;
    leaveCount: number;
    absentCount: number;
    courseCount: number;
    taskCount: number;
    submissionCount: number;
  };
};

export type TeacherTrainingPayload = {
  cohorts: TeacherTrainingCohortItem[];
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
    note?: string | null;
    accountUser?: { name: string; username?: string | null } | null;
    attendances?: Array<TeacherTrainingAttendanceRecord>;
    submissions?: Array<TeacherTrainingSubmissionRecord>;
  }>;
  courseSessions?: Array<TeacherTrainingCourseSessionRecord>;
  attendances?: Array<TeacherTrainingAttendanceRecord>;
  tasks?: Array<TeacherTrainingTaskRecord>;
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

export const serializeTeacherTrainingCohort = (
  cohort: TeacherTrainingCohortRecord,
): TeacherTrainingCohortItem => {
  const attendances = (cohort.attendances ?? []).map(serializeTeacherTrainingAttendance);
  const courseSessions = (cohort.courseSessions ?? []).map(serializeTeacherTrainingCourseSession);
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
    note: participant.note ?? "",
    attendances: (participant.attendances ?? []).map(serializeTeacherTrainingAttendance),
  }));
  const presentCount = attendances.filter((item) => item.status === "present").length;
  const leaveCount = attendances.filter((item) => item.status === "leave").length;
  const absentCount = attendances.filter((item) => item.status === "absent").length;
  const submissionCount = tasks.reduce((total, task) => total + task.submissions.length, 0);

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
    tasks,
    stats: {
      participantCount: participants.length,
      presentCount,
      leaveCount,
      absentCount,
      courseCount: courseSessions.length,
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
  type: "participants" | "attendance" | "submissions";
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

  return toCsv([
    ["班次", "姓名", "单位", "手机号", "分组", "账号状态", "备注"],
    ...cohort.participants.map((participant) => [
      cohort.title,
      participant.name,
      participant.organization,
      participant.phone,
      participant.groupName,
      participant.accountUserId ? `已分配账号：${participant.accountUsername || participant.accountName}` : "未分配账号",
      participant.note,
    ]),
  ]);
};
