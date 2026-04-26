"use client";

import { useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";

type StageDraft = {
  name: string;
  type: Workspace.ProjectReviewStageTypeKey;
  description: string;
  requiredMaterials: MaterialRequirementKey[];
  teamGroupIds: string[];
  startAt: string;
  deadline: string;
  isOpen: boolean;
};

type MaterialRequirementKey = "plan_pdf" | "ppt_pdf" | "video_20mb";

type MaterialDraft = {
  stageId: string;
  materialKind: MaterialRequirementKey | "";
  title: string;
};

const projectMaterialRequirementOptions: Array<{
  key: MaterialRequirementKey;
  label: string;
  description: string;
  accept: string;
}> = [
  { key: "ppt_pdf", label: "PPT PDF", description: "PPT 导出的 PDF 版本。", accept: ".pdf" },
  { key: "plan_pdf", label: "计划书 PDF", description: "计划书导出的 PDF 版本。", accept: ".pdf" },
  { key: "video_20mb", label: "视频", description: "不超过 20MB 的项目展示视频。", accept: ".mp4,.mov,.avi" },
];

const defaultRequiredMaterialsByStageType: Record<Workspace.ProjectReviewStageTypeKey, MaterialRequirementKey[]> = {
  online_review: ["ppt_pdf", "plan_pdf", "video_20mb"],
  roadshow: [],
};

const getRequirementOption = (key?: MaterialRequirementKey | "") =>
  projectMaterialRequirementOptions.find((option) => option.key === key) ?? projectMaterialRequirementOptions[0];

const defaultStageDraft: StageDraft = {
  name: "",
  type: "online_review",
  description: "",
  requiredMaterials: defaultRequiredMaterialsByStageType.online_review,
  teamGroupIds: [],
  startAt: "",
  deadline: "",
  isOpen: true,
};

const defaultMaterialDraft: MaterialDraft = {
  stageId: "",
  materialKind: "",
  title: "",
};

const stageTypeOptions: Array<{
  value: Workspace.ProjectReviewStageTypeKey;
  label: string;
  description: string;
}> = [
  {
    value: "online_review",
    label: "网络评审",
    description: "用于专家线上审阅项目材料并评分。",
  },
  {
    value: "roadshow",
    label: "项目路演",
    description: "用于现场路演打分，不要求上传材料。",
  },
];

const statusBadgeClassNames: Record<Workspace.ProjectMaterialStatusKey, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

const projectCardClassName =
  "project-dashboard-panel rounded-[20px] border border-blue-100/80 bg-white/95 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]";

const projectInputClassName =
  "mt-2 w-full rounded-xl border border-blue-100 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10";

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

const getStageAllowedTeamGroupIds = (stage: Workspace.ProjectReviewStageItem) =>
  stage.allowedTeamGroupIds ?? (stage.teamGroup?.id ? [stage.teamGroup.id] : []);

const canCurrentTeamUseStage = (
  stage: Workspace.ProjectReviewStageItem,
  currentTeamGroupId?: string | null,
) => {
  if (!currentTeamGroupId) {
    return false;
  }

  const allowedTeamGroupIds = getStageAllowedTeamGroupIds(stage);
  return allowedTeamGroupIds.length === 0 || allowedTeamGroupIds.includes(currentTeamGroupId);
};

const getStageScopeLabel = (
  stage: Workspace.ProjectReviewStageItem,
  teamGroups: Workspace.TeamGroupItem[],
) => {
  const allowedTeamGroupIds = getStageAllowedTeamGroupIds(stage);
  if (allowedTeamGroupIds.length === 0) {
    return "全部项目组可提交";
  }

  const groupNames = allowedTeamGroupIds.map(
    (groupId) =>
      teamGroups.find((group) => group.id === groupId)?.name ??
      (stage.teamGroup?.id === groupId ? stage.teamGroup.name : groupId),
  );

  return `开放项目组：${groupNames.join("、")}`;
};

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
    openPreviewAsset,
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
  const [stageEditorOpen, setStageEditorOpen] = useState(false);
  const [materialDraft, setMaterialDraft] = useState<MaterialDraft>(defaultMaterialDraft);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialSavingLabel, setMaterialSavingLabel] = useState("上传材料");
  const [materialUploadProgress, setMaterialUploadProgress] = useState<number | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const canManageStages = hasGlobalAdminRole;
  const canUploadMaterials = currentRole === "leader" && Boolean(currentUser?.teamGroupId);
  const canReviewMaterials =
    hasGlobalAdminRole || (currentRole === "teacher" && Boolean(currentUser?.teamGroupId));
  const canPreviewAllMaterials = hasGlobalAdminRole;

  const openStagesForUpload = useMemo(
    () =>
      projectStages.filter(
        (stage) =>
          stage.isOpen &&
          isStageWithinActiveWindow(stage) &&
          canCurrentTeamUseStage(stage, currentUser?.teamGroupId),
      ),
    [currentUser?.teamGroupId, projectStages],
  );

  const selectedUploadStage = openStagesForUpload.find((stage) => stage.id === materialDraft.stageId) ?? null;
  const selectedRequirement = getRequirementOption(materialDraft.materialKind);

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

  const pendingMaterialCount = projectMaterials.filter((item) => item.status === "pending").length;
  const approvedMaterialCount = projectMaterials.filter((item) => item.status === "approved").length;
  const rejectedMaterialCount = projectMaterials.filter((item) => item.status === "rejected").length;
  const selectedTeamGroupCount =
    stageDraft.teamGroupIds.length === 0 ? teamGroups.length : stageDraft.teamGroupIds.length;

  const projectStatCards = [
    {
      label: "评审阶段",
      value: projectStages.length,
      icon: FolderOpen,
      tone: "bg-blue-50 text-blue-600",
      valueClassName: "text-slate-950",
    },
    {
      label: "待审批材料",
      value: pendingMaterialCount,
      icon: Upload,
      tone: "bg-orange-50 text-orange-600",
      valueClassName: pendingMaterialCount > 0 ? "text-orange-600" : "text-slate-950",
    },
    {
      label: "已生效材料",
      value: approvedMaterialCount,
      icon: FileCheck,
      tone: "bg-emerald-50 text-emerald-600",
      valueClassName: approvedMaterialCount > 0 ? "text-emerald-600" : "text-slate-950",
    },
    {
      label: "已驳回材料",
      value: rejectedMaterialCount,
      icon: Trash2,
      tone: "bg-rose-50 text-rose-600",
      valueClassName: rejectedMaterialCount > 0 ? "text-rose-600" : "text-slate-950",
    },
  ];

  const resetStageForm = () => {
    setEditingStageId(null);
    setStageEditorOpen(false);
    setStageDraft(defaultStageDraft);
  };

  const editStage = (stage: Workspace.ProjectReviewStageItem) => {
    setEditingStageId(stage.id);
    setStageDraft({
      name: stage.name,
      type: stage.type,
      description: stage.description ?? "",
      requiredMaterials: stage.requiredMaterials ?? defaultRequiredMaterialsByStageType[stage.type],
      teamGroupIds: getStageAllowedTeamGroupIds(stage),
      startAt: stage.startAt ? toDateTimeInputValue(stage.startAt) : "",
      deadline: stage.deadline ? toDateTimeInputValue(stage.deadline) : "",
      isOpen: stage.isOpen,
    });
    setStageEditorOpen(true);
  };

  const saveStage = async () => {
    if (!stageDraft.name.trim()) {
      setLoadError("请填写项目阶段名称");
      return;
    }

    setIsSaving(true);
    try {
      const teamGroupIds = [...new Set(stageDraft.teamGroupIds.filter(Boolean))];
      await requestJson<{ stage: Workspace.ProjectReviewStageItem }>(
        editingStageId ? `/api/project-stages/${editingStageId}` : "/api/project-stages",
        {
          method: editingStageId ? "PUT" : "POST",
          body: JSON.stringify({
            name: stageDraft.name.trim(),
            type: stageDraft.type,
            description: stageDraft.description.trim() || null,
            requiredMaterials: stageDraft.requiredMaterials,
            teamGroupIds,
            teamGroupId: teamGroupIds.length === 1 ? teamGroupIds[0] : null,
            startAt: toApiDate(stageDraft.startAt),
            deadline: toApiDate(stageDraft.deadline),
            isOpen: stageDraft.isOpen,
          }),
        },
      );

      resetStageForm();
      showSuccessToast(editingStageId ? "项目阶段已更新" : "项目阶段已创建");
      refreshWorkspace(["projectStages", "projectMaterials"]);
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
      message: `确认删除「${stage.name}」？删除该阶段会同步删除对应专家评审配置、专家任务、投屏链接和未锁定评分记录；如已有正式评分，系统会拒绝删除并要求归档保留数据。`,
      confirmLabel: "确认删除",
      successTitle: "项目阶段已删除",
      onConfirm: async () => {
        await requestJson(`/api/project-stages/${stage.id}`, { method: "DELETE" });
        refreshWorkspace(["projectStages", "projectMaterials"]);
      },
    });
  };

  const submitMaterial = async () => {
    if (!materialDraft.stageId) {
      setLoadError("请选择项目阶段");
      return;
    }

    if (!materialDraft.materialKind) {
      setLoadError("请选择材料类型");
      return;
    }

    if (!materialFile) {
      setLoadError("请选择需要上传的项目材料");
      return;
    }

    const title = materialDraft.title.trim() || getRequirementOption(materialDraft.materialKind).label;
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
          materialKind: materialDraft.materialKind,
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
          materialKind: materialDraft.materialKind,
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
      refreshWorkspace("projectMaterials");
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
      refreshWorkspace("projectMaterials");
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
      refreshWorkspace("projectMaterials");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "项目材料驳回失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        description="按评审阶段沉淀项目组最终材料，项目负责人提交后由本组任意指导教师审批生效。"
        title="项目管理"
      />

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {projectStatCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              className="project-stat-card flex min-h-[104px] items-center gap-4 rounded-[18px] border border-blue-100/80 bg-white/95 p-5 shadow-[0_10px_24px_rgba(37,99,235,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(37,99,235,0.12)]"
              key={card.label}
            >
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${card.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-500">{card.label}</span>
                <span className={`mt-2 block text-[34px] font-black leading-none tracking-[-0.03em] ${card.valueClassName}`}>
                  {card.value}
                </span>
              </span>
            </div>
          );
        })}
      </section>

      {canManageStages ? (
        <section className={projectCardClassName}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="inline-flex items-center gap-2 text-lg font-bold text-slate-950">
                <Plus className="h-5 w-5 text-blue-600" />
                创建评审阶段
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                管理员先创建网络评审或项目路演阶段，学生端按开放范围提交对应内容。
              </p>
            </div>
          </div>

          <div className="project-stage-create-grid mt-5 grid gap-5 xl:grid-cols-[minmax(260px,1.25fr)_minmax(220px,1fr)_minmax(190px,0.75fr)_minmax(190px,0.75fr)]">
            <label className="block text-sm font-medium text-slate-700">
              阶段名称
              <input
                className={projectInputClassName}
                onChange={(event) => setStageDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="如：第一轮网络评审"
                value={stageDraft.name}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              阶段类型
              <select
                className={projectInputClassName}
                onChange={(event) => {
                  const nextType = event.target.value as Workspace.ProjectReviewStageTypeKey;
                  setStageDraft((current) => ({
                    ...current,
                    type: nextType,
                    requiredMaterials: defaultRequiredMaterialsByStageType[nextType],
                  }));
                }}
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
            <label className="block text-sm font-medium text-slate-700 xl:col-span-2">
              开放项目组
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                  <input
                    checked={stageDraft.teamGroupIds.length === 0}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    onChange={() => setStageDraft((current) => ({ ...current, teamGroupIds: [] }))}
                    type="checkbox"
                  />
                  <span className="font-medium">全部项目组可提交</span>
                </label>
                <div className="grid max-h-36 gap-2 overflow-y-auto border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
                  {teamGroups.map((group) => {
                    const checked = stageDraft.teamGroupIds.includes(group.id);
                    return (
                      <label
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 transition ${
                          checked
                            ? "bg-blue-50 text-blue-700 ring-blue-200"
                            : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                        }`}
                        key={group.id}
                      >
                        <input
                          checked={checked}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          onChange={(event) =>
                            setStageDraft((current) => ({
                              ...current,
                              teamGroupIds: event.target.checked
                                ? [...new Set([...current.teamGroupIds, group.id])]
                                : current.teamGroupIds.filter((teamGroupId) => teamGroupId !== group.id),
                            }))
                          }
                          type="checkbox"
                        />
                        <span className="truncate">{group.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
                  {stageDraft.teamGroupIds.length === 0
                    ? "当前面向全部项目组开放。"
                    : `已选择 ${selectedTeamGroupCount} 个项目组。`}
                </p>
              </div>
            </label>
            <label className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-blue-100 bg-slate-50/80 px-4 py-5 text-sm font-medium text-slate-700 xl:col-span-2">
              <span className="text-xs text-slate-400">学生上传权限</span>
              <span className="relative inline-flex h-7 w-14 items-center">
                <input
                  checked={stageDraft.isOpen}
                  className="peer sr-only"
                  onChange={(event) =>
                    setStageDraft((current) => ({ ...current, isOpen: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-blue-600" />
                <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-7" />
              </span>
              <span>{stageDraft.isOpen ? "当前开放学生上传" : "当前已关闭学生上传"}</span>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              开始时间
              <input
                className={projectInputClassName}
                onChange={(event) => setStageDraft((current) => ({ ...current, startAt: event.target.value }))}
                type="datetime-local"
                value={stageDraft.startAt}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              截止时间
              <input
                className={projectInputClassName}
                onChange={(event) => setStageDraft((current) => ({ ...current, deadline: event.target.value }))}
                type="datetime-local"
                value={stageDraft.deadline}
              />
            </label>
            <div className="rounded-xl border border-blue-100 bg-slate-50/80 p-4 xl:col-span-2">
              <p className="text-sm font-medium text-slate-700">要求上传内容</p>
              {stageDraft.type === "roadshow" ? (
                <p className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs leading-6 text-slate-500">
                  项目路演只开放专家现场评分，不要求学生上传材料。
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {projectMaterialRequirementOptions.map((option) => (
                    <label
                      className={`flex min-h-[64px] items-start gap-2 rounded-lg border px-3 py-3 text-sm transition ${
                        stageDraft.requiredMaterials.includes(option.key)
                          ? "border-blue-200 bg-blue-50 text-blue-800"
                          : "border-white bg-white text-slate-600"
                      }`}
                      key={option.key}
                    >
                      <input
                        checked={stageDraft.requiredMaterials.includes(option.key)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                        onChange={(event) =>
                          setStageDraft((current) => {
                            const requiredMaterials = event.target.checked
                              ? [...new Set([...current.requiredMaterials, option.key])]
                              : current.requiredMaterials.filter((item) => item !== option.key);
                            return {
                              ...current,
                              requiredMaterials:
                                requiredMaterials.length > 0
                                  ? requiredMaterials
                                  : defaultRequiredMaterialsByStageType[current.type],
                            };
                          })
                        }
                        type="checkbox"
                      />
                      <span>
                        <span className="block font-semibold text-slate-800">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <label className="block text-sm font-medium text-slate-700 xl:col-span-2">
              阶段说明
              <textarea
                className={`${textareaClassName} rounded-xl border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10`}
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
                <span>创建阶段</span>
              </span>
            </ActionButton>
          </div>
        </section>
      ) : null}

      {canManageStages && stageEditorOpen && editingStageId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="inline-flex items-center gap-2 text-lg font-bold text-slate-950">
                  <Pencil className="h-5 w-5 text-blue-600" />
                  编辑项目阶段
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  修改后会同步影响学生提交入口和专家评审可用材料范围。
                </p>
              </div>
              <ActionButton disabled={isSaving} onClick={resetStageForm} variant="secondary">
                关闭
              </ActionButton>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                阶段名称
                <input
                  className={projectInputClassName}
                  onChange={(event) => setStageDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="如：第一轮网络评审"
                  value={stageDraft.name}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                阶段类型
                <select
                  className={projectInputClassName}
                  onChange={(event) => {
                    const nextType = event.target.value as Workspace.ProjectReviewStageTypeKey;
                    setStageDraft((current) => ({
                      ...current,
                      type: nextType,
                      requiredMaterials: defaultRequiredMaterialsByStageType[nextType],
                    }));
                  }}
                  value={stageDraft.type}
                >
                  {stageTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                开放项目组
                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                    <input
                      checked={stageDraft.teamGroupIds.length === 0}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      onChange={() => setStageDraft((current) => ({ ...current, teamGroupIds: [] }))}
                      type="checkbox"
                    />
                    <span className="font-medium">全部项目组可提交</span>
                  </label>
                  <div className="grid max-h-36 gap-2 overflow-y-auto border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
                    {teamGroups.map((group) => {
                      const checked = stageDraft.teamGroupIds.includes(group.id);
                      return (
                        <label
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 transition ${
                            checked
                              ? "bg-blue-50 text-blue-700 ring-blue-200"
                              : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                          }`}
                          key={group.id}
                        >
                          <input
                            checked={checked}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            onChange={(event) =>
                              setStageDraft((current) => ({
                                ...current,
                                teamGroupIds: event.target.checked
                                  ? [...new Set([...current.teamGroupIds, group.id])]
                                  : current.teamGroupIds.filter((teamGroupId) => teamGroupId !== group.id),
                              }))
                            }
                            type="checkbox"
                          />
                          <span className="truncate">{group.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </label>
              <label className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-700">
                <span className="text-xs text-slate-400">学生上传权限</span>
                <span className="relative inline-flex h-7 w-14 items-center">
                  <input
                    checked={stageDraft.isOpen}
                    className="peer sr-only"
                    onChange={(event) => setStageDraft((current) => ({ ...current, isOpen: event.target.checked }))}
                    type="checkbox"
                  />
                  <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-blue-600" />
                  <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-7" />
                </span>
                <span>{stageDraft.isOpen ? "当前开放学生上传" : "当前已关闭学生上传"}</span>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                开始时间
                <input
                  className={projectInputClassName}
                  onChange={(event) => setStageDraft((current) => ({ ...current, startAt: event.target.value }))}
                  type="datetime-local"
                  value={stageDraft.startAt}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                截止时间
                <input
                  className={projectInputClassName}
                  onChange={(event) => setStageDraft((current) => ({ ...current, deadline: event.target.value }))}
                  type="datetime-local"
                  value={stageDraft.deadline}
                />
              </label>
              <div className="rounded-xl border border-blue-100 bg-slate-50/80 p-4 lg:col-span-2">
                <p className="text-sm font-medium text-slate-700">要求上传内容</p>
                {stageDraft.type === "roadshow" ? (
                  <p className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs leading-6 text-slate-500">
                    项目路演只开放专家现场评分，不要求学生上传材料。
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {projectMaterialRequirementOptions.map((option) => (
                      <label
                        className={`flex min-h-[64px] items-start gap-2 rounded-lg border px-3 py-3 text-sm transition ${
                          stageDraft.requiredMaterials.includes(option.key)
                            ? "border-blue-200 bg-blue-50 text-blue-800"
                            : "border-white bg-white text-slate-600"
                        }`}
                        key={option.key}
                      >
                        <input
                          checked={stageDraft.requiredMaterials.includes(option.key)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                          onChange={(event) =>
                            setStageDraft((current) => {
                              const requiredMaterials = event.target.checked
                                ? [...new Set([...current.requiredMaterials, option.key])]
                                : current.requiredMaterials.filter((item) => item !== option.key);
                              return {
                                ...current,
                                requiredMaterials:
                                  requiredMaterials.length > 0
                                    ? requiredMaterials
                                    : defaultRequiredMaterialsByStageType[current.type],
                              };
                            })
                          }
                          type="checkbox"
                        />
                        <span>
                          <span className="block font-semibold text-slate-800">{option.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
                阶段说明
                <textarea
                  className={`${textareaClassName} rounded-xl border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10`}
                  onChange={(event) => setStageDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="说明提交内容、材料格式或本轮用途。"
                  value={stageDraft.description}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <ActionButton disabled={isSaving} onClick={resetStageForm} variant="secondary">
                取消
              </ActionButton>
              <ActionButton disabled={isSaving} onClick={() => void saveStage()} variant="primary">
                <span className="inline-flex items-center gap-2">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                  <span>保存阶段</span>
                </span>
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {canUploadMaterials ? (
        <section className={projectCardClassName}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="inline-flex items-center gap-2 text-lg font-bold text-slate-950">
                <Upload className="h-5 w-5 text-blue-600" />
                提交项目材料
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                仅项目负责人可提交本项目组材料，提交后需要本组任意指导教师审批通过后生效。
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
                  className={projectInputClassName}
                  onChange={(event) =>
                    setMaterialDraft((current) => {
                      const nextStage = openStagesForUpload.find((stage) => stage.id === event.target.value);
                      return {
                        ...current,
                        stageId: event.target.value,
                        materialKind:
                          (nextStage?.requiredMaterials ?? defaultRequiredMaterialsByStageType[nextStage?.type ?? "online_review"])[0] ?? "",
                      };
                    })
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
                材料类型
                <select
                  className={projectInputClassName}
                  disabled={!selectedUploadStage}
                  onChange={(event) =>
                    setMaterialDraft((current) => ({
                      ...current,
                      materialKind: event.target.value as MaterialRequirementKey,
                      title: getRequirementOption(event.target.value as MaterialRequirementKey).label,
                    }))
                  }
                  value={materialDraft.materialKind}
                >
                  <option value="">请选择材料类型</option>
                  {(selectedUploadStage
                    ? selectedUploadStage.requiredMaterials ?? defaultRequiredMaterialsByStageType[selectedUploadStage.type]
                    : []
                  ).map((requirement) => (
                    <option key={requirement} value={requirement}>
                      {getRequirementOption(requirement).label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                材料标题
                <input
                  className={projectInputClassName}
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
                  className={`${projectInputClassName} file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700`}
                  onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)}
                  accept={selectedRequirement.accept}
                  type="file"
                />
              </label>
              <div className="lg:col-span-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">
                  {materialDraft.materialKind
                    ? `${selectedRequirement.label}：${selectedRequirement.description}`
                    : "请选择阶段和材料类型后上传。"}
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

      <section className="project-lower-grid grid gap-5 xl:grid-cols-[minmax(420px,0.92fr)_minmax(520px,1.08fr)]">
        <div className={projectCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="inline-flex items-center gap-2 text-lg font-bold text-slate-950">
                <FolderOpen className="h-5 w-5 text-blue-600" />
                项目阶段
              </h3>
              <p className="mt-1 text-sm text-slate-500">管理员设置后，学生端按开放时间提交对应材料。</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FolderOpen className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {projectStages.length > 0 ? (
              projectStages.map((stage, stageIndex) => (
                <article
                  key={stage.id}
                  className="grid gap-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.035)] transition hover:border-blue-200 hover:shadow-[0_12px_24px_rgba(37,99,235,0.08)] sm:grid-cols-[54px_1fr_auto] sm:items-center"
                >
                  <div className="project-stage-index flex h-14 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl font-black text-blue-600">
                    {stageIndex + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-950">{stage.name}</h4>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {stage.typeLabel}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          stage.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {stage.isOpen ? "开放中" : "已关闭"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {stage.description || getStageScopeLabel(stage, teamGroups)}
                    </p>
                    {stage.type === "online_review" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(stage.requiredMaterials ?? defaultRequiredMaterialsByStageType[stage.type]).map((requirement) => (
                          <span
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200"
                            key={requirement}
                          >
                            {getRequirementOption(requirement).label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-400">
                      {stage.startAt ? `开始 ${formatDateTime(stage.startAt)}` : "未设置开始时间"} ·{" "}
                      {stage.deadline ? `截止 ${formatDateTime(stage.deadline)}` : "未设置截止时间"} · 已提交{" "}
                      {stage.submissionCount} 份
                    </p>
                    {stage.reviewConfig ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                        <span className="font-semibold text-slate-500">评审状态：</span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            stage.reviewConfig.status === "configured"
                              ? "bg-blue-50 text-blue-700"
                              : stage.reviewConfig.status === "archived"
                                ? "bg-slate-200 text-slate-600"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {stage.reviewConfig.statusLabel}
                        </span>
                        {stage.reviewConfig.status === "configured" ? (
                          <span className="text-slate-500">
                            {stage.reviewConfig.expertAssignmentCount} 位专家
                            {stage.reviewConfig.deadline ? `，截止 ${formatDateTime(stage.reviewConfig.deadline)}` : ""}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {canManageStages ? (
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-xl border border-blue-100 bg-blue-50 p-2.5 text-blue-600 transition hover:border-blue-200 hover:bg-blue-100"
                        onClick={() => editStage(stage)}
                        title="编辑阶段"
                        type="button"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => deleteStage(stage)}
                        title="删除阶段"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
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

        <div className={projectCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="inline-flex items-center gap-2 text-lg font-bold text-slate-950">
                <FileText className="h-5 w-5 text-blue-600" />
                项目材料
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {canReviewMaterials ? "指导教师审批本组材料；管理员可查看全校材料状态。" : "查看本组材料审批状态。"}
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {sortedMaterials.length > 0 ? (
              sortedMaterials.map((material) => (
                <article
                  key={material.id}
                  className="project-material-card rounded-2xl border border-blue-100 bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.035)] transition hover:border-blue-200 hover:shadow-[0_12px_24px_rgba(37,99,235,0.08)]"
                >
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

                  {canPreviewAllMaterials ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                        onClick={() =>
                          openPreviewAsset({
                            title: material.title,
                            url: `/api/project-materials/${material.id}/download?inline=1`,
                            downloadUrl: `/api/project-materials/${material.id}/download`,
                            mimeType: material.mimeType,
                            fileName: material.fileName,
                          })
                        }
                        type="button"
                      >
                        预览
                      </button>
                      <a
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        href={`/api/project-materials/${material.id}/download`}
                      >
                        下载
                      </a>
                    </div>
                  ) : null}

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
                description="项目负责人提交材料后，这里会显示审批状态和最终归档结果。"
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
