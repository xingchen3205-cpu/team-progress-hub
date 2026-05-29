"use client";

import { useEffect, useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";

type AttendanceStatus = Workspace.TeacherTrainingAttendanceStatus;
type CheckInWindowState = Workspace.TeacherTrainingCheckInWindowState;
type TeacherTrainingSectionKey =
  | "overview"
  | "cohorts"
  | "participants"
  | "courses"
  | "checkins"
  | "attendance"
  | "tasks"
  | "leave"
  | "profile"
  | "exports";

const getDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export default function TeacherTrainingTab() {
  const {
    currentUser,
    teacherTrainingCohorts,
    teacherTrainingApproverOptions,
    teacherTrainingManagerOptions,
    hasGlobalAdminRole,
    canManageTeacherTraining,
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
  const [activeTeacherTrainingSection, setActiveTeacherTrainingSection] =
    useState<TeacherTrainingSectionKey>("overview");

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
  const courseSessions = selectedCohort?.courseSessions ?? [];
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
  const defaultLeaveFlowSteps = useMemo<Workspace.TeacherTrainingLeaveFlowStep[]>(
    () =>
      [
        { key: "step-1", name: "第一步审批", approverIds: teacherTrainingApproverOptions.slice(0, 1).map((item) => item.id), requiredCount: 1 },
        { key: "step-2", name: "第二步审批", approverIds: teacherTrainingApproverOptions.slice(1, 2).map((item) => item.id), requiredCount: 1 },
      ].filter((step) => step.approverIds.length > 0),
    [teacherTrainingApproverOptions],
  );
  const pendingLeaveRequests = selectedCohort?.leaveRequests.filter((request) => request.status === "pending") ?? [];
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
  const teacherTrainingSections: Array<{
    key: TeacherTrainingSectionKey;
    label: string;
    description: string;
    Icon: typeof Users;
    count?: number;
    managerOnly?: boolean;
    globalOnly?: boolean;
    teacherOnly?: boolean;
  }> = [
    {
      key: "overview",
      label: "工作台",
      description: "班次总览和关键进度",
      Icon: ClipboardCheck,
    },
    {
      key: "cohorts",
      label: "班次管理",
      description: "班次、地点和班主任",
      Icon: User,
      count: selectedCohort?.stats.managerCount ?? 0,
      managerOnly: true,
    },
    {
      key: "participants",
      label: "参训教师",
      description: "名单、账号和预录信息",
      Icon: Users,
      count: selectedCohort?.stats.participantCount ?? 0,
      managerOnly: true,
    },
    {
      key: "courses",
      label: "课程安排",
      description: "课程表和授课信息",
      Icon: CalendarDays,
      count: selectedCohort?.stats.courseCount ?? 0,
    },
    {
      key: "checkins",
      label: "报到签到",
      description: "课程定位签到任务",
      Icon: MapPin,
      count: selectedCohort?.stats.checkInRecordCount ?? 0,
    },
    {
      key: "attendance",
      label: "报到登记",
      description: "工作人员后台勾选",
      Icon: CheckCircle2,
      count: selectedCohort?.stats.presentCount ?? 0,
      managerOnly: true,
    },
    {
      key: "tasks",
      label: "任务汇报",
      description: "发布任务和汇总提交",
      Icon: FileText,
      count: selectedCohort?.stats.submissionCount ?? 0,
    },
    {
      key: "leave",
      label: "请假审批",
      description: "流程、申请和请假单",
      Icon: FileCheck,
      count: selectedCohort?.stats.leaveCount ?? 0,
    },
    {
      key: "profile",
      label: "个人信息",
      description: "参训教师资料维护",
      Icon: User,
      teacherOnly: true,
    },
    {
      key: "exports",
      label: "导出归档",
      description: "名单、签到和汇报导出",
      Icon: Download,
      managerOnly: true,
    },
  ];
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
  const showTeacherTrainingSection = (...keys: TeacherTrainingSectionKey[]) =>
    keys.includes(effectiveTeacherTrainingSection);
  const checkInNow = useMemo(() => new Date(checkInClock), [checkInClock]);
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
  const openTeacherTrainingSection = (key: TeacherTrainingSectionKey) => {
    setActiveTeacherTrainingSection(key);
    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      document.getElementById("teacher-training-content")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="省培平台独立管理班次、参训教师、课程签到、任务汇报、请假审批和导出归档。"
          title="江苏省职业院校创新创业教育（竞赛）指导能力提升培训"
        />
        <div className="rounded-2xl border border-blue-100 bg-white/80 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">当前模块</p>
          <p className="mt-1 text-sm font-bold text-slate-950">{activeTeacherTrainingSectionMeta?.label ?? "工作台"}</p>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          aria-label="省培模块导航，支持丝滑切换"
          className="depth-card sticky top-4 h-fit overflow-hidden rounded-2xl border border-blue-100/80 bg-white/86 p-3 shadow-[0_18px_55px_rgba(26,111,212,0.12)]"
        >
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 p-4 text-white">
            <p className="text-xs font-semibold text-blue-100">省培模块导航</p>
            <p className="mt-2 text-lg font-bold leading-6">分区处理，不再堆叠</p>
            <p className="mt-2 text-xs leading-5 text-blue-50">切换模块时只展示当前工作区，操作更聚焦。</p>
          </div>
          <div className="mt-3 space-y-1.5">
            {visibleTeacherTrainingSections.map(({ key, label, description, Icon, count }) => {
              const isActive = effectiveTeacherTrainingSection === key;
              return (
                <button
                  key={key}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition duration-200 ${
                    isActive
                      ? "bg-slate-950 text-white shadow-lg shadow-blue-950/10"
                      : "text-slate-600 hover:bg-blue-50 hover:text-slate-950"
                  }`}
                  data-section-key={key}
                  onClick={() => openTeacherTrainingSection(key)}
                  type="button"
                >
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                      isActive ? "bg-white/14 text-white" : "bg-white text-blue-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{label}</span>
                    <span className={`mt-0.5 block truncate text-xs ${isActive ? "text-white/68" : "text-slate-400"}`}>
                      {description}
                    </span>
                  </span>
                  {typeof count === "number" ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-4" id="teacher-training-content">
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
                    <p className="text-sm font-bold text-slate-950">快速进入</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">点击模块后页面会平滑定位到工作区。</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    {visibleTeacherTrainingSections.length - 1} 项
                  </span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {visibleTeacherTrainingSections
                    .filter((section) => section.key !== "overview")
                    .map(({ key, label, description, Icon, count }) => (
                      <button
                        key={key}
                        className="group flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/78 px-3 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/80 hover:shadow-lg hover:shadow-blue-950/8"
                        onClick={() => openTeacherTrainingSection(key)}
                        type="button"
                      >
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-slate-950">{label}</span>
                            {typeof count === "number" ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                                {count}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">{description}</span>
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </section>
          ) : null}

          <section className={`grid gap-4 ${canManage && showTeacherTrainingSection("cohorts", "participants") ? "xl:grid-cols-[360px_minmax(0,1fr)]" : ""}`}>
        {canManage && showTeacherTrainingSection("cohorts", "participants") ? (
          <aside className={`${surfaceCardClassName} space-y-5`}>
            <div>
              <p className="text-sm font-semibold text-slate-900">班次</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">按账号权限切换可管理或可参与的省培班次。</p>
              <select
                className={fieldClassName}
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
            </div>

            {canManageGlobal && showTeacherTrainingSection("cohorts") ? (
            <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#1a6fd4]" />
                <p className="text-sm font-semibold text-slate-900">新建省培班次</p>
              </div>
              <div className="mt-3 space-y-3">
                <input
                  className={fieldClassName}
                  onChange={(event) => setCohortDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="培训名称"
                  value={cohortDraft.title}
                />
                <input
                  className={fieldClassName}
                  onChange={(event) => setCohortDraft((current) => ({ ...current, location: event.target.value }))}
                  placeholder="培训地点"
                  value={cohortDraft.location}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className={fieldClassName}
                    onChange={(event) => setCohortDraft((current) => ({ ...current, startDate: event.target.value }))}
                    type="date"
                    value={cohortDraft.startDate}
                  />
                  <input
                    className={fieldClassName}
                    onChange={(event) => setCohortDraft((current) => ({ ...current, endDate: event.target.value }))}
                    type="date"
                    value={cohortDraft.endDate}
                  />
                </div>
                <textarea
                  className={`${textareaClassName} min-h-20`}
                  onChange={(event) => setCohortDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="培训说明"
                  value={cohortDraft.description}
                />
                <ActionButton className="w-full" loading={isSaving} onClick={() => void submitCohort()} variant="primary">
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
                  <p className="mt-1 text-xs leading-5 text-slate-500">系统管理员、校级管理员可新增省培教师账号，也可绑定已有平台账号。</p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <input
                  className={fieldClassName}
                  onChange={(event) => setParticipantDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="姓名"
                  value={participantDraft.name}
                />
                <input
                  className={fieldClassName}
                  onChange={(event) => setParticipantDraft((current) => ({ ...current, organization: event.target.value }))}
                  placeholder="单位"
                  value={participantDraft.organization}
                />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className={fieldClassName}
                  onChange={(event) => setParticipantDraft((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="手机"
                    value={participantDraft.phone}
                  />
                  <input
                    className={fieldClassName}
                    onChange={(event) => setParticipantDraft((current) => ({ ...current, groupName: event.target.value }))}
                    placeholder="分组"
                  value={participantDraft.groupName}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className={fieldClassName}
                  onChange={(event) => setParticipantDraft((current) => ({ ...current, accountUsername: event.target.value }))}
                  placeholder="省培登录账号；填已有平台账号可直接绑定"
                  value={participantDraft.accountUsername}
                />
                <input
                  className={fieldClassName}
                  onChange={(event) => setParticipantDraft((current) => ({ ...current, accountPassword: event.target.value }))}
                  placeholder="初始密码，不填则自动生成"
                  value={participantDraft.accountPassword}
                />
              </div>
              <textarea
                className={`${textareaClassName} min-h-24`}
                onChange={(event) => setParticipantDraft((current) => ({ ...current, extraInfo: event.target.value }))}
                placeholder="预录扩展信息，例如职务、住宿、发票、培训材料领取情况等；每行一项。"
                value={participantDraft.extraInfo}
              />
              <input
                className={fieldClassName}
                onChange={(event) => setParticipantDraft((current) => ({ ...current, note: event.target.value }))}
                  placeholder="备注"
                  value={participantDraft.note}
                />
                <ActionButton
                  className="w-full"
                  disabled={!selectedCohort}
                  loading={isSaving}
                  onClick={() => void submitParticipant()}
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
                  <select
                    className={fieldClassName}
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
                  <input
                    className={fieldClassName}
                    onChange={(event) => setManagerDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="职务，例如班主任、会务负责人"
                    value={managerDraft.title}
                  />
                  <ActionButton
                    className="w-full"
                    disabled={!managerDraft.userId}
                    loading={isSaving}
                    onClick={() => void submitManager()}
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
                          disabled={isSaving}
                          onClick={() =>
                            void removeTeacherTrainingCohortManager({
                              cohortId: selectedCohort.id,
                              userId: manager.userId,
                            })
                          }
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
                  <select
                    className={`${fieldClassName} mt-4 max-w-md`}
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
                      <EmptyState description="右侧添加课程后，教师端会同步显示课程表。" icon={CalendarDays} title="暂无课程安排" />
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
                    <input
                      className={fieldClassName}
                      onChange={(event) => setCourseDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="课程名称"
                      value={courseDraft.title}
                    />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        className={fieldClassName}
                        onChange={(event) => setCourseDraft((current) => ({ ...current, courseDate: event.target.value }))}
                        type="date"
                        value={courseDraft.courseDate}
                      />
                      <input
                        className={fieldClassName}
                        onChange={(event) => setCourseDraft((current) => ({ ...current, startTime: event.target.value }))}
                        type="time"
                        value={courseDraft.startTime}
                      />
                      <input
                        className={fieldClassName}
                        onChange={(event) => setCourseDraft((current) => ({ ...current, endTime: event.target.value }))}
                        type="time"
                        value={courseDraft.endTime}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className={fieldClassName}
                        onChange={(event) => setCourseDraft((current) => ({ ...current, location: event.target.value }))}
                        placeholder="地点"
                        value={courseDraft.location}
                      />
                      <input
                        className={fieldClassName}
                        onChange={(event) => setCourseDraft((current) => ({ ...current, instructor: event.target.value }))}
                        placeholder="授课教师"
                        value={courseDraft.instructor}
                      />
                    </div>
                    <textarea
                      className={`${textareaClassName} min-h-20`}
                      onChange={(event) => setCourseDraft((current) => ({ ...current, description: event.target.value }))}
                      placeholder="课程说明"
                      value={courseDraft.description}
                    />
                    <ActionButton loading={isSaving} onClick={() => void submitCourseSession()} variant="primary">
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
                    <p className="mt-1 text-xs leading-5 text-slate-500">查看本次省培的课程、地点和时间。</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {courseSessions.length} 节
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {courseSessions.length === 0 ? (
                    <EmptyState description="管理员发布课程后，这里会显示你的课程安排。" icon={CalendarDays} title="暂无课程安排" />
                  ) : (
                    courseSessions.map((course) => (
                      <article key={course.id} className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                        <p className="text-xs font-semibold text-[#1a6fd4]">
                          {course.courseDate}
                          {course.startTime ? ` ${course.startTime}` : ""}
                          {course.endTime ? `-${course.endTime}` : ""}
                        </p>
                        <p className="mt-2 font-semibold text-slate-950">{course.title}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {[course.location, course.instructor].filter(Boolean).join(" · ") || "课程信息待补充"}
                        </p>
                        {course.description ? (
                          <p className="mt-3 text-sm leading-6 text-slate-500">{course.description}</p>
                        ) : null}
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
                      <input
                        className={fieldClassName}
                        onChange={(event) => setCheckInDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="签到标题"
                        value={checkInDraft.title}
                      />
                      <select
                        className={fieldClassName}
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
                      <div className="grid gap-3 md:col-span-2">
                        <input
                          className={fieldClassName}
                          onChange={(event) => setCheckInDraft((current) => ({ ...current, signDate: event.target.value }))}
                          type="date"
                          value={checkInDraft.signDate}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            className={fieldClassName}
                            onChange={(event) => setCheckInDraft((current) => ({ ...current, startTime: event.target.value }))}
                            type="time"
                            value={checkInDraft.startTime}
                          />
                          <input
                            className={fieldClassName}
                            onChange={(event) => setCheckInDraft((current) => ({ ...current, endTime: event.target.value }))}
                            type="time"
                            value={checkInDraft.endTime}
                          />
                        </div>
                      </div>
                      <input
                        className={`${fieldClassName} md:col-span-2`}
                        onChange={(event) => setCheckInDraft((current) => ({ ...current, locationName: event.target.value }))}
                        placeholder="签到地点"
                        value={checkInDraft.locationName}
                      />
                      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px] md:col-span-2">
                        <input
                          className={fieldClassName}
                          onChange={(event) => setCheckInDraft((current) => ({ ...current, latitude: event.target.value }))}
                          placeholder="纬度"
                          value={checkInDraft.latitude}
                        />
                        <input
                          className={fieldClassName}
                          onChange={(event) => setCheckInDraft((current) => ({ ...current, longitude: event.target.value }))}
                          placeholder="经度"
                          value={checkInDraft.longitude}
                        />
                        <input
                          className={fieldClassName}
                          onChange={(event) => setCheckInDraft((current) => ({ ...current, radiusMeters: event.target.value }))}
                          placeholder="范围/米"
                          value={checkInDraft.radiusMeters}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 md:col-span-2">
                        <button
                          className="depth-button-secondary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold"
                          onClick={useCurrentLocationForCheckInTask}
                          type="button"
                        >
                          <Navigation className="h-4 w-4" />
                          使用当前位置
                        </button>
                        <ActionButton loading={isSaving} onClick={() => void submitCheckInTask()} variant="primary">
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
                    {selectedCohort.checkInTasks.length === 0 ? (
                      <EmptyState description="管理员发布课程签到后，这里会显示定位签到入口。" icon={MapPin} title="暂无签到任务" />
                    ) : (
                      selectedCohort.checkInTasks.map((task) => {
                        const signedRecord = task.records.find((record) => record.participantId === selectedParticipant?.id);
                        const windowState = Workspace.getTeacherTrainingCheckInWindowState(task, checkInNow);
                        const isWindowOpen = windowState === "open";
                        const isSigningThisTask = checkInSigningId === task.id;
                        return (
                          <div
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
                              disabled={!isWindowOpen || isSaving || isSigningThisTask || !selectedParticipant}
                              onClick={() => signWithCurrentLocation(task.id)}
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
                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-500">审批步骤</p>
                        <button
                          className="depth-button-secondary inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold"
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
                              <input
                                className={fieldClassName}
                                onChange={(event) => updateLeaveFlowStep(index, { name: event.target.value })}
                                placeholder="步骤名称"
                                value={step.name}
                              />
                              <input
                                className={fieldClassName}
                                min={1}
                                onChange={(event) =>
                                  updateLeaveFlowStep(index, { requiredCount: Number(event.target.value) || 1 })
                                }
                                placeholder="每步通过人数"
                                type="number"
                                value={step.requiredCount}
                              />
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
                              onClick={() =>
                                setLeaveFlowSteps((current) =>
                                  (current.length ? current : activeLeaveFlowSteps).filter((_, stepIndex) => stepIndex !== index),
                                )
                              }
                              type="button"
                            >
                              删除本步骤
                            </button>
                          </div>
                        ))
                      )}
                      <ActionButton disabled={!selectedCohort || activeLeaveFlowSteps.length === 0} loading={isSaving} onClick={() => void saveLeaveFlow()} variant="primary">
                        保存请假流程
                      </ActionButton>
                    </div>

                    <div className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                      <p className="text-sm font-semibold text-slate-900">请假审批</p>
                      <textarea
                        className={`${textareaClassName} mt-3 min-h-20`}
                        onChange={(event) => setLeaveReviewComment(event.target.value)}
                        placeholder="审批意见，可选"
                        value={leaveReviewComment}
                      />
                      <div className="mt-3 space-y-3">
                        {pendingLeaveRequests.length === 0 ? (
                          <EmptyState description="教师提交临时请假后，会进入这里等待审批。" icon={FileCheck} title="暂无待审批请假" />
                        ) : (
                          pendingLeaveRequests.slice(0, 5).map((request) => {
                            const step = request.approvalSteps[request.currentStepIndex];
                            return (
                              <div key={request.id} className="rounded-lg bg-slate-50 px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{request.participantName}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {request.startDate} 至 {request.endDate} · {step?.name ?? "审批中"}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      审批人：{step?.approverIds.map((id) => approverNameById.get(id) ?? "审批人").join("、") || "未配置"}
                                      {step ? ` · 需 ${step.requiredCount} 人通过` : ""}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <a
                                      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 no-underline"
                                      href={`/api/teacher-training/leave-requests/${request.id}/pdf`}
                                    >
                                      导出PDF请假单
                                    </a>
                                    {step?.approverIds.includes(currentUser?.id ?? "") || currentUser?.role === "admin" ? (
                                      <>
                                      <button
                                        className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"
                                        disabled={isSaving}
                                        onClick={() => void reviewLeaveRequest(request.id, "approve")}
                                        type="button"
                                      >
                                        通过
                                      </button>
                                      <button
                                        className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600"
                                        disabled={isSaving}
                                        onClick={() => void reviewLeaveRequest(request.id, "reject")}
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
                        <input
                          className={fieldClassName}
                          onChange={(event) => setLeaveDraft((current) => ({ ...current, startDate: event.target.value }))}
                          type="date"
                          value={leaveDraft.startDate}
                        />
                        <input
                          className={fieldClassName}
                          onChange={(event) => setLeaveDraft((current) => ({ ...current, endDate: event.target.value }))}
                          type="date"
                          value={leaveDraft.endDate}
                        />
                        <input
                          className={fieldClassName}
                          onChange={(event) => setLeaveDraft((current) => ({ ...current, sessionLabel: event.target.value }))}
                          placeholder="请假场次"
                          value={leaveDraft.sessionLabel}
                        />
                        <input className={fieldClassName} disabled value={selectedParticipant?.name ?? "参训教师"} />
                        <textarea
                          className={`${textareaClassName} min-h-24 sm:col-span-2`}
                          onChange={(event) => setLeaveDraft((current) => ({ ...current, reason: event.target.value }))}
                          placeholder="请假原因"
                          value={leaveDraft.reason}
                        />
                      </div>
                      <ActionButton
                        className="mt-3"
                        disabled={!selectedParticipant}
                        loading={isSaving}
                        onClick={() => void submitLeaveRequest()}
                        variant="primary"
                      >
                        提交请假
                      </ActionButton>
                    </div>

                    <div className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                      <p className="text-sm font-semibold text-slate-900">我的请假记录</p>
                      <div className="mt-3 grid gap-2">
                        {selectedParticipant?.leaveRequests.length ? (
                          selectedParticipant.leaveRequests.slice(0, 4).map((request) => (
                            <div key={request.id} className="rounded-lg bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">
                                  {request.startDate} 至 {request.endDate}
                                </p>
                                <div className="flex items-center gap-2">
                                  <a
                                    className="text-xs font-semibold text-blue-700 no-underline"
                                    href={`/api/teacher-training/leave-requests/${request.id}/pdf`}
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
                )}
              </section>
              ) : null}

              {!canManage && showTeacherTrainingSection("profile") ? (
              <section className={surfaceCardClassName}>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[#1a6fd4]" />
                  <p className="text-sm font-semibold text-slate-900">个人信息</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input
                    className={fieldClassName}
                    onChange={(event) => updateProfileDraftField("name", event.target.value)}
                    placeholder="姓名"
                    value={effectiveProfileDraft.name}
                  />
                  <input
                    className={fieldClassName}
                    onChange={(event) => updateProfileDraftField("organization", event.target.value)}
                    placeholder="单位"
                    value={effectiveProfileDraft.organization}
                  />
                  <input
                    className={fieldClassName}
                    onChange={(event) => updateProfileDraftField("phone", event.target.value)}
                    placeholder="手机"
                    value={effectiveProfileDraft.phone}
                  />
                  <input
                    className={fieldClassName}
                    onChange={(event) => updateProfileDraftField("groupName", event.target.value)}
                    placeholder="分组"
                    value={effectiveProfileDraft.groupName}
                  />
                  <textarea
                    className={`${textareaClassName} min-h-20 md:col-span-2`}
                    onChange={(event) => updateProfileDraftField("note", event.target.value)}
                    placeholder="个人备注或培训需求"
                    value={effectiveProfileDraft.note}
                  />
                </div>
                <div className="mt-4">
                  <ActionButton
                    disabled={!effectiveProfileDraft.participantId}
                    loading={isSaving}
                    onClick={() => void submitProfile()}
                    variant="primary"
                  >
                    保存个人信息
                  </ActionButton>
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
                    <EmptyState description="左侧添加参训教师后，这里会显示名单和账号信息。" icon={Users} title="名单为空" />
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
                            disabled={isSaving}
                            onClick={() => void copyAccountMessage(participant.id)}
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
                    <input
                      className={fieldClassName}
                      onChange={(event) => setAttendanceDate(event.target.value)}
                      type="date"
                      value={attendanceDate}
                    />
                    <select
                      className={fieldClassName}
                      onChange={(event) => setAttendanceSessionLabel(event.target.value)}
                      value={attendanceSessionLabel}
                    >
                      <option value="报到">报到</option>
                      <option value="上午课程">上午课程</option>
                      <option value="下午课程">下午课程</option>
                      <option value="晚间研讨">晚间研讨</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/75">
                  {selectedCohort.participants.length === 0 ? (
                    <EmptyState description="左侧添加参训教师后，这里会出现报到勾选列表。" icon={Users} title="名单为空" />
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
                                  disabled={isSaving}
                                  onClick={() => void copyAccountMessage(participant.id)}
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
                                  disabled={isSaving}
                                  onClick={() => markAttendance(participant.id, status)}
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
                    <input
                      className={fieldClassName}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="任务名称"
                      value={taskDraft.title}
                    />
                    <textarea
                      className={textareaClassName}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))}
                      placeholder="任务说明"
                      value={taskDraft.description}
                    />
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <input
                        className={fieldClassName}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))}
                        type="date"
                        value={taskDraft.dueDate}
                      />
                      <label className="mt-1.5 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
                        <input
                          checked={taskDraft.requireAttachment}
                          onChange={(event) => setTaskDraft((current) => ({ ...current, requireAttachment: event.target.checked }))}
                          type="checkbox"
                        />
                        需要附件
                      </label>
                    </div>
                    <ActionButton loading={isSaving} onClick={() => void submitTask()} variant="primary">
                      发布任务
                    </ActionButton>
                  </div>
                </div>
                ) : null}

                <div className={surfaceCardClassName}>
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-[#1a6fd4]" />
                    <p className="text-sm font-semibold text-slate-900">登记汇报</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <select
                      className={fieldClassName}
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
                    <select
                      className={fieldClassName}
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
                    <textarea
                      className={textareaClassName}
                      onChange={(event) => setSubmissionDraft((current) => ({ ...current, content: event.target.value }))}
                      placeholder="汇报内容"
                      value={submissionDraft.content}
                    />
                    <input
                      className={fieldClassName}
                      onChange={(event) => setSubmissionDraft((current) => ({ ...current, attachment: event.target.value }))}
                      placeholder="附件说明或链接"
                      value={submissionDraft.attachment}
                    />
                    <ActionButton
                      disabled={!selectedTask || !selectedParticipant}
                      loading={isSaving}
                      onClick={() => void submitSubmission()}
                      variant="primary"
                    >
                      保存汇报
                    </ActionButton>
                  </div>
                </div>
              </section>
              ) : null}

              {showTeacherTrainingSection("tasks") ? (
              <section className={surfaceCardClassName}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">任务汇报概览</p>
                    <p className="mt-1 text-xs text-slate-500">管理员可按班次导出全部任务完成情况。</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                    {selectedCohort.tasks.length} 项任务
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  {selectedCohort.tasks.length === 0 ? (
                    <EmptyState description="发布任务后，参训教师汇报会汇总在这里。" icon={FileText} title="暂无任务" />
                  ) : (
                    selectedCohort.tasks.map((task) => (
                      <div key={task.id} className="rounded-xl border border-slate-200/75 bg-white/72 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-950">{task.title}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{task.description}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                            {task.submissions.length}/{selectedCohort.participants.length} 份
                          </span>
                        </div>
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
                    ))
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
                        省培导出先统一入口，后续在这里接入公文排版和标准表格模板。
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
                        href={`${exportBaseUrl}&type=${item.type}`}
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
      </section>
        </div>
      </section>
    </div>
  );
}
