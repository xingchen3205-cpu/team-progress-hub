"use client";

import { useEffect, useMemo, useState } from "react";
import type { TeamRoleLabel } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

export default function TeamTab() {
  const {
    teamGroups,
    setTeamSearch,
    teamRoleFilter,
    setTeamRoleFilter,
    teamGroupFilter,
    setTeamGroupFilter,
    approvalGroupDrafts,
    setApprovalGroupDrafts,
    teamAiFilter,
    setTeamAiFilter,
    teamAccountView,
    setTeamAccountView,
    teamAiSelectedIds,
    setTeamAiSelectedIds,
    teamAiPage,
    setTeamAiPage,
    aiBatchQuotaDraft,
    setAiBatchQuotaDraft,
    isSaving,
    setTeamModalOpen,
    teamGroupDraft,
    setTeamGroupDraft,
    editingTeamGroupId,
    setBatchExpertModalOpen,
    aiPermissionItems,
    aiPermissionDrafts,
    aiPermissionsLoading,
    aiPermissionsMessage,
    aiPermissionSavingId,
    aiPermissionBatchSaving,
    editingTeamRowId,
    editingTeamRowRole,
    setEditingTeamRowRole,
    editingTeamRowGroupId,
    setEditingTeamRowGroupId,
    isSystemAdmin,
    hasGlobalAdminRole,
    permissions,
    loadAiPermissions,
    saveAiPermission,
    flushAiPermissionSave,
    updateAiPermissionDraft,
    confirmBatchAiPermissionUpdate,
    canManageMember,
    canResetMemberPassword,
    canDeleteMemberAccount,
    availableRoleOptions,
    canViewExpertAccounts,
    canViewTeamAccountIdentifiers,
    aiPermissionMap,
    visibleCoreTeamMembers,
    visibleExpertAccountMembers,
    activeTeamMembers,
    canUseTeamGroups,
    isEditingRoleTeamGroupAssignable,
    showTeamActions,
    teamListGridClassName,
    teamFilterOptions,
    teamPageCount,
    displayedTeamMembers,
    allVisibleAiSelected,
    teamAiStats,
    canBatchCreateExperts,
    canManageExpertProfiles,
    expertProfiles,
    pendingApprovalMembers,
    canSendDirectiveToMember,
    openReminderModal,
    openEmailSettingsModal,
    openSentRemindersModal,
    saveTeamGroup,
    editTeamGroup,
    cancelEditTeamGroup,
    deleteTeamGroup,
    confirmApproveMemberRegistration,
    openTeamRowEditor,
    cancelTeamRowEditor,
    saveTeamRowEditor,
    openPasswordModal,
    removeMember,
    rejectMemberRegistration,
    openExpertProfileModal,
    deleteExpertProfile,
    openExpertProfileAccount,
  } = Workspace.useWorkspaceContext();

  const {
    BellPlus,
    Check,
    HelpCircle,
    Pencil,
    Plus,
    RotateCcw,
    Shuffle,
    Trash2,
    Users,
    X,
    teamRoleTagClassNames,
    EmptyState,
    ActionButton,
    UserAvatar,
  } = Workspace;

  const isExpertAccountView = teamAccountView === "experts";
  const [expertProfileSearch, setExpertProfileSearch] = useState("");
  const expertProfileSearchText = (isExpertAccountView ? expertProfileSearch : "").trim().toLowerCase();
  const filteredExpertProfiles = useMemo(() => {
    if (!expertProfileSearchText) {
      return expertProfiles;
    }

    return expertProfiles.filter((profile) =>
      [
        profile.name,
        profile.phone,
        profile.email,
        profile.organization,
        profile.title,
        profile.specialtyText,
        profile.notes,
        profile.linkedUser?.username,
        ...profile.specialtyTags,
        ...profile.specialtyTracks,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(expertProfileSearchText),
    );
  }, [expertProfileSearchText, expertProfiles]);

  useEffect(() => {
    setTeamSearch("");
  }, [setTeamSearch]);

const renderTeam = () => (
    <div className="team-page-shell">
      <div className="team-page-top">
        <div>
          <h1>团队管理</h1>
          {permissions.canManageTeam ? (
            <p className="sub">支持创建直属账号，并对自助注册的下级账号执行审核通过。</p>
          ) : null}
        </div>
        <div className="team-page-actions">
          {permissions.canSendDirective ? (
            <ActionButton className="team-toolbar-secondary" onClick={openSentRemindersModal}>
              <span className="inline-flex items-center gap-2">
                <BellPlus className="h-4 w-4" />
                <span>邮件提醒</span>
              </span>
            </ActionButton>
          ) : null}
          {hasGlobalAdminRole ? (
            <ActionButton className="team-toolbar-secondary" onClick={() => void openEmailSettingsModal()}>
              <span className="inline-flex items-center gap-2">
                <BellPlus className="h-4 w-4" />
                <span>邮件设置</span>
              </span>
            </ActionButton>
          ) : null}
          {canBatchCreateExperts ? (
            <ActionButton className="team-toolbar-secondary" onClick={() => setBatchExpertModalOpen(true)}>
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>批量添加专家</span>
              </span>
            </ActionButton>
          ) : null}
          {permissions.canManageTeam ? (
            <ActionButton onClick={() => setTeamModalOpen(true)} variant="primary">
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>创建账号</span>
              </span>
            </ActionButton>
          ) : null}
        </div>
      </div>

      {pendingApprovalMembers.length > 0 ? (
        <section className="space-y-4">
          <div className="team-pending-alert">
            当前有 {pendingApprovalMembers.length} 个账号待你审核，通过后对方才能登录系统。
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {pendingApprovalMembers.map((member) => (
              <article key={`pending-${member.id}`} className="team-management-card">
                <div className="flex items-start gap-4">
                  <UserAvatar
                    avatar={member.avatar}
                    avatarUrl={member.avatarUrl}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-base font-semibold text-white"
                    name={member.name}
                    textClassName="text-base font-semibold text-white"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{member.name}</h3>
                        {!member.accountHidden ? (
                          <p className="mt-2 text-sm text-slate-500">账号：{member.account}</p>
                        ) : null}
                      </div>
                      <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                        待{member.pendingApproverLabel ?? "上级"}审核
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs text-slate-400">申请身份</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">{member.systemRole}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs text-slate-400">账号状态</p>
                        <p className="mt-1 text-sm font-medium text-amber-700">{member.approvalStatusLabel}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs text-slate-400">学院 / 部门</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">{member.college || "未填写"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs text-slate-400">{member.systemRole === "指导教师" ? "工号" : "班级 / 学号"}</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">
                          {member.systemRole === "指导教师"
                            ? member.employeeId || "未填写"
                            : [member.className, member.studentId].filter(Boolean).join(" / ") || "未填写"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3">
                        <p className="text-xs text-emerald-600">邮箱验证</p>
                        <p className="mt-1 text-sm font-medium text-emerald-700">
                          {member.emailVerifiedAt ? "邮箱已验证" : "邮箱未验证"}
                        </p>
                      </div>
                      <label className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-slate-600">
                        审核分组
                        <select
                          className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          value={approvalGroupDrafts[member.id] ?? ""}
                          onChange={(event) =>
                            setApprovalGroupDrafts((current) => ({
                              ...current,
                              [member.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">请选择项目组</option>
                          {teamGroups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <ActionButton
                        loading={isSaving}
                        loadingLabel="审核中..."
                        onClick={() => confirmApproveMemberRegistration(member)}
                        variant="primary"
                      >
                        审核通过
                      </ActionButton>
                      <ActionButton
                        disabled={isSaving}
                        onClick={() => rejectMemberRegistration(member)}
                        variant="danger"
                      >
                        驳回删除
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {hasGlobalAdminRole ? (
        <section className="team-management-card">
          <div className="team-card-head">
            <div>
              <h3 className="team-section-title">团队分组</h3>
              <p className="team-card-desc">
                全局管理员可见，可按学校、项目组等维度管理教师、负责人和成员；评审专家账号不参与分组。
              </p>
            </div>
            <span className="team-card-count">
              {teamGroups.length} 个分组
            </span>
          </div>

          <div className="team-group-form">
            <label className="team-form-label">
              <span>分组名称</span>
              <input
                className="team-form-input"
                placeholder="例如：南铁院 / 智轨灯塔项目组"
                value={teamGroupDraft.name}
                onChange={(event) => setTeamGroupDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="team-form-label">
              <span>说明（选填）</span>
              <input
                className="team-form-input"
                placeholder="可填写学校、项目方向或管理备注"
                value={teamGroupDraft.description}
                onChange={(event) =>
                  setTeamGroupDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <div className="flex items-end">
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  loading={isSaving}
                  loadingLabel={editingTeamGroupId ? "保存中..." : "创建中..."}
                  onClick={saveTeamGroup}
                  variant="primary"
                >
                  {editingTeamGroupId ? "保存修改" : "新建分组"}
                </ActionButton>
                {editingTeamGroupId ? (
                  <ActionButton disabled={isSaving} onClick={cancelEditTeamGroup}>
                    取消编辑
                  </ActionButton>
                ) : null}
              </div>
            </div>
          </div>

          {teamGroups.length > 0 ? (
            <div className="team-group-chips">
              {teamGroups.map((group) => (
                <div
                  className="team-group-chip"
                  key={group.id}
                >
                  <span className="team-group-name">{group.name}</span>
                  <span className="team-group-count-badge">{group.memberCount} 人</span>
                  <button
                    className="team-icon-button"
                    onClick={() => editTeamGroup(group)}
                    title="编辑分组"
                    type="button"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="team-icon-button danger"
                    onClick={() => deleteTeamGroup(group)}
                    title="删除分组"
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="team-empty-inline">
              暂无分组。可以先按学校或项目组创建，再在账号列表里分配成员。
            </div>
          )}
        </section>
      ) : null}

      {canManageExpertProfiles && isExpertAccountView ? (
        <section className="team-management-card">
          <div className="team-card-head">
            <div>
              <h3 className="team-section-title">专家库</h3>
              <p className="team-card-desc">
                先沉淀专家姓名、单位、职务、专业领域和擅长赛道；需要参与评审时再开通专家账号。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="team-card-count">
                {expertProfileSearchText
                  ? `${filteredExpertProfiles.length} / ${expertProfiles.length} 位专家`
                  : `${expertProfiles.length} 位专家`}
              </span>
              <ActionButton onClick={() => openExpertProfileModal()} variant="primary">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>录入专家</span>
                </span>
              </ActionButton>
            </div>
          </div>

          {expertProfiles.length > 0 ? (
            <div className="mt-4">
              <label className="sr-only" htmlFor="expert-profile-search">搜索专家库</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                id="expert-profile-search"
                onChange={(event) => setExpertProfileSearch(event.target.value)}
                placeholder="搜索姓名、单位、领域或赛道"
                type="search"
                value={expertProfileSearch}
              />
            </div>
          ) : null}

          {expertProfiles.length > 0 ? (
            filteredExpertProfiles.length > 0 ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {filteredExpertProfiles.map((profile) => (
                <article className="rounded-2xl border border-slate-200 bg-white p-4" key={profile.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-base font-semibold text-slate-900">{profile.name}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          profile.linkedUserId ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}>
                          {profile.accountStatus}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {[profile.organization, profile.title].filter(Boolean).join(" · ") || "单位和职务待补充"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="team-icon-button primary"
                        onClick={() => openExpertProfileModal(profile)}
                        title="编辑专家档案"
                        type="button"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!profile.linkedUserId ? (
                        <button
                          className="team-icon-button danger"
                          onClick={() => deleteExpertProfile(profile)}
                          title="删除专家档案"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                      <p className="text-xs text-slate-400">专业领域</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {profile.specialtyTags.length > 0 ? profile.specialtyTags.join("、") : "待补充"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                      <p className="text-xs text-slate-400">擅长赛道</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {profile.specialtyTracks.length > 0 ? profile.specialtyTracks.join("、") : "待补充"}
                      </p>
                    </div>
                  </div>

                  {profile.specialtyText ? (
                    <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-700">
                      {profile.specialtyText}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <span>
                      {profile.email || profile.phone
                        ? [profile.email, profile.phone].filter(Boolean).join(" · ")
                        : "联系方式待补充"}
                    </span>
                    {profile.linkedUser ? (
                      <span>账号：{profile.linkedUser.username}</span>
                    ) : (
                      <ActionButton disabled={isSaving} onClick={() => void openExpertProfileAccount(profile)}>
                        开通账号
                      </ActionButton>
                    )}
                  </div>
                </article>
              ))}
            </div>
            ) : (
              <div className="team-empty-inline mt-4">
                未找到匹配专家。可以按姓名、单位、专业领域或擅长赛道继续搜索。
              </div>
            )
          ) : (
            <div className="team-empty-inline">
              暂无专家档案。建议先录入专家资料，后续评审前再按需开通账号。
            </div>
          )}
        </section>
      ) : null}

      <section className="team-management-card p-0 overflow-hidden">
        <div className="team-account-header">
          <div className="team-card-head">
            <div>
              <h3 className="team-section-title">
                {isExpertAccountView ? "评审专家账号" : "团队账号"}
              </h3>
              <p className="team-card-desc">
                {isExpertAccountView
                  ? "专家账号不参与项目组分组，也不开放 AI 助手权限；仅用于专家评审登录与评分。"
                  : canViewTeamAccountIdentifiers
                    ? "普通团队账号与评审专家分开管理，避免权限和操作混在一起。"
                    : "仅显示你所在团队的人员姓名与角色，不展示账号名。"}
              </p>
            </div>
          </div>

          <div className="team-filter-bar">
              <label className="text-sm text-slate-500">
                <span className="sr-only">按角色筛选</span>
                <select
                  className="team-filter-select"
                  value={teamRoleFilter}
                  onChange={(event) => setTeamRoleFilter(event.target.value as "全部" | TeamRoleLabel)}
                >
                  {teamFilterOptions.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {roleOption === "全部" ? "全部角色" : roleOption}
                    </option>
                  ))}
                </select>
              </label>
              {!isExpertAccountView && hasGlobalAdminRole ? (
                <label className="text-sm text-slate-500">
                  <span className="sr-only">按 AI 权限筛选</span>
                  <select
                    className="team-filter-select"
                    value={teamAiFilter}
                    onChange={(event) => setTeamAiFilter(event.target.value as "全部" | "已开启" | "已关闭")}
                  >
                    {["全部", "已开启", "已关闭"].map((filterOption) => (
                      <option key={filterOption} value={filterOption}>
                        {filterOption === "全部" ? "全部 AI 状态" : filterOption}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!isExpertAccountView && canUseTeamGroups ? (
                <label className="text-sm text-slate-500">
                  <span className="sr-only">按分组筛选</span>
                  <select
                    className="team-filter-select"
                    value={teamGroupFilter}
                    onChange={(event) => setTeamGroupFilter(event.target.value)}
                  >
                    <option value="全部">全部分组</option>
                    <option value="未分组">未分组</option>
                    {teamGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!isExpertAccountView && hasGlobalAdminRole ? (
                <ActionButton disabled={aiPermissionsLoading} onClick={() => void loadAiPermissions()}>
                  <span className="inline-flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    <span>刷新 AI</span>
                  </span>
                </ActionButton>
              ) : null}
          </div>

          <div className="team-account-tabs">
            {[
              { key: "team", label: "团队账号", count: visibleCoreTeamMembers.length },
              ...(canViewExpertAccounts
                ? [{ key: "experts", label: "评审专家", count: visibleExpertAccountMembers.length }]
                : []),
            ].map((item) => (
              <button
                className={`team-account-tab ${
                  teamAccountView === item.key
                    ? "active"
                    : ""
                }`}
                key={item.key}
                onClick={() => setTeamAccountView(item.key as "team" | "experts")}
                type="button"
              >
                {item.label}
                <span className="team-tab-count ml-2">
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="team-filter-info">
            <span>
              当前共 {activeTeamMembers.length} 个账号
            </span>
            <span className="highlight">
              已筛选 {displayedTeamMembers.length} 个结果
            </span>
            {pendingApprovalMembers.length > 0 ? (
              <span className="warning">
                待审核 {pendingApprovalMembers.length} 个
              </span>
            ) : null}
            {!isExpertAccountView && canUseTeamGroups && teamGroupFilter !== "全部" ? (
              <span className="success">
                分组：{teamGroupFilter === "未分组"
                  ? "未分组"
                  : teamGroups.find((group) => group.id === teamGroupFilter)?.name ?? "已筛选"}
              </span>
            ) : null}
          </div>
          {!isExpertAccountView && hasGlobalAdminRole ? (
            <div className="team-stat-grid">
              <div className="team-mini-stat">
                <p>总成员数</p>
                <strong>{teamAiStats.totalMembers} 人</strong>
              </div>
              <div className="team-mini-stat success">
                <p>已开启 AI</p>
                <strong>{teamAiStats.enabledCount} 人</strong>
              </div>
              <div className="team-mini-stat warning">
                <p>累计已用</p>
                <strong>{teamAiStats.usedTotal} 次</strong>
              </div>
              <div className="team-mini-stat ink">
                <p>总配额消耗</p>
                <strong>
                  {teamAiStats.quotaUsed} / {teamAiStats.quotaTotal == null ? "∞" : `${teamAiStats.quotaTotal}`}
                </strong>
              </div>
            </div>
          ) : isExpertAccountView ? (
            <div className="team-stat-grid expert">
              <div className="team-expert-summary-card">
                <p>专家账号</p>
                <strong>{displayedTeamMembers.length} 人</strong>
              </div>
              <div className="team-expert-summary-card muted">
                <p>权限说明</p>
                <strong>仅开放专家评审，不参与分组和 AI 助手。</strong>
              </div>
            </div>
          ) : null}
        </div>

        {!isExpertAccountView && aiPermissionsMessage ? (
          <div className="border-b border-slate-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            {aiPermissionsMessage}
          </div>
        ) : null}

        {hasGlobalAdminRole ? (
          <>
            {!isExpertAccountView && teamAiSelectedIds.length > 0 ? (
              <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 border-b border-blue-200 bg-blue-50 px-5 py-3 text-sm text-blue-700">
                <span>已选 {teamAiSelectedIds.length} 人</span>
                <ActionButton
                  disabled={aiPermissionBatchSaving}
                  onClick={() =>
                    confirmBatchAiPermissionUpdate(teamAiSelectedIds, {
                      confirmLabel: "批量开启",
                      message: `确认批量开启 ${teamAiSelectedIds.length} 个账号的 AI 权限吗？`,
                      successTitle: "已批量开启 AI 权限",
                      updater: (draft) => ({ ...draft, isEnabled: true }),
                    })
                  }
                  variant="primary"
                >
                  批量开启权限
                </ActionButton>
                <ActionButton
                  disabled={aiPermissionBatchSaving}
                  onClick={() =>
                    confirmBatchAiPermissionUpdate(teamAiSelectedIds, {
                      confirmLabel: "批量关闭",
                      message: `确认批量关闭 ${teamAiSelectedIds.length} 个账号的 AI 权限吗？`,
                      successTitle: "已批量关闭 AI 权限",
                      updater: (draft) => ({ ...draft, isEnabled: false }),
                    })
                  }
                >
                  批量关闭权限
                </ActionButton>
                <ActionButton
                  disabled={aiPermissionBatchSaving}
                  onClick={() => {
                    const input = window.prompt("请输入统一次数上限，留空表示不限次数", aiBatchQuotaDraft);
                    if (input == null) {
                      return;
                    }
                    setAiBatchQuotaDraft(input);
                    confirmBatchAiPermissionUpdate(teamAiSelectedIds, {
                      confirmLabel: "批量设置",
                      message: `确认把选中账号的 AI 次数配额统一设置为「${input.trim() || "不限"}」吗？`,
                      successTitle: "已批量更新 AI 配额",
                      updater: (draft) => ({ ...draft, maxCount: input.trim() }),
                    });
                  }}
                >
                  批量设置次数
                </ActionButton>
                <ActionButton
                  disabled={aiPermissionBatchSaving}
                  onClick={() =>
                    confirmBatchAiPermissionUpdate(teamAiSelectedIds, {
                      confirmLabel: "批量重置",
                      message: `确认重置选中账号的 AI 已用次数吗？`,
                      successTitle: "已批量重置 AI 次数",
                      resetUsage: true,
                      updater: (draft) => draft,
                    })
                  }
                >
                  批量重置次数
                </ActionButton>
              </div>
            ) : null}

            {!isExpertAccountView && aiPermissionsLoading && aiPermissionItems.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">正在加载 AI 权限数据...</div>
            ) : displayedTeamMembers.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="team-account-table min-w-full table-fixed">
                    <thead>
                      <tr>
                        {!isExpertAccountView ? (
                          <th className="w-12 px-3 py-3 text-left">
                            <input
                              checked={allVisibleAiSelected}
                              onChange={(event) =>
                                setTeamAiSelectedIds((current) =>
                                  event.target.checked
                                    ? Array.from(new Set([...current, ...displayedTeamMembers.map((member) => member.id)]))
                                    : current.filter((id) => !displayedTeamMembers.some((member) => member.id === id))
                                )
                              }
                              type="checkbox"
                            />
                          </th>
                        ) : null}
                        <th className="px-3 py-3 text-left">成员</th>
                        <th className="w-28 px-3 py-3 text-left">{!isExpertAccountView ? "权限开关" : "账号状态"}</th>
                        {!isExpertAccountView ? (
                          <>
                            <th className="w-28 px-3 py-3 text-left">
                              <span className="inline-flex items-center gap-1">
                                次数配额
                                <span title="留空表示不限次数">
                                  <HelpCircle className="h-3.5 w-3.5" />
                                </span>
                              </span>
                            </th>
                            <th className="w-28 px-3 py-3 text-left">已用 / 配额</th>
                          </>
                        ) : null}
                        <th className="w-[200px] px-3 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedTeamMembers.map((member, index) => {
                        const editable = canManageMember(member);
                        const isSystemAccount = member.systemRole === "系统管理员";
                        const isSchoolAdminAccount = member.systemRole === "校级管理员";
                        const protectedGlobalAccount = isSystemAccount || (isSchoolAdminAccount && !isSystemAdmin);
                        const groupAssignmentLocked = isSystemAccount || isSchoolAdminAccount;
                        const roleDisabled = !editable || protectedGlobalAccount;
                        const permissionItem = aiPermissionMap.get(member.id);
                        const draft = aiPermissionDrafts[member.id] ?? {
                          isEnabled: permissionItem?.isEnabled ?? false,
                          maxCount: permissionItem?.maxCount == null ? "" : String(permissionItem.maxCount),
                        };

                        return (
                          <tr
                            className={`${index % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"} hover:bg-[#F0F7FF]`}
                            key={member.id}
                          >
                            {!isExpertAccountView ? (
                              <td className="px-3 py-3 align-top">
                                <input
                                  checked={teamAiSelectedIds.includes(member.id)}
                                  onChange={(event) =>
                                    setTeamAiSelectedIds((current) =>
                                      event.target.checked
                                        ? [...current, member.id]
                                        : current.filter((id) => id !== member.id)
                                    )
                                  }
                                  type="checkbox"
                                />
                              </td>
                            ) : null}
                            <td className="px-3 py-3 align-top">
                              <div className="flex items-start gap-3">
                                <UserAvatar
                                  avatar={member.avatar}
                                  avatarUrl={member.avatarUrl}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
                                  name={member.name}
                                  textClassName="text-sm font-semibold text-white"
                                />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-slate-900">{member.name}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${teamRoleTagClassNames[member.systemRole]}`}>
                                      {member.systemRole}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                    {!member.accountHidden ? <span>账号：{member.account}</span> : null}
                                    <span>
                                      {member.systemRole === "评审专家"
                                        ? "专家账号"
                                        : `分组：${member.teamGroupName ?? "未分组"}`}
                                    </span>
                                    <span>{isSystemAccount ? "系统保留账号" : isSchoolAdminAccount ? "全局管理员" : "已启用"}</span>
                                  </div>

                                  {editingTeamRowId === member.id ? (
                                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                                      <select
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                        disabled={roleDisabled}
                                        value={editingTeamRowRole ?? member.systemRole}
                                        onChange={(event) => setEditingTeamRowRole(event.target.value as TeamRoleLabel)}
                                      >
                                        {availableRoleOptions.map((roleOption) => (
                                          <option key={roleOption} value={roleOption}>
                                            {roleOption}
                                          </option>
                                        ))}
                                      </select>
                                      {!isEditingRoleTeamGroupAssignable(member) ? (
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                                          全局角色不分配项目组
                                        </div>
                                      ) : (
                                        <select
                                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                                          disabled={!canUseTeamGroups || groupAssignmentLocked}
                                          value={editingTeamRowGroupId}
                                          onChange={(event) => setEditingTeamRowGroupId(event.target.value)}
                                        >
                                          <option value="">未分组</option>
                                          {teamGroups.map((group) => (
                                            <option key={group.id} value={group.id}>
                                              {group.name}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              {!isExpertAccountView ? (
                                <button
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                    draft.isEnabled ? "bg-[#2563EB]" : "bg-slate-300"
                                  }`}
                                  disabled={aiPermissionSavingId === member.id || aiPermissionBatchSaving}
                                  onClick={() =>
                                    updateAiPermissionDraft(
                                      member.id,
                                      { isEnabled: !draft.isEnabled },
                                      { autoSave: true },
                                    )
                                  }
                                  type="button"
                                >
                                  <span
                                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                                      draft.isEnabled ? "translate-x-5" : "translate-x-0.5"
                                    }`}
                                  />
                                </button>
                              ) : (
                                <span className="system-status-tag expert">已启用</span>
                              )}
                            </td>
                            {!isExpertAccountView ? (
                              <>
                                <td className="px-3 py-3 align-top">
                                  <input
                                    className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    inputMode="numeric"
                                    onBlur={() => flushAiPermissionSave(member.id)}
                                    onChange={(event) => updateAiPermissionDraft(member.id, { maxCount: event.target.value })}
                                    placeholder="不限"
                                    type="text"
                                    value={draft.maxCount}
                                  />
                                </td>
                                <td className="px-3 py-3 align-top text-sm text-slate-600">
                                  <div className="font-medium">
                                    {permissionItem?.usedCount ?? 0} / {permissionItem?.maxCount == null ? "∞" : permissionItem.maxCount}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-400">
                                    剩余 {permissionItem?.remainingCount == null ? "∞" : permissionItem.remainingCount}
                                  </div>
                                </td>
                              </>
                            ) : null}
                            <td className="px-3 py-3 align-top">
                              <div className="flex flex-wrap justify-end gap-2">
                                {permissions.canManageTeam && editable && !protectedGlobalAccount && editingTeamRowId !== member.id ? (
                                  <button
                                    className="team-icon-button primary"
                                    onClick={() => openTeamRowEditor(member)}
                                    title="编辑角色和分组"
                                    type="button"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                {permissions.canManageTeam && editingTeamRowId === member.id ? (
                                  <>
                                    <button
                                      className="team-icon-button confirm"
                                      onClick={() => saveTeamRowEditor(member)}
                                      title="确认保存"
                                      type="button"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      className="team-icon-button muted"
                                      onClick={cancelTeamRowEditor}
                                      title="取消编辑"
                                      type="button"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                ) : null}
                                {!isExpertAccountView ? (
                                  <button
                                    className="team-icon-button warning"
                                    disabled={aiPermissionSavingId === member.id || aiPermissionBatchSaving}
                                    onClick={() => void saveAiPermission(member.id, { resetUsage: true })}
                                    title="重置次数"
                                    type="button"
                                  >
                                    <Shuffle className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                {canSendDirectiveToMember(member) ? (
                                  <button
                                    className="team-icon-button primary"
                                    onClick={() => openReminderModal(member)}
                                    title="发送提醒"
                                    type="button"
                                  >
                                    <BellPlus className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                {canResetMemberPassword(member) ? (
                                  <button
                                    className="team-icon-button muted"
                                    onClick={() => openPasswordModal(member)}
                                    title="重置密码"
                                    type="button"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                {canDeleteMemberAccount(member) ? (
                                  <button
                                    className="team-icon-button danger"
                                    onClick={() => removeMember(member.id, member.name)}
                                    title="删除账号"
                                    type="button"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {teamPageCount > 1 ? (
                  <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
                    <span>
                      第 {teamAiPage} / {teamPageCount} 页
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg border border-slate-300 px-3 py-1.5 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        disabled={teamAiPage <= 1}
                        onClick={() => setTeamAiPage((current) => Math.max(1, current - 1))}
                        type="button"
                      >
                        上一页
                      </button>
                      <button
                        className="rounded-lg border border-slate-300 px-3 py-1.5 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        disabled={teamAiPage >= teamPageCount}
                        onClick={() => setTeamAiPage((current) => Math.min(teamPageCount, current + 1))}
                        type="button"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="px-5 py-8">
                <EmptyState
                  description="当前筛选条件下没有匹配账号，可以调整角色筛选或搜索关键词。"
                  icon={Users}
                  title="暂无匹配账号"
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`hidden ${teamListGridClassName} gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium tracking-[0.06em] text-slate-400 lg:grid`}>
              <span>账号信息</span>
              <span>角色</span>
              {!isExpertAccountView && canUseTeamGroups ? <span>分组</span> : null}
              <span>状态</span>
              {showTeamActions ? <span className="text-right">操作</span> : null}
            </div>

            {displayedTeamMembers.length > 0 ? (
              displayedTeamMembers.map((member) => {
                const editable = canManageMember(member);
                const isSystemAccount = member.systemRole === "系统管理员";
                const isSchoolAdminAccount = member.systemRole === "校级管理员";
                const protectedGlobalAccount = isSystemAccount || (isSchoolAdminAccount && !isSystemAdmin);
                const groupAssignmentLocked = isSystemAccount || isSchoolAdminAccount;
                const roleDisabled = !editable || protectedGlobalAccount;

                return (
                  <article
                    key={member.id}
                    className="border-b border-slate-200 px-5 py-5 last:border-b-0"
                  >
                    <div className={`grid gap-4 ${teamListGridClassName} lg:items-center`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar
                          avatar={member.avatar}
                          avatarUrl={member.avatarUrl}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
                          name={member.name}
                          textClassName="text-sm font-semibold text-white"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-slate-900">{member.name}</h3>
                            {isSystemAccount ? (
                              <span className="system-account-tag">
                                最高权限
                              </span>
                            ) : isSchoolAdminAccount ? (
                              <span className="system-account-tag school-admin">
                                全局管理员
                              </span>
                            ) : member.systemRole === "评审专家" ? (
                              <span className="system-account-tag expert">
                                评审专家
                              </span>
                            ) : null}
                          </div>
                          {!member.accountHidden ? (
                            <p className="mt-1 truncate text-sm text-slate-500">账号：{member.account}</p>
                          ) : member.systemRole !== "评审专家" && member.teamGroupName ? (
                            <p className="mt-1 truncate text-sm text-slate-500">团队：{member.teamGroupName}</p>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-xs text-slate-400 lg:hidden">角色</p>
                        {permissions.canManageTeam && !roleDisabled && editingTeamRowId === member.id ? (
                          <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            value={editingTeamRowRole ?? member.systemRole}
                            onChange={(event) => setEditingTeamRowRole(event.target.value as TeamRoleLabel)}
                          >
                            {availableRoleOptions.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {roleOption}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="team-inline-value">
                            {member.systemRole}
                          </span>
                        )}
                      </div>

                      {!isExpertAccountView && canUseTeamGroups ? (
                        <div>
                          <p className="mb-2 text-xs text-slate-400 lg:hidden">分组</p>
                          {editingTeamRowId === member.id && !isEditingRoleTeamGroupAssignable(member) ? (
                            <span className="team-inline-value">全局角色不分配项目组</span>
                          ) : editingTeamRowId === member.id && !groupAssignmentLocked ? (
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                              value={editingTeamRowGroupId}
                              onChange={(event) => setEditingTeamRowGroupId(event.target.value)}
                            >
                              <option value="">未分组</option>
                              {teamGroups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="team-inline-value">{member.teamGroupName ?? "未分组"}</span>
                          )}
                        </div>
                      ) : null}

                      <div>
                        <p className="mb-2 text-xs text-slate-400 lg:hidden">状态</p>
                        <span
                          className={`system-status-tag ${isSchoolAdminAccount ? "school-admin" : member.systemRole === "评审专家" ? "expert" : ""}`}
                        >
                          {isSystemAccount ? "系统保留账号" : isSchoolAdminAccount ? "全局管理员" : "已启用"}
                        </span>
                      </div>

                      {showTeamActions ? (
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          {permissions.canManageTeam && editable && !protectedGlobalAccount && editingTeamRowId !== member.id ? (
                            <button
                              className="team-icon-button primary"
                              onClick={() => openTeamRowEditor(member)}
                              title="编辑角色和分组"
                              type="button"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {permissions.canManageTeam && editingTeamRowId === member.id ? (
                            <>
                              <button
                                className="team-icon-button confirm"
                                onClick={() => saveTeamRowEditor(member)}
                                title="确认保存"
                                type="button"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="team-icon-button muted"
                                onClick={cancelTeamRowEditor}
                                title="取消编辑"
                                type="button"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : null}
                          {canSendDirectiveToMember(member) ? (
                            <ActionButton onClick={() => openReminderModal(member)}>
                              发送提醒
                            </ActionButton>
                          ) : null}
                          {canResetMemberPassword(member) ? (
                            <ActionButton
                              onClick={() => openPasswordModal(member)}
                              title="重置密码"
                            >
                              重置密码
                            </ActionButton>
                          ) : null}
                          {canDeleteMemberAccount(member) ? (
                            <ActionButton
                              className="team-delete-button"
                              onClick={() => removeMember(member.id, member.name)}
                              title="删除账号"
                            >
                              删除账号
                            </ActionButton>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="px-5 py-8">
                <EmptyState
                  description="当前筛选条件下没有匹配账号，可以调整角色筛选或搜索关键词。"
                  icon={Users}
                  title="暂无匹配账号"
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );

  return renderTeam();
}
