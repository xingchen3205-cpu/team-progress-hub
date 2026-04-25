"use client";

import { useMemo, useState } from "react";
import { Ban, CheckCircle2, Copy, ExternalLink, PlayCircle } from "lucide-react";

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

type ExpertScoreSuccess = {
  kind: "network" | "roadshow";
  targetName: string;
  roundLabel: string;
  displayScore: string;
} | null;

type ReviewScreenSessionState = {
  sessionId: string;
  screenUrl: string;
  message: string;
  startedAt: string | null;
  seats: Array<{
    id: string;
    seatNo: number;
    displayName: string;
    status: "pending" | "submitted" | "voided";
    voidedAt: string | null;
  }>;
};

const getInitial = (name?: string | null) => (name?.trim().slice(0, 1) || "评").toUpperCase();

const getReviewMode = (
  assignment: Pick<ExpertReviewAssignmentItem, "roundLabel" | "targetName" | "overview" | "reviewMode">,
) =>
  assignment.reviewMode ??
  (/路演|答辩|现场|视频/i.test(`${assignment.roundLabel} ${assignment.targetName} ${assignment.overview}`)
    ? "roadshow"
    : "network");

const isRoadshowAssignment = (
  assignment: Pick<ExpertReviewAssignmentItem, "roundLabel" | "targetName" | "overview" | "reviewMode">,
) => getReviewMode(assignment) === "roadshow";

const usesCentScoreScale = (assignment: ExpertReviewAssignmentItem) =>
  Boolean(assignment.score?.lockedAt) || isRoadshowAssignment(assignment) || (assignment.score?.totalScore ?? 0) > 100;

const formatScoreForAssignment = (assignment: ExpertReviewAssignmentItem) => {
  if (!assignment.score) {
    return "--";
  }

  return (assignment.score.totalScore / (usesCentScoreScale(assignment) ? 100 : 1)).toFixed(2);
};

const getScoreValue = (assignment: ExpertReviewAssignmentItem) => {
  if (!assignment.score) {
    return null;
  }

  return assignment.score.totalScore / (usesCentScoreScale(assignment) ? 100 : 1);
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
          提交后不可修改，请确认分数无误。
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

function ExpertScoreSuccessModal({
  success,
  onClose,
}: {
  success: ExpertScoreSuccess;
  onClose: () => void;
}) {
  if (!success) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.24)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-[0_16px_32px_rgba(16,185,129,0.16)]">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h3 className="mt-5 text-xl font-bold text-slate-950">评分提交成功</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {success.targetName} 已完成{success.kind === "roadshow" ? "路演评分" : "网络评审"}提交。
        </p>
        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-medium text-emerald-600">{success.roundLabel}</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">{success.displayScore}</p>
        </div>
        <button
          className="mt-6 w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_34px_rgba(16,185,129,0.22)] transition hover:bg-emerald-700"
          onClick={onClose}
          type="button"
        >
          完成
        </button>
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
    deleteReviewAssignment,
    refreshWorkspace,
    setLoadError,
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
    ShieldCheck,
    formatDateTime,
    expertReviewMaterialLabels,
    requestJson,
  } = Workspace;

  const [expertMode, setExpertMode] = useState<ExpertPanelMode>("home");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [networkScoreDrafts, setNetworkScoreDrafts] = useState<Record<string, string>>({});
  const [networkCommentDrafts, setNetworkCommentDrafts] = useState<Record<string, string>>({});
  const [roadshowScoreDraft, setRoadshowScoreDraft] = useState("");
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission>(null);
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);
  const [expertScoreSuccess, setExpertScoreSuccess] = useState<ExpertScoreSuccess>(null);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [reviewScreenSessions, setReviewScreenSessions] = useState<Record<string, ReviewScreenSessionState>>({});
  const [reviewScreenActionKey, setReviewScreenActionKey] = useState<string | null>(null);

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
  const availableModeCount = (networkAssignments.length > 0 ? 1 : 0) + (roadshowAssignments.length > 0 ? 1 : 0);
  const pendingReviewCount = reviewAssignments.filter((assignment) => assignment.statusKey === "pending").length;
  const finishedReviewCount = reviewAssignments.filter((assignment) => assignment.statusKey !== "pending").length;
  const reviewDeadlineText = useMemo(() => {
    const deadlines = reviewAssignments
      .map((assignment) => assignment.deadline)
      .filter((deadline): deadline is string => Boolean(deadline))
      .map((deadline) => new Date(deadline))
      .filter((deadline) => !Number.isNaN(deadline.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (deadlines.length === 0) {
      return "评审截止：待管理员设置";
    }

    const first = deadlines[0];
    const last = deadlines[deadlines.length - 1];
    const firstText = formatDateTime(first.toISOString());
    const lastText = formatDateTime(last.toISOString());

    return first.getTime() === last.getTime()
      ? `评审截止：${firstText}`
      : `评审截止：${firstText} 至 ${lastText}`;
  }, [formatDateTime, reviewAssignments]);

  const downloadReviewScoreDetails = () => {
    if (reviewAssignments.length === 0) {
      setLoadError("暂无可导出的评分明细");
      return;
    }

    const escapeCsvCell = (value: string | number | null | undefined) => {
      const text = String(value ?? "");
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ["项目名称", "评审轮次", "评审模式", "专家姓名", "状态", "分数", "提交时间", "评语"];
    const rows = reviewAssignments.map((assignment) => [
      assignment.targetName,
      assignment.roundLabel,
      isRoadshowAssignment(assignment) ? "路演评审" : "网络评审",
      assignment.expert.name,
      assignment.statusKey === "pending" ? "待评审" : "已提交",
      assignment.score ? formatScoreForAssignment(assignment) : "",
      assignment.score ? formatDateTime(assignment.score.updatedAt) : "",
      assignment.score?.commentTotal ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `expert-review-score-details-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const createReviewScreenSession = async (group: ReviewGroup) => {
    if (!group.items.some((assignment) => isRoadshowAssignment(assignment))) {
      setLoadError("只有项目路演评审可以生成现场大屏链接");
      return;
    }

    setReviewScreenActionKey(group.key);
    try {
      const payload = await requestJson<{
        session: { id: string; startedAt?: string | null };
        seats: ReviewScreenSessionState["seats"];
        screenUrl: string;
      }>("/api/review-screen/sessions", {
        method: "POST",
        body: JSON.stringify({
          packageId: group.key,
          countdownSeconds: 60,
          dropHighestCount: 1,
          dropLowestCount: 1,
        }),
      });

      await navigator.clipboard?.writeText(payload.screenUrl).catch(() => undefined);
      setReviewScreenSessions((current) => ({
        ...current,
        [group.key]: {
          sessionId: payload.session.id,
          screenUrl: payload.screenUrl,
          message: "现场大屏链接已生成，可复制或打开。",
          startedAt: payload.session.startedAt ?? null,
          seats: payload.seats,
        },
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "现场大屏链接生成失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const startReviewScreenSession = async (group: ReviewGroup) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }

    setReviewScreenActionKey(group.key);
    try {
      const payload = await requestJson<{
        session: { id: string; startedAt: string | null };
      }>(`/api/review-screen/sessions/${screenSession.sessionId}/start`, {
        method: "POST",
        body: JSON.stringify({ countdownSeconds: 60 }),
      });
      setReviewScreenSessions((current) => ({
        ...current,
        [group.key]: {
          ...screenSession,
          message: "现场评分已开始，倒计时 60 秒。",
          startedAt: payload.session.startedAt,
        },
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "现场评分启动失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const voidReviewScreenSeat = async (group: ReviewGroup, seatId: string) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }

    setReviewScreenActionKey(`${group.key}:${seatId}`);
    try {
      const payload = await requestJson<{
        seat: ReviewScreenSessionState["seats"][number];
      }>(`/api/review-screen/sessions/${screenSession.sessionId}/void-seat`, {
        method: "POST",
        body: JSON.stringify({ seatId }),
      });
      setReviewScreenSessions((current) => ({
        ...current,
        [group.key]: {
          ...screenSession,
          message: `${payload.seat.displayName} 已作废，最终计分将自动排除此席位。`,
          seats: screenSession.seats.map((seat) => (seat.id === payload.seat.id ? payload.seat : seat)),
        },
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "席位作废失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

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
      [assignment.id]: current[assignment.id] ?? (assignment.score ? formatScoreForAssignment(assignment) : ""),
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
        ? formatScoreForAssignment(activeRoadshowAssignment)
        : "",
    );
    setExpertMode(activeRoadshowAssignment.statusKey === "pending" ? "roadshow-score" : "roadshow-done");
  };

  const prepareNetworkSubmission = (assignment: ExpertReviewAssignmentItem) => {
    if (assignment.score || assignment.statusKey !== "pending" || !assignment.canEdit) {
      setLoadError("该评审已提交，不能修改");
      return;
    }

    const score = Number(networkScoreDrafts[assignment.id]);
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100 ||
      !Number.isInteger(score * 100)
    ) {
      setLoadError("网评分数需为 0.00-100.00，最多保留两位小数");
      return;
    }

    setPendingSubmission({
      assignment,
      kind: "network",
      score,
      displayScore: score.toFixed(2),
      comment: networkCommentDrafts[assignment.id]?.trim() ?? "",
    });
  };

  const prepareRoadshowSubmission = () => {
    if (!activeRoadshowAssignment) {
      setLoadError("当前没有可提交的路演评审任务");
      return;
    }

    if (activeRoadshowAssignment.score || activeRoadshowAssignment.statusKey !== "pending" || !activeRoadshowAssignment.canEdit) {
      setLoadError("该路演评分已提交，不能修改");
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
      comment: "",
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
              }
            : {
                assignmentId: pendingSubmission.assignment.id,
                totalScore: Number(pendingSubmission.score.toFixed(2)),
                commentTotal: pendingSubmission.comment || undefined,
              },
        ),
      });

      setExpertScoreSuccess({
        kind: pendingSubmission.kind,
        targetName: pendingSubmission.assignment.targetName,
        roundLabel: pendingSubmission.assignment.roundLabel,
        displayScore: pendingSubmission.displayScore,
      });
      setPendingSubmission(null);
      if (pendingSubmission.kind === "roadshow") {
        setExpertMode("roadshow-done");
      }
      refreshWorkspace("reviewAssignments");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "专家评分提交失败");
    } finally {
      setSubmittingAssignmentId(null);
    }
  };

  if (currentRole === "expert") {
    return (
      <div className="mx-auto max-w-[1120px] space-y-6">
        <div className="expert-status-bar overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
          <div className="relative px-6 py-5 md:px-7">
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_20%,rgba(37,99,235,0.10),transparent_38%),linear-gradient(90deg,transparent,rgba(37,99,235,0.05))]" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-slate-950">评审任务入口</h2>
                  <p className="mt-1 text-sm text-slate-500">{reviewDeadlineText}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-2xl border border-slate-200 bg-white/85 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="min-w-24 px-5 py-3 text-center">
                  <p className="text-xs text-slate-400">待评</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{pendingNetworkCount + pendingRoadshowCount}</p>
                </div>
                <div className="min-w-24 px-5 py-3 text-center">
                  <p className="text-xs text-slate-400">已评</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600">{finishedNetworkCount + finishedRoadshowCount}</p>
                </div>
                <div className="min-w-24 px-5 py-3 text-center">
                  <p className="text-xs text-slate-400">模式</p>
                  <p className="mt-1 text-2xl font-bold text-blue-600">{availableModeCount}</p>
                </div>
              </div>
            </div>
          </div>

          {expertMode === "home" ? (
            <section className="border-t border-slate-100 px-6 py-9 md:px-8 md:py-11">
              <div className="mx-auto max-w-5xl">
                <div className="text-center">
                  <p className="text-sm font-semibold text-blue-600">您好，{currentUser?.name || "评审专家"}</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">请选择本轮评审任务</h1>
                  <p className="mt-3 text-sm text-slate-500">
                    系统仅展示管理员已分配给您的评审任务，提交后评分将锁定。
                  </p>
                </div>
                <div className="mt-10 grid gap-5 md:grid-cols-2">
                  <button
                    className="expert-task-card group relative overflow-hidden rounded-[22px] border border-blue-100 bg-gradient-to-br from-white to-blue-50/55 px-8 py-8 text-left transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_42px_rgba(37,99,235,0.13)]"
                    onClick={() => setExpertMode("network-list")}
                    type="button"
                  >
                    <div aria-hidden className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-blue-100/60 transition group-hover:scale-110" />
                    <div className="relative">
                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 text-white shadow-[0_18px_34px_rgba(37,99,235,0.22)]">
                        <Monitor className="h-8 w-8" />
                      </div>
                      <h3 className="mt-7 text-2xl font-bold tracking-tight text-slate-950">项目网络评审</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-500">审阅计划书、PPT、PDF 和视频材料，完成在线评分。</p>
                      <div className="mt-7 flex items-center gap-3">
                        <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">待评 {pendingNetworkCount}</span>
                        <span className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-blue-700">已评 {finishedNetworkCount}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    className="expert-task-card group relative overflow-hidden rounded-[22px] border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/55 px-8 py-8 text-left transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_18px_42px_rgba(16,185,129,0.12)]"
                    onClick={startRoadshowReview}
                    type="button"
                  >
                    <div aria-hidden className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-100/60 transition group-hover:scale-110" />
                    <div className="relative">
                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-600 text-white shadow-[0_18px_34px_rgba(16,185,129,0.20)]">
                        <Users className="h-8 w-8" />
                      </div>
                      <h3 className="mt-7 text-2xl font-bold tracking-tight text-slate-950">项目路演评审</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-500">根据现场展示和答辩表现，提交最终路演分数。</p>
                      <div className="mt-7 flex items-center gap-3">
                        <span className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">待评 {pendingRoadshowCount}</span>
                        <span className="rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-emerald-700">已评 {finishedRoadshowCount}</span>
                      </div>
                    </div>
                  </button>
                </div>
                <div className="mt-8 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800 ring-1 ring-amber-100">
                  评分范围为 0.00-100.00。提交前请确认分数，两位小数将按最终提交值锁定。
                </div>
              </div>
            </section>
          ) : null}
        </div>

        {expertMode === "network-list" ? (
          <section className="py-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-950">项目网络评审</h3>
                <p className="mt-1 text-sm text-slate-500">请逐项查看材料并提交 0.00-100.00 分评分。</p>
              </div>
              <button className="text-sm font-semibold text-blue-600 hover:text-blue-700" onClick={() => setExpertMode("home")} type="button">
                返回任务选择
              </button>
            </div>
            <div className="grid gap-4">
              {networkAssignments.map((assignment) => (
                <button
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/35 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
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
            <div className="detail-layout grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                  <h4 className="text-base font-bold text-slate-950">项目管理已生效材料</h4>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {materialEntries(selectedAssignment).map(([kind, label, material]) => (
                      <button
                        className="material-item rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
                        key={kind}
                        onClick={() => openMaterial(selectedAssignment, kind)}
                        type="button"
                      >
                        <p className="text-sm font-bold text-slate-900">{label}</p>
                        <p className="mt-2 truncate text-xs text-slate-500">{material?.fileName}</p>
                      </button>
                    ))}
                    {materialEntries(selectedAssignment).length === 0 ? (
                      <p className="text-sm text-slate-400">项目管理已生效材料暂未同步。</p>
                    ) : null}
                  </div>
                </article>
              </div>
              <aside className="rounded-3xl border border-blue-100 bg-blue-50/40 p-6">
                <h4 className="text-lg font-bold text-slate-950">提交评分</h4>
                {selectedAssignment.score ? (
                  <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    已提交 {formatScoreForAssignment(selectedAssignment)} 分，评分已锁定不能修改。
                  </div>
                ) : null}
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  评分（0.00-100.00）
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-3xl font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={
                      Boolean(selectedAssignment.score) ||
                      !selectedAssignment.canEdit ||
                      submittingAssignmentId === selectedAssignment.id
                    }
                    inputMode="decimal"
                    max={100}
                    min={0}
                    onChange={(event) =>
                      setNetworkScoreDrafts((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))
                    }
                    placeholder="0"
                    step="0.01"
                    type="number"
                    value={networkScoreDrafts[selectedAssignment.id] ?? ""}
                  />
                  <input
                    className="score-range mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500 accent-blue-600"
                    disabled={
                      Boolean(selectedAssignment.score) ||
                      !selectedAssignment.canEdit ||
                      submittingAssignmentId === selectedAssignment.id
                    }
                    max={100}
                    min={0}
                    onChange={(event) =>
                      setNetworkScoreDrafts((current) => ({
                        ...current,
                        [selectedAssignment.id]: Number(event.target.value).toFixed(2),
                      }))
                    }
                    step="0.01"
                    type="range"
                    value={Number(networkScoreDrafts[selectedAssignment.id] || 0)}
                  />
                </label>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  评语（可选）
                  <textarea
                    className="mt-2 min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={
                      Boolean(selectedAssignment.score) ||
                      !selectedAssignment.canEdit ||
                      submittingAssignmentId === selectedAssignment.id
                    }
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
                  disabled={
                    Boolean(selectedAssignment.score) ||
                    !selectedAssignment.canEdit ||
                    submittingAssignmentId === selectedAssignment.id
                  }
                  onClick={() => prepareNetworkSubmission(selectedAssignment)}
                  type="button"
                >
                  {selectedAssignment.score ? "已提交，不能修改" : "确认提交评分"}
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
                    disabled={Boolean(activeRoadshowAssignment.score) || !activeRoadshowAssignment.canEdit}
                    inputMode="decimal"
                    max={100}
                    min={0}
                    onChange={(event) => setRoadshowScoreDraft(event.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={roadshowScoreDraft}
                  />
                  <input
                    className="score-range mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500 accent-indigo-600"
                    disabled={Boolean(activeRoadshowAssignment.score) || !activeRoadshowAssignment.canEdit}
                    max={100}
                    min={0}
                    onChange={(event) => setRoadshowScoreDraft(Number(event.target.value).toFixed(2))}
                    step="0.01"
                    type="range"
                    value={Number(roadshowScoreDraft || 0)}
                  />
                </label>
                <p className="mt-4 text-sm text-slate-500">
                  若输入整数，如 85，系统会按 85.00 分提交；提交前请确认是否需要保留两位小数。
                </p>
                <button
                  className="mt-6 w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_36px_rgba(79,70,229,0.24)] transition hover:bg-indigo-700"
                  disabled={Boolean(activeRoadshowAssignment.score) || !activeRoadshowAssignment.canEdit}
                  onClick={prepareRoadshowSubmission}
                  type="button"
                >
                  {activeRoadshowAssignment.score ? "已提交，不能修改" : "确认提交路演分数"}
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
            <p className="mt-3 text-sm text-slate-500">当前路演评分已提交，感谢完成本轮评审。</p>
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
        <ExpertScoreSuccessModal
          success={expertScoreSuccess}
          onClose={() => setExpertScoreSuccess(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">评审管理</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">专家评审</h2>
            <p className="mt-2 text-sm text-slate-500">基于项目管理已生效材料分配专家、查看提交进度并导出评分明细。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              onClick={downloadReviewScoreDetails}
              type="button"
            >
              导出评分明细
            </button>
            {canCreateReviewPackage ? (
              <ActionButton onClick={openReviewAssignmentModal} variant="primary">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  分配专家评审
                </span>
              </ActionButton>
            ) : null}
          </div>
        </div>
      </section>

      {groupedAssignments.length === 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-8">
          <EmptyState description="从项目管理选择已生效材料并分配专家后，专家评分数据会显示在这里。" icon={FileCheck} title="暂无评审任务" />
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
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
              <h3 className="text-lg font-bold text-slate-950">项目管理已生效材料</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {activeGroup && (["plan", "ppt", "video"] as const).map((kind) => {
                  const assignment = activeGroup.items[0];
                  const material = assignment.materials[kind];
                  return (
                    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4" key={kind}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">{expertReviewMaterialLabels[kind]}</p>
                          <p className="mt-2 break-all text-xs leading-5 text-slate-500">{material?.fileName ?? "暂未上传"}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {material ? (
                          <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => openMaterial(assignment, kind)} type="button">
                            查看
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
              <h3 className="text-lg font-bold text-slate-950">评审概览</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-blue-50 px-4 py-3">
                  <p className="text-xs font-medium text-blue-600">项目</p>
                  <p className="mt-1 text-2xl font-bold text-blue-700">{groupedAssignments.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium text-slate-500">专家任务</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{reviewAssignments.length}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium text-amber-700">待评审</p>
                  <p className="mt-1 text-2xl font-bold text-amber-700">{pendingReviewCount}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-medium text-emerald-700">已提交</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">{finishedReviewCount}</p>
                </div>
              </div>
            </article>
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
            {canManageReviewMaterials && activeGroup ? (
              <div className="space-y-3">
                {isRoadshowAssignment(activeGroup.items[0]) ? (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-sm font-bold text-blue-900">现场大屏链接</p>
                    <p className="mt-1 text-xs leading-5 text-blue-700/75">
                      仅用于路演现场展示匿名专家席位和实时分数，链接有效期跟随本轮评审截止时间。
                    </p>
                    {reviewScreenSessions[activeGroup.key] ? (
                      <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-blue-700">
                        {reviewScreenSessions[activeGroup.key].message}
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-2">
                      <button
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-[0_12px_26px_rgba(37,99,235,0.20)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={reviewScreenActionKey === activeGroup.key}
                        onClick={() => void createReviewScreenSession(activeGroup)}
                        type="button"
                      >
                        <Copy className="h-4 w-4" />
                        {reviewScreenSessions[activeGroup.key] ? "重新生成并复制链接" : "生成并复制链接"}
                      </button>
	                      {reviewScreenSessions[activeGroup.key] ? (
	                        <>
	                          <div className="grid grid-cols-2 gap-2">
                          <button
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
                            onClick={() => window.open(reviewScreenSessions[activeGroup.key].screenUrl, "_blank", "noopener,noreferrer")}
                            type="button"
                          >
                            <ExternalLink className="h-4 w-4" />
                            打开大屏
                          </button>
                          <button
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={reviewScreenActionKey === activeGroup.key}
                            onClick={() => void startReviewScreenSession(activeGroup)}
                            type="button"
                          >
                            <PlayCircle className="h-4 w-4" />
                            开始评分
	                          </button>
		                        </div>
	                        {reviewScreenSessions[activeGroup.key]?.seats.length ? (
	                          <div className="mt-3 rounded-2xl border border-blue-100 bg-white p-3">
	                            <div className="flex items-center justify-between gap-2">
	                              <p className="text-xs font-bold text-slate-800">作废席位</p>
	                              <span className="text-[11px] text-slate-400">仅限未提交席位</span>
	                            </div>
	                            <div className="mt-2 space-y-2">
	                              {reviewScreenSessions[activeGroup.key].seats.map((seat) => {
	                                const statusLabel =
	                                  seat.status === "submitted" ? "已提交" : seat.status === "voided" ? "已作废" : "待提交";
	                                const statusClassName =
	                                  seat.status === "submitted"
	                                    ? "bg-emerald-50 text-emerald-700"
	                                    : seat.status === "voided"
	                                      ? "bg-slate-100 text-slate-500"
	                                      : "bg-amber-50 text-amber-700";
	                                return (
	                                  <div
	                                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
	                                    key={seat.id}
	                                  >
	                                    <div className="min-w-0">
	                                      <p className="truncate text-xs font-bold text-slate-800">{seat.displayName}</p>
	                                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClassName}`}>
	                                        {statusLabel}
	                                      </span>
	                                    </div>
	                                    <button
	                                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-100 bg-white px-2 py-1.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
	                                      disabled={seat.status !== "pending" || reviewScreenActionKey === `${activeGroup.key}:${seat.id}`}
	                                      onClick={() => void voidReviewScreenSeat(activeGroup, seat.id)}
	                                      type="button"
	                                    >
	                                      <Ban className="h-3.5 w-3.5" />
	                                      作废
	                                    </button>
	                                  </div>
	                                );
	                              })}
	                            </div>
	                          </div>
		                        ) : null}
		                        </>
	                      ) : null}
	                    </div>
	                  </div>
                ) : null}
                <button
                  className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                  onClick={() => openReviewAssignmentModal(activeGroup.items)}
                  type="button"
                >
                  编辑当前评审包
                </button>
                <button
                  className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  onClick={() => deleteReviewAssignment(activeGroup.items[0].id, activeGroup.targetName)}
                  type="button"
                >
                  删除当前评审包
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      )}

    </div>
  );
}
