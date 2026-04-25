"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { TeamRoleLabel, TaskDraft, DocumentDraft } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

const PdfPreview = dynamic(() => import("@/components/pdf-preview").then((mod) => mod.PdfPreview), {
  ssr: false,
});

function WorkspaceUnitFooter() {
  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-20 border-t border-white/70 bg-white/85 px-4 py-2 text-center text-[12px] leading-5 text-slate-500 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur">
      <span>用户单位：南京铁道职业技术学院</span>
      <span className="mx-3 text-slate-300">|</span>
      <span>支持单位：南京君如玉科技有限公司</span>
    </footer>
  );
}

export function WorkspaceShell({ tabContent }: { tabContent: ReactNode }) {
  const {
    currentUser,
    currentDateTime,
    isBooting,
    loadError,
    setLoadError,
    sentReminders,
    teamGroups,
    selectedDate,
    notificationsOpen,
    setNotificationsOpen,
    sentRemindersOpen,
    setSentRemindersOpen,
    sentRemindersLoading,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    profileMenuOpen,
    setProfileMenuOpen,
    confirmDialog,
    setConfirmDialog,
    successToast,
    isSaving,
    previewAsset,
    setPreviewAsset,
    taskModalOpen,
    setTaskModalOpen,
    editingTaskId,
    taskDraft,
    setTaskDraft,
    taskCompletionModalOpen,
    taskCompletionTarget,
    taskCompletionDraft,
    setTaskCompletionDraft,
    taskRejectModalOpen,
    taskRejectTarget,
    taskRejectReason,
    setTaskRejectReason,
    questionImportModalOpen,
    setQuestionImportModalOpen,
    questionImportFileName,
    questionImportRows,
    setQuestionImportRows,
    questionImportError,
    announcementModalOpen,
    setAnnouncementModalOpen,
    announcementDraft,
    setAnnouncementDraft,
    selectedAnnouncement,
    setSelectedAnnouncement,
    reminderModalOpen,
    reminderTargetMember,
    reminderDraft,
    setReminderDraft,
    reminderDraftErrors,
    emailSettingsModalOpen,
    setEmailSettingsModalOpen,
    emailSettingsDraft,
    setEmailSettingsDraft,
    emailSettingsLoading,
    eventModalOpen,
    setEventModalOpen,
    editingEventId,
    eventDraft,
    setEventDraft,
    expertModalOpen,
    setExpertModalOpen,
    expertDraft,
    setExpertDraft,
    expertFiles,
    setExpertFiles,
    expertDraftErrors,
    setExpertDraftErrors,
    reviewAssignmentModalOpen,
    setReviewAssignmentModalOpen,
    reviewAssignmentDraft,
    setReviewAssignmentDraft,
    reviewAssignmentEditAssignmentId,
    setReviewAssignmentEditAssignmentId,
    reviewMaterialModalOpen,
    setReviewMaterialModalOpen,
    reviewMaterialDraft,
    setReviewMaterialDraft,
    reviewMaterialSavingLabel,
    reviewMaterialUploadProgress,
    teamModalOpen,
    setTeamModalOpen,
    teamDraft,
    setTeamDraft,
    batchExpertModalOpen,
    setBatchExpertModalOpen,
    batchExpertDraft,
    setBatchExpertDraft,
    profileMenuRef,
    passwordModalOpen,
    setPasswordModalOpen,
    passwordTargetMember,
    passwordDraft,
    setPasswordDraft,
    reportModalOpen,
    editingReportDate,
    reportDraft,
    setReportDraft,
    documentModalOpen,
    setDocumentModalOpen,
    documentDraft,
    setDocumentDraft,
    documentSavingLabel,
    documentUploadProgress,
    versionModalOpen,
    setVersionModalOpen,
    versionUploadNote,
    setVersionUploadNote,
    setVersionUploadFile,
    versionSavingLabel,
    versionUploadProgress,
    reviewModalOpen,
    setReviewModalOpen,
    setReviewTargetDocId,
    reviewAction,
    setReviewAction,
    reviewComment,
    setReviewComment,
    currentRole,
    hasGlobalAdminRole,
    permissions,
    sidebarTabs,
    safeActiveTab,
    activeTabItem,
    taskAssignableMembers,
    expertMembers,
    projectStages,
    projectMaterials,
    availableRoleOptions,
    todoNotifications,
    visibleRoleTodoItems,
    todoItemCount,
    urgentTodoCount,
    dismissTodoItem,
    markAllTodoItemsAsRead,
    reminderTabOptions,
    closeReminderModal,
    saveEmailSettings,
    refreshWorkspace,
    validateClientFile,
    handleDownload,
    handleLogout,
    loadSentReminders,
    openTodoItem,
    saveTask,
    closeTaskCompletionModal,
    submitTaskForReview,
    closeTaskRejectModal,
    rejectTaskForRework,
    updateQuestionImportRow,
    handleQuestionImportFile,
    importTrainingQuestions,
    publishAnnouncement,
    saveReminder,
    closeReportModal,
    saveReport,
    saveEvent,
    saveExpert,
    saveDocument,
    uploadNewDocumentVersion,
    reviewDocument,
    saveReviewAssignment,
    saveReviewMaterial,
    saveTeamMember,
    saveBatchExperts,
    openProfilePage,
    resetMemberPassword,
    handleConfirmDialog,
  } = Workspace.useWorkspaceContext();

  const {
    BellPlus,
    ChevronDown,
    Cloud,
    Download,
    Loader2,
    LogOut,
    Menu,
    X,
    documentCategories,
    roleLabels,
    formatBeijingDateTimeShort,
    USERNAME_RULE_HINT,
    getNotificationEmailStatusMeta,
    documentCenterAcceptAttribute,
    documentAcceptAttribute,
    MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
    expertReviewAcceptAttributes,
    expertReviewMaterialLabels,
    requestJson,
    trainingQuestionCategories,
    allTabs,
    reviewActionTitles,
    surfaceCardClassName,
    subtleCardClassName,
    fieldClassName,
    fieldErrorClassName,
    textareaClassName,
    formatShortDate,
    formatFriendlyDate,
    emailReminderSettingItems,
    defaultExpertDraft,
    defaultExpertDraftErrors,
    defaultBatchExpertDraft,
    isPdfAsset,
    isImageAsset,
    isWordAsset,
    Modal,
    ModalActions,
    ConfirmDialog,
    EmptyState,
    SuccessToast,
    ActionButton,
    UserAvatar,
  } = Workspace;

  const selectedReviewStage = projectStages.find((stage) => stage.id === reviewAssignmentDraft.stageId) ?? null;
  const isEditingReviewAssignment = Boolean(reviewAssignmentEditAssignmentId);
  const closeReviewAssignmentModal = () => {
    setReviewAssignmentModalOpen(false);
    setReviewAssignmentEditAssignmentId(null);
  };
  const approvedProjectMaterialsForReview = projectMaterials.filter(
    (material) =>
      material.status === "approved" &&
      (!reviewAssignmentDraft.stageId || material.stageId === reviewAssignmentDraft.stageId),
  );

  const getSidebarUserMeta = () => {
    if (currentRole === "admin" || currentRole === "school_admin") {
      return "全校管理";
    }

    if (currentRole === "expert") {
      return "专家评审";
    }

    return currentUser?.teamGroupName ?? "未绑定项目组";
  };

  if (isBooting) {
    return (
      <main className="workspace-depth-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6">
        <div aria-hidden className="workspace-orb-field" />
        <div className="relative z-[1] depth-card w-full max-w-[calc(100vw-2rem)] rounded-2xl px-5 py-6 sm:max-w-xl sm:px-8 sm:py-8">
          <div className="depth-emphasis inline-flex items-center px-3 py-1 text-xs font-medium tracking-[0.08em] text-[color:var(--color-primary)]">
            中国国际大学生创新大赛管理系统
          </div>
          <div className="mt-5 flex items-start gap-4">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_16px_34px_rgba(var(--color-primary-rgb),0.12)]">
              <div className="loading-spinner" />
            </div>
            <div className="min-w-0">
              <p className="loading-title tracking-[-0.02em]">正在进入管理中心</p>
              <p className="loading-sub leading-7">
                正在同步角色权限、任务概览和最近通知，马上就好。
              </p>
            </div>
          </div>
          <div className="loading-status mt-6 depth-emphasis inline-flex px-3 py-1.5">
            <span>正在加载工作台数据...</span>
          </div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">登录状态已失效，正在返回登录页...</p>
      </main>
    );
  }

  if (currentRole === "expert") {
    return (
      <>
        <main className="min-h-screen bg-[#eef4fb] px-5 py-6 pb-14">
          <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1240px] flex-col overflow-hidden rounded-[30px] border border-blue-100 bg-white shadow-[0_28px_90px_rgba(15,45,91,0.12)]">
            <header className="relative overflow-hidden px-6 py-6 text-white md:px-8">
              <div aria-hidden className="absolute inset-0 bg-[linear-gradient(115deg,#073b82_0%,#1765f3_58%,#4aa3ff_100%)]" />
              <div aria-hidden className="absolute -right-20 -top-28 h-72 w-72 rounded-full border border-white/20" />
              <div aria-hidden className="absolute right-16 top-8 h-32 w-32 rounded-full border border-white/15" />
              <div aria-hidden className="absolute bottom-0 right-0 h-32 w-[420px] bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.28),transparent_60%)]" />
              <div className="relative z-[1] flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.12)] backdrop-blur">
                    <Image alt="南铁校徽" className="h-9 w-9 object-contain brightness-0 invert" height={77} src="/official-logo.png" width={430} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-[0.2em] text-blue-100">EXPERT REVIEW PORTAL</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">大学生创新大赛评审系统</h1>
                    <p className="mt-1 text-sm text-blue-100">南京铁道职业技术学院 · 专家评审入口</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-white/20 bg-white/12 px-4 py-2.5 text-sm text-blue-50 backdrop-blur">
                    <span className="text-blue-100">当前专家</span>
                    <span className="ml-2 font-semibold text-white">{currentUser.profile.name}</span>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>退出</span>
                  </button>
                </div>
              </div>
            </header>

            <section className="min-h-0 flex-1 px-5 py-5 md:px-8 md:py-7">
              {loadError ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                  {loadError}
                </div>
              ) : null}
              {tabContent}
            </section>
          </div>
        </main>
        <WorkspaceUnitFooter />

        <SuccessToast toast={successToast} />

        {previewAsset ? (
          <Modal
            bodyClassName="px-5 py-4 md:px-6 md:py-5"
            onClose={() => setPreviewAsset(null)}
            size="preview"
            title={previewAsset.title}
          >
            <div className="space-y-4">
              {previewAsset.mode === "download-fallback" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <div className="space-y-3">
                    <p className="text-base font-medium text-slate-900">
                      {previewAsset.fileName || "当前文件"}
                    </p>
                    <p className="text-sm leading-7 text-slate-500">
                      {previewAsset.fallbackMessage || "该文件类型暂不支持站内预览，请下载后使用本地软件查看。"}
                    </p>
                  </div>
                </div>
              ) : previewAsset.mimeType?.startsWith("video/") ? (
                <video
                  className="max-h-[78vh] w-full rounded-lg border border-slate-200 bg-black"
                  controls
                  playsInline
                  src={previewAsset.url}
                />
              ) : isPdfAsset(previewAsset) ? (
                <PdfPreview url={previewAsset.url} />
              ) : isImageAsset(previewAsset) ? (
                <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={previewAsset.fileName || previewAsset.title}
                    className="block h-auto max-w-none rounded-md border border-slate-200 bg-white shadow-sm"
                    loading="eager"
                    src={previewAsset.url}
                  />
                </div>
              ) : (
                <iframe
                  className="h-[78vh] w-full rounded-lg border border-slate-200 bg-white"
                  src={previewAsset.url}
                  title={previewAsset.title}
                />
              )}
              <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
                {previewAsset.mode === "download-fallback"
                  ? "已为当前文件切换到下载查看模式。"
                  : previewAsset.mimeType?.startsWith("video/")
                  ? "视频材料支持在当前页面直接播放。"
                  : isPdfAsset(previewAsset)
                    ? "PDF 使用站内渲染模式，避免浏览器原生预览层在后台页面残留。"
                    : isImageAsset(previewAsset)
                      ? "图片按原始清晰度显示，可在窗口内滚动查看细节。"
                      : isWordAsset(previewAsset)
                        ? "Word 文档已切换为站内只读预览；在线标注和协同修改需要后续接入文档协作服务。"
                        : "已切换为站内在线预览模式。"}
              </p>
              <ModalActions>
                {previewAsset.mode === "download-fallback" ? (
                  <ActionButton
                    onClick={() => handleDownload(previewAsset.downloadUrl)}
                    variant="primary"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      <span>下载查看</span>
                    </span>
                  </ActionButton>
                ) : null}
                <ActionButton onClick={() => setPreviewAsset(null)}>关闭</ActionButton>
              </ModalActions>
            </div>
          </Modal>
        ) : null}
      </>
    );
  }

  return (
    <>
      <main className="workspace-depth-bg workspace-shell-fade-in min-h-screen overflow-x-hidden p-4 pb-14 md:p-6 md:pb-14">
        <div aria-hidden className="workspace-orb-field" />
        <div className="relative z-[1] mx-auto flex max-w-[1500px] flex-col gap-4 overflow-x-hidden xl:flex-row">
          {mobileSidebarOpen ? (
            <div
              className="fixed inset-0 z-40 bg-slate-950/40 xl:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          ) : null}

          <aside className="hidden xl:sticky xl:top-4 xl:block xl:h-[calc(100svh-2rem)] xl:w-[260px] xl:flex-none xl:self-start">
            <div className="depth-sidebar depth-sidebar-enhanced sidebar-government-pattern flex h-full flex-col rounded-xl px-4 py-6 text-white">
              <div className="sidebar-header pb-5">
                <div className="sidebar-logo flex items-center gap-3">
                  <div className="sidebar-logo-wrapper flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10">
                    <Image alt="南铁校徽" className="h-7 w-7 object-contain" height={77} src="/official-logo.png" width={430} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="school-name text-[15px] font-bold leading-tight tracking-[0.01em]">中国国际大学生创新大赛管理系统</h1>
                    <p className="school-sub mt-1">南京铁道职业技术学院</p>
                  </div>
                </div>
              </div>

              <nav className="sidebar-nav mt-5 flex-1 overflow-y-auto space-y-1 pr-1">
                {sidebarTabs.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === safeActiveTab;
                  const href =
                    item.key === "overview" ? "/workspace" : `/workspace?tab=${item.key}`;

                  return (
                    <Link
                      key={item.key}
                      className={`sidebar-nav-item no-underline ${isActive ? "sidebar-nav-item-active" : ""}`}
                      href={href}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="sidebar-user-area mt-auto">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    avatar={currentUser.profile.avatar}
                    avatarUrl={currentUser.profile.avatarUrl}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white"
                    name={currentUser.profile.name}
                    textClassName="text-sm font-semibold text-white"
                  />
                  <div className="min-w-0">
                    <p className="sidebar-user-name truncate">{currentUser.profile.name}</p>
                    <p className="sidebar-user-role mt-0.5">{roleLabels[currentRole]}</p>
                    <p className="mt-0.5 text-[11px] text-white/45">{getSidebarUserMeta()}</p>
                  </div>
                </div>
                <button
                  className="mt-4 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  <span>退出</span>
                </button>
              </div>
            </div>
          </aside>

          <aside
            className={`depth-sidebar depth-sidebar-enhanced sidebar-government-pattern fixed inset-y-0 left-0 z-50 w-[min(82vw,260px)] overflow-hidden px-4 py-6 text-white transition-all duration-200 xl:hidden ${
              mobileSidebarOpen
                ? "translate-x-0 opacity-100 shadow-xl"
                : "-translate-x-[calc(100%+2rem)] opacity-0 shadow-none pointer-events-none"
            }`}
          >
            <div className="sidebar flex h-full flex-col">
              <div className="sidebar-header flex items-center justify-between pb-5">
                <div className="sidebar-logo flex items-center gap-3">
                  <div className="sidebar-logo-wrapper flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10">
                    <Image alt="南铁校徽" className="h-7 w-7 object-contain" height={77} src="/official-logo.png" width={430} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="school-name text-[15px] font-bold leading-tight tracking-[0.01em]">中国国际大学生创新大赛管理系统</h1>
                    <p className="school-sub mt-1">南京铁道职业技术学院</p>
                  </div>
                </div>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/80"
                  onClick={() => setMobileSidebarOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="sidebar-nav mt-5 space-y-1">
                {sidebarTabs.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === safeActiveTab;
                  const href =
                    item.key === "overview" ? "/workspace" : `/workspace?tab=${item.key}`;

                  return (
                    <Link
                      key={`mobile-${item.key}`}
                      className={`sidebar-nav-item no-underline ${isActive ? "sidebar-nav-item-active" : ""}`}
                      href={href}
                      onClick={() => setMobileSidebarOpen(false)}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="sidebar-user-area mt-auto">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    avatar={currentUser.profile.avatar}
                    avatarUrl={currentUser.profile.avatarUrl}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white"
                    name={currentUser.profile.name}
                    textClassName="text-sm font-semibold text-white"
                  />
                  <div className="min-w-0">
                    <p className="sidebar-user-name truncate">{currentUser.profile.name}</p>
                    <p className="sidebar-user-role mt-0.5">{roleLabels[currentRole]}</p>
                    <p className="mt-0.5 text-[11px] text-white/45">{getSidebarUserMeta()}</p>
                  </div>
                </div>
                <button
                  className="mt-4 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  <span>退出</span>
                </button>
              </div>
            </div>
          </aside>

          <section className="min-w-0 flex-1 overflow-x-hidden">
            <header className="topbar-enhanced mx-auto max-w-[1200px]">
              <div className="mx-auto flex max-w-[1200px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="flex min-h-10 items-center gap-3">
                  <button
                    className="depth-button-secondary inline-flex h-10 w-10 items-center justify-center rounded-lg text-[color:var(--color-neutral)] xl:hidden"
                    onClick={() => setMobileSidebarOpen(true)}
                    type="button"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  <p className="topbar-page-title">{activeTabItem.label}</p>
                </div>

                <div className="hidden flex-1 lg:block" />

                <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
                  <span className="header-date hidden text-[13px] text-slate-500 md:inline-flex">
                    {formatFriendlyDate(currentDateTime)}
                  </span>
                  <div className="header-sync-indicator group relative hidden md:inline-flex">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                      <Cloud className="h-4 w-4" />
                    </span>
                    <span className="header-sync-tooltip">数据已同步</span>
                  </div>
                  <button
                    className="depth-button-secondary relative inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[color:var(--color-neutral)]"
                    onClick={() => setNotificationsOpen(true)}
                    type="button"
                  >
                    <BellPlus className="h-4 w-4" />
                    <span className="hidden text-sm font-medium sm:inline">待办</span>
                    {todoItemCount > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-[10px] font-semibold text-white">
                        {todoItemCount}
                      </span>
                    ) : null}
                  </button>
                  <div className="header-profile-menu relative" ref={profileMenuRef}>
                    <button
                      className="depth-button-secondary flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition sm:gap-3 sm:px-3"
                      onClick={() => setProfileMenuOpen((current) => !current)}
                      type="button"
                    >
                      <UserAvatar
                        avatar={currentUser.profile.avatar}
                        avatarUrl={currentUser.profile.avatarUrl}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white"
                        name={currentUser.profile.name}
                        textClassName="text-sm font-semibold text-white"
                      />
                      <div className="hidden min-w-0 sm:block">
                        <p className="truncate text-sm font-medium text-slate-900">{currentUser.profile.name}</p>
                        <p className="mt-0.5 text-xs text-slate-400">查看个人信息</p>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition ${profileMenuOpen ? "rotate-180" : ""}`} />
                    </button>
                    {profileMenuOpen ? (
                      <div className="header-profile-menu-panel absolute right-0 top-full z-30 mt-2 min-w-[180px] rounded-xl p-1">
                        <button
                          className="header-profile-menu-item"
                          onClick={openProfilePage}
                          type="button"
                        >
                          查看个人信息
                        </button>
                        <button
                          className="header-profile-menu-item danger"
                          onClick={() => void handleLogout()}
                          type="button"
                        >
                          退出登录
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="header-toolbar-divider hidden h-8 w-px bg-slate-200 md:block" />
                  <ActionButton
                    className="px-3 sm:px-4"
                    disabled={!permissions.canPublishAnnouncement}
                    onClick={() => setAnnouncementModalOpen(true)}
                    title="无权限"
                    variant="primary"
                  >
                    <span className="inline-flex items-center gap-2">
                      <BellPlus className="h-4 w-4" />
                      <span className="hidden sm:inline">发布公告</span>
                    </span>
                  </ActionButton>
                </div>
              </div>
            </header>

            <div className="mx-auto mt-4 flex max-w-[1200px] flex-col gap-4">
              {loadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                  {loadError}
                </div>
              ) : null}
              {tabContent}
            </div>
          </section>
        </div>
      </main>
      <WorkspaceUnitFooter />

      <SuccessToast toast={successToast} />

      {questionImportModalOpen ? (
        <Modal
          onClose={() => setQuestionImportModalOpen(false)}
          panelClassName="max-w-[min(92vw,980px)]"
          title="导入 Q&A 题库"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-7 text-blue-700">
              上传文档后会先自动识别问题和回答要点，导入前可以逐条校对、修改和取消选择。支持 PDF、Word(.docx)、
              txt / md / csv / json；旧版 .doc 请另存为 .docx 后导入，单文件最大 4MB。
            </div>
            <label className="block text-sm text-slate-500">
              选择题库文档
              <input
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.json"
                className={fieldClassName}
                type="file"
                onChange={(event) => void handleQuestionImportFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {questionImportFileName ? (
              <p className="text-sm text-slate-500">当前文件：{questionImportFileName}</p>
            ) : null}
            {questionImportError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {questionImportError}
              </div>
            ) : null}

            {questionImportRows.length > 0 ? (
              <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {questionImportRows.map((row, index) => (
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={row.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          checked={row.selected}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          onChange={(event) => updateQuestionImportRow(row.id, { selected: event.target.checked })}
                          type="checkbox"
                        />
                        导入第 {index + 1} 题
                      </label>
                      <button
                        className="text-sm text-red-500 transition hover:text-red-600"
                        onClick={() => setQuestionImportRows((current) => current.filter((item) => item.id !== row.id))}
                        type="button"
                      >
                        移除
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                      <label className="text-sm text-slate-500">
                        分类
                        <select
                          className={fieldClassName}
                          value={row.category}
                          onChange={(event) => updateQuestionImportRow(row.id, { category: event.target.value })}
                        >
                          {trainingQuestionCategories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.category === "其他" ? (
                        <label className="text-sm text-slate-500">
                          自定义分类
                          <input
                            className={fieldClassName}
                            placeholder="例如：政策合规、临场追问"
                            value={row.customCategory}
                            onChange={(event) => updateQuestionImportRow(row.id, { customCategory: event.target.value })}
                          />
                        </label>
                      ) : null}
                      <label className={`text-sm text-slate-500 ${row.category === "其他" ? "md:col-span-2" : ""}`}>
                        问题
                        <textarea
                          className={`${textareaClassName} min-h-24`}
                          value={row.question}
                          onChange={(event) => updateQuestionImportRow(row.id, { question: event.target.value })}
                        />
                      </label>
                    </div>
                    <label className="mt-3 block text-sm text-slate-500">
                      标准回答要点
                      <textarea
                        className={`${textareaClassName} min-h-24`}
                        value={row.answerPoints}
                        onChange={(event) => updateQuestionImportRow(row.id, { answerPoints: event.target.value })}
                      />
                    </label>
                  </article>
                ))}
              </div>
            ) : null}

            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setQuestionImportModalOpen(false)}>
                取消
              </ActionButton>
              <ActionButton
                disabled={isSaving || questionImportRows.length === 0}
                loading={isSaving}
                loadingLabel="导入中..."
                onClick={() => void importTrainingQuestions()}
                variant="primary"
              >
                确认导入
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {taskModalOpen ? (
        <Modal title={editingTaskId ? "编辑工单" : "发布工单"} onClose={() => setTaskModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              工单标题
              <input
                className={fieldClassName}
                value={taskDraft.title}
                onChange={(event) =>
                  setTaskDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              处理人 {currentRole !== "member" ? <span className="text-slate-400">（可多选）</span> : null}
              <div className="mt-1.5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                {currentRole !== "member" ? (
                  <label className="flex items-center gap-3 text-sm text-slate-600">
                    <input
                      checked={taskDraft.assigneeIds.length === 0}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600/20"
                      onChange={(event) => {
                        if (event.target.checked) {
                          setTaskDraft((current) => ({ ...current, assigneeIds: [] }));
                        }
                      }}
                      type="radio"
                    />
                    <span>暂不分配，先进入待分配列表</span>
                  </label>
                ) : null}
                <div className="grid gap-2 md:grid-cols-2">
                  {taskAssignableMembers.map((member) => {
                    const checked = taskDraft.assigneeIds.includes(member.id);
                    return (
                      <label
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                          checked
                            ? "border-white/90 bg-white text-[#1a6fd4] shadow-[0_14px_32px_rgba(31,38,135,0.14)]"
                            : "border-white/65 bg-white/55 text-slate-500 hover:border-white/90"
                        }`}
                        key={member.id}
                      >
                        <input
                          checked={checked}
                          className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600/20"
                          onChange={(event) =>
                            setTaskDraft((current) => ({
                              ...current,
                              assigneeIds: event.target.checked
                                ? Array.from(new Set([...current.assigneeIds, member.id]))
                                : current.assigneeIds.filter((item) => item !== member.id),
                            }))
                          }
                          type="checkbox"
                        />
                        <span>{member.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </label>
            {!editingTaskId && taskDraft.assigneeIds.length === 0 ? (
              hasGlobalAdminRole ? (
                <label className="block text-sm text-slate-500">
                  所属队伍 <span className="text-red-500">*</span>
                  <select
                    className={fieldClassName}
                    value={taskDraft.teamGroupId}
                    onChange={(event) =>
                      setTaskDraft((current) => ({ ...current, teamGroupId: event.target.value }))
                    }
                  >
                    <option value="">请选择待分配工单所属队伍</option>
                    {teamGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
                  暂不分配时，工单会进入当前队伍
                  {currentUser?.teamGroupName ? `「${currentUser.teamGroupName}」` : ""}
                  的待分配列表，并提醒项目负责人处理。
                </p>
              )
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                截止时间
                <input
                  className={fieldClassName}
                  type="datetime-local"
                  value={taskDraft.dueDate}
                  onChange={(event) =>
                    setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-500">
                优先级
                <select
                  className={fieldClassName}
                  value={taskDraft.priority}
                  onChange={(event) =>
                    setTaskDraft((current) => ({
                      ...current,
                      priority: event.target.value as TaskDraft["priority"],
                    }))
                  }
                >
                  <option value="高优先级">高优先级</option>
                  <option value="中优先级">中优先级</option>
                  <option value="低优先级">低优先级</option>
                </select>
              </label>
            </div>
            {!editingTaskId ? (
              <label className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-600">
                <input
                  checked={taskDraft.notifyAssignee}
                  className="mt-1 h-4 w-4 rounded border-blue-200 text-blue-600"
                  onChange={(event) =>
                    setTaskDraft((current) => ({ ...current, notifyAssignee: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>
                  <span className="font-medium text-slate-900">创建后发送提醒</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    已分配时提醒处理人；暂不分配时提醒本队项目负责人来分配。
                  </span>
                </span>
              </label>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setTaskModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveTask} variant="primary">
                保存工单
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {taskCompletionModalOpen && taskCompletionTarget ? (
        <Modal title="提交工单验收" onClose={closeTaskCompletionModal}>
          <div className="space-y-4">
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
              可上传佐证附件辅助验收，提交后会推送给验收人确认闭环。
            </p>
            <label className="block text-sm text-slate-500">
              完成说明
              <textarea
                className={textareaClassName}
                placeholder="简要说明完成情况、关键结果或需要验收人注意的点"
                value={taskCompletionDraft.note}
                onChange={(event) =>
                  setTaskCompletionDraft((current) => ({ ...current, note: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              完成凭证
              <input
                accept={documentAcceptAttribute}
                className={fieldClassName}
                onChange={(event) =>
                  setTaskCompletionDraft((current) => ({
                    ...current,
                    file: event.target.files?.[0] ?? null,
                  }))
                }
                type="file"
              />
              <span className="mt-1.5 block text-xs leading-5 text-slate-400">
                支持 PDF、Word、Excel、图片、txt，单文件最大 20MB。
              </span>
            </label>
            {taskCompletionTarget.attachments && taskCompletionTarget.attachments.length > 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                已有凭证：{taskCompletionTarget.attachments.map((item) => item.fileName).join("、")}
              </div>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeTaskCompletionModal}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="提交中..." onClick={submitTaskForReview} variant="primary">
                提交验收
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {taskRejectModalOpen && taskRejectTarget ? (
        <Modal title="驳回工单" onClose={closeTaskRejectModal}>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-slate-500">
              驳回后工单会回到“处理中”，并提醒处理人继续完善。
            </p>
            <label className="block text-sm text-slate-500">
              驳回原因
              <textarea
                className={textareaClassName}
                placeholder="请写清需要补充或重做的内容"
                value={taskRejectReason}
                onChange={(event) => setTaskRejectReason(event.target.value)}
              />
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeTaskRejectModal}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="提交中..." onClick={rejectTaskForRework} variant="danger">
                确认驳回
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reportModalOpen ? (
        <Modal title={editingReportDate ? "修改日程汇报" : "提交日程汇报"} onClose={closeReportModal}>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-slate-500">
              提交日期：{formatShortDate(editingReportDate || selectedDate)} · 提交人：{currentUser.profile.name}
            </p>
            <label className="block text-sm text-slate-500">
              今日完成
              <textarea
                className={textareaClassName}
                value={reportDraft.summary}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              明日计划
              <textarea
                className={textareaClassName}
                value={reportDraft.nextPlan}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, nextPlan: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              附件
              <input
                className={fieldClassName}
                placeholder="例如：日报截图.png / 无"
                value={reportDraft.attachment}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, attachment: event.target.value }))
                }
              />
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeReportModal}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="提交中..." onClick={saveReport} variant="primary">
                {editingReportDate ? "保存修改" : "保存汇报"}
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {announcementModalOpen ? (
        <Modal title="发布公告" onClose={() => setAnnouncementModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              公告标题
              <input
                className={fieldClassName}
                value={announcementDraft.title}
                onChange={(event) =>
                  setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              公告内容
              <textarea
                className={`${textareaClassName} min-h-32`}
                value={announcementDraft.detail}
                onChange={(event) =>
                  setAnnouncementDraft((current) => ({ ...current, detail: event.target.value }))
                }
              />
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-600">
              <input
                checked={announcementDraft.notifyTeam}
                className="mt-1 h-4 w-4 rounded border-blue-200 text-blue-600"
                onChange={(event) =>
                  setAnnouncementDraft((current) => ({ ...current, notifyTeam: event.target.checked }))
                }
                type="checkbox"
              />
              <span>
                <span className="font-medium text-slate-900">发布后同步提醒团队</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  勾选后会向相关成员发送站内通知，并在符合条件时同步发送邮件提醒。
                </span>
              </span>
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setAnnouncementModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="发布中..." onClick={publishAnnouncement} variant="primary">
                发布公告
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {selectedAnnouncement ? (
        <Modal
          title="公告详情"
          onClose={() => setSelectedAnnouncement(null)}
          panelClassName="max-w-[min(92vw,760px)]"
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/90 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900">{selectedAnnouncement.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>发布时间：{formatBeijingDateTimeShort(selectedAnnouncement.createdAt)}</span>
                    {selectedAnnouncement.author?.name ? <span>发布人：{selectedAnnouncement.author.name}</span> : null}
                  </div>
                </div>
                <span className="depth-emphasis inline-flex px-2 py-1 text-xs text-slate-500">通知公告</span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 text-sm leading-7 text-slate-600 whitespace-pre-wrap">
              {selectedAnnouncement.detail}
            </div>
            <ModalActions>
              {currentUser && ["admin", "school_admin", "teacher", "leader"].includes(currentUser.role) ? (
                <ActionButton
                  onClick={() => {
                    const announcement = selectedAnnouncement;
                    setConfirmDialog({
                      open: true,
                      title: "删除公告",
                      message: `确定删除“${announcement.title}”吗？删除后成员将无法继续查看这条公告。`,
                      confirmLabel: "删除公告",
                      confirmVariant: "danger",
                      successTitle: "公告已删除",
                      successDetail: "首页公告列表已经同步更新。",
                      onConfirm: async () => {
                        await requestJson(`/api/announcements/${announcement.id}`, {
                          method: "DELETE",
                        });
                        setSelectedAnnouncement(null);
                        refreshWorkspace("announcements");
                      },
                    });
                  }}
                  variant="danger"
                >
                  删除公告
                </ActionButton>
              ) : null}
              <ActionButton onClick={() => setSelectedAnnouncement(null)} variant="primary">
                我知道了
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {eventModalOpen ? (
        <Modal title={editingEventId ? "编辑时间节点" : "新增时间节点"} onClose={() => setEventModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              节点标题
              <input
                className={fieldClassName}
                value={eventDraft.title}
                onChange={(event) => setEventDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                时间
                <input
                  className={fieldClassName}
                  type="datetime-local"
                  value={eventDraft.dateTime}
                  onChange={(event) =>
                    setEventDraft((current) => ({ ...current, dateTime: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-500">
                节点类型
                <input
                  className={fieldClassName}
                  value={eventDraft.type}
                  onChange={(event) => setEventDraft((current) => ({ ...current, type: event.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              节点说明
              <textarea
                className={textareaClassName}
                value={eventDraft.description}
                onChange={(event) =>
                  setEventDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setEventModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveEvent} variant="primary">
                保存节点
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {expertModalOpen ? (
        <Modal
          title="上传专家意见"
          onClose={() => {
            setExpertModalOpen(false);
            setExpertDraft(defaultExpertDraft);
            setExpertFiles([]);
            setExpertDraftErrors(defaultExpertDraftErrors());
          }}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
              <p className="font-medium text-slate-700">带 <span className="text-red-500">*</span> 的项目为必填项</p>
              <p className="mt-1">如提交失败，会在对应字段下方直接说明原因。</p>
            </div>
            {expertDraftErrors.submit ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {expertDraftErrors.submit}
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                日期 <span className="text-red-500">*</span>
                <input
                  className={expertDraftErrors.date ? fieldErrorClassName : fieldClassName}
                  type="date"
                  value={expertDraft.date}
                  onChange={(event) => {
                    setExpertDraft((current) => ({ ...current, date: event.target.value }));
                    setExpertDraftErrors((current) => ({
                      ...current,
                      date: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {expertDraftErrors.date ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.date}</p> : null}
              </label>
              <label className="block text-sm text-slate-500">
                形式 <span className="text-red-500">*</span>
                <input
                  className={expertDraftErrors.format ? fieldErrorClassName : fieldClassName}
                  value={expertDraft.format}
                  onChange={(event) => {
                    setExpertDraft((current) => ({ ...current, format: event.target.value }));
                    setExpertDraftErrors((current) => ({
                      ...current,
                      format: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {expertDraftErrors.format ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.format}</p> : null}
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                专家姓名 <span className="text-red-500">*</span>
                <input
                  className={expertDraftErrors.expert ? fieldErrorClassName : fieldClassName}
                  value={expertDraft.expert}
                  onChange={(event) => {
                    setExpertDraft((current) => ({ ...current, expert: event.target.value }));
                    setExpertDraftErrors((current) => ({
                      ...current,
                      expert: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {expertDraftErrors.expert ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.expert}</p> : null}
              </label>
              <label className="block text-sm text-slate-500">
                主题 <span className="text-red-500">*</span>
                <input
                  className={expertDraftErrors.topic ? fieldErrorClassName : fieldClassName}
                  value={expertDraft.topic}
                  onChange={(event) => {
                    setExpertDraft((current) => ({ ...current, topic: event.target.value }));
                    setExpertDraftErrors((current) => ({
                      ...current,
                      topic: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {expertDraftErrors.topic ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.topic}</p> : null}
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              反馈摘要 <span className="text-red-500">*</span>
              <textarea
                className={`${expertDraftErrors.summary ? fieldErrorClassName : fieldClassName} min-h-28`}
                value={expertDraft.summary}
                onChange={(event) => {
                  setExpertDraft((current) => ({ ...current, summary: event.target.value }));
                  setExpertDraftErrors((current) => ({
                    ...current,
                    summary: undefined,
                    submit: undefined,
                  }));
                }}
              />
              {expertDraftErrors.summary ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.summary}</p> : null}
            </label>
            <label className="block text-sm text-slate-500">
              后续动作 <span className="text-red-500">*</span>
              <textarea
                className={`${expertDraftErrors.nextAction ? fieldErrorClassName : fieldClassName} min-h-28`}
                value={expertDraft.nextAction}
                onChange={(event) => {
                  setExpertDraft((current) => ({ ...current, nextAction: event.target.value }));
                  setExpertDraftErrors((current) => ({
                    ...current,
                    nextAction: undefined,
                    submit: undefined,
                  }));
                }}
              />
              {expertDraftErrors.nextAction ? <p className="mt-1 text-sm text-red-600">{expertDraftErrors.nextAction}</p> : null}
            </label>
            <label className="block text-sm text-slate-500">
              上传附件
              <input
                accept={documentAcceptAttribute}
                className={`${fieldClassName} block min-h-11`}
                multiple
                type="file"
                onChange={(event) => {
                  const nextFiles = Array.from(event.target.files ?? []);
                  for (const file of nextFiles) {
                    const validationError = validateClientFile(file);
                    if (validationError) {
                      setExpertDraftErrors((current) => ({
                        ...current,
                        attachments: validationError,
                        submit: undefined,
                      }));
                      event.target.value = "";
                      setExpertFiles([]);
                      return;
                    }
                  }
                  setExpertFiles(nextFiles);
                  setExpertDraftErrors((current) => ({
                    ...current,
                    attachments: undefined,
                    submit: undefined,
                  }));
                }}
              />
              <p className="mt-1 text-xs leading-5 text-slate-400">附件选填，支持 Word / PDF / Excel / 图片。</p>
              {expertDraftErrors.attachments ? (
                <p className="mt-1 text-sm text-red-600">{expertDraftErrors.attachments}</p>
              ) : null}
            </label>
            {expertFiles.length > 0 ? (
              <div className={`${subtleCardClassName} space-y-2`}>
                <p className="text-sm text-slate-500">已选附件</p>
                {expertFiles.map((file) => (
                  <p key={`${file.name}-${file.size}`} className="text-sm text-slate-600">
                    {file.name}
                  </p>
                ))}
              </div>
            ) : null}
            <ModalActions>
              <ActionButton
                disabled={isSaving}
                onClick={() => {
                  setExpertModalOpen(false);
                  setExpertDraft(defaultExpertDraft);
                  setExpertFiles([]);
                }}
              >
                取消
              </ActionButton>
              <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveExpert} variant="primary">
                保存意见
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reviewAssignmentModalOpen ? (
        <Modal
          title={isEditingReviewAssignment ? "编辑专家评审设置" : "从项目管理分配专家评审"}
          onClose={closeReviewAssignmentModal}
        >
          <div className="space-y-4">
            {isEditingReviewAssignment ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                正在编辑已生成的评审包。可调整轮次名称、截止时间、说明和专家名单；已有评分的专家不会被移除，避免误删成绩。
              </div>
            ) : (
              <label className="block text-sm text-slate-500">
                选择项目管理轮次
                <select
                  className={fieldClassName}
                  value={reviewAssignmentDraft.stageId}
                  onChange={(event) => {
                    const selectedStage = projectStages.find((stage) => stage.id === event.target.value) ?? null;
                    setReviewAssignmentDraft((current) => ({
                      ...current,
                      stageId: event.target.value,
                      materialSubmissionIds: [],
                      roundLabel: selectedStage?.name || current.roundLabel,
                      deadline: selectedStage?.deadline
                        ? Workspace.formatBeijingDateTimeInput(selectedStage.deadline)
                        : current.deadline,
                    }));
                  }}
                >
                  <option value="">请选择已创建的项目管理轮次</option>
                  {projectStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name} · {stage.typeLabel}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                评审轮次
                <input
                  className={fieldClassName}
                  value={reviewAssignmentDraft.roundLabel}
                  onChange={(event) =>
                    setReviewAssignmentDraft((current) => ({ ...current, roundLabel: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-500">
                截止时间
                <input
                  className={fieldClassName}
                  type="datetime-local"
                  value={reviewAssignmentDraft.deadline}
                  onChange={(event) =>
                    setReviewAssignmentDraft((current) => ({ ...current, deadline: event.target.value }))
                  }
                />
              </label>
            </div>

            {!isEditingReviewAssignment ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">选择已生效项目材料</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {selectedReviewStage?.type === "roadshow"
                      ? "路演只用项目组名单生成打分任务，不向专家展示材料。"
                      : "网络评审会把已生效材料同步给专家查看。"}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  已选 {reviewAssignmentDraft.materialSubmissionIds.length} 项
                </span>
              </div>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {approvedProjectMaterialsForReview.length > 0 ? (
                  approvedProjectMaterialsForReview.map((material) => (
                    <label
                      className="flex items-start gap-3 rounded-xl border border-white bg-white px-3 py-2 text-sm"
                      key={material.id}
                    >
                      <input
                        checked={reviewAssignmentDraft.materialSubmissionIds.includes(material.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                        onChange={(event) =>
                          setReviewAssignmentDraft((current) => ({
                            ...current,
                            materialSubmissionIds: event.target.checked
                              ? [...new Set([...current.materialSubmissionIds, material.id])]
                              : current.materialSubmissionIds.filter((id) => id !== material.id),
                          }))
                        }
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-800">
                          {material.teamGroupName} · {material.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">
                          {material.stageName} · {material.fileName}
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-400">
                    当前轮次暂无已生效项目材料，请先在项目管理中完成提交与审批。
                  </p>
                )}
              </div>
            </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">批量选择专家</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {expertMembers.map((member) => (
                  <label
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"
                    key={member.id}
                  >
                    <input
                      checked={reviewAssignmentDraft.expertUserIds.includes(member.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      onChange={(event) =>
                        setReviewAssignmentDraft((current) => ({
                          ...current,
                          expertUserId: event.target.checked ? member.id : current.expertUserId,
                          expertUserIds: event.target.checked
                            ? [...new Set([...current.expertUserIds, member.id])]
                            : current.expertUserIds.filter((id) => id !== member.id),
                        }))
                      }
                      type="checkbox"
                    />
                    <span>{member.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block text-sm text-slate-500">
              任务说明
              <textarea
                className={`${textareaClassName} min-h-28`}
                value={reviewAssignmentDraft.overview}
                onChange={(event) =>
                  setReviewAssignmentDraft((current) => ({ ...current, overview: event.target.value }))
                }
              />
            </label>
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              专家评审轮次直接复用项目管理阶段；网络评审展示已生效材料，路演评审只开放打分权限。
            </p>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeReviewAssignmentModal}>
                取消
              </ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel="保存中..."
                onClick={saveReviewAssignment}
                variant="primary"
              >
                {isEditingReviewAssignment ? "保存修改" : "保存评审任务"}
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reviewMaterialModalOpen ? (
        <Modal title={`上传${expertReviewMaterialLabels[reviewMaterialDraft.kind]}`} onClose={() => setReviewMaterialModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              材料名称
              <input
                className={fieldClassName}
                value={reviewMaterialDraft.name}
                onChange={(event) =>
                  setReviewMaterialDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              选择文件
              <input
                accept={expertReviewAcceptAttributes[reviewMaterialDraft.kind]}
                className={`${fieldClassName} block`}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setReviewMaterialDraft((current) => ({ ...current, file }));
                }}
              />
            </label>
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              {reviewMaterialDraft.kind === "plan"
                ? "计划书仅支持 PDF 导出版，确保评委端在线预览稳定。"
                : reviewMaterialDraft.kind === "ppt"
                  ? "路演材料仅支持 PDF 导出版，确保评委端在线预览稳定。"
                  : "视频支持 .mp4 / .mov / .avi"}，单文件最大 30MB。
            </p>
            {reviewMaterialUploadProgress !== null ? (
              <div className={`${subtleCardClassName} space-y-3`}>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>当前上传进度</span>
                  <span className="font-medium text-slate-700">{reviewMaterialUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${reviewMaterialUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setReviewMaterialModalOpen(false)}>
                取消
              </ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel={reviewMaterialSavingLabel}
                onClick={() => void saveReviewMaterial()}
                variant="primary"
              >
                保存材料
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {notificationsOpen ? (
        <Modal
          onClose={() => setNotificationsOpen(false)}
          panelClassName="max-h-[min(92vh,860px)] max-w-[min(94vw,860px)] sm:max-w-[min(92vw,860px)]"
          title="今日待办"
        >
          <div className="space-y-5 overflow-hidden">
            <div className={`todo-modal-summary-card ${subtleCardClassName}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">待处理事项总览</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    未标记为已读的内容会继续保留在待办入口；通知点开后自动标记为已读。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="todo-modal-count-chip">
                    <span className="todo-modal-count-value">{visibleRoleTodoItems.length}</span>
                    <span>待办</span>
                  </span>
                  <span className="todo-modal-count-chip">
                    <span className="todo-modal-count-value">{todoNotifications.length}</span>
                    <span>提醒</span>
                  </span>
                  {urgentTodoCount > 0 ? (
                    <span className="todo-modal-count-chip urgent">
                      <span className="todo-modal-count-value">{urgentTodoCount}</span>
                      <span>紧急</span>
                    </span>
                  ) : null}
                </div>
              </div>
              {todoItemCount > 0 ? (
                <div className="mt-4 flex justify-end">
                  <ActionButton onClick={() => void markAllTodoItemsAsRead()}>
                    全部标记已读
                  </ActionButton>
                </div>
              ) : null}
            </div>

            {visibleRoleTodoItems.length > 0 ? (
              <section className="space-y-3">
                <div className="todo-modal-section-header">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">待办事项</p>
                    <p className="mt-1 text-xs text-slate-400">需要主动推进的事项，收起后仍可从待办入口再次查看。</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {visibleRoleTodoItems.map((item) => (
                    <div
                      className={`todo-modal-role-card ${
                        item.priority === "danger"
                          ? "danger"
                          : item.priority === "warning"
                            ? "warning"
                            : "normal"
                      }`}
                      key={item.id}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_136px] gap-4 sm:items-start sm:gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            {item.priority === "danger" ? (
                              <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                                紧急
                              </span>
                            ) : item.priority === "warning" ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                                待处理
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                        </div>
                        <div className="todo-modal-action">
                          <ActionButton className="todo-modal-dismiss" onClick={() => dismissTodoItem(item.id)}>
                            收起
                          </ActionButton>
                          <ActionButton onClick={() => void openTodoItem(item)} variant="primary">
                            {item.actionLabel}
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {todoNotifications.length > 0 ? (
              <section className="space-y-3">
                <div className="todo-modal-section-header">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">未读提醒</p>
                    <p className="mt-1 text-xs text-slate-400">点击提醒进入处理页后会自动标记为已读。</p>
                  </div>
                </div>
                <div className="todo-modal-notice-list space-y-3">
                  {todoNotifications.map((item) => (
                    <button
                      className="todo-modal-notice-card w-full text-left transition"
                      key={item.id}
                      onClick={() => void openTodoItem(item)}
                      type="button"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-3 sm:items-start sm:gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                        </div>
                        <div className="todo-modal-action">
                          <span className="text-sm font-medium text-blue-600">{item.actionLabel}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {todoItemCount === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200">
                <EmptyState
                  description="当前没有需要你立刻处理的事项，今天的节奏已经很不错了。"
                  icon={BellPlus}
                  title="暂时没有新的待办"
                />
              </div>
            ) : null}

            <ModalActions>
              <ActionButton onClick={() => setNotificationsOpen(false)}>稍后处理</ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reminderModalOpen ? (
        <Modal onClose={closeReminderModal} title="发送站内提醒">
          <div className="space-y-4">
            <div className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              当前提醒对象：
              <span className="ml-1 font-medium text-slate-800">
                {reminderTargetMember?.name}（{reminderTargetMember?.systemRole}）
              </span>
            </div>

            <div>
              <label className="text-sm text-slate-500">
                提醒标题 <span className="text-red-500">*</span>
                <input
                  className={reminderDraftErrors.title ? fieldErrorClassName : fieldClassName}
                  placeholder="例如：请尽快补齐材料并同步结果"
                  type="text"
                  value={reminderDraft.title}
                  onChange={(event) =>
                    setReminderDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </label>
              {reminderDraftErrors.title ? (
                <p className="mt-1 text-xs text-red-500">{reminderDraftErrors.title}</p>
              ) : null}
            </div>

            <div>
              <label className="text-sm text-slate-500">
                跳转板块
                <select
                  className={fieldClassName}
                  value={reminderDraft.targetTab}
                  onChange={(event) =>
                    setReminderDraft((current) => ({ ...current, targetTab: event.target.value }))
                  }
                >
                  <option value="">仅提醒，不跳转</option>
                  {reminderTabOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label className="text-sm text-slate-500">
                提醒内容 <span className="text-red-500">*</span>
                <textarea
                  className={reminderDraftErrors.detail ? fieldErrorClassName : textareaClassName}
                  placeholder="请填写需要对方查看和执行的事项。"
                  value={reminderDraft.detail}
                  onChange={(event) =>
                    setReminderDraft((current) => ({ ...current, detail: event.target.value }))
                  }
                />
              </label>
              {reminderDraftErrors.detail ? (
                <p className="mt-1 text-xs text-red-500">{reminderDraftErrors.detail}</p>
              ) : null}
            </div>

            {reminderDraftErrors.submit ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {reminderDraftErrors.submit}
              </div>
            ) : null}

            <ModalActions>
              <ActionButton disabled={isSaving} onClick={closeReminderModal}>
                取消
              </ActionButton>
              <ActionButton loading={isSaving} loadingLabel="发送中..." onClick={saveReminder} variant="primary">
                发送提醒
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {emailSettingsModalOpen ? (
        <Modal
          onClose={() => setEmailSettingsModalOpen(false)}
          panelClassName="max-w-[min(92vw,760px)]"
          title="邮件提醒设置"
        >
          <div className="space-y-4">
            <div className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              该设置仅全局管理员可修改，保存后对全体成员生效；站内提醒不受影响。
            </div>

            {emailSettingsLoading ? (
              <div className={`${subtleCardClassName} flex items-center justify-center py-10 text-sm text-slate-500`}>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在加载邮件提醒设置...
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {emailReminderSettingItems.map((item) => (
                    <label
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/30"
                      key={item.key}
                    >
                      <input
                        checked={Boolean(emailSettingsDraft[item.key])}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        onChange={(event) =>
                          setEmailSettingsDraft((current) => ({
                            ...current,
                            [item.key]: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <label className="block rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  每日未提交汇报提醒时间
                  <select
                    className={fieldClassName}
                    value={emailSettingsDraft.dailyReportHour}
                    onChange={(event) =>
                      setEmailSettingsDraft((current) => ({
                        ...current,
                        dailyReportHour: Number(event.target.value),
                      }))
                    }
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {`${hour}`.padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs leading-5 text-slate-400">
                    系统会按小时检查，到达这里设置的整点才发送邮件。
                  </span>
                </label>
              </>
            )}

            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setEmailSettingsModalOpen(false)}>
                取消
              </ActionButton>
              <ActionButton
                disabled={emailSettingsLoading}
                loading={isSaving}
                loadingLabel="保存中..."
                onClick={() => void saveEmailSettings()}
                variant="primary"
              >
                保存设置
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {sentRemindersOpen ? (
        <Modal onClose={() => setSentRemindersOpen(false)} panelClassName="max-w-[min(92vw,860px)]" title="邮件提醒记录">
          <div className="space-y-4">
            <div className={`${subtleCardClassName} flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
              <div>
                <p className="text-sm font-medium text-slate-900">这里仅展示邮件提醒的发送结果。</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">站内提醒仍会正常发送，但不再在这里显示已读/未读状态。</p>
              </div>
              <ActionButton disabled={sentRemindersLoading} onClick={() => void loadSentReminders()}>
                刷新记录
              </ActionButton>
            </div>

            {sentRemindersLoading ? (
              <div className={`${subtleCardClassName} flex items-center justify-center py-12 text-sm text-slate-500`}>
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在加载邮件提醒记录...</span>
                </span>
              </div>
            ) : sentReminders.length > 0 ? (
              <div className="space-y-3">
                {sentReminders.map((item) => (
                  (() => {
                    const emailMeta = getNotificationEmailStatusMeta(item.emailStatus, item.emailError);
                    const statusClassName =
                      emailMeta.tone === "success"
                        ? "bg-emerald-100 text-emerald-700"
                        : emailMeta.tone === "danger"
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-600";

                    return (
                      <article key={item.id} className={surfaceCardClassName}>
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClassName}`}>
                                {emailMeta.label}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                              <span>接收人：{item.recipient?.name ?? "成员"}</span>
                              {item.recipient?.email ? <span>邮箱：{item.recipient.email}</span> : null}
                              <span>创建时间：{item.createdAt}</span>
                              {item.emailSentAt ? <span>邮件发送时间：{item.emailSentAt}</span> : null}
                              {item.targetTab ? (
                                <span>
                                  跳转板块：
                                  {allTabs.find((tab) => tab.key === item.targetTab)?.label ?? item.targetTab}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-500 md:max-w-[220px]">
                            <p className="font-medium text-slate-700">{emailMeta.label}</p>
                            <p className="mt-1 leading-5">{emailMeta.detail}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })()
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200">
                <EmptyState
                  description="你最近还没有发送新的邮件提醒，后续发送后会在这里查看邮件发送结果。"
                  icon={BellPlus}
                  title="暂无邮件提醒记录"
                />
              </div>
            )}

            <ModalActions>
              <ActionButton onClick={() => setSentRemindersOpen(false)}>关闭</ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {previewAsset ? (
        <Modal
          bodyClassName="px-5 py-4 md:px-6 md:py-5"
          onClose={() => setPreviewAsset(null)}
          size="preview"
          title={previewAsset.title}
        >
          <div className="space-y-4">
            {previewAsset.mode === "download-fallback" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <div className="space-y-3">
                  <p className="text-base font-medium text-slate-900">
                    {previewAsset.fileName || "当前文件"}
                  </p>
                  <p className="text-sm leading-7 text-slate-500">
                    {previewAsset.fallbackMessage || "该文件类型暂不支持站内预览，请下载后使用本地软件查看。"}
                  </p>
                </div>
              </div>
            ) : previewAsset.mimeType?.startsWith("video/") ? (
              <video
                className="max-h-[78vh] w-full rounded-lg border border-slate-200 bg-black"
                controls
                playsInline
                src={previewAsset.url}
              />
            ) : isPdfAsset(previewAsset) ? (
              <PdfPreview url={previewAsset.url} />
            ) : isImageAsset(previewAsset) ? (
              <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={previewAsset.fileName || previewAsset.title}
                  className="block h-auto max-w-none rounded-md border border-slate-200 bg-white shadow-sm"
                  loading="eager"
                  src={previewAsset.url}
                />
              </div>
            ) : (
              <iframe
                className="h-[78vh] w-full rounded-lg border border-slate-200 bg-white"
                src={previewAsset.url}
                title={previewAsset.title}
              />
            )}
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              {previewAsset.mode === "download-fallback"
                ? "已为当前文件切换到下载查看模式。"
                : previewAsset.mimeType?.startsWith("video/")
                ? "视频材料支持在当前页面直接播放。"
                : isPdfAsset(previewAsset)
                  ? "PDF 使用站内渲染模式，避免浏览器原生预览层在后台页面残留。"
                  : isImageAsset(previewAsset)
                    ? "图片按原始清晰度显示，可在窗口内滚动查看细节。"
                    : isWordAsset(previewAsset)
                      ? "Word 文档已切换为站内只读预览；在线标注和协同修改需要后续接入文档协作服务。"
                      : "已切换为站内在线预览模式。"}
            </p>
            <ModalActions>
              {previewAsset.mode === "download-fallback" ? (
                <ActionButton
                  onClick={() => handleDownload(previewAsset.downloadUrl)}
                  variant="primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    <span>下载查看</span>
                  </span>
                </ActionButton>
              ) : null}
              <ActionButton onClick={() => setPreviewAsset(null)}>关闭</ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {documentModalOpen ? (
        <Modal title="上传文档" onClose={() => setDocumentModalOpen(false)}>
          <div className="space-y-4">
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              仅支持 `.doc`、`.docx`、`.pdf`、`.xls`、`.xlsx`、`.txt`、`.jpg`、`.jpeg`、`.png`、
              `.zip`、`.rar`、`.7z`，单文件最大 100MB；不支持视频和 PPT 源文件。若选择 “PPT” 分类，请上传导出版 PDF 或图片版本。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                文档名称
                <input
                  className={fieldClassName}
                  value={documentDraft.name}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-500">
                文档分类
                <select
                  className={fieldClassName}
                  value={documentDraft.category}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({
                      ...current,
                      category: event.target.value as DocumentDraft["category"],
                    }))
                  }
                >
                  {documentCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              版本说明
              <textarea
                className={`${textareaClassName} min-h-24`}
                value={documentDraft.note}
                onChange={(event) =>
                  setDocumentDraft((current) => ({ ...current, note: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-slate-500">
              选择文件
              <input
                accept={documentCenterAcceptAttribute}
                className={`${fieldClassName} block`}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const validationError = validateClientFile(file, {
                    allowArchives: true,
                    maxSizeBytes: MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
                    maxSizeLabel: "100MB",
                  });
                  if (validationError && file) {
                    setLoadError(validationError);
                    event.target.value = "";
                    setDocumentDraft((current) => ({ ...current, file: null }));
                    return;
                  }
                  setDocumentDraft((current) => ({ ...current, file }));
                }}
              />
            </label>
            {documentUploadProgress !== null ? (
              <div className={`${subtleCardClassName} space-y-3`}>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>当前上传进度</span>
                  <span className="font-medium text-slate-700">{documentUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${documentUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setDocumentModalOpen(false)}>取消</ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel={documentSavingLabel}
                onClick={() => void saveDocument()}
                variant="primary"
              >
                上传文档
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {versionModalOpen ? (
        <Modal title="上传文档新版本" onClose={() => setVersionModalOpen(false)}>
          <div className="space-y-4">
            <p className={`${subtleCardClassName} text-sm leading-7 text-slate-500`}>
              仅支持 `.doc`、`.docx`、`.pdf`、`.xls`、`.xlsx`、`.txt`、`.jpg`、`.jpeg`、`.png`、
              `.zip`、`.rar`、`.7z`，单文件最大 100MB；不支持视频和 PPT 源文件。若选择 “PPT” 分类，请上传导出版 PDF 或图片版本。
            </p>
            <label className="block text-sm text-slate-500">
              版本说明
              <textarea
                className={`${textareaClassName} min-h-24`}
                value={versionUploadNote}
                onChange={(event) => setVersionUploadNote(event.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-500">
              选择文件
              <input
                accept={documentCenterAcceptAttribute}
                className={`${fieldClassName} block`}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const validationError = validateClientFile(file, {
                    allowArchives: true,
                    maxSizeBytes: MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
                    maxSizeLabel: "100MB",
                  });
                  if (validationError && file) {
                    setLoadError(validationError);
                    event.target.value = "";
                    setVersionUploadFile(null);
                    return;
                  }
                  setVersionUploadFile(file);
                }}
              />
            </label>
            {versionUploadProgress !== null ? (
              <div className={`${subtleCardClassName} space-y-3`}>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>当前上传进度</span>
                  <span className="font-medium text-slate-700">{versionUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${versionUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setVersionModalOpen(false)}>取消</ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel={versionSavingLabel}
                onClick={() => void uploadNewDocumentVersion()}
                variant="primary"
              >
                上传新版本
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {reviewModalOpen && reviewAction ? (
        <Modal
          title={reviewActionTitles[reviewAction]}
          onClose={() => {
            setReviewModalOpen(false);
            setReviewTargetDocId(null);
            setReviewAction(null);
            setReviewComment("");
          }}
        >
          <div className="space-y-4">
            <label className="block text-sm text-slate-500">
              审批批注
              <textarea
                className={textareaClassName}
                placeholder="请填写审批批注（可选）"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
              />
            </label>
            <ModalActions>
              <ActionButton
                disabled={isSaving}
                onClick={() => {
                  setReviewModalOpen(false);
                  setReviewTargetDocId(null);
                  setReviewAction(null);
                  setReviewComment("");
                }}
              >
                取消
              </ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel="提交中..."
                onClick={() => void reviewDocument()}
                variant={reviewAction === "leaderRevision" || reviewAction === "teacherRevision" ? "danger" : "primary"}
              >
                确认提交
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {teamModalOpen ? (
        <Modal title="创建账号" onClose={() => setTeamModalOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
              通过团队管理创建的直属账号会立即生效，无需再走待审核流程。
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                姓名 / 显示名
                <input
                  className={fieldClassName}
                  value={teamDraft.name}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="block text-sm text-slate-500">
                用户名
                <input
                  className={fieldClassName}
                  value={teamDraft.username}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, username: event.target.value }))}
                />
                <span className="mt-1 block text-xs leading-6 text-slate-400">{USERNAME_RULE_HINT}</span>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-500">
                邮箱
                <input
                  className={fieldClassName}
                  value={teamDraft.email}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="block text-sm text-slate-500">
                初始密码
                <input
                  className={fieldClassName}
                  value={teamDraft.password}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm text-slate-500">
              角色
              <select
                className={fieldClassName}
                value={teamDraft.role}
                onChange={(event) =>
                  setTeamDraft((current) => ({
                    ...current,
                    role: event.target.value as TeamRoleLabel,
                    teamGroupId: event.target.value === "评审专家" ? "" : current.teamGroupId,
                  }))
                }
              >
                {availableRoleOptions.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleOption}
                  </option>
                ))}
              </select>
            </label>
            {hasGlobalAdminRole && teamDraft.role !== "评审专家" && teamDraft.role !== "校级管理员" ? (
              <label className="block text-sm text-slate-500">
                分组（选填）
                <select
                  className={fieldClassName}
                  value={teamDraft.teamGroupId}
                  onChange={(event) =>
                    setTeamDraft((current) => ({ ...current, teamGroupId: event.target.value }))
                  }
                >
                  <option value="">暂不分组</option>
                  {teamGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setTeamModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="保存中..." onClick={saveTeamMember} variant="primary">
                创建账号
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {batchExpertModalOpen ? (
        <Modal title="批量添加评审专家" onClose={() => setBatchExpertModalOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-500">
              每行填写一个专家账号，格式为：
              <span className="mx-1 font-medium text-slate-700">姓名，账号名，初始密码，邮箱</span>
              。初始密码和邮箱可不填，未填写密码时默认使用 123456。
            </div>
            <label className="block text-sm text-slate-500">
              专家账号数据
              <textarea
                className={`${textareaClassName} min-h-[180px] font-mono text-sm`}
                placeholder={"王老师,expertwang,123456,wang@example.com\n李老师,expertli,123456,li@example.com"}
                value={batchExpertDraft.rows}
                onChange={(event) => setBatchExpertDraft({ rows: event.target.value })}
              />
              <span className="mt-1 block text-xs leading-6 text-slate-400">
                账号名仅支持英文字母和数字，不允许中文；批量创建后账号会直接生效。
              </span>
            </label>
            <ModalActions>
              <ActionButton
                disabled={isSaving}
                onClick={() => {
                  setBatchExpertDraft(defaultBatchExpertDraft);
                  setBatchExpertModalOpen(false);
                }}
              >
                取消
              </ActionButton>
              <ActionButton
                loading={isSaving}
                loadingLabel="创建中..."
                onClick={() => void saveBatchExperts()}
                variant="primary"
              >
                批量创建
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {passwordModalOpen ? (
        <Modal title="重置密码" onClose={() => setPasswordModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-slate-500">
              正在为 {passwordTargetMember?.name ?? "该成员"} 设置新密码。
            </p>
            <label className="block text-sm text-slate-500">
              新密码
              <input
                className={fieldClassName}
                type="password"
                value={passwordDraft}
                onChange={(event) => setPasswordDraft(event.target.value)}
              />
            </label>
            <ModalActions>
              <ActionButton disabled={isSaving} onClick={() => setPasswordModalOpen(false)}>取消</ActionButton>
              <ActionButton loading={isSaving} loadingLabel="提交中..." onClick={resetMemberPassword} variant="primary">
                确认重置
              </ActionButton>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        confirmLabel={confirmDialog?.confirmLabel ?? "确认"}
        confirmVariant={confirmDialog?.confirmVariant}
        isLoading={isSaving}
        message={confirmDialog?.message ?? ""}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => void handleConfirmDialog()}
        open={Boolean(confirmDialog?.open)}
        title={confirmDialog?.title ?? "确认操作"}
      />
    </>
  );
}
