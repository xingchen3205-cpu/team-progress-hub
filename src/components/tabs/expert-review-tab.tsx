"use client";

import type { ExpertReviewAssignmentItem } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

export default function ExpertReviewTab() {
  const {
    currentDateTime,
    reviewAssignments,
    reviewScoreDrafts,
    activeReviewAssignmentId,
    expandedReviewPackageKeys,
    setExpandedReviewPackageKeys,
    currentRole,
    canManageReviewMaterials,
    canCreateReviewPackage,
    openPreviewAsset,
    openReviewAssignmentModal,
    openReviewMaterialModal,
    deleteReviewMaterial,
    deleteReviewAssignment,
    updateReviewScoreDraft,
    getReviewScoreTotal,
    saveExpertReviewScore,
  } = Workspace.useWorkspaceContext();

  const {
    BellPlus,
    ChevronDown,
    ChevronUp,
    FileCheck,
    Plus,
    Trash2,
    expertReviewCategoryCaps,
    expertReviewFieldHints,
    expertReviewFieldLabels,
    getExpertReviewGradeChoices,
    getExpertReviewGradeFromScore,
    mapExpertReviewGradeToScore,
    expertReviewMaterialLabels,
    surfaceCardClassName,
    subtleCardClassName,
    textareaClassName,
    formatDateTime,
    getReviewDeadlineMeta,
    createExpertReviewScoreDraft,
    EmptyState,
    ActionButton,
  } = Workspace;

const renderReview = () => {
    const reviewStatusMeta = {
      pending: { label: "待评审", className: "pending" },
      completed: { label: "已提交", className: "completed" },
      locked: { label: "已锁定", className: "locked" },
    } as const;

    const groupedAssignments = reviewAssignments.reduce<
      Array<{
        key: string;
        targetName: string;
        roundLabel: string;
        deadline: string | null;
        items: ExpertReviewAssignmentItem[];
      }>
    >((groups, assignment) => {
      const key = assignment.packageId;
      const existingGroup = groups.find((item) => item.key === key);

      if (existingGroup) {
        existingGroup.items.push(assignment);
        return groups;
      }

      return [
        ...groups,
        {
          key,
          targetName: assignment.targetName,
          roundLabel: assignment.roundLabel,
          deadline: assignment.deadline,
          items: [assignment],
        },
      ];
    }, []);
    const reviewPendingCount =
      currentRole === "expert"
        ? reviewAssignments.filter((assignment) => assignment.statusKey === "pending").length
        : groupedAssignments.filter((group) => group.items.some((assignment) => assignment.statusKey === "pending"))
            .length;
    const toggleReviewPackageExpanded = (packageKey: string) => {
      setExpandedReviewPackageKeys((current) =>
        current.includes(packageKey)
          ? current.filter((item) => item !== packageKey)
          : [...current, packageKey],
      );
    };

    return (
      <div className="space-y-4">
        <div className="review-header-toolbar depth-card flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm leading-6 text-slate-500">
              {currentRole === "expert"
                ? "仅显示当前专家被指派的评审任务，材料只支持在线查看计划书、路演材料和视频；提交后截止前可继续修改，截止后自动锁定。"
                : currentRole === "member"
                  ? "查看专家已提交的评分、等级和综合评语。"
                  : "评审材料与主文档中心完全独立，管理员、教师和负责人都可创建并指派评审包；教师和管理员可查看全部评分。"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="review-todo-pill">
              <BellPlus className="h-4 w-4" />
              <span>待办</span>
              <span className="review-todo-count">{reviewPendingCount}</span>
            </div>
            {canCreateReviewPackage ? (
              <ActionButton onClick={openReviewAssignmentModal} variant="primary">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>新建评审包</span>
                </span>
              </ActionButton>
            ) : null}
          </div>
        </div>

        {reviewAssignments.length === 0 ? (
          <section className={surfaceCardClassName}>
            <EmptyState
              description={
                currentRole === "expert"
                  ? "管理员、教师或负责人完成指派后，你的评审任务会显示在这里。"
                  : currentRole === "member"
                    ? "专家完成评分后，结果会显示在这里。"
                  : "当前还没有专家评审包，创建后即可上传计划书、路演材料和视频，并分配给指定专家。"
              }
              icon={FileCheck}
              title={currentRole === "member" ? "暂无专家评分" : "暂无专家评审包"}
            />
          </section>
        ) : currentRole === "expert" ? (
          <section className="space-y-4">
            {reviewAssignments.map((assignment) => {
              const draft = reviewScoreDrafts[assignment.id] ?? createExpertReviewScoreDraft(assignment);
              const planMaterial = assignment.materials.plan;
              const pptMaterial = assignment.materials.ppt;
              const videoMaterial = assignment.materials.video;
              const deadlineMeta = getReviewDeadlineMeta(assignment.deadline, currentDateTime);
              const headerStatus = reviewStatusMeta[assignment.statusKey];

              return (
                <article key={assignment.id} className={`review-package-card ${surfaceCardClassName}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{assignment.targetName}</h3>
                        <span className={`review-status-chip ${headerStatus.className}`}>
                          {headerStatus.label}
                        </span>
                        <span className={`review-deadline-chip ${deadlineMeta.tone}`}>
                          {assignment.deadline ? `截止 ${formatDateTime(assignment.deadline)}` : "未设截止时间"}
                        </span>
                        <span className={`review-deadline-chip subtle ${deadlineMeta.tone}`}>
                          {deadlineMeta.label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{assignment.roundLabel}</p>
                      <p className={`mt-3 text-sm leading-7 ${assignment.overview ? "text-slate-600" : "text-slate-400"}`}>
                        {assignment.overview || "暂无描述，点击编辑补充"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["plan", planMaterial, "查看计划书"],
                        ["ppt", pptMaterial, "查看路演材料"],
                        ["video", videoMaterial, "查看视频"],
                      ] as const).map(([kind, material, label]) =>
                        material ? (
                          <ActionButton
                            key={kind}
                            onClick={() =>
                              openPreviewAsset({
                                title: `${assignment.targetName} · ${expertReviewMaterialLabels[kind]}`,
                                url: material.previewUrl,
                                mimeType: material.mimeType,
                                fileName: material.fileName,
                              })
                            }
                          >
                            {label}
                          </ActionButton>
                        ) : null,
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {(Object.keys(expertReviewCategoryCaps) as Array<keyof typeof expertReviewCategoryCaps>).map(
                      (fieldKey) => {
                        const choices = getExpertReviewGradeChoices(fieldKey);
                        const selectedGrade = draft[fieldKey];

                        return (
                          <div key={`${assignment.id}-${fieldKey}`} className="review-score-card rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-900">
                                {expertReviewFieldLabels[fieldKey]}
                                <span className="ml-2 text-xs font-medium text-slate-400">
                                  满分 {expertReviewCategoryCaps[fieldKey]}
                                </span>
                              </p>
                              <span className="review-score-badge">
                                {selectedGrade
                                  ? `${selectedGrade} · ${mapExpertReviewGradeToScore(fieldKey, selectedGrade as "A" | "B" | "C" | "D" | "E")} 分`
                                  : "请选择等级"}
                              </span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                              {choices.map((choice) => {
                                const isSelected = selectedGrade === choice.grade;
                                return (
                                  <button
                                    key={`${assignment.id}-${fieldKey}-${choice.grade}`}
                                    className={`rounded-lg border px-3 py-2 text-center transition ${
                                      isSelected
                                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                                    } ${!assignment.canEdit || activeReviewAssignmentId === assignment.id ? "cursor-not-allowed opacity-60" : ""}`}
                                    disabled={!assignment.canEdit || activeReviewAssignmentId === assignment.id}
                                    onClick={() => updateReviewScoreDraft(assignment.id, fieldKey, choice.grade)}
                                    type="button"
                                  >
                                    <span className="block text-sm font-semibold">{choice.grade}</span>
                                    <span className="mt-1 block text-[11px]">{choice.score}分</span>
                                  </button>
                                );
                              })}
                            </div>
                            <span className="mt-3 block text-xs leading-6 text-slate-400">
                              {expertReviewFieldHints[fieldKey].join(" / ")}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>

                  <label className="mt-5 block text-sm text-slate-500">
                    综合评语
                    <textarea
                      className={`${textareaClassName} min-h-32`}
                      disabled={!assignment.canEdit || activeReviewAssignmentId === assignment.id}
                      placeholder="请结合四大类评分填写综合评语"
                      value={draft.commentTotal}
                      onChange={(event) =>
                        updateReviewScoreDraft(assignment.id, "commentTotal", event.target.value)
                      }
                    />
                  </label>

                  <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-slate-500">当前总分</p>
                      <p className="mt-1 text-2xl font-bold text-blue-600">
                        {getReviewScoreTotal(draft)}
                        <span className="ml-2 text-sm font-medium text-slate-400">/ 100</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {assignment.score ? (
                        <p className="text-sm text-slate-400">
                          最近提交：{formatDateTime(assignment.score.updatedAt)}
                        </p>
                      ) : null}
                      <ActionButton
                        disabled={!assignment.canEdit}
                        loading={activeReviewAssignmentId === assignment.id}
                        loadingLabel="提交中..."
                        onClick={() => void saveExpertReviewScore(assignment.id)}
                        title={assignment.canEdit ? undefined : "已截止，当前任务已锁定"}
                        variant="primary"
                      >
                        {assignment.score ? "更新评分" : "提交评分"}
                      </ActionButton>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="space-y-4">
            {groupedAssignments.map((group) => (
              (() => {
                const isExpanded = expandedReviewPackageKeys.includes(group.key);
                const deadlineMeta = getReviewDeadlineMeta(group.deadline, currentDateTime);
                const packagePendingCount = group.items.filter((assignment) => assignment.statusKey === "pending").length;
                return (
              <article key={group.key} className={`review-package-card ${surfaceCardClassName}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">{group.targetName}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="review-status-chip completed">{group.roundLabel}</span>
                      {group.deadline ? (
                        <>
                          <span className={`review-deadline-chip ${deadlineMeta.tone}`}>截止 {formatDateTime(group.deadline)}</span>
                          <span className={`review-deadline-chip subtle ${deadlineMeta.tone}`}>{deadlineMeta.label}</span>
                        </>
                      ) : null}
                      {packagePendingCount > 0 ? (
                        <span className="review-status-chip pending">待评分 {packagePendingCount}</span>
                      ) : (
                        <span className="review-status-chip locked">已完成</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <button
                      className="review-score-toggle w-full justify-center sm:w-auto"
                      onClick={() => toggleReviewPackageExpanded(group.key)}
                      type="button"
                    >
                      <span>{isExpanded ? "收起评分明细" : "展开评分明细"}</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {canManageReviewMaterials ? (
                      <ActionButton
                        className="review-danger-button w-full sm:w-auto"
                        onClick={() => deleteReviewAssignment(group.items[0].id, group.targetName)}
                      >
                        删除整包评审数据
                      </ActionButton>
                    ) : null}
                  </div>
                </div>

                {currentRole === "member" ? null : (
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {(["plan", "ppt", "video"] as const).map((kind) => {
                      const material = group.items[0]?.materials[kind];
                      const missingHint =
                        kind === "video"
                          ? "支持 MP4 / MOV / AVI，单文件最大 30MB。"
                          : "支持 PDF 在线预览，单文件最大 30MB。";

                      return (
                        <div key={`${group.key}-${kind}`} className={`review-material-card ${subtleCardClassName}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{expertReviewMaterialLabels[kind]}</p>
                              <p className="mt-2 text-xs text-slate-400">
                                {material ? material.fileName : "暂未上传"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`review-status-chip ${material ? "completed" : "pending"}`}>
                                {material ? "已上传" : "待补充"}
                              </span>
                              {material && canManageReviewMaterials ? (
                                <button
                                  className="review-delete-icon"
                                  onClick={() => deleteReviewMaterial(group.items[0].id, kind)}
                                  type="button"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="review-material-actions mt-4 flex flex-wrap gap-2">
                            {material ? (
                              <>
                                <ActionButton
                                  onClick={() =>
                                    openPreviewAsset({
                                      title: `${group.targetName} · ${expertReviewMaterialLabels[kind]}`,
                                      url: material.previewUrl,
                                      mimeType: material.mimeType,
                                      fileName: material.fileName,
                                    })
                                  }
                                >
                                  查看
                                </ActionButton>
                                {canManageReviewMaterials ? (
                                  <>
                                    <ActionButton onClick={() => openReviewMaterialModal(group.items[0].id, kind)}>
                                      替换
                                    </ActionButton>
                                  </>
                                ) : null}
                              </>
                            ) : canManageReviewMaterials ? (
                              <>
                                <ActionButton onClick={() => openReviewMaterialModal(group.items[0].id, kind)} variant="primary">
                                  上传
                                </ActionButton>
                                <span className="text-xs leading-6 text-slate-400">{missingHint}</span>
                              </>
                            ) : (
                              <span className="text-sm text-slate-400">{missingHint}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className={`${isExpanded ? "mt-5 grid gap-4 xl:grid-cols-2" : "mt-5"}`}>
                  {!isExpanded ? (
                    <div className="review-score-summary-card">
                      <p className="text-sm font-medium text-slate-500">评分概览</p>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {group.items.map((assignment) => (
                          <div key={`${assignment.id}-summary`} className="review-score-summary-item">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{assignment.expert.name}</p>
                                <p className="mt-1 text-xs text-slate-400">{assignment.expert.roleLabel}</p>
                              </div>
                              <span className={`review-status-chip ${reviewStatusMeta[assignment.statusKey].className}`}>
                                {reviewStatusMeta[assignment.statusKey].label}
                              </span>
                            </div>
                            <p className="mt-3 text-sm text-slate-500">
                              {assignment.score ? `总分 ${assignment.score.totalScore} / 100` : "尚未提交评分"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {isExpanded
                    ? group.items.map((assignment) => (
                        <div key={assignment.id} className={`review-score-detail-card ${subtleCardClassName}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-base font-semibold text-slate-900">{assignment.expert.name}</p>
                              <p className="mt-2 text-sm text-slate-500">{assignment.expert.roleLabel}</p>
                            </div>
                            <span className={`review-status-chip ${reviewStatusMeta[assignment.statusKey].className}`}>
                              {reviewStatusMeta[assignment.statusKey].label}
                            </span>
                          </div>

                          {assignment.score ? (
                            <>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                {(Object.keys(expertReviewCategoryCaps) as Array<keyof typeof expertReviewCategoryCaps>).map(
                                  (fieldKey) => (
                                    <div key={`${assignment.id}-${fieldKey}`} className="review-score-metric rounded-lg bg-white px-4 py-3">
                                      <p className="text-xs text-slate-400">{expertReviewFieldLabels[fieldKey]}</p>
                                      <p className="mt-2 text-lg font-semibold text-slate-900">
                                        {getExpertReviewGradeFromScore(fieldKey, assignment.score?.[fieldKey])}
                                        <span className="ml-2 text-sm font-medium text-slate-500">
                                          {assignment.score?.[fieldKey]}分
                                        </span>
                                        <span className="ml-1 text-xs text-slate-400">
                                          / {expertReviewCategoryCaps[fieldKey]}
                                        </span>
                                      </p>
                                    </div>
                                  ),
                                )}
                              </div>
                              <p className="mt-4 text-sm font-medium text-blue-600">
                                总分：{assignment.score.totalScore} / 100
                              </p>
                              <p className="mt-3 text-sm leading-7 text-slate-600">
                                评语：{assignment.score.commentTotal}
                              </p>
                              <p className="mt-3 text-xs text-slate-400">
                                提交时间：{formatDateTime(assignment.score.updatedAt)}
                              </p>
                            </>
                          ) : (
                            <p className="mt-4 text-sm leading-7 text-slate-500">该专家尚未提交本次评分。</p>
                          )}
                        </div>
                      ))
                    : null}
                </div>
              </article>
                );
              })()
            ))}
          </section>
        )}
      </div>
    );
  };

  return renderReview();
}
