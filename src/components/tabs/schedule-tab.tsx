"use client";

import * as Workspace from "@/components/workspace-context";

export default function ScheduleTab() {
  const {
    teamGroups,
    reportEntriesByDay,
    selectedDate,
    setSelectedDate,
    selectedReportTeamGroupId,
    setSelectedReportTeamGroupId,
    reportDeleteTeamGroupId,
    setReportDeleteTeamGroupId,
    hasGlobalAdminRole,
    currentMemberId,
    permissions,
    reportEntryMap,
    todayDateKey,
    visibleReportMembers,
    reportDateOptions,
    selectedReportSubmittedCount,
    selectedReportExpectedCount,
    selectedReportMissingCount,
    currentUserSelectedReport,
    selectedDateHasSavedReports,
    sendReportReminder,
    openCreateReportModal,
    openEditReportModal,
    removeReport,
    removeTeamReports,
  } = Workspace.useWorkspaceContext();

  const {
    BellPlus,
    CalendarDays,
    getReportAttachmentNote,
    surfaceCardClassName,
    fieldClassName,
    formatShortDate,
    SectionHeader,
    EmptyState,
    ActionButton,
  } = Workspace;

const renderReports = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description={
            permissions.canViewAllReports
              ? "按日期查看团队汇报归档，历史记录会一直保留，可随时回看。"
              : "按日期查看自己的历史汇报，已提交内容会持续保存。"
          }
          title="日程汇报"
        />
      </div>

      <section className={surfaceCardClassName}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="report-filter-column flex h-full flex-col space-y-4 self-stretch">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">选择查看日期</p>
                <p className="mt-1 text-sm text-slate-500">
                  可以直接选择过去任意一天；有保存记录的日期会在下方显示。
                </p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                {hasGlobalAdminRole ? (
                  <label className="block w-full md:min-w-56 text-sm font-medium text-slate-600">
                    项目组
                    <select
                      className={`${fieldClassName} mt-1.5`}
                      value={selectedReportTeamGroupId}
                      onChange={(event) => setSelectedReportTeamGroupId(event.target.value)}
                    >
                      <option value="">全部项目组</option>
                      {teamGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="block w-full md:min-w-56 text-sm font-medium text-slate-600">
                  日期
                  <input
                    className={`${fieldClassName} mt-1.5`}
                    max={todayDateKey}
                    type="date"
                    value={selectedDate}
                    onChange={(event) => {
                      if (event.target.value) {
                        setSelectedDate(event.target.value);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
              {reportDateOptions.slice(0, 10).map((date) => {
                const hasReport = (reportEntriesByDay[date] ?? []).length > 0;
                const isSelected = date === selectedDate;

                return (
                  <button
                    className={`report-date-chip ${isSelected ? "selected" : ""} ${hasReport ? "has-record" : "muted"}`}
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    type="button"
                  >
                    {date === todayDateKey ? "今天" : formatShortDate(date)}
                    {hasReport ? <span className="report-date-dot" /> : null}
                  </button>
                );
              })}
            </div>
            {hasGlobalAdminRole ? (
              <div className="report-record-legend mt-auto rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-sm font-medium text-slate-700">日期标签说明</p>
                <p className="mt-1 text-sm text-slate-500">
                  右上角带蓝点代表该日期已有汇报记录；未标记的日期表示当前还没有保存内容。
                </p>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm text-slate-500">当前日期</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">{formatShortDate(selectedDate)}</h3>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="report-stat-card expected">
                  <p className="text-xs text-slate-400">应提交</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{selectedReportExpectedCount}</p>
                </div>
                <div className="report-stat-card submitted">
                  <p className="text-xs text-slate-400">已提交</p>
                  <p className="mt-1 text-lg font-semibold">{selectedReportSubmittedCount}</p>
                </div>
                <div className="report-stat-card missing">
                  <p className="text-xs text-slate-400">未提交</p>
                  <p className="mt-1 text-lg font-semibold">{selectedReportMissingCount}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width:
                      selectedReportExpectedCount > 0
                        ? `${Math.round((selectedReportSubmittedCount / selectedReportExpectedCount) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
            <div className="report-stats-divider" />
            {permissions.canSubmitReport ? (
              <ActionButton
                className="mt-4 w-full justify-center"
                onClick={() =>
                  currentUserSelectedReport
                    ? openEditReportModal(currentUserSelectedReport)
                    : openCreateReportModal()
                }
                variant="primary"
              >
                {currentUserSelectedReport ? "修改我的汇报" : "提交这天汇报"}
              </ActionButton>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                当前角色只查看归档，不需要提交汇报。
              </p>
            )}
            {hasGlobalAdminRole ? (
              <div className="report-admin-danger-zone mt-4">
                <p className="text-xs font-semibold text-rose-700">管理员清理</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  只删除指定项目组在当前日期的汇报记录。
                </p>
                <select
                  className={`${fieldClassName} mt-2`}
                  value={reportDeleteTeamGroupId}
                  onChange={(event) => setReportDeleteTeamGroupId(event.target.value)}
                >
                  <option value="">选择项目组</option>
                  {teamGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <ActionButton
                  className="mt-2 w-full justify-center"
                  disabled={!reportDeleteTeamGroupId}
                  onClick={removeTeamReports}
                  variant="secondary"
                >
                  删除该组本日汇报
                </ActionButton>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {visibleReportMembers.length > 0 ? (
          visibleReportMembers.map((member) => {
            const report = reportEntryMap.get(member.id);
            const attachmentNote = getReportAttachmentNote(report?.attachment);

            return (
              <article
                key={member.id}
                className={`${surfaceCardClassName} overflow-hidden p-0`}
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{member.name}</h3>
                      <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                        {member.systemRole}
                      </span>
                      {member.teamGroupName ? (
                        <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                          {member.teamGroupName}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-500">提交人：{member.name}</p>
                  </div>
                  {report ? (
                    <span className="shrink-0 rounded-md bg-blue-50 px-3 py-1 text-sm text-blue-600">
                      已提交 {report.submittedAt}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-md bg-red-50 px-3 py-1 text-sm text-red-700">
                      未提交
                    </span>
                  )}
                </div>

                <div className="p-5">
                  {report ? (
                    <>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-400">今日完成</p>
                          <p className="mt-2 text-sm leading-7 text-slate-700">{report.summary}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-400">明日计划</p>
                          <p className="mt-2 text-sm leading-7 text-slate-700">{report.nextPlan}</p>
                        </div>
                      </div>
                      {attachmentNote ? (
                        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                          附件备注：{attachmentNote}
                        </p>
                      ) : null}
                      {member.id === currentMemberId && permissions.canSubmitReport ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <ActionButton onClick={() => openEditReportModal(report)}>修改汇报</ActionButton>
                          <ActionButton onClick={() => removeReport(report.date)} variant="danger">
                            撤回汇报
                          </ActionButton>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
                      <p className="text-sm font-semibold text-slate-700">这一天还没有汇报</p>
                      <p className="mt-2 text-sm leading-7 text-slate-500">
                        {member.id === currentMemberId && permissions.canSubmitReport
                          ? "可以补交这一天的工作汇报，保存后会进入历史记录。"
                          : `该成员在 ${formatShortDate(selectedDate)} 尚未提交当日汇报。`}
                      </p>
                      {permissions.canSendDirective && member.id !== currentMemberId ? (
                        <ActionButton
                          className="report-remind-button mt-3"
                          onClick={() => sendReportReminder(member)}
                        >
                          <BellPlus className="h-4 w-4" />
                          发送提醒
                        </ActionButton>
                      ) : null}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <div className="xl:col-span-2">
            <EmptyState
              description="当前日期下还没有可展示的汇报记录，提交后会集中显示在这里。"
              icon={CalendarDays}
              title="暂无汇报记录"
            />
          </div>
        )}
      </section>

      {!selectedDateHasSavedReports && visibleReportMembers.length > 0 ? (
        <p className="report-empty-hint text-center text-sm text-slate-400">
          {formatShortDate(selectedDate)} 暂无保存记录。选择其他历史日期，或点击“提交这天汇报”补录保存。
        </p>
      ) : null}
    </div>
  );

  return renderReports();
}
