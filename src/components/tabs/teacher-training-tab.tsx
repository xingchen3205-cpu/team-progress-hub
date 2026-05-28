"use client";

import { useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";

type AttendanceStatus = Workspace.TeacherTrainingAttendanceStatus;

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

const statusStyleMap: Record<AttendanceStatus, string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-700",
  leave: "border-amber-200 bg-amber-50 text-amber-700",
  absent: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function TeacherTrainingTab() {
  const {
    teacherTrainingCohorts,
    canManageTeacherTraining,
    isSaving,
    createTeacherTrainingCohort,
    addTeacherTrainingParticipant,
    createTeacherTrainingCourseSession,
    markTeacherTrainingAttendance,
    createTeacherTrainingTask,
    saveTeacherTrainingSubmission,
    updateTeacherTrainingProfile,
  } = Workspace.useWorkspaceContext();
  const {
    ActionButton,
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    Download,
    EmptyState,
    FileCheck,
    FileText,
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
    note: "",
  });
  const [courseDraft, setCourseDraft] = useState<Workspace.TeacherTrainingCourseSessionDraft>(
    createDefaultCourseSessionDraft,
  );
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
  const metricCards: Array<{ label: string; value: number; Icon: typeof Users }> = [
    { label: "参训教师", value: selectedCohort?.stats.participantCount ?? 0, Icon: Users },
    { label: "课程", value: selectedCohort?.stats.courseCount ?? 0, Icon: CalendarDays },
    { label: "已报到", value: selectedCohort?.stats.presentCount ?? 0, Icon: CheckCircle2 },
    { label: "请假", value: selectedCohort?.stats.leaveCount ?? 0, Icon: CalendarDays },
    { label: "缺勤", value: selectedCohort?.stats.absentCount ?? 0, Icon: FileCheck },
    { label: "任务", value: selectedCohort?.stats.taskCount ?? 0, Icon: FileText },
    { label: "汇报", value: selectedCohort?.stats.submissionCount ?? 0, Icon: Send },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="省培平台独立管理班次、参训教师、工作人员后台勾选报到、任务汇报和导出归档。"
          title="江苏省职业院校创新创业教育（竞赛）指导能力提升培训"
        />
        {selectedCohort && canManage ? (
          <div className="flex flex-wrap gap-2">
            <a className="depth-button-secondary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm no-underline" href={`${exportBaseUrl}&type=participants`}>
              <Download className="h-4 w-4" />
              导出名单
            </a>
            <a className="depth-button-secondary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm no-underline" href={`${exportBaseUrl}&type=attendance`}>
              <Download className="h-4 w-4" />
              导出签到
            </a>
            <a className="depth-button-secondary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm no-underline" href={`${exportBaseUrl}&type=submissions`}>
              <Download className="h-4 w-4" />
              导出汇报
            </a>
          </div>
        ) : null}
      </div>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        {metricCards.map(({ label, value, Icon }) => (
          <div key={label} className="depth-subtle rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{label}</p>
              <Icon className="h-4 w-4 text-[#1a6fd4]" />
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className={`grid gap-4 ${canManage ? "xl:grid-cols-[360px_minmax(0,1fr)]" : ""}`}>
        {canManage ? (
          <aside className={`${surfaceCardClassName} space-y-5`}>
            <div>
              <p className="text-sm font-semibold text-slate-900">班次</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">系统管理员和校级管理员从这里切换省培班次。</p>
              <select
                className={fieldClassName}
                onChange={(event) => setSelectedCohortId(event.target.value)}
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

            <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#1a6fd4]" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">参训教师中心</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">系统管理员、校级管理员可新增省培教师账号。</p>
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
                  placeholder="省培登录账号"
                  value={participantDraft.accountUsername}
                />
                <input
                  className={fieldClassName}
                  onChange={(event) => setParticipantDraft((current) => ({ ...current, accountPassword: event.target.value }))}
                  placeholder="初始密码，不填则自动生成"
                  value={participantDraft.accountPassword}
                />
              </div>
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
                    onChange={(event) => setSelectedCohortId(event.target.value)}
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

              {canManage ? (
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
              )}

              {!canManage ? (
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

              {canManage ? (
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
                            </div>
                            <div className="flex flex-wrap gap-2">
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
              </section>
              ) : null}

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
            </>
          )}
        </div>
      </section>
    </div>
  );
}
