"use client";

import type { PriorityFocusItem, OverviewMetric } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

export default function OverviewTab() {
  const {
    router,
    currentUser,
    currentDateTime,
    announcements,
    events,
    tasks,
    reviewAssignments,
    documents,
    countdown,
    setNotificationsOpen,
    isSaving,
    setSelectedAnnouncement,
    currentRole,
    hasGlobalAdminRole,
    currentMemberId,
    nearestEvent,
    portalScopeText,
    canReviewDocuments,
    todayReportEntryMap,
    myOpenTasks,
    pendingLeaderReviewCount,
    pendingTeacherReviewCount,
    reportableMembers,
    reportSubmittedCount,
    reportExpectedCount,
    getTaskAssigneeName,
    todayTaskSummaryTasks,
    pendingApprovalMembers,
    unreadTodoNotifications,
    todoItemCount,
    canMoveTask,
    completeTaskFromOverview,
    openOverviewTarget,
  } = Workspace.useWorkspaceContext();

  const {
    CalendarDays,
    FileCheck,
    FolderOpen,
    KanbanSquare,
    roleLabels,
    formatDateTime,
    formatFriendlyDate,
    getOverviewDeadlineMeta,
    priorityFocusTagMeta,
  } = Workspace;

const renderOverview = () => {
    const quickCompletableTask = tasks.find((task) => task.status !== "archived" && canMoveTask(task));
    const countdownTotalHours = countdown.days * 24 + countdown.hours;
    const countdownStatus = !nearestEvent
      ? {
          label: "待配置",
          className: "border-white/90 bg-white text-slate-900/70 shadow-[0_12px_28px_rgba(31,38,135,0.12)]",
          hint: "补充节点后自动预警",
        }
      : countdownTotalHours <= 24
        ? {
            label: "紧急",
            className: "border-white/90 bg-white text-[#1a6fd4] shadow-[0_14px_32px_rgba(31,38,135,0.16)]",
            hint: "进入最后 24 小时",
          }
        : countdown.days <= 3
          ? {
              label: "临近",
              className: "border-white/90 bg-white text-[#1a6fd4] shadow-[0_14px_32px_rgba(31,38,135,0.16)]",
              hint: "建议开始集中检查",
            }
          : {
              label: "推进中",
              className: "border-white/90 bg-white text-[#1a6fd4] shadow-[0_14px_32px_rgba(31,38,135,0.16)]",
              hint: "按计划持续推进",
            };

    const openTasks = tasks.filter((task) => task.status !== "archived");
    const unsubmittedReportCount = reportableMembers.filter(
      (member) => !todayReportEntryMap.has(member.id),
    ).length;
    const myReportSubmitted = todayReportEntryMap.has(currentMemberId);
    const reviewScoreCount = reviewAssignments.filter((assignment) => assignment.score).length;
    const pendingExpertReviewCount = reviewAssignments.filter((assignment) => assignment.statusKey === "pending").length;

    const overviewMetrics: OverviewMetric[] =
      hasGlobalAdminRole
        ? [
            {
              label: "待审核账号",
              value: `${pendingApprovalMembers.length} 个`,
              guide:
                pendingApprovalMembers.length > 0
                  ? "存在待审核账号，可前往账号管理处理 →"
                  : "暂无待处理，可前往账号管理查看 →",
              isMuted: pendingApprovalMembers.length === 0,
            },
            {
              label: "待办提醒",
              value: `${todoItemCount} 项`,
              guide:
                todoItemCount > 0
                  ? "建议优先处理站内待办与提醒 →"
                  : "暂无待处理，可前往待办中心查看 →",
              isMuted: todoItemCount === 0,
            },
            {
              label: "未读消息",
              value: `${unreadTodoNotifications.length} 条`,
              guide:
                unreadTodoNotifications.length > 0
                  ? "存在未读消息，可前往待办中心查看 →"
                  : "暂无未读消息，可前往待办中心查看 →",
              isMuted: unreadTodoNotifications.length === 0,
            },
          ]
        : currentRole === "teacher"
          ? [
              {
                label: "待审材料",
                value: `${pendingLeaderReviewCount + pendingTeacherReviewCount} 份`,
                guide:
                  pendingLeaderReviewCount + pendingTeacherReviewCount > 0
                    ? "存在待审批材料，可前往文档中心处理 →"
                    : "暂无待审批材料，可前往文档中心查看 →",
                isMuted: pendingLeaderReviewCount + pendingTeacherReviewCount === 0,
              },
              {
                label: "未交汇报",
                value: `${unsubmittedReportCount} 人`,
                guide:
                  unsubmittedReportCount > 0
                    ? "存在未交汇报，可前往日程汇报督办 →"
                    : "暂无未交汇报，可前往日程汇报查看 →",
                isMuted: unsubmittedReportCount === 0,
              },
              {
                label: "待办提醒",
                value: `${todoItemCount} 项`,
                guide:
                  todoItemCount > 0
                    ? "存在待办提醒，可前往待办中心处理 →"
                    : "暂无待办提醒，可前往待办中心查看 →",
                isMuted: todoItemCount === 0,
              },
            ]
          : currentRole === "leader"
            ? [
                {
                  label: "待分配工单",
                  value: `${tasks.filter((task) => task.status === "todo" && !task.assigneeId).length} 项`,
                  guide:
                    tasks.filter((task) => task.status === "todo" && !task.assigneeId).length > 0
                      ? "存在待分配工单，可前往任务中心处理 →"
                      : "暂无待分配工单，可前往任务中心查看 →",
                  isMuted: tasks.filter((task) => task.status === "todo" && !task.assigneeId).length === 0,
                },
                {
                  label: "待验收工单",
                  value: `${tasks.filter((task) => task.status === "review").length} 项`,
                  guide:
                    tasks.filter((task) => task.status === "review").length > 0
                      ? "存在待验收工单，可前往任务中心处理 →"
                      : "暂无待验收工单，可前往任务中心查看 →",
                  isMuted: tasks.filter((task) => task.status === "review").length === 0,
                },
                {
                  label: "未交汇报",
                  value: `${unsubmittedReportCount} 人`,
                  guide:
                    unsubmittedReportCount > 0
                      ? "存在未交汇报，可前往日程汇报督办 →"
                      : "暂无未交汇报，可前往日程汇报查看 →",
                  isMuted: unsubmittedReportCount === 0,
                },
              ]
            : currentRole === "expert"
              ? [
                  {
                    label: "待评任务",
                    value: `${pendingExpertReviewCount} 项`,
                    guide:
                      pendingExpertReviewCount > 0
                        ? "存在待评任务，可前往专家评审处理 →"
                        : "暂无待评任务，可前往专家评审查看 →",
                    isMuted: pendingExpertReviewCount === 0,
                  },
                  {
                    label: "已交评分",
                    value: `${reviewScoreCount} 条`,
                    guide:
                      reviewScoreCount > 0
                        ? "已提交评分结果，可前往专家评审查看 →"
                        : "暂无已交评分，可前往专家评审查看 →",
                    isMuted: reviewScoreCount === 0,
                  },
                  {
                    label: "待办提醒",
                    value: `${todoItemCount} 项`,
                    guide:
                      todoItemCount > 0
                        ? "存在待办提醒，可前往待办中心处理 →"
                        : "暂无待办提醒，可前往待办中心查看 →",
                    isMuted: todoItemCount === 0,
                  },
                ]
              : [
                  {
                    label: "我的任务",
                    value: `${myOpenTasks.length} 项`,
                    guide:
                      myOpenTasks.length > 0
                        ? "存在个人任务，可前往任务中心处理 →"
                        : "暂无个人任务，可前往任务中心查看 →",
                    isMuted: myOpenTasks.length === 0,
                  },
                  {
                    label: "今日日报",
                    value: myReportSubmitted ? "已提交" : "待提交",
                    guide: myReportSubmitted ? "今日日报已完成，可前往日程汇报查看 →" : "请先提交今日工作汇报 →",
                    isMuted: myReportSubmitted,
                  },
                  {
                    label: "未读消息",
                    value: `${unreadTodoNotifications.length} 条`,
                    guide:
                      unreadTodoNotifications.length > 0
                        ? "存在未读消息，可前往待办中心查看 →"
                        : "暂无未读消息，可前往待办中心查看 →",
                    isMuted: unreadTodoNotifications.length === 0,
                  },
                ];

    const businessTabs = [
      {
        key: "todo",
        label: "待办事项",
        count: todoItemCount,
        onClick: () => setNotificationsOpen(true),
      },
      {
        key: "board",
        label: "工单流转",
        count: openTasks.length,
        onClick: () => router.push("/workspace?tab=board"),
      },
      {
        key: "documents",
        label: "文档审批",
        count: pendingLeaderReviewCount + pendingTeacherReviewCount,
        onClick: () => router.push("/workspace?tab=documents"),
      },
      {
        key: "reports",
        label: "日程汇报",
        count: reportExpectedCount > 0 ? reportExpectedCount - reportSubmittedCount : 0,
        onClick: () => router.push("/workspace?tab=reports"),
      },
    ];

    const portalQuickEntries = [
      {
        title: currentRole === "member" || currentRole === "leader" ? "今日日程汇报" : "团队汇报进度",
        icon: CalendarDays,
        metric:
          currentRole === "member" || currentRole === "leader"
            ? myReportSubmitted
              ? "已提交"
              : "待提交"
            : `${reportSubmittedCount}/${reportExpectedCount || 0}`,
        detail:
          currentRole === "member" || currentRole === "leader"
            ? myReportSubmitted
              ? "今日汇报已完成，可继续查看任务推进。"
              : "建议先补齐今日完成与明日计划。"
            : reportExpectedCount > 0
              ? `今日已有 ${reportSubmittedCount} 人提交，还有 ${unsubmittedReportCount} 人待提交。`
              : "当前没有需要统计的团队汇报对象。",
        actionLabel: currentRole === "member" || currentRole === "leader" ? "进入汇报" : "查看汇报",
        onAction: () => router.push("/workspace?tab=reports"),
      },
      {
        title: "任务工单",
        icon: KanbanSquare,
        metric: `${openTasks.length} 项`,
        detail:
          quickCompletableTask && currentRole === "member"
            ? "你有可直接推进的个人工单，可快速标记处理状态。"
            : openTasks.length > 0
              ? "当前仍有工单流转中，建议查看处理进度。"
              : "当前没有未归档工单。",
        actionLabel: quickCompletableTask && currentRole === "member" ? "标记完成" : "进入工单",
        onAction: () => {
          if (quickCompletableTask && currentRole === "member") {
            void completeTaskFromOverview(quickCompletableTask);
            return;
          }
          router.push("/workspace?tab=board");
        },
      },
      {
        title: canReviewDocuments ? "文档审批" : "文档中心",
        icon: FolderOpen,
        metric: `${pendingLeaderReviewCount + pendingTeacherReviewCount} 份`,
        detail:
          canReviewDocuments
            ? pendingLeaderReviewCount + pendingTeacherReviewCount > 0
              ? "仍有材料待审批，建议尽快处理。"
              : "当前没有待审批材料。"
            : `当前共维护 ${documents.length} 份文档材料。`,
        actionLabel: "查看文档",
        onAction: () => router.push("/workspace?tab=documents"),
      },
      {
        title: "专家评审",
        icon: FileCheck,
        metric: reviewScoreCount > 0 ? `${reviewScoreCount} 条` : pendingExpertReviewCount > 0 ? "进行中" : "暂无",
        detail:
          reviewScoreCount > 0
            ? "已有评分和综合评语，可结合结果继续优化。"
            : pendingExpertReviewCount > 0
              ? "当前还有评审包正在评分中。"
              : "当前暂无可查看的评审结果。",
        actionLabel: "查看评审",
        onAction: () => router.push("/workspace?tab=review"),
      },
    ];

    const priorityFocusItems: PriorityFocusItem[] =
      currentRole === "member"
        ? [
            {
              tag: myReportSubmitted ? "clear" : "pending-action",
              text: myReportSubmitted ? "今日日程汇报已提交。" : "今日日程汇报还未提交，建议先补齐。",
              targetTab: "reports",
            },
            {
              tag: myOpenTasks.length > 0 ? "pending-action" : "clear",
              text:
                myOpenTasks.length > 0
                  ? `当前有 ${myOpenTasks.length} 项个人任务待推进。`
                  : "当前没有个人待办任务。",
              targetTab: "board",
            },
            {
              tag: pendingExpertReviewCount > 0 ? "pending-review" : reviewScoreCount > 0 ? "pending-view" : "clear",
              text:
                pendingExpertReviewCount > 0
                  ? `专家评审仍有 ${pendingExpertReviewCount} 项正在进行中。`
                  : reviewScoreCount > 0
                  ? `专家评审已有 ${reviewScoreCount} 条评分/评语可查看。`
                  : "当前暂无专家评审结果。",
              targetTab: "review",
            },
          ]
        : currentRole === "leader"
          ? [
            {
              tag: unsubmittedReportCount > 0 ? "pending-action" : "clear",
              text: unsubmittedReportCount > 0 ? `今天还有 ${unsubmittedReportCount} 人未提交汇报。` : "今天团队汇报已基本收齐。",
              targetTab: "reports",
            },
            {
              tag: openTasks.length > 0 ? "pending-action" : "clear",
              text: openTasks.length > 0 ? `工单台账仍有 ${openTasks.length} 项待推进。` : "工单台账当前没有未完成事项。",
              targetTab: "board",
            },
            {
              tag: pendingExpertReviewCount > 0 ? "pending-review" : reviewScoreCount > 0 ? "pending-view" : "clear",
              text:
                pendingExpertReviewCount > 0
                    ? `专家评审仍有 ${pendingExpertReviewCount} 项正在评分。`
                    : reviewScoreCount > 0
                      ? `专家评审已有 ${reviewScoreCount} 条评分/评语。`
                      : "专家评审结果暂未形成。",
              targetTab: "review",
            },
          ]
        : [
            {
              tag: pendingApprovalMembers.length > 0 ? "pending-approval" : "clear",
              text:
                pendingApprovalMembers.length > 0
                    ? `当前有 ${pendingApprovalMembers.length} 个账号等待审核。`
                    : "当前没有新的账号审核积压。",
              targetTab: "team",
            },
            {
              tag: pendingLeaderReviewCount + pendingTeacherReviewCount > 0 ? "pending-approval" : "clear",
              text:
                pendingLeaderReviewCount + pendingTeacherReviewCount > 0
                    ? `文档中心共有 ${pendingLeaderReviewCount + pendingTeacherReviewCount} 份材料待审批。`
                    : "文档中心当前没有待审批材料。",
              targetTab: "documents",
            },
            {
              tag: pendingExpertReviewCount > 0 ? "pending-review" : reviewScoreCount > 0 ? "pending-view" : "clear",
              text:
                pendingExpertReviewCount > 0
                    ? `专家评审仍有 ${pendingExpertReviewCount} 项正在进行中。`
                    : reviewScoreCount > 0
                      ? `专家评审已有 ${reviewScoreCount} 条评分/评语。`
                      : "专家评审暂无已提交评分。",
              targetTab: "review",
            },
          ];

    const keyEventItems = events.slice(0, 4);
    const quickActionEntries =
      currentRole === "expert"
        ? [
            { label: "评审任务", onClick: () => router.push("/workspace?tab=review") },
            { label: "训练中心", onClick: () => router.push("/workspace?tab=training") },
            { label: "待办中心", onClick: () => setNotificationsOpen(true) },
          ]
        : currentRole === "member"
          ? [
              { label: "任务工单", onClick: () => router.push("/workspace?tab=board") },
              { label: "文档中心", onClick: () => router.push("/workspace?tab=documents") },
              { label: "日程汇报", onClick: () => router.push("/workspace?tab=reports") },
            ]
          : [
              { label: "工单流转", onClick: () => router.push("/workspace?tab=board") },
              { label: "文档审批", onClick: () => router.push("/workspace?tab=documents") },
              { label: "日程汇报", onClick: () => router.push("/workspace?tab=reports") },
            ];

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="depth-mid flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-[var(--border-radius-lg)] px-4 py-3">
            <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
            <p className="truncate text-sm font-semibold text-slate-900">中国国际大学生创新大赛管理系统</p>
            <span className="depth-emphasis px-3 py-1 text-xs text-slate-500">
              南京铁道职业技术学院
            </span>
            <span className="depth-emphasis px-3 py-1 text-xs text-slate-500">
              {formatFriendlyDate(currentDateTime)}
            </span>
            <span className="depth-emphasis px-3 py-1 text-xs text-[#1a6fd4]">
              {currentUser?.roleLabel ?? roleLabels[currentRole]}
            </span>
            <span className="depth-emphasis px-3 py-1 text-xs text-slate-500">
              {portalScopeText}
            </span>
          </div>
        </div>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <article className="depth-card overflow-hidden rounded-[var(--border-radius-lg)]">
            <div className="border-b border-white/55 bg-white/18 px-6 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="depth-emphasis inline-flex items-center gap-2 px-3 py-1 text-xs font-medium tracking-[0.08em] text-[#1a6fd4]">
                    <span className="h-2 w-2 rounded-full bg-[#1a6fd4]" />
                    今日总览
                  </div>
                  <h3 className="mt-3 text-base font-medium text-[var(--color-text-secondary)]">
                    欢迎登录，{currentUser?.roleLabel ?? roleLabels[currentRole]}。
                  </h3>
                  <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--color-text-tertiary)]">
                    {hasGlobalAdminRole
                      ? "当前为全局管理视角，请优先关注账号审核、站内待办和公告发布。"
                      : currentRole === "teacher"
                        ? "当前聚合本队材料审批、团队汇报和关键节点，便于统一查看与督办。"
                        : currentRole === "leader"
                          ? "当前聚合本队工单流转、汇报进度和专家反馈，便于推进每日事务。"
                          : currentRole === "expert"
                            ? "当前展示评审任务、评分进度和关键提醒，便于集中完成专家评审。"
                            : "当前展示本队任务、今日日报和评审反馈，方便快速进入个人办理事项。"}
                  </p>
                </div>
                <button
                  className="depth-emphasis hidden shrink-0 px-4 py-2 text-sm font-medium text-[#1a6fd4] transition hover:-translate-y-px lg:inline-flex"
                  onClick={() => setNotificationsOpen(true)}
                  type="button"
                >
                  今日待办 {todoItemCount} 项 →
                </button>
              </div>
            </div>
            <div className="grid gap-3 px-6 py-4 md:grid-cols-3">
              {overviewMetrics.map((item) => (
                <article className={`stat-card ${item.isMuted ? "muted" : ""}`} key={item.label}>
                  <p className="label-top tracking-[0.08em]">{item.label}</p>
                  <p className="number tracking-[-0.03em]">{item.value}</p>
                  <p className="label-bottom leading-5">{item.guide}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="depth-card overflow-hidden rounded-[var(--border-radius-lg)]">
            <div className="border-b border-white/55 bg-white/18 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
                <h3 className="text-lg font-semibold text-slate-900">今日工作提示</h3>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {priorityFocusItems.map((item) => (
                <button
                  className="work-tip-item w-full text-left"
                  key={`${item.tag}-${item.text}`}
                  onClick={() => openOverviewTarget(item.targetTab)}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <span className={`work-tip-dot ${item.tag === "clear" ? "muted" : "actionable"}`} />
                    <p className="work-tip-text leading-6">{item.text}</p>
                  </div>
                </button>
              ))}
              <button
                className="depth-card flex w-full items-center justify-between rounded-[var(--border-radius-lg)] px-4 py-3 text-left transition"
                onClick={() => setNotificationsOpen(true)}
                type="button"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">进入待办中心</p>
                  <p className="mt-1 text-xs text-slate-500">统一查看待办、提醒与审批通知</p>
                </div>
                <span className={`pending-badge px-2.5 py-1 text-xs font-medium ${todoItemCount === 0 ? "muted" : ""}`}>
                  {todoItemCount} 项
                </span>
              </button>
            </div>
          </article>
        </section>

        <section className="mid-row grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_380px]">
          <article className="depth-card overflow-hidden rounded-[20px]">
            <div className="border-b border-white/55 bg-white/18 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
                  <h3 className="text-lg font-semibold text-slate-900">业务办理</h3>
                </div>
                <span className="text-xs text-slate-400">常用业务入口</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {businessTabs.map((item, index) => (
                  <button
                    className={`tab-item border-b-2 px-3 py-2 transition ${
                      index === 0
                        ? "active border-[#1a6fd4]"
                        : "border-transparent hover:text-[#1a6fd4]"
                    }`}
                    key={item.key}
                    onClick={item.onClick}
                    type="button"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                {portalQuickEntries.slice(0, 2).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="depth-card group rounded-2xl px-4 py-4 text-left transition"
                      key={item.title}
                      onClick={item.onAction}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="depth-emphasis flex h-11 w-11 items-center justify-center rounded-xl text-[#1a6fd4]">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-900">{item.metric}</p>
                          </div>
                        </div>
                        <span className="depth-emphasis px-2 py-1 text-xs text-slate-500 transition">
                          进入
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-500">{item.detail}</p>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {portalQuickEntries.slice(2).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="depth-subtle group rounded-2xl px-4 py-4 text-left transition"
                      key={item.title}
                      onClick={item.onAction}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="depth-emphasis flex h-10 w-10 items-center justify-center rounded-xl text-[#1a6fd4]">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 text-lg font-bold tracking-[-0.02em] text-slate-900">{item.metric}</p>
                          </div>
                        </div>
                        <span className="depth-emphasis px-2 py-1 text-xs text-slate-500 transition">
                          进入
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="quick-tips-card depth-subtle rounded-2xl border-dashed px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">快捷办理提示</p>
                    <p className="mt-1 text-sm text-slate-500">优先从待办事项进入，可减少重复查找模块的时间。</p>
                  </div>
                  <button
                    className="depth-emphasis inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#1a6fd4] transition"
                    onClick={() => setNotificationsOpen(true)}
                    type="button"
                  >
                    查看待办
                    <span className="pending-badge">{todoItemCount}项</span>
                  </button>
                </div>
                <div className="quick-actions-grid">
                  {quickActionEntries.map((item) => (
                    <button
                      className="quick-action-btn"
                      key={item.label}
                      onClick={item.onClick}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <div className="space-y-4">
            <article className="depth-card overflow-hidden rounded-[20px]">
              <div className="border-b border-white/55 bg-white/18 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
                    <h3 className="text-lg font-semibold text-slate-900">通知公告</h3>
                  </div>
                  <span className="text-xs text-slate-400">{announcements.length} 条</span>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {announcements.slice(0, 5).map((item) => (
                  <button
                    className="block w-full px-4 py-3 text-left transition hover:bg-white/35"
                    key={item.id}
                    onClick={() => setSelectedAnnouncement(item)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#1a6fd4]" />
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                            <span className="mt-2 inline-flex text-xs font-medium text-[#1a6fd4]">查看详情</span>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="depth-emphasis inline-flex px-2 py-1 text-xs text-slate-500">
                          通知公告
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
                {announcements.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-500">当前暂无公告。</div>
                ) : null}
              </div>
            </article>

            <article className="depth-card overflow-hidden rounded-[20px]">
              <div className="border-b border-white/55 bg-white/18 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
                    <h3 className="text-lg font-semibold text-slate-900">关键节点</h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${countdownStatus.className}`}>
                    {countdownStatus.label}
                  </span>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="depth-emphasis rounded-xl px-4 py-3">
                  <p className="text-xs text-slate-400">节点倒计时</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {nearestEvent
                      ? `距 ${nearestEvent.title} 还剩 ${countdown.days}天 ${countdown.hours}小时 ${countdown.minutes}分`
                      : "当前还没有配置关键节点"}
                  </p>
                </div>
                <div className="depth-subtle space-y-0 rounded-xl">
                  {keyEventItems.map((item, index) => (
                    <button
                      className={`block w-full px-4 py-3 text-left transition hover:bg-white/42 ${index !== keyEventItems.length - 1 ? "border-b border-white/55" : ""}`}
                      key={item.id}
                      onClick={() => router.push("/workspace?tab=timeline")}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#1a6fd4]" />
                          {index !== keyEventItems.length - 1 ? <span className="mt-1 h-10 w-px bg-[#1a6fd4]/18" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
                            <span className="shrink-0 text-xs text-slate-400">{formatDateTime(item.dateTime)}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="bottom-grid grid gap-4 xl:grid-cols-2">
          <article className="depth-card overflow-hidden rounded-[20px]">
            <div className="border-b border-white/55 bg-white/18 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
                <h3 className="text-lg font-semibold text-slate-900">今日任务摘要</h3>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {todayTaskSummaryTasks.length > 0 ? (
                todayTaskSummaryTasks.map((item) => {
                  const deadlineMeta = getOverviewDeadlineMeta(item.dueDate, currentDateTime);

                  return (
                    <div
                      key={item.id}
                      className="depth-subtle flex flex-col gap-3 rounded-xl px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`task-priority-rail ${deadlineMeta.tone}`} />
                        <div className="min-w-0 flex-1">
                          <p className="task-title leading-6 text-slate-900" title={item.title}>
                            {item.title}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="task-assignee-meta">负责人：{getTaskAssigneeName(item)}</span>
                            <span className={`task-deadline ${deadlineMeta.tone === "danger" ? "overdue" : deadlineMeta.tone === "warning" ? "warning" : ""}`} title={`截止时间：${formatDateTime(item.dueDate)}`}>
                              {deadlineMeta.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        className="task-summary-link shrink-0 self-start lg:self-center"
                        disabled={isSaving}
                        onClick={() =>
                          canMoveTask(item)
                            ? void completeTaskFromOverview(item)
                            : router.push("/workspace?tab=board")
                        }
                        type="button"
                      >
                        {canMoveTask(item) ? "勾选完成" : "查看工单"}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm leading-7 text-slate-500">当前暂无待处理任务。</p>
              )}
            </div>
          </article>

          <article className="depth-card overflow-hidden rounded-[20px]">
            <div className="border-b border-white/55 bg-white/18 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
                <h3 className="text-lg font-semibold text-slate-900">优先关注</h3>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="node-tip-banner">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="label">节点提示</p>
                    <p className="content">
                      {nearestEvent
                        ? `距 ${nearestEvent.title} 还剩 ${countdown.days > 0 ? `${countdown.days}天 ` : ""}${countdown.hours}小时`
                        : countdownStatus.hint}
                    </p>
                  </div>
                  <span className={`priority-focus-tag ${countdownTotalHours <= 24 ? "pending-review" : countdown.days <= 3 ? "pending-action" : "clear"}`}>
                    {countdownStatus.label}
                  </span>
                </div>
              </div>
              {priorityFocusItems.map((item) => (
                <div className="depth-subtle rounded-xl px-4 py-3" key={`${item.tag}-${item.text}`}>
                  <div className="flex items-start gap-3">
                    <span className={`priority-focus-tag ${priorityFocusTagMeta[item.tag].className}`}>
                      {priorityFocusTagMeta[item.tag].label}
                    </span>
                    <p className="text-sm leading-6 text-slate-500">{item.text}</p>
                  </div>
                </div>
              ))}
              <button
                className="task-summary-footer-link"
                onClick={() => setNotificationsOpen(true)}
                type="button"
              >
                查看全部通知
              </button>
            </div>
          </article>
        </section>
      </div>
    );
  };

  return renderOverview();
}
