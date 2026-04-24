"use client";

import { useMemo, useState } from "react";

import type { ExpertReviewAssignmentItem } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

type ExpertPanelMode =
  | "home"
  | "network-list"
  | "network-detail"
  | "roadshow-wait"
  | "roadshow-score"
  | "roadshow-done";

type ReviewGroup = {
  key: string;
  targetName: string;
  roundLabel: string;
  deadline: string | null;
  overview: string;
  items: ExpertReviewAssignmentItem[];
};

type PendingSubmission = {
  assignment: ExpertReviewAssignmentItem;
  kind: "network" | "roadshow";
  score: number;
  displayScore: string;
  comment: string;
} | null;

const systemDateRange = "2026-04-22 ~ 04-27";

const getInitial = (name?: string | null) => (name?.trim().slice(0, 1) || "评").toUpperCase();

const isRoadshowAssignment = (assignment: Pick<ExpertReviewAssignmentItem, "roundLabel" | "targetName" | "overview">) =>
  /路演|答辩|现场|视频/i.test(`${assignment.roundLabel} ${assignment.targetName} ${assignment.overview}`);

const formatScoreForAssignment = (assignment: ExpertReviewAssignmentItem) => {
  if (!assignment.score) {
    return "--";
  }

  if (isRoadshowAssignment(assignment)) {
    return (assignment.score.totalScore / 100).toFixed(2);
  }

  return `${assignment.score.totalScore}`;
};

const getScoreValue = (assignment: ExpertReviewAssignmentItem) => {
  if (!assignment.score) {
    return null;
  }

  return isRoadshowAssignment(assignment)
    ? assignment.score.totalScore / 100
    : assignment.score.totalScore;
};

const groupReviewAssignments = (assignments: ExpertReviewAssignmentItem[]) =>
  assignments.reduce<ReviewGroup[]>((groups, assignment) => {
    const existing = groups.find((group) => group.key === assignment.packageId);
    if (existing) {
      existing.items.push(assignment);
      return groups;
    }

    return [
      ...groups,
      {
        key: assignment.packageId,
        targetName: assignment.targetName,
        roundLabel: assignment.roundLabel,
        deadline: assignment.deadline,
        overview: assignment.overview,
        items: [assignment],
      },
    ];
  }, []);

const getAverageScore = (group: ReviewGroup) => {
  const scores = group.items
    .map((assignment) => getScoreValue(assignment))
    .filter((score): score is number => typeof score === "number");

  if (scores.length === 0 || scores.length !== group.items.length) {
    return null;
  }

  const sortedScores = [...scores].sort((a, b) => a - b);
  const effectiveScores = sortedScores.length >= 3 ? sortedScores.slice(1, -1) : sortedScores;
  const total = effectiveScores.reduce((sum, score) => sum + score, 0);

  return total / effectiveScores.length;
};

const materialEntries = (assignment: ExpertReviewAssignmentItem) =>
  ([
    ["plan", "项目计划书", assignment.materials.plan],
    ["ppt", "路演材料", assignment.materials.ppt],
    ["video", "演示视频", assignment.materials.video],
  ] as const).filter(([, , material]) => Boolean(material));

function StatusBadge({ statusKey }: { statusKey: ExpertReviewAssignmentItem["statusKey"] }) {
  const meta = {
    pending: "bg-amber-50 text-amber-700 border-amber-100",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
    locked: "bg-slate-100 text-slate-500 border-slate-200",
  }[statusKey];
  const label = {
    pending: "待评审",
    completed: "已提交",
    locked: "已锁定",
  }[statusKey];

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${meta}`}>{label}</span>;
}

function ConfirmModal({
  pendingSubmission,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  pendingSubmission: PendingSubmission;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!pendingSubmission) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.24)]">
        <p className="text-sm font-semibold text-blue-600">确认提交</p>
        <h3 className="mt-2 text-xl font-bold text-slate-950">
          {pendingSubmission.kind === "roadshow" ? "确认提交路演评分？" : "确认提交网评分数？"}
        </h3>
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">{pendingSubmission.assignment.targetName}</p>
          <p className="mt-2 text-sm text-slate-500">{pendingSubmission.assignment.roundLabel}</p>
          <p className="mt-4 text-3xl font-bold text-slate-950">
            {pendingSubmission.displayScore}
            <span className="ml-1 text-sm font-medium text-slate-400">/ 100</span>
          </p>
          {pendingSubmission.comment ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">{pendingSubmission.comment}</p>
          ) : null}
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-500">
          提交后系统会实时更新管理端大屏数据；截止前如需调整，可重新提交覆盖。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            返回修改
          </button>
          <button
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={onConfirm}
            type="button"
          >
            {isSubmitting ? "提交中..." : "确认提交"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExpertReviewTab() {
  const {
    currentUser,
    currentRole,
    reviewAssignments,
    canCreateReviewPackage,
    canManageReviewMaterials,
    openPreviewAsset,
    openReviewAssignmentModal,
    openReviewMaterialModal,
    deleteReviewMaterial,
    deleteReviewAssignment,
    refreshWorkspace,
    setLoadError,
    showSuccessToast,
  } = Workspace.useWorkspaceContext();

  const {
    ActionButton,
    EmptyState,
    FileCheck,
    BookOpen,
    Monitor,
    Users,
    Clock3,
    ChevronRight,
    Plus,
    Upload,
    Trash2,
    ShieldCheck,
    Presentation,
    formatDateTime,
    expertReviewMaterialLabels,
    requestJson,
  } = Workspace;

  const [expertMode, setExpertMode] = useState<ExpertPanelMode>("home");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [networkScoreDrafts, setNetworkScoreDrafts] = useState<Record<string, string>>({});
  const [networkCommentDrafts, setNetworkCommentDrafts] = useState<Record<string, string>>({});
  const [roadshowScoreDraft, setRoadshowScoreDraft] = useState("");
  const [roadshowCommentDraft, setRoadshowCommentDraft] = useState("");
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission>(null);
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [projectionMode, setProjectionMode] = useState(false);

  const groupedAssignments = useMemo(() => groupReviewAssignments(reviewAssignments), [reviewAssignments]);
  const networkAssignments = reviewAssignments.filter((assignment) => !isRoadshowAssignment(assignment));
  const roadshowAssignments = reviewAssignments.filter((assignment) => isRoadshowAssignment(assignment));
  const selectedAssignment =
    reviewAssignments.find((assignment) => assignment.id === selectedAssignmentId) ??
    networkAssignments[0] ??
    roadshowAssignments[0] ??
    null;
  const activeRoadshowAssignment =
    roadshowAssignments.find((assignment) => assignment.statusKey === "pending") ??
    roadshowAssignments[0] ??
    null;
  const activeGroup =
    groupedAssignments.find((group) => group.key === activeGroupKey) ??
    groupedAssignments[0] ??
    null;

  const pendingNetworkCount = networkAssignments.filter((assignment) => assignment.statusKey === "pending").length;
  const finishedNetworkCount = networkAssignments.filter((assignment) => assignment.statusKey !== "pending").length;
  const pendingRoadshowCount = roadshowAssignments.filter((assignment) => assignment.statusKey === "pending").length;
  const finishedRoadshowCount = roadshowAssignments.filter((assignment) => assignment.statusKey !== "pending").length;

  const openMaterial = (assignment: ExpertReviewAssignmentItem, kind: "plan" | "ppt" | "video") => {
    const material = assignment.materials[kind];
    if (!material) {
      setLoadError("当前评审材料暂未上传");
      return;
    }

    openPreviewAsset({
      title: `${assignment.targetName} · ${expertReviewMaterialLabels[kind]}`,
      url: material.previewUrl,
      mimeType: material.mimeType,
      fileName: material.fileName,
    });
  };

  const startNetworkReview = (assignment: ExpertReviewAssignmentItem) => {
    setSelectedAssignmentId(assignment.id);
    setExpertMode("network-detail");
    setNetworkScoreDrafts((current) => ({
      ...current,
      [assignment.id]: current[assignment.id] ?? (assignment.score ? `${assignment.score.totalScore}` : ""),
    }));
    setNetworkCommentDrafts((current) => ({
      ...current,
      [assignment.id]: current[assignment.id] ?? assignment.score?.commentTotal ?? "",
    }));
  };

  const startRoadshowReview = () => {
    if (!activeRoadshowAssignment) {
      setExpertMode("roadshow-wait");
      return;
    }

    setRoadshowScoreDraft(
      activeRoadshowAssignment.score
        ? (activeRoadshowAssignment.score.totalScore / 100).toFixed(2)
        : "",
    );
    setRoadshowCommentDraft(activeRoadshowAssignment.score?.commentTotal ?? "");
    setExpertMode(activeRoadshowAssignment.statusKey === "pending" ? "roadshow-score" : "roadshow-done");
  };

  const prepareNetworkSubmission = (assignment: ExpertReviewAssignmentItem) => {
    const score = Number(networkScoreDrafts[assignment.id]);
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      setLoadError("网评分数需为 0-100 的整数");
      return;
    }

    setPendingSubmission({
      assignment,
      kind: "network",
      score,
      displayScore: `${score}`,
      comment: networkCommentDrafts[assignment.id]?.trim() ?? "",
    });
  };

  const prepareRoadshowSubmission = () => {
    if (!activeRoadshowAssignment) {
      setLoadError("当前没有可提交的路演评审任务");
      return;
    }

    const score = Number(roadshowScoreDraft);
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100 ||
      !Number.isInteger(score * 100)
    ) {
      setLoadError("路演分数需为 0.00-100.00，最多保留两位小数");
      return;
    }

    setPendingSubmission({
      assignment: activeRoadshowAssignment,
      kind: "roadshow",
      score,
      displayScore: score.toFixed(2),
      comment: roadshowCommentDraft.trim(),
    });
  };

  const submitConfirmedScore = async () => {
    if (!pendingSubmission) {
      return;
    }

    setSubmittingAssignmentId(pendingSubmission.assignment.id);
    try {
      await requestJson("/api/expert-reviews/scores", {
        method: "POST",
        body: JSON.stringify(
          pendingSubmission.kind === "roadshow"
            ? {
                assignmentId: pendingSubmission.assignment.id,
                roadshowScore: Number(pendingSubmission.score.toFixed(2)),
                commentTotal: pendingSubmission.comment || undefined,
              }
            : {
                assignmentId: pendingSubmission.assignment.id,
                totalScore: Math.round(pendingSubmission.score),
                commentTotal: pendingSubmission.comment || undefined,
              },
        ),
      });

      showSuccessToast(
        pendingSubmission.kind === "roadshow" ? "路演评分已提交" : "网评评分已提交",
        "管理端和投屏数据已同步刷新。",
      );
      setPendingSubmission(null);
      if (pendingSubmission.kind === "roadshow") {
        setExpertMode("roadshow-done");
      }
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "专家评分提交失败");
    } finally {
      setSubmittingAssignmentId(null);
    }
  };

  if (currentRole === "expert") {
    return (
      <div className="min-h-[calc(100vh-140px)] rounded-[28px] bg-white px-6 py-6 shadow-[0_18px_60px_rgba(15,23,42,0.07)]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">大学生创新大赛评审系统</h2>
              <p className="text-xs text-slate-400">专家端 · 独立评审</p>
            </div>
          </div>
          <div className="flex items-center gap-5 text-sm text-slate-500">
            <span>评审日期：{systemDateRange}</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">
              {getInitial(currentUser?.name)}
            </div>
          </div>
        </div>

        {expertMode === "home" ? (
          <section className="mx-auto flex max-w-4xl flex-col items-center py-12 text-center">
            <h1 className="text-2xl font-bold text-slate-900">您好，{currentUser?.name || "评审专家"}</h1>
            <p className="mt-3 text-sm text-slate-500">
              您有 {pendingNetworkCount + pendingRoadshowCount} 个项目待评审，评审截止日期为 2026-04-27 11:00
            </p>
            <div className="mt-10 grid w-full gap-6 md:grid-cols-2">
              <button
                className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_50px_rgba(37,99,235,0.12)]"
                onClick={() => setExpertMode("network-list")}
                type="button"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Monitor className="h-8 w-8" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-slate-900">项目网络评审</h3>
                <p className="mt-3 text-sm text-slate-500">审阅项目材料，在线评分</p>
                <div className="mt-6 flex justify-center gap-8 text-sm text-slate-500">
                  <span>待评审 <b className="text-slate-900">{pendingNetworkCount}</b></span>
                  <span>已完成 <b className="text-slate-900">{finishedNetworkCount}</b></span>
                </div>
              </button>
              <button
                className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_18px_50px_rgba(99,102,241,0.12)]"
                onClick={startRoadshowReview}
                type="button"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Users className="h-8 w-8" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-slate-900">项目路演评审</h3>
                <p className="mt-3 text-sm text-slate-500">现场/视频答辩评分</p>
                <div className="mt-6 flex justify-center gap-8 text-sm text-slate-500">
                  <span>待评审 <b className="text-slate-900">{pendingRoadshowCount}</b></span>
                  <span>已完成 <b className="text-slate-900">{finishedRoadshowCount}</b></span>
                </div>
              </button>
            </div>
          </section>
        ) : null}

        {expertMode === "network-list" ? (
          <section className="py-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-950">项目网络评审</h3>
                <p className="mt-1 text-sm text-slate-500">请逐项查看材料并提交 0-100 分整数评分。</p>
              </div>
              <button className="text-sm font-semibold text-slate-500 hover:text-blue-600" onClick={() => setExpertMode("home")} type="button">
                返回入口
              </button>
            </div>
            <div className="grid gap-4">
              {networkAssignments.map((assignment) => (
                <button
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-200 hover:bg-blue-50/35"
                  key={assignment.id}
                  onClick={() => startNetworkReview(assignment)}
                  type="button"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="text-base font-bold text-slate-950">{assignment.targetName}</h4>
                      <StatusBadge statusKey={assignment.statusKey} />
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{assignment.roundLabel}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300" />
                </button>
              ))}
              {networkAssignments.length === 0 ? (
                <EmptyState description="当前没有被指派的网络评审任务。" icon={FileCheck} title="暂无网络评审" />
              ) : null}
            </div>
          </section>
        ) : null}

        {expertMode === "network-detail" && selectedAssignment ? (
          <section className="py-6">
            <button className="mb-5 text-sm font-semibold text-blue-600" onClick={() => setExpertMode("network-list")} type="button">
              ← 返回网络评审列表
            </button>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <article className="rounded-3xl border border-slate-200 bg-white p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-bold text-slate-950">{selectedAssignment.targetName}</h3>
                    <StatusBadge statusKey={selectedAssignment.statusKey} />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">{selectedAssignment.roundLabel}</p>
                  <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                    {selectedAssignment.overview || "暂无项目概述，请结合计划书、路演材料和视频进行评审。"}
                  </p>
                </article>
                <article className="rounded-3xl border border-slate-200 bg-white p-6">
                  <h4 className="text-base font-bold text-slate-950">评审材料</h4>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {materialEntries(selectedAssignment).map(([kind, label, material]) => (
                      <button
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
                        key={kind}
                        onClick={() => openMaterial(selectedAssignment, kind)}
                        type="button"
                      >
                        <p className="text-sm font-bold text-slate-900">{label}</p>
                        <p className="mt-2 truncate text-xs text-slate-500">{material?.fileName}</p>
                      </button>
                    ))}
                    {materialEntries(selectedAssignment).length === 0 ? (
                      <p className="text-sm text-slate-400">管理员尚未上传评审材料。</p>
                    ) : null}
                  </div>
                </article>
              </div>
              <aside className="rounded-3xl border border-blue-100 bg-blue-50/40 p-6">
                <h4 className="text-lg font-bold text-slate-950">提交评分</h4>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  评分（0-100）
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-3xl font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={!selectedAssignment.canEdit || submittingAssignmentId === selectedAssignment.id}
                    inputMode="numeric"
                    max={100}
                    min={0}
                    onChange={(event) =>
                      setNetworkScoreDrafts((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))
                    }
                    placeholder="0"
                    type="number"
                    value={networkScoreDrafts[selectedAssignment.id] ?? ""}
                  />
                </label>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  评语（可选）
                  <textarea
                    className="mt-2 min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={!selectedAssignment.canEdit || submittingAssignmentId === selectedAssignment.id}
                    onChange={(event) =>
                      setNetworkCommentDrafts((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))
                    }
                    placeholder="请填写项目优势、风险或建议"
                    value={networkCommentDrafts[selectedAssignment.id] ?? ""}
                  />
                </label>
                {selectedAssignment.score ? (
                  <p className="mt-4 text-xs text-slate-500">最近提交：{formatDateTime(selectedAssignment.score.updatedAt)}</p>
                ) : null}
                <button
                  className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-[0_14px_36px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!selectedAssignment.canEdit || submittingAssignmentId === selectedAssignment.id}
                  onClick={() => prepareNetworkSubmission(selectedAssignment)}
                  type="button"
                >
                  {selectedAssignment.score ? "确认更新评分" : "确认提交评分"}
                </button>
              </aside>
            </div>
          </section>
        ) : null}

        {expertMode === "roadshow-wait" ? (
          <section className="mx-auto max-w-2xl py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
              <Clock3 className="h-8 w-8" />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-slate-950">等待评审开始</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">管理员开始路演节奏并指派项目后，这里会自动出现评分入口。</p>
            <button className="mt-8 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600" onClick={() => setExpertMode("home")} type="button">
              返回入口
            </button>
          </section>
        ) : null}

        {expertMode === "roadshow-score" && activeRoadshowAssignment ? (
          <section className="mx-auto max-w-3xl py-10">
            <div className="rounded-[32px] border border-indigo-100 bg-indigo-50/45 p-7">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-semibold text-indigo-600">项目路演评审</p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-950">{activeRoadshowAssignment.targetName}</h3>
                  <p className="mt-3 text-sm text-slate-500">{activeRoadshowAssignment.overview || "请根据现场展示和答辩情况给出最终评分。"}</p>
                </div>
                <button className="text-sm font-semibold text-slate-500 hover:text-indigo-600" onClick={() => setExpertMode("home")} type="button">
                  返回入口
                </button>
              </div>
              <div className="mt-8 rounded-3xl bg-white p-6">
                <label className="block text-sm font-semibold text-slate-700">
                  路演评分（精确到两位小数）
                  <input
                    className="mt-3 w-full rounded-3xl border border-slate-200 px-5 py-4 text-center text-5xl font-bold tracking-tight text-slate-950 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    inputMode="decimal"
                    max={100}
                    min={0}
                    onChange={(event) => setRoadshowScoreDraft(event.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={roadshowScoreDraft}
                  />
                </label>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  现场记录（可选）
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    onChange={(event) => setRoadshowCommentDraft(event.target.value)}
                    placeholder="记录答辩亮点、扣分原因或后续建议"
                    value={roadshowCommentDraft}
                  />
                </label>
                <button
                  className="mt-6 w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_36px_rgba(79,70,229,0.24)] transition hover:bg-indigo-700"
                  onClick={prepareRoadshowSubmission}
                  type="button"
                >
                  确认提交路演分数
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {expertMode === "roadshow-done" ? (
          <section className="mx-auto max-w-2xl py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-slate-950">路演评分已提交</h3>
            <p className="mt-3 text-sm text-slate-500">当前路演评分已同步到管理后台投屏页面。</p>
            <button className="mt-8 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600" onClick={() => setExpertMode("home")} type="button">
              返回入口
            </button>
          </section>
        ) : null}

        <ConfirmModal
          isSubmitting={Boolean(submittingAssignmentId)}
          onCancel={() => setPendingSubmission(null)}
          onConfirm={() => void submitConfirmedScore()}
          pendingSubmission={pendingSubmission}
        />
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${projectionMode ? "rounded-[32px] bg-slate-950 p-6 text-white" : ""}`}>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">路演管理后台</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">专家评审与大屏投屏</h2>
            <p className="mt-2 text-sm text-slate-500">管理员创建专家账号、分配评审权限和截止时间；专家提交后实时汇总分数。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canCreateReviewPackage ? (
              <ActionButton onClick={openReviewAssignmentModal} variant="primary">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  创建评审任务
                </span>
              </ActionButton>
            ) : null}
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() => setProjectionMode((current) => !current)}
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                <Presentation className="h-4 w-4" />
                投屏模式
              </span>
            </button>
          </div>
        </div>
      </section>

      {groupedAssignments.length === 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-8">
          <EmptyState description="创建评审任务并上传材料后，专家评分和投屏数据会显示在这里。" icon={FileCheck} title="暂无评审任务" />
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-5">
            {activeGroup ? (
              <article className="rounded-[28px] border border-slate-200 bg-white p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-blue-600">当前项目</p>
                    <h3 className="mt-2 text-3xl font-bold text-slate-950">{activeGroup.targetName}</h3>
                    <p className="mt-2 text-sm text-slate-500">{activeGroup.roundLabel}</p>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">{activeGroup.overview || "暂无项目简介。"}</p>
                  </div>
                  <div className="rounded-3xl bg-blue-50 px-6 py-5 text-center">
                    <p className="text-xs font-semibold text-blue-600">最终得分</p>
                    <p className="mt-2 text-5xl font-bold text-blue-700">
                      {getAverageScore(activeGroup)?.toFixed(2) ?? "--"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">全部专家提交后自动计算</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeGroup.items.map((assignment) => (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5" key={assignment.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                            {getInitial(assignment.expert.name)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-950">{assignment.expert.name}</p>
                            <p className="text-xs text-slate-400">{assignment.expert.roleLabel}</p>
                          </div>
                        </div>
                        <StatusBadge statusKey={assignment.statusKey} />
                      </div>
                      <div className="mt-5 rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-400">专家评分</p>
                        <p className="mt-2 text-3xl font-bold text-slate-950">
                          {formatScoreForAssignment(assignment)}
                          <span className="ml-1 text-xs font-medium text-slate-400">/100</span>
                        </p>
                        {assignment.score ? (
                          <p className="mt-3 text-xs text-slate-400">提交：{formatDateTime(assignment.score.updatedAt)}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            <article className="rounded-[28px] border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-bold text-slate-950">材料与权限</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {activeGroup && (["plan", "ppt", "video"] as const).map((kind) => {
                  const assignment = activeGroup.items[0];
                  const material = assignment.materials[kind];
                  return (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={kind}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{expertReviewMaterialLabels[kind]}</p>
                          <p className="mt-2 truncate text-xs text-slate-500">{material?.fileName ?? "暂未上传"}</p>
                        </div>
                        {material && canManageReviewMaterials ? (
                          <button className="text-rose-500" onClick={() => deleteReviewMaterial(assignment.id, kind)} type="button">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {material ? (
                          <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => openMaterial(assignment, kind)} type="button">
                            查看
                          </button>
                        ) : null}
                        {canManageReviewMaterials ? (
                          <button className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => openReviewMaterialModal(assignment.id, kind)} type="button">
                            <span className="inline-flex items-center gap-1">
                              <Upload className="h-3.5 w-3.5" />
                              {material ? "替换" : "上传"}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>

          <aside className="space-y-5">
            <article className="rounded-[28px] border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-bold text-slate-950">项目列表</h3>
              <div className="mt-4 space-y-3">
                {groupedAssignments.map((group) => {
                  const pendingCount = group.items.filter((assignment) => assignment.statusKey === "pending").length;
                  const averageScore = getAverageScore(group);
                  const isActive = group.key === activeGroup?.key;
                  return (
                    <button
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isActive ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                      key={group.key}
                      onClick={() => setActiveGroupKey(group.key)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold text-slate-950">{group.targetName}</p>
                        <span className="text-sm font-bold text-blue-600">{averageScore?.toFixed(2) ?? "--"}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">待评分 {pendingCount} / 专家 {group.items.length}</p>
                    </button>
                  );
                })}
              </div>
            </article>
            <article className="rounded-[28px] border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-bold text-slate-950">实时分数段</h3>
              <div className="mt-4 space-y-3">
                {([
                  ["90-100", "优秀", activeGroup?.items.filter((item) => (getScoreValue(item) ?? 0) >= 90).length ?? 0],
                  ["80-89", "良好", activeGroup?.items.filter((item) => {
                    const score = getScoreValue(item) ?? 0;
                    return score >= 80 && score < 90;
                  }).length ?? 0],
                  ["70-79", "合格", activeGroup?.items.filter((item) => {
                    const score = getScoreValue(item) ?? 0;
                    return score >= 70 && score < 80;
                  }).length ?? 0],
                  ["0-69", "预警", activeGroup?.items.filter((item) => {
                    const score = getScoreValue(item) ?? 0;
                    return score > 0 && score < 70;
                  }).length ?? 0],
                ] as const).map(([range, label, count]) => (
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3" key={range}>
                    <span className="text-sm font-semibold text-slate-700">{range} · {label}</span>
                    <span className="text-lg font-bold text-slate-950">{count}</span>
                  </div>
                ))}
              </div>
            </article>
            {canManageReviewMaterials && activeGroup ? (
              <button
                className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                onClick={() => deleteReviewAssignment(activeGroup.items[0].id, activeGroup.targetName)}
                type="button"
              >
                删除当前评审包
              </button>
            ) : null}
          </aside>
        </div>
      )}

    </div>
  );
}
