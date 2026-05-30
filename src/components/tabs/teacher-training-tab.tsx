"use client";

import { useEffect, useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";

type AttendanceStatus = Workspace.TeacherTrainingAttendanceStatus;
type CheckInWindowState = Workspace.TeacherTrainingCheckInWindowState;

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

const teacherTrainingActionHints: Partial<Record<Workspace.TeacherTrainingSectionKey, { title: string; steps: string[] }>> = {
  overview: {
    title: "省培操作提示",
    steps: ["先确认当前班次", "点左上角菜单切换模块", "重要操作会有按钮提示"],
  },
  cohorts: {
    title: "班次管理提示",
    steps: ["先建班次和地点", "再设置班主任", "班主任可维护本班省培事务"],
  },
  participants: {
    title: "参训教师提示",
    steps: ["先录入教师信息", "可绑定已有账号", "复制账号消息后发给教师"],
  },
  courses: {
    title: "课程安排提示",
    steps: ["查看课程日期", "确认地点和授课教师", "手机端按时间顺序查看"],
  },
  checkins: {
    title: "手机端定位签到",
    steps: ["到达课程地点", "允许浏览器定位", "点击定位签到并等待结果"],
  },
  attendance: {
    title: "报到登记提示",
    steps: ["选择日期和场次", "逐人标记报到状态", "导出时会带出登记记录"],
  },
  tasks: {
    title: "任务汇报提示",
    steps: ["教师选择任务", "填写汇报内容", "管理员统一导出汇总"],
  },
  leave: {
    title: "请假审批提示",
    steps: ["教师提交请假", "按流程审批", "可导出 PDF 请假单"],
  },
  profile: {
    title: "个人信息提示",
    steps: ["首次登录先核对资料", "补充单位和手机号", "保存后同步到省培档案"],
  },
  exports: {
    title: "导出归档提示",
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
    return "管理员尚未配置请假审批流程，请联系班主任或管理员";
  }

  if (!reason.trim()) {
    return "请填写请假原因后再提交";
  }

  return "";
};

const getTeacherTrainingSubmissionDisabledReason = (hasTask: boolean, hasParticipant: boolean, content: string, canManage = false) => {
  const participantReason = getTeacherTrainingParticipantDisabledReason(hasParticipant, canManage);
  if (participantReason) return participantReason;

  if (!hasTask) {
    return "暂无省培任务，请等待管理员发布任务";
  }

  if (!content.trim()) {
    return "请填写汇报内容后再保存";
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
    isSaving,
    createTeacherTrainingCohort,
    addTeacherTrainingParticipant,
    createTeacherTrainingCourseSession,
    createTeacherTrainingCheckInTask,
    signTeacherTrainingCheckIn,
    markTeacherTrainingAttendance,
    generateTeacherTrainingAccountMessage,
    assignTeacherTrainingCohortManager,
    removeTeacherTrainingCohortManager,
    updateTeacherTrainingLeaveFlow,
    submitTeacherTrainingLeaveRequest,
    reviewTeacherTrainingLeaveRequest,
    createTeacherTrainingTask,
    saveTeacherTrainingSubmission,
    updateTeacherTrainingProfile,
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
    Plus,
    SectionHeader,
    Send,
    User,
    Users,
    fieldClassName,
    surfaceCardClassName,
    textareaClassName,
  } = Workspace;

  const [selectedCohortId, setSelectedCohortId] = useState("");
  const [cohortDraft, setCohortDraft] = useState<Workspace.TeacherTrainingCohortDraft>(createDefaultCohortDraft);
  const [participantDraft, setParticipantDraft] = useState<Workspace.TeacherTrainingParticipantDraft>({
    cohortId: "",
    name: "",
    organization: "",
    phone: "",
    groupName: "",
    accountUsername: "",
    accountPassword: "",
    extraInfo: "",
    note: "",
  });
  const [managerDraft, setManagerDraft] = useState<Workspace.TeacherTrainingCohortManagerDraft>({
    cohortId: "",
    userId: "",
    title: "班主任",
  });
  const [courseDraft, setCourseDraft] = useState<Workspace.TeacherTrainingCourseSessionDraft>(
    createDefaultCourseSessionDraft,
  );
  const [checkInDraft, setCheckInDraft] = useState<Workspace.TeacherTrainingCheckInTaskDraft>(
    createDefaultCheckInTaskDraft,
  );
  const [locationMessage, setLocationMessage] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [checkInSigningId, setCheckInSigningId] = useState("");
  const [checkInClock, setCheckInClock] = useState(() => Date.now());
  const [leaveFlowSteps, setLeaveFlowSteps] = useState<Workspace.TeacherTrainingLeaveFlowStep[]>([]);
  const [leaveDraft, setLeaveDraft] = useState<Workspace.TeacherTrainingLeaveRequestDraft>({
    participantId: "",
    startDate: getDateInputValue(new Date()),
    endDate: getDateInputValue(new Date()),
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
    note: "",
  });
  const [attendanceDate, setAttendanceDate] = useState(getDateInputValue(new Date()));
  const [attendanceSessionLabel, setAttendanceSessionLabel] = useState("报到");
  const [taskDraft, setTaskDraft] = useState<Workspace.TeacherTrainingTaskDraft>({
    cohortId: "",
    title: "",
    description: "",
    dueDate: "",
    requireAttachment: false,
  });
  const [submissionDraft, setSubmissionDraft] = useState<Workspace.TeacherTrainingSubmissionDraft>({
    taskId: "",
    participantId: "",
    content: "",
    attachment: "",
  });

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
  const selectedTask = selectedCohort?.tasks.find((task) => task.id === submissionDraft.taskId) ?? selectedCohort?.tasks[0] ?? null;
  const selectedParticipant =
    selectedCohort?.participants.find((participant) => participant.id === submissionDraft.participantId) ??
    selectedCohort?.participants[0] ??
    null;
  const hasSelectedParticipant = Boolean(selectedParticipant);
  const courseSessions = selectedCohort?.courseSessions ?? [];
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
          note: selectedParticipant.note,
        }
      : profileDraft;
  const exportBaseUrl = selectedCohort
    ? `/api/teacher-training/export?cohortId=${encodeURIComponent(selectedCohort.id)}`
    : "";
  const canManage = canManageTeacherTraining;
  const canManageGlobal = hasGlobalAdminRole;
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
    },
    {
      label: "单位",
      isComplete: Boolean(effectiveProfileDraft.organization.trim()),
      completeLabel: "单位已填写",
      incompleteLabel: "单位待补充",
    },
    {
      label: "手机号",
      isComplete: Boolean(effectiveProfileDraft.phone.trim()),
      completeLabel: "手机号已填写",
      incompleteLabel: "手机号待补充",
    },
  ];
  const teacherProfileCompletedCount = teacherProfileCompletionItems.filter((item) => item.isComplete).length;
  const teacherProfileCompletionPercent = Math.round(
    (teacherProfileCompletedCount / Math.max(1, teacherProfileCompletionItems.length)) * 100,
  );
  const teacherProfileNeedsAttention =
    !hasSelectedParticipant || teacherProfileCompletedCount < teacherProfileCompletionItems.length;
  const teacherProfileStatusText = teacherProfileNeedsAttention ? "资料待完善" : "资料已完整";
  const leaveDisabledReason = getTeacherTrainingLeaveDisabledReason(
    hasSelectedParticipant,
    selectedCohort?.leaveFlow,
    leaveDraft.reason,
    canManage,
  );
  const profileDisabledReason = getTeacherTrainingParticipantDisabledReason(Boolean(effectiveProfileDraft.participantId));
  const submissionDisabledReason = getTeacherTrainingSubmissionDisabledReason(
    Boolean(selectedTask),
    hasSelectedParticipant,
    submissionDraft.content,
    canManage,
  );
  const defaultLeaveFlowSteps = useMemo<Workspace.TeacherTrainingLeaveFlowStep[]>(
    () =>
      [
        { key: "step-1", name: "第一步审批", approverIds: teacherTrainingApproverOptions.slice(0, 1).map((item) => item.id), requiredCount: 1 },
        { key: "step-2", name: "第二步审批", approverIds: teacherTrainingApproverOptions.slice(1, 2).map((item) => item.id), requiredCount: 1 },
      ].filter((step) => step.approverIds.length > 0),
    [teacherTrainingApproverOptions],
  );
  const pendingLeaveRequests = selectedCohort?.leaveRequests.filter((request) => request.status === "pending") ?? [];
  const teacherLeaveRequests = [...(selectedParticipant?.leaveRequests ?? [])].sort((first, second) =>
    second.submittedAt.localeCompare(first.submittedAt),
  );
  const teacherLatestLeaveRequest = teacherLeaveRequests[0] ?? null;
  const approverNameById = useMemo(
    () => new Map(teacherTrainingApproverOptions.map((option) => [option.id, option.name])),
    [teacherTrainingApproverOptions],
  );
  const activeLeaveFlowSteps = leaveFlowSteps.length
    ? leaveFlowSteps
    : selectedCohort?.leaveFlow?.approvalSteps.length
      ? selectedCohort.leaveFlow.approvalSteps
      : defaultLeaveFlowSteps;

  const getAttendanceForParticipant = (participantId: string) =>
    selectedCohort?.attendances.find(
      (attendance) =>
        attendance.participantId === participantId &&
        attendance.sessionDate === attendanceDate &&
        attendance.sessionLabel === attendanceSessionLabel,
    ) ?? null;

  const submitCohort = async () => {
    await createTeacherTrainingCohort(cohortDraft);
  };

  const submitParticipant = async () => {
    if (!selectedCohort) return;
    await addTeacherTrainingParticipant({
      ...participantDraft,
      cohortId: selectedCohort.id,
    });
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

  const submitTask = async () => {
    if (!selectedCohort) return;
    await createTeacherTrainingTask({
      ...taskDraft,
      cohortId: selectedCohort.id,
    });
  };

  const submitSubmission = async () => {
    await saveTeacherTrainingSubmission({
      ...submissionDraft,
      taskId: selectedTask?.id ?? submissionDraft.taskId,
      participantId: selectedParticipant?.id ?? submissionDraft.participantId,
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
    await updateTeacherTrainingProfile(effectiveProfileDraft);
  };

  const markAttendance = (participantId: string, status: AttendanceStatus) => {
    if (!selectedCohort) return;

    void markTeacherTrainingAttendance({
      cohortId: selectedCohort.id,
      participantId,
      sessionDate: attendanceDate,
      sessionLabel: attendanceSessionLabel,
      status,
    });
  };

  const submitCheckInTask = async () => {
    if (!selectedCohort) return;
    await createTeacherTrainingCheckInTask({
      ...checkInDraft,
      cohortId: selectedCohort.id,
    });
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

    setAccountMessage(messageText);
    await navigator.clipboard?.writeText(messageText).catch(() => undefined);
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
    await reviewTeacherTrainingLeaveRequest({
      leaveRequestId,
      decision,
      comment: leaveReviewComment,
    });
    setLeaveReviewComment("");
  };

  const metricCards: Array<{ label: string; value: number; Icon: typeof Users }> = [
    { label: "参训教师", value: selectedCohort?.stats.participantCount ?? 0, Icon: Users },
    { label: "班主任", value: selectedCohort?.stats.managerCount ?? 0, Icon: User },
    { label: "课程", value: selectedCohort?.stats.courseCount ?? 0, Icon: CalendarDays },
    { label: "已报到", value: selectedCohort?.stats.presentCount ?? 0, Icon: CheckCircle2 },
    { label: "请假", value: selectedCohort?.stats.leaveCount ?? 0, Icon: CalendarDays },
    { label: "缺勤", value: selectedCohort?.stats.absentCount ?? 0, Icon: FileCheck },
    { label: "课程签到", value: selectedCohort?.stats.checkInRecordCount ?? 0, Icon: MapPin },
    { label: "任务", value: selectedCohort?.stats.taskCount ?? 0, Icon: FileText },
    { label: "汇报", value: selectedCohort?.stats.submissionCount ?? 0, Icon: Send },
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
    if (section.globalOnly && !canManageGlobal) return false;
    if (section.managerOnly && !canManage) return false;
    if (section.teacherOnly && canManage) return false;
    return true;
  });
  const effectiveTeacherTrainingSection = visibleTeacherTrainingSections.some(
    (section) => section.key === activeTeacherTrainingSection,
  )
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
  const openTeacherTrainingSection = (key: Workspace.TeacherTrainingSectionKey) => {
    setActiveTeacherTrainingSection(key);

    window.requestAnimationFrame(() => {
      document.getElementById("teacher-training-content")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };
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
            helper: "补全单位和手机号",
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
    setSubmissionDraft((current) => ({
      ...current,
      taskId,
      participantId: selectedParticipant?.id ?? current.participantId,
    }));

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
      helper: hasSelectedParticipant ? "核对单位和手机号" : "联系管理员绑定",
      Icon: User,
      onClick: () => openTeacherTrainingSection("profile"),
    },
  ];
  const ActiveTeacherTrainingIcon = activeTeacherTrainingSectionMeta?.Icon ?? ClipboardCheck;
  const showTeacherTrainingSection = (...keys: Workspace.TeacherTrainingSectionKey[]) =>
    keys.includes(effectiveTeacherTrainingSection);
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
                    直接查看课程、签到、汇报、请假和个人信息。
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
                  <p className="text-sm font-bold text-slate-950">今日待办</p>
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
            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              {metricCards.map(({ label, value, Icon }) => (
                <div key={label} className="depth-subtle rounded-2xl border border-white/70 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">{label}</p>
                    <Icon className="h-4 w-4 text-[#1a6fd4]" />
                  </div>
                  <p className="mt-3 text-2xl font-bold text-slate-950">{value}</p>
                </div>
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
                  <span className="w-fit rounded-full border border-blue-200 bg-white/78 px-3 py-1 text-xs font-bold text-blue-700">
                    {canManage ? "管理端" : "教师端"}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "参训教师", value: selectedCohort?.stats.participantCount ?? 0, helper: "名单与账号" },
                    { label: "课程安排", value: selectedCohort?.stats.courseCount ?? 0, helper: "课程表" },
                    { label: "任务汇报", value: selectedCohort?.stats.submissionCount ?? 0, helper: "已提交" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/75 bg-white/72 p-4 shadow-sm">
                      <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                      <p className="mt-2 text-3xl font-black text-slate-950">{item.value}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.helper}</p>
                    </div>
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
                  {[
                    { label: "课程安排", value: selectedCohort?.stats.courseCount ?? 0, Icon: CalendarDays },
                    { label: "签到记录", value: selectedCohort?.stats.checkInRecordCount ?? 0, Icon: MapPin },
                    { label: "任务汇报", value: selectedCohort?.stats.submissionCount ?? 0, Icon: Send },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                          <item.Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate text-sm font-semibold text-slate-700">{item.label}</span>
                      </span>
                      <span className="text-xl font-black text-slate-950">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <div className={`grid gap-4 ${canManage && showTeacherTrainingSection("cohorts", "participants") ? "xl:grid-cols-[360px_minmax(0,1fr)]" : ""}`}>
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
                    setAccountMessage("");
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

            {canManageGlobal && showTeacherTrainingSection("cohorts") ? (
            <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#1a6fd4]" />
                <p className="text-sm font-semibold text-slate-900">新建省培班次</p>
              </div>
              <div className="mt-3 space-y-3">
                <label className={teacherTrainingFieldShellClassName}>
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
                <div className="grid gap-3 sm:grid-cols-2">
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
                </div>
                <label className={teacherTrainingFieldShellClassName}>
                  <span className={teacherTrainingFieldLabelClassName}>培训说明</span>
                  <textarea
                    className={`${textareaClassName} min-h-20`}
                    {...fieldHint("培训说明")}
                    onChange={(event) => setCohortDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="培训说明"
                    value={cohortDraft.description}
                  />
                </label>
                <ActionButton
                  aria-label="创建新的省培班次"
                  className="w-full"
                  loading={isSaving}
                  onClick={() => void submitCohort()}
                  title="创建新的省培班次"
                  variant="primary"
                >
                  创建班次
                </ActionButton>
              </div>
            </div>
            ) : null}

            {canManageGlobal && showTeacherTrainingSection("participants") ? (
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
                </div>
              </div>
            ) : null}

            {canManageGlobal && selectedCohort && showTeacherTrainingSection("cohorts") ? (
              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[#1a6fd4]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">班主任设置</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">可选择已有大赛账号或省培账号，开通这个班次的省培管理权限。</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>选择班主任账号</span>
                    <select
                      className={fieldClassName}
                      {...fieldHint("选择班主任账号")}
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
                    <span className={teacherTrainingFieldLabelClassName}>班主任职务</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("班主任职务")}
                      onChange={(event) => setManagerDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="职务，例如班主任、会务负责人"
                      value={managerDraft.title}
                    />
                  </label>
                  <ActionButton
                    aria-label="设置当前班次班主任"
                    className="w-full"
                    disabled={!managerDraft.userId}
                    loading={isSaving}
                    onClick={() => void submitManager()}
                    title="设置当前班次班主任"
                    variant="primary"
                  >
                    设置班主任
                  </ActionButton>
                </div>
                <div className="mt-4 space-y-2">
                  {selectedCohort.managers.length === 0 ? (
                    <p className="text-xs text-slate-400">暂未设置班主任。</p>
                  ) : (
                    selectedCohort.managers.map((manager) => (
                      <div key={manager.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{manager.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {manager.title} · {manager.username}
                          </p>
                        </div>
                        <button
                          className="text-xs font-semibold text-rose-500"
                          aria-label={`移除${manager.name}的班主任权限`}
                          disabled={isSaving}
                          onClick={() =>
                            void removeTeacherTrainingCohortManager({
                              cohortId: selectedCohort.id,
                              userId: manager.userId,
                            })
                          }
                          title={`移除${manager.name}的班主任权限`}
                          type="button"
                        >
                          移除
                        </button>
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
                    {canManage ? "工作人员后台勾选" : "我的省培任务"}
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
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className={teacherTrainingFieldShellClassName}>
                        <span className={teacherTrainingFieldLabelClassName}>课程日期</span>
                        <input
                          className={fieldClassName}
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
                      保存课程
                    </ActionButton>
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
                          发布签到任务
                        </ActionButton>
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
                      <div className="mt-3 space-y-3">
                        {selectedCohort.checkInTasks.length === 0 ? (
                          <EmptyState description="发布后会在这里显示签到进度。" icon={MapPin} title="暂无课程签到" />
                        ) : (
                          selectedCohort.checkInTasks.map((task) => {
                            const windowState = Workspace.getTeacherTrainingCheckInWindowState(task, checkInNow);
                            const progress = getCheckInProgress(task);
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
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500"
                                    style={{ width: `${progress.percent}%` }}
                                  />
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span>已签到 {progress.signed} 人</span>
                                  <span className="text-slate-300">/</span>
                                  <span>未签到 {progress.unsigned} 人</span>
                                  <span className="text-slate-300">/</span>
                                  <span>范围 {task.radiusMeters} 米</span>
                                </div>
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
                      {canManageGlobal ? "请假流程设置" : "临时请假"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {canManageGlobal
                        ? "系统管理员统一配置审批步骤、候选审批人和每步通过人数。"
                        : "临时请假会按管理员配置的审批步骤流转，最终批准后自动写入请假签到记录。"}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                    {selectedCohort.leaveRequests.length} 条请假
                  </span>
                </div>

                {canManageGlobal ? (
                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.78fr)]">
                    <div className="space-y-3">
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
                                name: `第${baseSteps.length + 1}步审批`,
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
                        <EmptyState description="先增加审批步骤，再选择审批人和每步通过人数。" icon={FileCheck} title="未配置流程" />
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
                                  onChange={(event) =>
                                    updateLeaveFlowStep(index, { requiredCount: Number(event.target.value) || 1 })
                                  }
                                  placeholder="每步通过人数"
                                  type="number"
                                  value={step.requiredCount}
                                />
                              </label>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {teacherTrainingApproverOptions.length === 0 ? (
                                <span className="text-xs text-slate-400">暂无可选审批人</span>
                              ) : (
                                teacherTrainingApproverOptions.map((approver) => (
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
                                      {...fieldHint(`选择${approver.name}作为${step.name || "当前步骤"}审批人`)}
                                      onChange={() => toggleLeaveApprover(index, approver.id)}
                                      type="checkbox"
                                    />
                                    {approver.name}
                                  </label>
                                ))
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
                        disabled={!selectedCohort || activeLeaveFlowSteps.length === 0}
                        loading={isSaving}
                        onClick={() => void saveLeaveFlow()}
                        title="保存省培请假审批流程"
                        variant="primary"
                      >
                        保存请假流程
                      </ActionButton>
                    </div>

                    <div className="rounded-2xl border border-slate-200/75 bg-white/80 p-5 shadow-sm shadow-blue-100/50">
                      <p className="text-sm font-semibold text-slate-900">请假审批</p>
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
                      <div className="mt-3 space-y-3">
                        {pendingLeaveRequests.length === 0 ? (
                          <EmptyState description="教师提交临时请假后，会进入这里等待审批。" icon={FileCheck} title="暂无待审批请假" />
                        ) : (
                          pendingLeaveRequests.slice(0, 5).map((request) => {
                            const step = request.approvalSteps[request.currentStepIndex];
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
                                        {step?.name ?? "审批中"}
                                      </span>
                                      {step ? (
                                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                                          需 {step.requiredCount} 人通过
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-2 break-words text-xs leading-5 text-slate-500">
                                      审批人：{step?.approverIds.map((id) => approverNameById.get(id) ?? "审批人").join("、") || "未配置"}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                    <a
                                      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 no-underline"
                                      href={`/api/teacher-training/leave-requests/${request.id}/pdf`}
                                      aria-label={`导出${request.participantName}的 PDF 请假单`}
                                      title={`导出${request.participantName}的 PDF 请假单`}
                                    >
                                      导出PDF请假单
                                    </a>
                                    {step?.approverIds.includes(currentUser?.id ?? "") || currentUser?.role === "admin" ? (
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
                              teacherLatestLeaveRequest.approvalSteps.map((step, index) => {
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
                                  <div key={step.key} className="rounded-2xl border border-white/80 bg-white/82 px-3 py-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-950">{step.name}</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                          {step.approverIds
                                            .map((approverId) => approverNameById.get(approverId) ?? "审批人")
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
                              })
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
                      <div className="mt-3 grid gap-2">
                        {teacherLeaveRequests.length ? (
                          teacherLeaveRequests.slice(0, 4).map((request) => (
                            <div key={request.id} className="rounded-lg bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">
                                  {request.startDate} 至 {request.endDate}
                                </p>
                                <div className="flex items-center gap-2">
                                  <a
                                    className="text-xs font-semibold text-blue-700 no-underline"
                                    href={`/api/teacher-training/leave-requests/${request.id}/pdf`}
                                    aria-label={`导出${request.startDate}请假 PDF`}
                                    title={`导出${request.startDate}请假 PDF`}
                                  >
                                    导出PDF请假单
                                  </a>
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
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className={teacherTrainingFieldShellClassName}>
                    <span className={teacherTrainingFieldLabelClassName}>个人姓名</span>
                    <input
                      className={fieldClassName}
                      {...fieldHint("个人姓名")}
                      onChange={(event) => updateProfileDraftField("name", event.target.value)}
                      placeholder="姓名"
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
                      value={effectiveProfileDraft.groupName}
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
                </div>
              </section>
              ) : null}

              {canManage && showTeacherTrainingSection("participants") ? (
              <section className={surfaceCardClassName}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">参训教师名单</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">集中查看省培教师、账号状态和预录扩展信息。</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {selectedCohort.participants.length} 人
                  </span>
                </div>

                <div className="mt-4 grid gap-3">
                  {selectedCohort.participants.length === 0 ? (
                    <EmptyState description="在参训教师模块添加名单后，这里会显示账号和预录信息。" icon={Users} title="名单为空" />
                  ) : (
                    selectedCohort.participants.map((participant) => (
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
                        {canManageGlobal ? (
                          <button
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                            aria-label="复制省培账号通知消息"
                            disabled={isSaving}
                            onClick={() => void copyAccountMessage(participant.id)}
                            title="复制省培账号通知消息"
                            type="button"
                          >
                            <Copy className="h-4 w-4" />
                            一键复制账号消息
                          </button>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
                {accountMessage ? (
                  <textarea
                    className={`${textareaClassName} mt-4 min-h-28`}
                    {...fieldHint("省培账号通知消息")}
                    onChange={(event) => setAccountMessage(event.target.value)}
                    value={accountMessage}
                  />
                ) : null}
              </section>
              ) : null}

              {canManage && showTeacherTrainingSection("attendance") ? (
              <section className={surfaceCardClassName}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">报到登记</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">工作人员在管理员账号里给参训教师打勾。</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[180px_180px]">
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>报到登记日期</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("报到登记日期")}
                        onChange={(event) => setAttendanceDate(event.target.value)}
                        type="date"
                        value={attendanceDate}
                      />
                    </label>
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>报到登记场次</span>
                      <select
                        className={fieldClassName}
                        {...fieldHint("报到登记场次")}
                        onChange={(event) => setAttendanceSessionLabel(event.target.value)}
                        value={attendanceSessionLabel}
                      >
                        <option value="报到">报到</option>
                        <option value="上午课程">上午课程</option>
                        <option value="下午课程">下午课程</option>
                        <option value="晚间研讨">晚间研讨</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/75">
                  {selectedCohort.participants.length === 0 ? (
                    <EmptyState description="在参训教师模块添加名单后，这里会出现报到勾选列表。" icon={Users} title="名单为空" />
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {selectedCohort.participants.map((participant) => {
                        const attendance = getAttendanceForParticipant(participant.id);
                        return (
                          <div key={participant.id} className="grid gap-3 bg-white/72 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-950">{participant.name}</p>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                  {participant.groupName || "未分组"}
                                </span>
                                {attendance ? (
                                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyleMap[attendance.status]}`}>
                                    {attendance.statusLabel}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-slate-500">{participant.organization}</p>
                              {attendance ? (
                                <p className="mt-1 text-xs text-slate-400">
                                  {attendance.markedByName} · {attendance.markedAt}
                                </p>
                              ) : null}
                              {participant.accountUsername ? (
                                <p className="mt-1 text-xs text-slate-400">省培账号：{participant.accountUsername}</p>
                              ) : null}
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
                            <div className="flex flex-wrap gap-2">
                              {canManageGlobal ? (
                                <button
                                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                                  aria-label="复制省培账号通知消息"
                                  disabled={isSaving}
                                  onClick={() => void copyAccountMessage(participant.id)}
                                  title="复制省培账号通知消息"
                                  type="button"
                                >
                                  <Copy className="h-4 w-4" />
                                  一键复制账号消息
                                </button>
                              ) : null}
                              {(["present", "leave", "absent"] as AttendanceStatus[]).map((status) => (
                                <button
                                  key={status}
                                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold transition ${
                                    attendance?.status === status
                                      ? statusStyleMap[status]
                                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                                  }`}
                                  aria-label={`将${participant.name}标记为${Workspace.teacherTrainingAttendanceLabels[status]}`}
                                  disabled={isSaving}
                                  onClick={() => markAttendance(participant.id, status)}
                                  title={`将${participant.name}标记为${Workspace.teacherTrainingAttendanceLabels[status]}`}
                                  type="button"
                                >
                                  {Workspace.teacherTrainingAttendanceLabels[status]}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {accountMessage ? (
                  <textarea
                    className={`${textareaClassName} mt-4 min-h-28`}
                    {...fieldHint("省培账号通知消息")}
                    onChange={(event) => setAccountMessage(event.target.value)}
                    value={accountMessage}
                  />
                ) : null}
              </section>
              ) : null}

              {showTeacherTrainingSection("tasks") ? (
              <section className="grid gap-4 xl:grid-cols-2">
                {canManage ? (
                <div className={surfaceCardClassName}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#1a6fd4]" />
                    <p className="text-sm font-semibold text-slate-900">发布任务</p>
                  </div>
                  <div className="mt-4 space-y-3">
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
                      <span className={teacherTrainingFieldLabelClassName}>省培任务说明</span>
                      <textarea
                        className={textareaClassName}
                        {...fieldHint("省培任务说明")}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))}
                        placeholder="任务说明"
                        value={taskDraft.description}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
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
                    </div>
                    <ActionButton
                      aria-label="发布省培任务汇报要求"
                      loading={isSaving}
                      onClick={() => void submitTask()}
                      title="发布省培任务汇报要求"
                      variant="primary"
                    >
                      发布任务
                    </ActionButton>
                  </div>
                </div>
                ) : null}

                <div className={surfaceCardClassName} id="teacher-training-submission-form">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-[#1a6fd4]" />
                    <p className="text-sm font-semibold text-slate-900">登记汇报</p>
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
                        onChange={(event) => setSubmissionDraft((current) => ({ ...current, taskId: event.target.value }))}
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
                          onChange={(event) => setSubmissionDraft((current) => ({ ...current, participantId: event.target.value }))}
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
                    <label className={teacherTrainingFieldShellClassName}>
                      <span className={teacherTrainingFieldLabelClassName}>附件说明或链接</span>
                      <input
                        className={fieldClassName}
                        {...fieldHint("省培任务汇报附件说明或链接")}
                        onChange={(event) => setSubmissionDraft((current) => ({ ...current, attachment: event.target.value }))}
                        placeholder="附件说明或链接"
                        value={submissionDraft.attachment}
                      />
                    </label>
                    <ActionButton
                      aria-label="保存省培任务汇报"
                      disabled={Boolean(submissionDisabledReason)}
                      loading={isSaving}
                      onClick={() => void submitSubmission()}
                      title={submissionDisabledReason || "保存省培任务汇报"}
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
                <div className="mt-4 grid gap-3">
                  {selectedCohort.tasks.length === 0 ? (
                    <EmptyState
                      description={canManage ? "发布任务后，参训教师汇报会汇总在这里。" : "管理员发布任务后，这里会显示我的任务和提交记录。"}
                      icon={FileText}
                      title="暂无任务"
                    />
                  ) : (
                    selectedCohort.tasks.map((task) => {
                      const teacherSubmission = task.submissions.find(
                        (submission) => submission.participantId === selectedParticipant?.id,
                      );

                      return (
                      <div key={task.id} className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-950">{task.title}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{task.description}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
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
                        {task.submissions.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {task.submissions.slice(0, 3).map((submission) => (
                              <div key={submission.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                <span className="font-semibold text-slate-900">{submission.participantName}</span>
                                <span className="mx-2 text-slate-300">/</span>
                                <span>{submission.submittedAt}</span>
                              </div>
                            ))}
                          </div>
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
                        导出名单、签到、课程签到和任务汇报，按当前班次生成归档材料。
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                      {selectedCohort.title}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: "导出名单", type: "participants", description: "参训教师、单位、账号和预录信息" },
                      { label: "导出签到", type: "attendance", description: "报到、请假和缺勤人工登记" },
                      { label: "导出课程签到", type: "checkIns", description: "定位签到任务和签到明细" },
                      { label: "导出汇报", type: "submissions", description: "任务完成情况和汇报内容" },
                    ].map((item) => (
                      <a
                        key={item.type}
                        className="group rounded-2xl border border-slate-200/75 bg-white/76 p-4 no-underline shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/10"
                        aria-label={`${item.label}：${item.description}`}
                        href={`${exportBaseUrl}&type=${item.type}`}
                        title={`${item.label}：${item.description}`}
                      >
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
                          <Download className="h-4 w-4" />
                        </span>
                        <span className="mt-4 block text-sm font-bold text-slate-950">{item.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                      </a>
                    ))}
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
