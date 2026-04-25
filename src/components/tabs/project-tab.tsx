"use client";

import { useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";

type StageDraft = {
  name: string;
  type: Workspace.ProjectReviewStageTypeKey;
  description: string;
  teamGroupId: string;
  startAt: string;
  deadline: string;
  isOpen: boolean;
};

type MaterialDraft = {
  stageId: string;
  title: string;
};

const defaultStageDraft: StageDraft = {
  name: "",
  type: "online_review",
  description: "",
  teamGroupId: "",
  startAt: "",
  deadline: "",
  isOpen: true,
};

const defaultMaterialDraft: MaterialDraft = {
  stageId: "",
  title: "",
};

const stageTypeOptions: Array<{
  value: Workspace.ProjectReviewStageTypeKey;
  label: string;
  description: string;
}> = [
  {
    value: "online_review",
    label: "网络评审材料",
    description: "用于网评阶段，专家可按管理员分配查看材料。",
  },
  {
    value: "roadshow",
    label: "路演归档材料",
    description: "用于路演前归档，路演专家打分界面不展示材料。",
  },
];

const statusBadgeClassNames: Record<Workspace.ProjectMaterialStatusKey, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

const isStageWithinActiveWindow = (stage: Workspace.ProjectReviewStageItem) => {
  const now = Date.now();
  const startAt = stage.startAt ? new Date(stage.startAt).getTime() : null;
  const deadline = stage.deadline ? new Date(stage.deadline).getTime() : null;

  if (startAt && startAt > now) {
    return false;
  }

  if (deadline && deadline < now) {
    return false;
  }

  return true;
};

const getStageScopeLabel = (stage: Workspace.ProjectReviewStageItem) =>
  stage.teamGroup?.name ? `限定项目组：${stage.teamGroup.name}` : "全部项目组可提交";

const toApiDate = (value: string) => (value ? new Date(value).toISOString() : null);

export default function ProjectTab() {
  const {
    currentUser,
    currentRole,
    hasGlobalAdminRole,
    teamGroups,
    projectStages,
    projectMaterials,
    isSaving,
    setIsSaving,
    setLoadError,
    setConfirmDialog,
    showSuccessToast,
    refreshWorkspace,
  } = Workspace.useWorkspaceContext();

  const {
    ActionButton,
    EmptyState,
    FileCheck,
    FileText,
    FolderOpen,
    Loader2,
    Pencil,
    Plus,
    SectionHeader,
    Trash2,
    Upload,
    UserAvatar,
    fieldClassName,
    formatDateTime,
    formatFileSize,
    requestJson,
    textareaClassName,
    toDateTimeInputValue,
    uploadFileDirectly,
  } = Workspace;

  const [stageDraft, setStageDraft] = useState<StageDraft>(defaultStageDraft);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [materialDraft, setMaterialDraft] = useState<MaterialDraft>(defaultMaterialDraft);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialSavingLabel, setMaterialSavingLabel] = useState("上传材料");
  const [materialUploadProgress, setMaterialUploadProgress] = useState<number | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const canManageStages = hasGlobalAdminRole;
  const canUploadMaterials =
    (currentRole === "leader" || currentRole === "member") && Boolean(currentUser?.teamGroupId);
  const canReviewMaterials =
    hasGlobalAdminRole || (currentRole === "teacher" && Boolean(currentUser?.teamGroupId));

  const openStagesForUpload = useMemo(
    () =>
      projectStages.filter(
        (stage) =>
          stage.isOpen &&
          isStageWithinActiveWindow(stage) &&
          (!stage.teamGroup?.id || stage.teamGroup.id === currentUser?.teamGroupId),
      ),
    [currentUser?.teamGroupId, projectStages],
  );

  const sortedMaterials = useMemo(
    () =>
      [...projectMaterials].sort((left, right) => {
        const statusWeight: Record<Workspace.ProjectMaterialStatusKey, number> = {
          pending: 0,
          rejected: 1,
          approved: 2,
        };
        const statusDelta = statusWeight[left.status] - statusWeight[right.status];
        if (statusDelta !== 0) {
          return statusDelta;
        }
        return new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime();
      }),
    [projectMaterials],
  );

  const resetStageForm = () => {
    setEditingStageId(null);
    setStageDraft(defaultStageDraft);
  };

  const editStage = (stage: Workspace.ProjectReviewStageItem) => {
    setEditingStageId(stage.id);
    setStageDraft({
      name: stage.name,
      type: stage.type,
      description: stage.description ?? "",
      teamGroupId: stage.teamGroup?.id ?? "",
      startAt: stage.startAt ? toDateTimeInputValue(stage.startAt) : "",
      deadline: stage.deadline ? toDateTimeInputValue(stage.deadline) : "",
      isOpen: stage.isOpen,
    });
  };

  const saveStage = async () => {
    if (!stageDraft.name.trim()) {
      setLoadError("请填写项目阶段名称");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson<{ stage: Workspace.ProjectReviewStageItem }>(
        editingStageId ? `/api/project-stages/${editingStageId}` : "/api/project-stages",
        {
          method: editingStageId ? "PUT" : "POST",
          body: JSON.stringify({
            name: stageDraft.name.trim(),
            type: stageDraft.type,
            description: stageDraft.description.trim() || null,
            teamGroupId: stageDraft.teamGroupId || null,
            startAt: toApiDate(stageDraft.startAt),
            deadline: toApiDate(stageDraft.deadline),
            isOpen: stageDraft.isOpen,
          }),
        },
      );

      resetStageForm();
      showSuccessToast(editingStageId ? "项目阶段已更新" : "项目阶段已创建");
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "项目阶段保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteStage = (stage: Workspace.ProjectReviewStageItem) => {
    setConfirmDialog({
      open: true,
      title: "删除项目阶段",
      message: `确认删除「${stage.name}」？该阶段下的项目材料记录也会被一并删除。`,
      confirmLabel: "确认删除",
      successTitle: "项目阶段已删除",
      onConfirm: async () => {
        await requestJson(`/api/project-stages/${stage.id}`, { method: "DELETE" });
        refreshWorkspace();
      },
    });
  };

  const submitMaterial = async () => {
    if (!materialDraft.stageId) {
      setLoadError("请选择项目阶段");
      return;
    }

    if (!materialFile) {
      setLoadError("请选择需要上传的项目材料");
      return;
    }

    const title = materialDraft.title.trim() || materialFile.name;
    setIsSaving(true);
    setMaterialUploadProgress(null);
    setMaterialSavingLabel("准备上传...");

    try {
      const uploadTicket = await requestJson<{
        uploadUrl: string;
        objectKey: string;
        uploadToken: string;
        contentType: string;
      }>("/api/project-materials/upload-url", {
        method: "POST",
        body: JSON.stringify({
          stageId: materialDraft.stageId,
          fileName: materialFile.name,
          fileSize: materialFile.size,
          mimeType: materialFile.type || "application/octet-stream",
        }),
      });

      setMaterialSavingLabel("直传中... 0%");
      await uploadFileDirectly({
        url: uploadTicket.uploadUrl,
        file: materialFile,
        contentType: uploadTicket.contentType,
        onProgress: (percent) => {
          setMaterialUploadProgress(percent);
          setMaterialSavingLabel(`直传中... ${percent}%`);
        },
      });

      setMaterialSavingLabel("保存中...");
      await requestJson<{ material: Workspace.ProjectMaterialSubmissionItem }>("/api/project-materials", {
        method: "POST",
        body: JSON.stringify({
          stageId: materialDraft.stageId,
          title,
          fileName: materialFile.name,
          filePath: uploadTicket.objectKey,
          fileSize: materialFile.size,
          mimeType: uploadTicket.contentType,
          uploadToken: uploadTicket.uploadToken,
        }),
      });

      setMaterialDraft(defaultMaterialDraft);
      setMaterialFile(null);
      showSuccessToast("项目材料已提交", "材料已进入指导教师审批流程。");
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "项目材料上传失败");
    } finally {
      setIsSaving(false);
      setMaterialSavingLabel("上传材料");
      setMaterialUploadProgress(null);
    }
  };

  const approveMaterial = async (material: Workspace.ProjectMaterialSubmissionItem) => {
    setIsSaving(true);
    try {
      await requestJson<{ material: Workspace.ProjectMaterialSubmissionItem }>(
        `/api/project-materials/${material.id}/approve`,
        { method: "POST" },
      );
      showSuccessToast("项目材料已通过", `${material.teamGroupName} 的最终材料已经生效。`);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "项目材料审批失败");
    } finally {
      setIsSaving(false);
    }
  };

  const rejectMaterial = async (material: Workspace.ProjectMaterialSubmissionItem) => {
    const reason = rejectReasons[material.id]?.trim();
    if (!reason) {
      setLoadError("请填写驳回原因");
      return;
    }

    setIsSaving(true);
    try {
      await requestJson<{ material: Workspace.ProjectMaterialSubmissionItem }>(
        `/api/project-materials/${material.id}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
      setRejectReasons((current) => ({ ...current, [material.id]: "" }));
      showSuccessToast("项目材料已驳回", "学生端已收到修改通知。");
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "项目材料驳回失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        description="按评审阶段沉淀项目组最终材料，学生提交后由本组任意指导教师审批生效。"
        title="项目管理"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(30,64,175,0.08)]">
          <p className="text-xs font-medium text-slate-500">评审阶段</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{projectStages.length}</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(30,64,175,0.08)]">
          <p className="text-xs font-medium text-slate-500">待审批材料</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">
            {projectMaterials.filter((item) => item.status === "pending").length}
          </p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(30,64,175,0.08)]">
          <p className="text-xs font-medium text-slate-500">已生效材料</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-600">
            {projectMaterials.filter((item) => item.status === "approved").length}
          </p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(30,64,175,0.08)]">
          <p className="text-xs font-medium text-slate-500">已驳回材料</p>
          <p className="mt-2 text-3xl font-semibold text-rose-600">
            {projectMaterials.filter((item) => item.status === "rejected").length}
          </p>
        </div>
      </section>

      {canManageStages ? (
        <section className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(30,64,175,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                {editingStageId ? "编辑评审阶段" : "创建评审阶段"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                管理员先开放网评或路演材料阶段，学生端才会出现对应上传入口。
              </p>
            </div>
            {editingStageId ? (
              <ActionButton onClick={resetStageForm} variant="secondary">
                取消编辑
              </ActionButton>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              阶段名称
              <input
                className={fieldClassName}
                onChange={(event) => setStageDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="如：第一轮网络评审材料提交"
                value={stageDraft.name}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              阶段类型
              <select
                className={fieldClassName}
                onChange={(event) =>
                  setStageDraft((current) => ({
                    ...current,
                    type: event.target.value as Workspace.ProjectReviewStageTypeKey,
                  }))
                }
                value={stageDraft.type}
              >
                {stageTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-400">
                {stageTypeOptions.find((item) => item.value === stageDraft.type)?.description}
              </span>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              限定项目组
              <select
                className={fieldClassName}
                onChange={(event) => setStageDraft((current) => ({ ...current, teamGroupId: event.target.value }))}
                value={stageDraft.teamGroupId}
              >
                <option value="">全部项目组</option>
                {teamGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                checked={stageDraft.isOpen}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                onChange={(event) =>
                  setStageDraft((current) => ({ ...current, isOpen: event.target.checked }))
                }
                type="checkbox"
              />
              当前开放学生上传
            </label>
            <label className="block text-sm font-medium text-slate-700">
              开始时间
              <input
                className={fieldClassName}
                onChange={(event) => setStageDraft((current) => ({ ...current, startAt: event.target.value }))}
                type="datetime-local"
                value={stageDraft.startAt}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              截止时间
              <input
                className={fieldClassName}
                onChange={(event) => setStageDraft((current) => ({ ...current, deadline: event.target.value }))}
                type="datetime-local"
                value={stageDraft.deadline}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
              阶段说明
              <textarea
                className={textareaClassName}
                onChange={(event) => setStageDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="说明提交内容、材料格式或本轮用途。"
                value={stageDraft.description}
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <ActionButton disabled={isSaving} onClick={() => void saveStage()} variant="primary">
              <span className="inline-flex items-center gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span>{editingStageId ? "保存阶段" : "创建阶段"}</span>
              </span>
            </ActionButton>
          </div>
        </section>
      ) : null}

      {canUploadMaterials ? (
        <section className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(30,64,175,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">提交项目材料</h3>
              <p className="mt-1 text-sm text-slate-500">
                只能提交本项目组材料，提交后需要本组任意指导教师审批通过后生效。
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {currentUser?.teamGroupName ?? "当前项目组"}
            </span>
          </div>

          {openStagesForUpload.length > 0 ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr_auto] lg:items-end">
              <label className="block text-sm font-medium text-slate-700">
                选择阶段
                <select
                  className={fieldClassName}
                  onChange={(event) =>
                    setMaterialDraft((current) => ({ ...current, stageId: event.target.value }))
                  }
                  value={materialDraft.stageId}
                >
                  <option value="">请选择开放阶段</option>
                  {openStagesForUpload.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name} · {stage.typeLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                材料标题
                <input
                  className={fieldClassName}
                  onChange={(event) =>
                    setMaterialDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="不填则使用文件名"
                  value={materialDraft.title}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                上传文件
                <input
                  className={`${fieldClassName} file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700`}
                  onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              <div className="lg:col-span-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">
                  支持 PDF、PPT、Word、Excel、图片和视频，单个文件不超过 100MB。
                  {materialUploadProgress !== null ? ` 当前进度 ${materialUploadProgress}%` : ""}
                </p>
                <ActionButton disabled={isSaving} onClick={() => void submitMaterial()} variant="primary">
                  <span className="inline-flex items-center gap-2">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span>{materialSavingLabel}</span>
                  </span>
                </ActionButton>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前暂无开放的项目材料提交阶段。
            </div>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(30,64,175,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">项目阶段</h3>
              <p className="mt-1 text-sm text-slate-500">管理员设置后，学生端按开放时间提交对应材料。</p>
            </div>
            <FolderOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-4 space-y-3">
            {projectStages.length > 0 ? (
              projectStages.map((stage) => (
                <article key={stage.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-950">{stage.name}</h4>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {stage.typeLabel}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            stage.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {stage.isOpen ? "开放中" : "已关闭"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{stage.description || getStageScopeLabel(stage)}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        {stage.startAt ? `开始 ${formatDateTime(stage.startAt)}` : "未设置开始时间"} ·{" "}
                        {stage.deadline ? `截止 ${formatDateTime(stage.deadline)}` : "未设置截止时间"} ·{" "}
                        已提交 {stage.submissionCount} 份
                      </p>
                    </div>
                    {canManageStages ? (
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          onClick={() => editStage(stage)}
                          title="编辑阶段"
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => deleteStage(stage)}
                          title="删除阶段"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                description="管理员创建评审阶段后，项目组才可以提交对应材料。"
                icon={FolderOpen}
                title="暂无项目阶段"
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(30,64,175,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">项目材料</h3>
              <p className="mt-1 text-sm text-slate-500">
                {canReviewMaterials ? "指导教师审批本组材料；管理员可查看全校材料状态。" : "查看本组材料审批状态。"}
              </p>
            </div>
            <FileText className="h-5 w-5 text-blue-600" />
          </div>

          <div className="mt-4 space-y-3">
            {sortedMaterials.length > 0 ? (
              sortedMaterials.map((material) => (
                <article key={material.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClassNames[material.status]}`}>
                          {material.statusLabel}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                          {material.stageName}
                        </span>
                      </div>
                      <h4 className="mt-3 text-base font-semibold text-slate-950">{material.title}</h4>
                      <p className="mt-2 text-sm text-slate-500">
                        {material.teamGroupName} · {material.fileName} · {formatFileSize(material.fileSize)}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>提交时间：{formatDateTime(material.submittedAt)}</span>
                        {material.approvedAt ? <span>通过时间：{formatDateTime(material.approvedAt)}</span> : null}
                        {material.rejectedAt ? <span>驳回时间：{formatDateTime(material.rejectedAt)}</span> : null}
                      </div>
                      {material.rejectReason ? (
                        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                          驳回原因：{material.rejectReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex min-w-40 items-center gap-3">
                      <UserAvatar
                        avatar={material.submitter?.avatar ?? material.submitter?.name?.slice(0, 1) ?? "项"}
                        avatarUrl={null}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700"
                        name={material.submitter?.name ?? "提交人"}
                        textClassName="text-sm font-semibold text-blue-700"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{material.submitter?.name ?? "未知提交人"}</p>
                        <p className="text-xs text-slate-400">提交人</p>
                      </div>
                    </div>
                  </div>

                  {canReviewMaterials && material.status === "pending" ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                        <input
                          className={fieldClassName}
                          onChange={(event) =>
                            setRejectReasons((current) => ({
                              ...current,
                              [material.id]: event.target.value,
                            }))
                          }
                          placeholder="如需驳回，请填写修改原因"
                          value={rejectReasons[material.id] ?? ""}
                        />
                        <ActionButton disabled={isSaving} onClick={() => void approveMaterial(material)} variant="primary">
                          <span className="inline-flex items-center gap-2">
                            <FileCheck className="h-4 w-4" />
                            <span>审批通过</span>
                          </span>
                        </ActionButton>
                        <ActionButton
                          className="border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                          disabled={isSaving}
                          onClick={() => void rejectMaterial(material)}
                          variant="secondary"
                        >
                          驳回修改
                        </ActionButton>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <EmptyState
                description="学生或项目负责人提交材料后，这里会显示审批状态和最终归档结果。"
                icon={FileText}
                title="暂无项目材料"
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
