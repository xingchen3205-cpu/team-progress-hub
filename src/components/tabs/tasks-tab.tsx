"use client";

import { useState } from "react";

import type { BoardStatus, BoardStatusFilter, TaskDraft, PreviewAsset } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

export default function TasksTab() {
  const {
    tasks,
    teamGroups,
    expandedBoardTaskIds,
    boardStatusFilter,
    setBoardStatusFilter,
    boardSearch,
    setBoardSearch,
    isSaving,
    currentRole,
    hasGlobalAdminRole,
    currentMemberId,
    permissions,
    getTaskAssigneeIds,
    getTaskAssignmentSummary,
    getTaskAssigneeName,
    canAcceptTask,
    canSubmitTask,
    canEditTaskItem,
    canDeleteTaskItem,
    canReviewTaskItem,
    toggleBoardTaskExpand,
    handleDownload,
    buildInlinePreviewUrl,
    handlePreviewDocument,
    openCreateTaskModal,
    openEditTaskModal,
    deleteTask,
    acceptTask,
    openTaskCompletionModal,
    confirmTaskArchive,
    openTaskRejectModal,
    sendTaskReminder,
    remindTaskDispatch,
  } = Workspace.useWorkspaceContext();

  const {
    FileText,
    KanbanSquare,
    Plus,
    Search,
    boardColumns,
    buildTaskWorkflowSteps,
    getTaskAcceptedTimeLabel,
    getTaskReminderActionLabel,
    getTaskReviewerLabel,
    boardStatusMeta,
    boardStatusOrder,
    getBoardStatusLabel,
    taskPriorityStyles,
    taskWorkflowDotClassNames,
    getAssetExtension,
    isImageAsset,
    formatFileSize,
    SectionHeader,
    DemoResetNote,
    EmptyState,
    ActionButton,
  } = Workspace;

  const [selectedTaskTeamGroupId, setSelectedTaskTeamGroupId] = useState("all");

const renderBoard = () => {
    const normalizedBoardSearch = boardSearch.trim().toLowerCase();
    const isGlobalTaskView = currentRole === "admin" || currentRole === "school_admin";
    const scopedTasks =
      isGlobalTaskView && selectedTaskTeamGroupId !== "all"
        ? tasks.filter((task) =>
            selectedTaskTeamGroupId === "unassigned" ? !task.teamGroupId : task.teamGroupId === selectedTaskTeamGroupId,
          )
        : tasks;
    const taskTeamGroupSummaries = [
      {
        id: "all",
        name: "全部项目组",
        count: tasks.length,
        active: tasks.filter((task) => task.status !== "archived").length,
      },
      {
        id: "unassigned",
        name: "未分组任务",
        count: tasks.filter((task) => !task.teamGroupId).length,
        active: tasks.filter((task) => !task.teamGroupId && task.status !== "archived").length,
      },
      ...teamGroups.map((group) => {
        const groupTasks = tasks.filter((task) => task.teamGroupId === group.id);
        return {
          id: group.id,
          name: group.name,
          count: groupTasks.length,
          active: groupTasks.filter((task) => task.status !== "archived").length,
        };
      }),
    ].filter((item) => item.id === "all" || item.count > 0);
    const taskStatusCounts = boardColumns.reduce(
      (result, column) => ({
        ...result,
        [column.id]: scopedTasks.filter((task) => task.status === column.id).length,
      }),
      {} as Record<BoardStatus, number>,
    );
    const filteredTasks = scopedTasks
      .filter((task) => boardStatusFilter === "all" || task.status === boardStatusFilter)
      .filter((task) => {
        if (!normalizedBoardSearch) {
          return true;
        }

        return [
          task.title,
          task.priority,
          getTaskAssigneeName(task),
          task.reviewer?.name,
          task.teamGroupName,
          task.creator?.name,
        ]
          .filter(Boolean)
          .some((value) => `${value}`.toLowerCase().includes(normalizedBoardSearch));
      })
      .sort((first, second) => {
        const statusDifference = boardStatusOrder[first.status] - boardStatusOrder[second.status];
        if (statusDifference !== 0) {
          return statusDifference;
        }

        return new Date(first.dueDate).getTime() - new Date(second.dueDate).getTime();
      });

    const activeTaskCount = scopedTasks.filter((task) => task.status !== "archived").length;
    const reviewTaskCount = taskStatusCounts.review ?? 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeader
            description={
              isGlobalTaskView
                ? "以全校任务台账方式查看各项目组提报、分配、接取、验收和归档情况。"
                : "以工单台账方式管理提报、分配、接取、验收和归档，状态清楚，责任到人。"
            }
            title={isGlobalTaskView ? "全校任务台账" : "任务工单"}
          />
          <div className="flex flex-wrap items-center gap-3">
            <DemoResetNote />
            <ActionButton
              disabled={!permissions.canCreateTask}
              onClick={openCreateTaskModal}
              title="无权限"
              variant="primary"
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>发布工单</span>
              </span>
            </ActionButton>
          </div>
        </div>

        {isGlobalTaskView ? (
          <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">项目组任务总览</h3>
                <p className="mt-1 text-sm text-slate-500">系统管理员按项目组查看全校任务状态，必要时再进入单组细看。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {taskTeamGroupSummaries.map((group) => {
                  const active = selectedTaskTeamGroupId === group.id;
                  return (
                    <button
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        active
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50/60"
                      }`}
                      key={group.id}
                      onClick={() => setSelectedTaskTeamGroupId(group.id)}
                      type="button"
                    >
                      <span className="font-semibold">{group.name}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {group.count} 项 / 进行中 {group.active}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-[#F7FAFE] p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "待推进工单", value: `${activeTaskCount} 项`, hint: "未归档总量" },
                  { label: "待验收", value: `${reviewTaskCount} 项`, hint: "需要确认闭环" },
                  { label: "已归档", value: `${taskStatusCounts.archived ?? 0} 项`, hint: "完成留痕" },
                ].map((item) => (
                  <div className="rounded-lg border border-slate-100 bg-white px-4 py-3" key={item.label}>
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.hint}</p>
                  </div>
                ))}
              </div>

              <label className="relative block w-full xl:w-80">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  onChange={(event) => setBoardSearch(event.target.value)}
                  placeholder="搜索工单、处理人、队伍"
                  value={boardSearch}
                />
              </label>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {[
                { id: "all" as BoardStatusFilter, label: "全部", count: scopedTasks.length, description: "全部工单" },
                ...boardColumns.map((column) => ({
                  id: column.id as BoardStatusFilter,
                  label: boardStatusMeta[column.id].label,
                  count: taskStatusCounts[column.id] ?? 0,
                  description: boardStatusMeta[column.id].description,
                })),
              ].map((item) => {
                const active = boardStatusFilter === item.id;
                const dotClassName =
                  item.id === "all" ? "bg-[#1a6fd4]/55" : boardStatusMeta[item.id as BoardStatus].dotClassName;

                return (
                  <button
                    className={`shrink-0 rounded-lg border px-3.5 py-2 text-left transition ${
                      active
                        ? "border-white/90 bg-white text-[#1a6fd4] shadow-[0_14px_32px_rgba(31,38,135,0.14)]"
                        : "border-white/65 bg-white/55 text-slate-500 hover:border-white/90 hover:bg-white/70"
                    }`}
                    key={item.id}
                    onClick={() => setBoardStatusFilter(item.id)}
                    title={item.description}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                      <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
                      {item.label}
                      <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs text-slate-500">{item.count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[min(780px,calc(100vh-300px))] space-y-3 overflow-y-auto bg-slate-50/40 p-4">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => {
                const isTaskExpanded = expandedBoardTaskIds.includes(task.id);
                const canExpandTask = task.title.length > 32;
                const statusMeta = boardStatusMeta[task.status];
                const attachmentCount = task.attachments?.length ?? 0;
                const assignmentSummary = getTaskAssignmentSummary(task);
                const isUnassignedTask = task.status === "todo" && assignmentSummary.total === 0;
                const taskReminderLabel = getTaskReminderActionLabel({
                  status: task.status,
                  assigneeId: assignmentSummary.total > 0 ? getTaskAssigneeIds(task)[0] ?? null : null,
                });
                const canPromptDispatch =
                  isUnassignedTask &&
                  Boolean(task.teamGroupId) &&
                  (task.creatorId === currentMemberId ||
                    hasGlobalAdminRole ||
                    currentRole === "teacher" ||
                    currentRole === "leader");
                const workflowSteps = buildTaskWorkflowSteps({
                  status: task.status,
                  assigneeId: assignmentSummary.total > 0 ? getTaskAssigneeIds(task)[0] ?? null : null,
                  assigneeName: assignmentSummary.total > 0 ? getTaskAssigneeName(task) : null,
                  assigneeCount: assignmentSummary.total,
                  acceptedCount: assignmentSummary.accepted,
                  submittedCount: assignmentSummary.submitted,
                  reviewerName: task.reviewer?.name ?? null,
                });
                const nextStepLabel = isUnassignedTask
                  ? "等待项目负责人 / 指导教师分配处理人"
                  : task.status === "todo"
                    ? "等待处理人接取工单"
                    : task.status === "doing"
                      ? "补充完成凭证并提交验收"
                      : task.status === "review"
                        ? "等待验收人确认闭环"
                        : "已归档，可后续备查";
                const taskPeople = [
                  { label: "提报人", value: task.creator?.name ?? "系统记录" },
                  { label: "发布人", value: task.creator?.name ?? "系统记录" },
                  { label: "处理人", value: getTaskAssigneeName(task) },
                  { label: "审批人", value: getTaskReviewerLabel({ status: task.status, reviewerName: task.reviewer?.name }) },
                  { label: "所属队伍", value: task.teamGroupName ?? "未分组" },
                ];
                const taskTimeItems = [
                  { label: "提报时间", value: task.createdAt ?? "未记录" },
                  { label: "截止时间", value: task.dueDate },
                  { label: "接取时间", value: getTaskAcceptedTimeLabel(task) },
                  { label: "提交验收", value: task.submittedAt ?? "未提交" },
                  { label: "归档时间", value: task.archivedAt ?? "未归档" },
                ];
                const completedWorkflowCount = workflowSteps.filter((step) => step.state === "done").length;

                return (
                  <article
                    className="group relative overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:border-[#D2E0F5] hover:shadow-md"
                    key={task.id}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${statusMeta.rowAccentClassName}`} />
                    <div className="p-4 pl-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusMeta.badgeClassName}`}
                          >
                            {getBoardStatusLabel(task)}
                          </span>
                          <span
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                              task.priority in taskPriorityStyles
                                ? taskPriorityStyles[task.priority as TaskDraft["priority"]]
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {task.priority}
                          </span>
                          {attachmentCount > 0 ? (
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
                              凭证 {attachmentCount} 个
                            </span>
                          ) : null}
                        </div>

                        <button
                          className="mt-3 block w-full text-left"
                          onClick={() => (canExpandTask ? toggleBoardTaskExpand(task.id) : undefined)}
                          title={canExpandTask ? "点击展开完整工单标题" : task.title}
                          type="button"
                        >
                          <h3
                            className={`text-base font-semibold leading-7 text-slate-900 ${
                              isTaskExpanded ? "" : "line-clamp-2"
                            }`}
                          >
                            {task.title}
                          </h3>
                        </button>
                        {canExpandTask ? (
                          <button
                            className="mt-1 text-xs font-medium text-blue-600 transition hover:text-blue-700"
                            onClick={() => toggleBoardTaskExpand(task.id)}
                            type="button"
                          >
                            {isTaskExpanded ? "收起标题" : "展开标题"}
                          </button>
                        ) : null}

                        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                            <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                              {taskPeople.map((item) => (
                                <div
                                  className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
                                  key={item.label}
                                >
                                  <span className="block text-[11px] font-medium tracking-[0.08em] text-slate-400">
                                    {item.label}
                                  </span>
                                  <span className="mt-1 block break-words text-sm font-semibold leading-6 text-slate-800">
                                    {item.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="rounded-xl border border-[#D9E4F5] bg-[#F5F9FF] px-4 py-3 shadow-sm 2xl:w-56">
                              <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">当前环节</p>
                              <p className="mt-1 text-sm font-semibold leading-6 text-slate-900">{nextStepLabel}</p>
                              <p className="mt-2 text-xs text-[#1a6fd4]">
                                已完成 {completedWorkflowCount}/4 个节点
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 rounded-xl border border-[#D9E4F5] bg-[#F5F9FF] px-4 py-4">
                          <div className="overflow-x-auto pb-1">
                            <div className="grid min-w-[760px] grid-cols-4">
                              {workflowSteps.map((step, index) => {
                                const leftLineClass =
                                  index > 0 && workflowSteps[index - 1]?.state === "done"
                                    ? "bg-[#89B3EA]"
                                    : "bg-slate-200";
                                const rightLineClass =
                                  step.state === "done"
                                    ? "bg-[#89B3EA]"
                                    : step.state === "current"
                                      ? "bg-[#BFD5F5]"
                                      : "bg-slate-200";

                                return (
                                  <div className="relative px-2 text-center" key={step.key}>
                                    {index > 0 ? (
                                      <span
                                        className={`absolute top-4 left-0 h-0.5 w-1/2 rounded-full ${leftLineClass}`}
                                      />
                                    ) : null}
                                    {index < workflowSteps.length - 1 ? (
                                      <span
                                        className={`absolute top-4 right-0 h-0.5 w-1/2 rounded-full ${rightLineClass}`}
                                      />
                                    ) : null}
                                    <span
                                      className={`relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${taskWorkflowDotClassNames[step.state]}`}
                                    >
                                      {index + 1}
                                    </span>
                                    <p
                                      className={`mt-2 text-sm font-semibold ${
                                        step.state === "done"
                                          ? "text-[#1a6fd4]"
                                          : step.state === "current"
                                            ? "text-[#1a6fd4]"
                                            : "text-slate-500"
                                      }`}
                                    >
                                      {step.label}
                                    </p>
                                    <p className="mx-auto mt-1 max-w-[160px] text-xs leading-5 text-slate-500">
                                      {step.helper}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          </div>

                          <details className="mt-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm text-slate-600">
                            <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500">
                              查看时间台账
                            </summary>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                              {taskTimeItems.map((item) => (
                                <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100" key={item.label}>
                                  <span className="block text-xs text-slate-400">{item.label}</span>
                                  <span className="mt-1 block font-medium text-slate-700">{item.value}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>

                        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">办理提示</p>
                            <p className="min-w-0 text-sm font-semibold text-slate-800">{nextStepLabel}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            {isUnassignedTask && canEditTaskItem(task) ? (
                              <ActionButton disabled={isSaving} onClick={() => openEditTaskModal(task)} variant="primary">
                                分配处理人
                              </ActionButton>
                            ) : null}
                            {canAcceptTask(task) ? (
                              <ActionButton disabled={isSaving} onClick={() => void acceptTask(task)} variant="secondary">
                                接取
                              </ActionButton>
                            ) : null}
                            {canSubmitTask(task) ? (
                              <ActionButton disabled={isSaving} onClick={() => openTaskCompletionModal(task)} variant="primary">
                                提交验收
                              </ActionButton>
                            ) : null}
                            {task.status === "review" && canReviewTaskItem(task) ? (
                              <>
                                <ActionButton disabled={isSaving} onClick={() => confirmTaskArchive(task)} variant="secondary">
                                  确认归档
                                </ActionButton>
                                <ActionButton disabled={isSaving} onClick={() => openTaskRejectModal(task)} variant="danger">
                                  驳回
                                </ActionButton>
                              </>
                            ) : null}
                            {canPromptDispatch ||
                            (permissions.canSendDirective &&
                              getTaskAssigneeIds(task).some((assigneeId) => assigneeId !== currentMemberId)) ? (
                              <ActionButton
                                disabled={isSaving}
                                onClick={() => (canPromptDispatch ? void remindTaskDispatch(task) : sendTaskReminder(task))}
                              >
                                {taskReminderLabel}
                              </ActionButton>
                            ) : null}
                            <ActionButton
                              disabled={!canEditTaskItem(task)}
                              onClick={() => openEditTaskModal(task)}
                              title="无权限"
                            >
                              {isUnassignedTask ? "编辑内容" : "编辑"}
                            </ActionButton>
                            <ActionButton
                              disabled={!canDeleteTaskItem(task)}
                              onClick={() => deleteTask(task.id, task.title)}
                              title="无权限"
                              variant="danger"
                            >
                              删除
                            </ActionButton>
                          </div>
                        </div>

                        {task.rejectionReason ? (
                          <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                            驳回原因：{task.rejectionReason}
                          </p>
                        ) : null}
                        {task.completionNote ? (
                          <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                            完成说明：{task.completionNote}
                          </p>
                        ) : null}
                        {attachmentCount > 0 ? (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold text-slate-400">完成凭证</p>
                              <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                                {attachmentCount} 个附件
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {task.attachments?.slice(0, 6).map((attachment) => {
                                const asset = {
                                  title: "完成凭证预览",
                                  url: attachment.downloadUrl,
                                  fileName: attachment.fileName,
                                  mimeType: attachment.mimeType,
                                } satisfies PreviewAsset;
                                const isPreviewableImage = isImageAsset(asset);

                                return (
                                  <div
                                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
                                    key={attachment.id}
                                  >
                                    <button
                                      className="block w-full text-left"
                                      onClick={() =>
                                        handlePreviewDocument({
                                          downloadUrl: attachment.downloadUrl,
                                          fileName: attachment.fileName,
                                          mimeType: attachment.mimeType,
                                          title: "完成凭证预览",
                                        })
                                      }
                                      type="button"
                                    >
                                      <div className="flex h-28 items-center justify-center overflow-hidden bg-slate-100">
                                        {isPreviewableImage ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            alt={attachment.fileName}
                                            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                                            loading="lazy"
                                            src={buildInlinePreviewUrl(attachment.downloadUrl) ?? attachment.downloadUrl}
                                          />
                                        ) : (
                                          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400">
                                            <FileText className="h-8 w-8" />
                                            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold uppercase text-slate-500 ring-1 ring-slate-200">
                                              {getAssetExtension(attachment.fileName).replace(".", "") || "file"}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="p-3">
                                        <p className="line-clamp-2 text-sm font-semibold leading-6 text-slate-800">
                                          {attachment.fileName}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400">
                                          {formatFileSize(attachment.fileSize)} · {attachment.uploaderName}
                                        </p>
                                      </div>
                                    </button>
                                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-3 py-2">
                                      <button
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                        onClick={() =>
                                          handlePreviewDocument({
                                            downloadUrl: attachment.downloadUrl,
                                            fileName: attachment.fileName,
                                            mimeType: attachment.mimeType,
                                            title: "完成凭证预览",
                                          })
                                        }
                                        type="button"
                                      >
                                        预览
                                      </button>
                                      <button
                                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                                        onClick={() => handleDownload(attachment.downloadUrl)}
                                        type="button"
                                      >
                                        下载
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {attachmentCount > 6 ? (
                              <p className="mt-3 text-xs text-slate-400">
                                还有 {attachmentCount - 6} 个附件未在卡片中展开，可进入工单详情后继续查看。
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
                <EmptyState
                  description="当前筛选条件下没有工单，可以切换状态或重新搜索。"
                  icon={KanbanSquare}
                  title="暂无工单"
                />
              </div>
            )}
          </div>
        </section>
      </div>
    );
  };

  return renderBoard();
}
