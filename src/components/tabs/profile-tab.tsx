"use client";

import * as Workspace from "@/components/workspace-context";

export default function ProfileTab() {
  const {
    currentUser,
    isSaving,
    profileDraft,
    setProfileDraft,
    profileMessage,
    setProfileMessage,
    isAvatarUploading,
    avatarInputRef,
    currentRole,
    requiresEmailCompletion,
    saveProfile,
    uploadProfileAvatar,
  } = Workspace.useWorkspaceContext();

  const {
    Upload,
    roleLabels,
    EMAIL_RULE_HINT,
    surfaceCardClassName,
    fieldClassName,
    defaultProfileDraft,
    SectionHeader,
    ModalActions,
    ActionButton,
    UserAvatar,
  } = Workspace;

const renderProfile = () => {
    if (!currentUser) {
      return null;
    }

    return (
      <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="这里仅显示你自己的账号资料，可按需维护头像、姓名、联系邮箱和登录密码。"
          title="个人信息"
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <article className={surfaceCardClassName}>
          <div className="flex flex-col items-center text-center">
            <UserAvatar
              avatar={currentUser.profile.avatar}
              avatarUrl={currentUser.profile.avatarUrl}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-2xl font-semibold text-white"
              name={currentUser.profile.name}
              textClassName="text-2xl font-semibold text-white"
            />
            <h3 className="mt-4 text-xl font-semibold text-slate-900">{currentUser.profile.name}</h3>
            <p className="mt-2 rounded-md bg-blue-50 px-3 py-1 text-sm text-blue-600">
              {roleLabels[currentRole]}
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs text-slate-400">个人头像</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                支持 JPG、PNG、WEBP，单张图片不超过 2MB。上传后会同步显示在顶部栏和团队管理中。
              </p>
              <input
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(event) => void uploadProfileAvatar(event.target.files?.[0] ?? null)}
                ref={avatarInputRef}
                type="file"
              />
              <div className="mt-4">
                <ActionButton
                  disabled={isAvatarUploading}
                  loading={isAvatarUploading}
                  loadingLabel="上传中..."
                  onClick={() => avatarInputRef.current?.click()}
                  variant="primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    <span>上传头像</span>
                  </span>
                </ActionButton>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">账号名</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{currentUser.username}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">账号角色</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{currentUser.roleLabel}</p>
            </div>
            {currentUser.role !== "admin" && currentUser.role !== "school_admin" && currentUser.role !== "expert" ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-400">当前队伍</p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {currentUser.teamGroupName ?? "暂未分组"}
                </p>
              </div>
            ) : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">账号状态</p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                {currentUser.approvalStatusLabel ?? "已通过"}
              </p>
            </div>
          </div>
        </article>

        <article className={surfaceCardClassName}>
          {requiresEmailCompletion ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              请先补充联系邮箱。系统会通过邮箱发送任务、公告和日程汇报提醒。
            </div>
          ) : null}

          {profileMessage ? (
            <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {profileMessage}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-500">
              姓名
              <input
                className={fieldClassName}
                value={profileDraft.name}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, name: event.target.value }));
                  setProfileMessage(null);
                }}
              />
            </label>
            <label className="block text-sm text-slate-500">
              联系邮箱 <span className="text-red-500">*</span>
              <input
                className={fieldClassName}
                placeholder="必填，用于接收任务和日程提醒"
                type="email"
                value={profileDraft.email}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, email: event.target.value }));
                  setProfileMessage(null);
                }}
              />
              <span className="mt-1.5 block text-xs leading-5 text-slate-400">{EMAIL_RULE_HINT}</span>
            </label>
          </div>

          <label className="mt-4 block text-sm text-slate-500">
            新密码
            <input
              className={fieldClassName}
              placeholder="如不修改可留空"
              type="password"
              value={profileDraft.password}
              onChange={(event) => {
                setProfileDraft((current) => ({ ...current, password: event.target.value }));
                setProfileMessage(null);
              }}
            />
          </label>

          <ModalActions>
            <ActionButton
              disabled={isSaving}
              onClick={() => {
                setProfileDraft(defaultProfileDraft(currentUser));
                setProfileMessage(null);
              }}
            >
              重置
            </ActionButton>
            <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveProfile} variant="primary">
              保存个人信息
            </ActionButton>
          </ModalActions>
        </article>
      </section>
      </div>
    );
  };

  return renderProfile();
}
