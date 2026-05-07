"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Monitor,
  Plus,
  ShieldCheck,
  Shuffle,
  Trophy,
  Users,
} from "lucide-react";

import type { ExpertReviewAssignmentItem } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";
import {
  normalizeReviewScreenDisplaySettings,
  type ReviewScreenDisplaySettings,
} from "@/lib/review-screen-display-settings";

type ExpertPanelMode =
  | "home"
  | "network-list"
  | "network-detail"
  | "roadshow-wait"
  | "roadshow-score"
  | "roadshow-done";

type ReviewGroup = {
  key: string;
  projectReviewStageId: string | null;
  targetName: string;
  roundLabel: string;
  startAt: string | null;
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
  screenDisplay?: ReviewScreenDisplaySettings;
  seats: Array<{
    id: string;
    seatNo: number;
    displayName: string;
    status: "pending" | "submitted" | "voided";
    voidedAt: string | null;
  }>;
};

type ReviewScreenConsoleSeat = ReviewScreenSessionState["seats"][number];
type ReviewScreenLiveSeat = Pick<ReviewScreenConsoleSeat, "seatNo" | "displayName" | "status"> & {
  assignmentId?: string;
  id?: string;
  scoreText?: string | null;
  voidedAt?: string | null;
};

type ReviewScreenFinalScoreState = {
  ready: boolean;
  finalScoreText: string | null;
  finalScoreCents?: number | null;
  effectiveSeatCount: number;
  submittedSeatCount: number;
  waitingSeatNos: number[];
  droppedSeatNos: number[];
  droppedSeatReasons?: Array<{ seatNo: number; reason: "highest" | "lowest" | "voided" | string }>;
  validScoreTexts?: string[];
  dropHighestCount?: number;
  dropLowestCount?: number;
  scoreLockedAt?: string | null;
};

type ReviewScreenProjectResult = {
  reviewPackage: {
    id: string;
    targetName: string;
    roundLabel: string;
  };
  seats: ReviewScreenLiveSeat[];
  finalScore: ReviewScreenFinalScoreState;
};

type ReviewScreenProjectOrderItem = {
  orderIndex: number;
  packageId: string;
  targetName: string;
  roundLabel: string;
  groupName: string | null;
  groupIndex: number;
  groupSlotIndex: number;
  selfDrawnAt: string | null;
  revealedAt: string | null;
};

const reviewScreenPhaseActionLabels: Record<string, string> = {
  draw: "抽签准备",
  presentation: "路演展示",
  qa: "答辩提问",
  scoring: "评分进行中",
  reveal: "揭晓分数",
  finished: "本轮结束",
};

const getReviewScreenPhaseActionLabel = (phase: string) =>
  reviewScreenPhaseActionLabels[phase] ?? "现场阶段";

const mergeConsoleSeats = (
  sessionSeats: ReviewScreenConsoleSeat[],
  liveSeats: ReviewScreenLiveSeat[],
) => {
  const liveSeatByNo = new Map(liveSeats.map((seat) => [seat.seatNo, seat]));
  return sessionSeats.map((seat) => {
    const liveSeat = liveSeatByNo.get(seat.seatNo);
    return {
      ...seat,
      displayName: liveSeat?.displayName ?? seat.displayName,
      status: liveSeat?.status ?? seat.status,
      scoreText: liveSeat?.scoreText ?? null,
      voidedAt: liveSeat?.voidedAt ?? seat.voidedAt,
    };
  });
};

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

const getDefaultScreenTimingDraft = () => ({
  presentationMinutes: "8",
  qaMinutes: "7",
  scoringSeconds: "60",
});

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
        projectReviewStageId: assignment.projectReviewStageId ?? null,
        targetName: assignment.targetName,
        roundLabel: assignment.roundLabel,
        startAt: assignment.startAt,
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

  const dropHighestCount = group.items[0]?.dropHighestCount ?? 1;
  const dropLowestCount = group.items[0]?.dropLowestCount ?? 1;
  const canApplyDropRule = scores.length - dropHighestCount - dropLowestCount >= 2;
  const sortedScores = [...scores].sort((a, b) => a - b);
  const effectiveScores = canApplyDropRule
    ? sortedScores.slice(dropLowestCount, sortedScores.length - dropHighestCount)
    : sortedScores;
  const total = effectiveScores.reduce((sum, score) => sum + score, 0);

  return total / effectiveScores.length;
};

const materialEntries = (assignment: ExpertReviewAssignmentItem) =>
  ([
    ["plan", "项目计划书", assignment.materials.plan],
    ["ppt", "路演材料", assignment.materials.ppt],
    ["video", "演示视频", assignment.materials.video],
  ] as const).filter(([, , material]) => Boolean(material));

const getReviewWindowBlockMessage = (assignment: ExpertReviewAssignmentItem) => {
  if (assignment.score) {
    return null;
  }

  if (isRoadshowAssignment(assignment)) {
    if (assignment.roadshowScreenStarted === true && assignment.canEdit) {
      return null;
    }

    if (assignment.roadshowScreenStarted === false) {
      return "现场评分尚未开始，请等待管理员在大屏控制端点击开始评分。";
    }
  }

  if (assignment.reviewWindowState === "not_started") {
    return "当前不在评审时间段内，评审尚未开始。";
  }

  if (assignment.reviewWindowState === "ended" || assignment.statusKey === "locked") {
    return "当前不在评审时间段内，评审已结束。";
  }

  if (assignment.statusKey !== "pending" || assignment.canEdit) {
    return null;
  }

  return "当前不在评审时间段内，暂不能进入评审或提交分数。";
};

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
      <div
        aria-live="polite"
        className="w-full max-w-md rounded-t-[28px] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.24)] sm:rounded-3xl sm:p-6"
        role="dialog"
      >
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
        <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
          <button
            className="touch-manipulation rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition active:scale-[0.98] hover:bg-slate-50 sm:py-2.5"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            返回修改
          </button>
          <button
            className="touch-manipulation rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] transition active:scale-[0.98] hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
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
    projectStages,
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
  const [copiedScreenGroupKey, setCopiedScreenGroupKey] = useState<string | null>(null);
  const [screenTimingDrafts, setScreenTimingDrafts] = useState<
    Record<string, ReturnType<typeof getDefaultScreenTimingDraft>>
  >({});
  const [screenDisplayDrafts, setScreenDisplayDrafts] = useState<Record<string, ReviewScreenDisplaySettings>>({});
  const [manualOrderDrafts, setManualOrderDrafts] = useState<Record<string, Record<string, string>>>({});
  const [screenGroupDrafts, setScreenGroupDrafts] = useState<Record<string, string>>({});
  const [screenLiveData, setScreenLiveData] = useState<
    Record<
      string,
      {
        screenPhase: string;
        phaseLabel: string;
        phaseRemainingSeconds: number;
        currentProjectIndex: number;
        totalProjectCount: number;
        currentPackageId: string | null;
        reviewPackage?: { targetName: string };
        screenDisplay: ReviewScreenDisplaySettings;
        seats: ReviewScreenLiveSeat[];
        finalScore: ReviewScreenFinalScoreState | null;
        projectResults: ReviewScreenProjectResult[];
        projectOrder: ReviewScreenProjectOrderItem[];
      }
    >
  >({});

  // Poll live screen data when a session exists
  useEffect(() => {
    const uniqueSessionEntries = Array.from(
      Object.entries(reviewScreenSessions)
        .filter(([, session]) => Boolean(session.sessionId))
        .reduce((entries, [key, session]) => {
          if (!entries.has(session.sessionId)) {
            entries.set(session.sessionId, { key, session });
          }
          return entries;
        }, new Map<string, { key: string; session: ReviewScreenSessionState }>())
        .values(),
    );

    if (uniqueSessionEntries.length === 0) return;

    const poll = async () => {
      for (const { session: sessionState } of uniqueSessionEntries) {
        try {
          const data = await requestJson<{
            session: {
              screenPhase: string;
              phaseLabel: string;
              phaseRemainingSeconds: number;
              currentProjectIndex: number;
              totalProjectCount: number;
              currentPackageId: string | null;
              screenDisplay: ReviewScreenDisplaySettings;
            };
            seats: ReviewScreenLiveSeat[];
            finalScore: ReviewScreenFinalScoreState;
            projectResults: ReviewScreenProjectResult[];
            reviewPackage?: { targetName: string };
            projectOrder: ReviewScreenProjectOrderItem[];
            adminCanSeeScores?: boolean;
          }>(
            `/api/review-screen/sessions/${sessionState.sessionId}?token=${encodeURIComponent(tokenFromUrl(sessionState.screenUrl))}&viewer=admin`,
          );
          setScreenLiveData((prev) => {
            const next = { ...prev };
            for (const [groupKey, groupSession] of Object.entries(reviewScreenSessions)) {
              if (groupSession.sessionId !== sessionState.sessionId) continue;
              next[groupKey] = {
                screenPhase: data.session.screenPhase,
                phaseLabel: data.session.phaseLabel,
                phaseRemainingSeconds: data.session.phaseRemainingSeconds,
                currentProjectIndex: data.session.currentProjectIndex,
                totalProjectCount: data.session.totalProjectCount,
                currentPackageId: data.session.currentPackageId,
                reviewPackage: data.reviewPackage,
                screenDisplay: normalizeReviewScreenDisplaySettings(data.session.screenDisplay),
                seats: data.seats,
                finalScore: data.finalScore,
                projectResults: data.projectResults,
                projectOrder: data.projectOrder,
              };
            }
            return next;
          });
        } catch {
          // ignore polling errors
        }
      }
    };

    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => window.clearInterval(timer);
  }, [reviewScreenSessions, requestJson]);

  const tokenFromUrl = (url: string) => {
    try {
      return new URL(url).searchParams.get("token") ?? "";
    } catch {
      return "";
    }
  };

  const groupedAssignments = useMemo(() => groupReviewAssignments(reviewAssignments), [reviewAssignments]);
  const assignmentsByStageId = useMemo(() => {
    const map = new Map<string, ExpertReviewAssignmentItem[]>();
    for (const assignment of reviewAssignments) {
      if (!assignment.projectReviewStageId) {
        continue;
      }
      map.set(assignment.projectReviewStageId, [...(map.get(assignment.projectReviewStageId) ?? []), assignment]);
    }
    return map;
  }, [reviewAssignments]);
  const networkAssignments = useMemo(
    () => reviewAssignments.filter((assignment) => !isRoadshowAssignment(assignment)),
    [reviewAssignments],
  );
  const roadshowAssignments = useMemo(
    () => reviewAssignments.filter((assignment) => isRoadshowAssignment(assignment)),
    [reviewAssignments],
  );
  useEffect(() => {
    if (currentRole !== "expert") {
      return;
    }

    const refreshExpertAssignments = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      refreshWorkspace("reviewAssignments");
    };

    const timer = window.setInterval(refreshExpertAssignments, 3000);
    window.addEventListener("focus", refreshExpertAssignments);
    document.addEventListener("visibilitychange", refreshExpertAssignments);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshExpertAssignments);
      document.removeEventListener("visibilitychange", refreshExpertAssignments);
    };
  }, [currentRole, refreshWorkspace]);
  useEffect(() => {
    if (!canManageReviewMaterials || Object.keys(reviewScreenSessions).length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshWorkspace("reviewAssignments");
    }, 5000);

    return () => window.clearInterval(timer);
  }, [canManageReviewMaterials, refreshWorkspace, reviewScreenSessions]);
  const selectedAssignment =
    reviewAssignments.find((assignment) => assignment.id === selectedAssignmentId) ??
    networkAssignments[0] ??
    roadshowAssignments[0] ??
    null;
  const activeRoadshowAssignment =
    roadshowAssignments.find((assignment) => assignment.statusKey === "pending" && assignment.canEdit) ??
    roadshowAssignments.find((assignment) => assignment.statusKey === "pending" && assignment.roadshowScreenActive === true) ??
    roadshowAssignments.find((assignment) => assignment.statusKey === "pending" && assignment.roadshowScreenStarted === true) ??
    roadshowAssignments.find((assignment) => assignment.statusKey === "pending") ??
    roadshowAssignments[0] ??
    null;
  useEffect(() => {
    if (
      currentRole !== "expert" ||
      expertMode !== "roadshow-wait" ||
      !activeRoadshowAssignment ||
      !activeRoadshowAssignment.canEdit ||
      activeRoadshowAssignment.score
    ) {
      return;
    }

    const scoreText = formatScoreForAssignment(activeRoadshowAssignment);
    setRoadshowScoreDraft(scoreText === "--" ? "" : scoreText);
    setExpertMode("roadshow-score");
  }, [activeRoadshowAssignment, currentRole, expertMode]);
  const activeGroup =
    groupedAssignments.find((group) => group.key === activeGroupKey) ??
    groupedAssignments[0] ??
    null;
  const activeGroupLiveData = activeGroup ? screenLiveData[activeGroup.key] : undefined;
  const activeCurrentProjectGroup =
    groupedAssignments.find((group) => group.key === activeGroupLiveData?.currentPackageId) ??
    activeGroup;
  const activeGroupLiveProject = activeGroup && activeGroupLiveData
    ? activeGroupLiveData.projectResults.find(
        (project) => project.reviewPackage.id === (activeGroupLiveData.currentPackageId ?? activeGroup.key),
      )
    : undefined;
  const activeGroupFinalScoreText =
    activeGroup && isRoadshowAssignment(activeGroup.items[0])
      ? activeGroupLiveProject?.finalScore.ready
        ? activeGroupLiveProject.finalScore.finalScoreText ?? "--"
        : "--"
      : activeGroup
        ? getAverageScore(activeGroup)?.toFixed(2) ?? "--"
        : "--";
  const getLiveAssignmentScoreText = (assignment: ExpertReviewAssignmentItem) => {
    const liveProject = screenLiveData[assignment.packageId]?.projectResults.find(
      (project) => project.reviewPackage.id === assignment.packageId,
    );
    const liveSeat = liveProject?.seats.find((seat) => seat.assignmentId === assignment.id);
    return liveSeat?.scoreText ?? (assignment.score ? formatScoreForAssignment(assignment) : "--");
  };
  const activeGroupHasLockedScore = Boolean(
    activeGroup?.items.some((assignment) => Boolean(assignment.score?.lockedAt)),
  );

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

  const updateScreenTimingDraft = (
    groupKey: string,
    field: keyof ReturnType<typeof getDefaultScreenTimingDraft>,
    value: string,
  ) => {
    const normalizedValue = value.replace(/[^\d]/g, "").slice(0, 3);
    setScreenTimingDrafts((current) => ({
      ...current,
      [groupKey]: {
        ...(current[groupKey] ?? getDefaultScreenTimingDraft()),
        [field]: normalizedValue,
      },
    }));
  };

  const getReviewScreenTimingPayload = useCallback((groupKey: string) => {
    const draft = screenTimingDrafts[groupKey] ?? getDefaultScreenTimingDraft();
    const presentationMinutes = Number(draft.presentationMinutes || 8);
    const qaMinutes = Number(draft.qaMinutes || 7);
    const scoringSeconds = Number(draft.scoringSeconds || 60);

    return {
      presentationSeconds: Math.min(1800, Math.max(60, Math.trunc(presentationMinutes * 60))),
      qaSeconds: Math.min(1800, Math.max(60, Math.trunc(qaMinutes * 60))),
      scoringSeconds: Math.min(600, Math.max(10, Math.trunc(scoringSeconds))),
    };
  }, [screenTimingDrafts]);

  const getReviewScreenDisplayPayload = useCallback((groupKey: string) => {
    return normalizeReviewScreenDisplaySettings(
      screenDisplayDrafts[groupKey] ?? screenLiveData[groupKey]?.screenDisplay ?? reviewScreenSessions[groupKey]?.screenDisplay,
    );
  }, [reviewScreenSessions, screenDisplayDrafts, screenLiveData]);

  const saveReviewScreenTiming = useCallback(
    async (groupKey: string, screenSession: ReviewScreenSessionState) => {
      await requestJson(`/api/review-screen/sessions/${screenSession.sessionId}/settings`, {
        method: "POST",
        body: JSON.stringify({
          ...getReviewScreenTimingPayload(groupKey),
          screenDisplay: getReviewScreenDisplayPayload(groupKey),
        }),
      });
    },
    [getReviewScreenDisplayPayload, getReviewScreenTimingPayload, requestJson],
  );

  const updateScreenDisplayDraft = (
    groupKey: string,
    field: keyof ReviewScreenDisplaySettings,
    value: boolean,
  ) => {
    setScreenDisplayDrafts((current) => {
      const currentDraft = normalizeReviewScreenDisplaySettings(
        current[groupKey] ?? screenLiveData[groupKey]?.screenDisplay ?? reviewScreenSessions[groupKey]?.screenDisplay,
      );
      return {
        ...current,
        [groupKey]: normalizeReviewScreenDisplaySettings({
          ...currentDraft,
          [field]: value,
        }),
      };
    });
  };

  useEffect(() => {
    const groupKeys = Array.from(
      new Set([...Object.keys(screenTimingDrafts), ...Object.keys(screenDisplayDrafts)]),
    ).filter((groupKey) => {
      const screenPhase = screenLiveData[groupKey]?.screenPhase ?? "draw";
      return Boolean(reviewScreenSessions[groupKey]?.sessionId) && screenPhase === "draw";
    });
    if (groupKeys.length === 0) return;

    const timer = window.setTimeout(() => {
      for (const groupKey of groupKeys) {
        const screenSession = reviewScreenSessions[groupKey];
        if (!screenSession) continue;
        void saveReviewScreenTiming(groupKey, screenSession).catch(() => undefined);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [reviewScreenSessions, saveReviewScreenTiming, screenDisplayDrafts, screenLiveData, screenTimingDrafts]);

  const getRoadshowProjectCount = (group: ReviewGroup) => {
    if (!group.projectReviewStageId) {
      return 1;
    }
    return groupedAssignments.filter((candidate) => candidate.projectReviewStageId === group.projectReviewStageId).length;
  };

  const updateScreenGroupDraft = (groupKey: string, value: string) => {
    setScreenGroupDrafts((current) => ({
      ...current,
      [groupKey]: value.replace(/[^\d/，,、\s]/g, "").slice(0, 24),
    }));
  };

  const getRoadshowGroupSizesPayload = (group: ReviewGroup) => {
    const projectCount = getRoadshowProjectCount(group);
    const draft = screenGroupDrafts[group.key]?.trim();
    if (!draft) {
      return [projectCount];
    }
    const sizes = draft
      .split(/[\/，,、\s]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.trunc(value))
      .filter((value) => value > 0);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    if (sizes.length === 0 || total !== projectCount) {
      throw new Error(`路演分组容量之和需等于项目数量（当前 ${total}/${projectCount}）`);
    }
    return sizes;
  };

  const createReviewScreenSession = async (group: ReviewGroup) => {
    if (!group.items.some((assignment) => isRoadshowAssignment(assignment))) {
      setLoadError("只有项目路演评审可以生成现场大屏链接");
      return;
    }

    setReviewScreenActionKey(group.key);
    try {
      const roadshowGroupSizes = getRoadshowGroupSizesPayload(group);
      const payload = await requestJson<{
        session: {
          id: string;
          startedAt?: string | null;
          screenPhase?: string;
          currentPackageId?: string | null;
          screenDisplay?: ReviewScreenDisplaySettings;
        };
        seats: ReviewScreenSessionState["seats"];
        screenUrl: string;
        packageIds?: string[];
        projectOrder?: ReviewScreenProjectOrderItem[];
      }>("/api/review-screen/sessions", {
        method: "POST",
        body: JSON.stringify({
          packageId: group.key,
          countdownSeconds: 60,
          ...getReviewScreenTimingPayload(group.key),
          screenDisplay: getReviewScreenDisplayPayload(group.key),
          roadshowGroupSizes,
        }),
      });

      await navigator.clipboard?.writeText(payload.screenUrl).catch(() => undefined);
      const stageGroupKeys = payload.packageIds?.length
        ? groupedAssignments
            .filter((candidate) => payload.packageIds?.includes(candidate.key))
            .map((candidate) => candidate.key)
        : groupedAssignments
            .filter((candidate) =>
              group.projectReviewStageId
                ? candidate.projectReviewStageId === group.projectReviewStageId
                : candidate.key === group.key,
            )
            .map((candidate) => candidate.key);
      const nextSessionState: ReviewScreenSessionState = {
          sessionId: payload.session.id,
          screenUrl: payload.screenUrl,
        message: "本轮路演大屏链接已生成，可复制或打开。",
          startedAt: payload.session.startedAt ?? null,
          screenDisplay: normalizeReviewScreenDisplaySettings(payload.session.screenDisplay),
          seats: payload.seats,
      };
      setReviewScreenSessions((current) => {
        const next = { ...current };
        for (const key of stageGroupKeys.length ? stageGroupKeys : [group.key]) {
          next[key] = nextSessionState;
        }
        return next;
      });
      if (payload.projectOrder?.length) {
        setScreenLiveData((current) => {
          const next = { ...current };
          for (const key of stageGroupKeys.length ? stageGroupKeys : [group.key]) {
            next[key] = {
              screenPhase: payload.session.screenPhase ?? "draw",
              phaseLabel: "待开始",
              phaseRemainingSeconds: 0,
              currentProjectIndex: 0,
              totalProjectCount: payload.projectOrder?.length ?? 0,
              currentPackageId: payload.session.currentPackageId ?? payload.projectOrder?.[0]?.packageId ?? null,
              reviewPackage: { targetName: payload.projectOrder?.[0]?.targetName ?? group.targetName },
              screenDisplay: normalizeReviewScreenDisplaySettings(payload.session.screenDisplay),
              seats: payload.seats,
              finalScore: null,
              projectResults: [],
              projectOrder: payload.projectOrder ?? [],
            };
          }
          return next;
        });
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "现场大屏链接生成失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const copyReviewScreenUrl = async (groupKey: string, screenUrl: string) => {
    await navigator.clipboard?.writeText(screenUrl).catch(() => undefined);
    setCopiedScreenGroupKey(groupKey);
    window.setTimeout(() => {
      setCopiedScreenGroupKey((current) => (current === groupKey ? null : current));
    }, 2000);
  };

  const voidReviewScreenSeat = async (group: ReviewGroup, seatId: string) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }
    if (!seatId) {
      setLoadError("请选择要排除的专家席位");
      return;
    }
    if (!window.confirm("排除该专家后，其席位将不参与评分计算。确定排除？")) {
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
      setReviewScreenSessions((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (value.sessionId === screenSession.sessionId) {
            next[key] = {
              ...value,
              message: `${payload.seat.displayName} 已从本轮计分排除。`,
              seats: value.seats.map((seat) => (seat.id === payload.seat.id ? payload.seat : seat)),
            };
          }
        }
        return next;
      });
      setScreenLiveData((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (reviewScreenSessions[key]?.sessionId === screenSession.sessionId) {
            next[key] = {
              ...value,
              seats: value.seats.map((seat) =>
                seat.seatNo === payload.seat.seatNo
                  ? { ...seat, status: payload.seat.status, voidedAt: payload.seat.voidedAt }
                  : seat,
              ),
            };
          }
        }
        return next;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "席位作废失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const restoreReviewScreenSeat = async (group: ReviewGroup, seatId: string) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }
    if (!seatId) {
      setLoadError("请选择要恢复的专家席位");
      return;
    }

    setReviewScreenActionKey(`${group.key}:${seatId}`);
    try {
      const payload = await requestJson<{
        seat: ReviewScreenSessionState["seats"][number];
      }>(`/api/review-screen/sessions/${screenSession.sessionId}/restore-seat`, {
        method: "POST",
        body: JSON.stringify({ seatId }),
      });
      setReviewScreenSessions((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (value.sessionId === screenSession.sessionId) {
            next[key] = {
              ...value,
              message: `${payload.seat.displayName} 已恢复计分。`,
              seats: value.seats.map((seat) => (seat.id === payload.seat.id ? payload.seat : seat)),
            };
          }
        }
        return next;
      });
      setScreenLiveData((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (reviewScreenSessions[key]?.sessionId === screenSession.sessionId) {
            next[key] = {
              ...value,
              seats: value.seats.map((seat) =>
                seat.seatNo === payload.seat.seatNo
                  ? { ...seat, status: payload.seat.status, voidedAt: payload.seat.voidedAt }
                  : seat,
              ),
            };
          }
        }
        return next;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "席位恢复失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const drawReviewScreenSession = async (group: ReviewGroup) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }
    setReviewScreenActionKey(`${group.key}:draw`);
    try {
      const roadshowGroupSizes = getRoadshowGroupSizesPayload(group);
      const payload = await requestJson<{
        projectOrder: ReviewScreenProjectOrderItem[];
        session: { currentPackageId: string | null };
      }>(`/api/review-screen/sessions/${screenSession.sessionId}/draw`, {
        method: "POST",
        body: JSON.stringify({ roadshowGroupSizes }),
      });
      setReviewScreenSessions((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (value.sessionId === screenSession.sessionId) {
            next[key] = { ...value, message: "随机抽签顺序已生成，大屏已同步。" };
          }
        }
        return next;
      });
      setScreenLiveData((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (reviewScreenSessions[key]?.sessionId === screenSession.sessionId) {
            next[key] = {
              ...value,
              currentPackageId: payload.session.currentPackageId,
              currentProjectIndex: 0,
              projectOrder: payload.projectOrder,
            };
          }
        }
        return next;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "抽签生成失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const reorderReviewScreenProjects = async (group: ReviewGroup, packageIds: string[]) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }

    setReviewScreenActionKey(`${group.key}:order`);
    try {
      const roadshowGroupSizes = getRoadshowGroupSizesPayload(group);
      const payload = await requestJson<{
        projectOrder: ReviewScreenProjectOrderItem[];
        session: { currentPackageId: string | null };
      }>(`/api/review-screen/sessions/${screenSession.sessionId}/order`, {
        method: "POST",
        body: JSON.stringify({ packageIds, roadshowGroupSizes }),
      });
      setReviewScreenSessions((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (value.sessionId === screenSession.sessionId) {
            next[key] = { ...value, message: "路演顺序已调整，大屏已同步。" };
          }
        }
        return next;
      });
      setScreenLiveData((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (reviewScreenSessions[key]?.sessionId === screenSession.sessionId) {
            next[key] = {
              ...value,
              currentPackageId: payload.session.currentPackageId,
              currentProjectIndex: 0,
              projectOrder: payload.projectOrder,
            };
          }
        }
        return next;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "路演顺序调整失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const moveReviewScreenProject = (group: ReviewGroup, index: number, direction: -1 | 1) => {
    const currentOrder = screenLiveData[group.key]?.projectOrder ?? [];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) {
      return;
    }

    const nextOrder = [...currentOrder];
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    void reorderReviewScreenProjects(group, nextOrder.map((item) => item.packageId));
  };

  const updateManualOrderDraft = (groupKey: string, packageId: string, value: string) => {
    setManualOrderDrafts((current) => ({
      ...current,
      [groupKey]: {
        ...(current[groupKey] ?? {}),
        [packageId]: value.replace(/[^\d]/g, "").slice(0, 3),
      },
    }));
  };

  const saveManualReviewScreenOrder = (group: ReviewGroup, projectOrder: ReviewScreenProjectOrderItem[]) => {
    const drafts = manualOrderDrafts[group.key] ?? {};
    const parsed = projectOrder.map((item, index) => ({
      item,
      originalIndex: index,
      manualOrder: Number(drafts[item.packageId] || index + 1),
    }));
    if (parsed.some((entry) => !Number.isFinite(entry.manualOrder) || entry.manualOrder <= 0)) {
      setLoadError("请填写有效的手动序号");
      return;
    }
    const sorted = parsed
      .sort((left, right) => left.manualOrder - right.manualOrder || left.originalIndex - right.originalIndex)
      .map((entry) => entry.item.packageId);
    void reorderReviewScreenProjects(group, sorted);
  };

  const changeReviewScreenPhase = async (
    group: ReviewGroup,
    phase: string,
    options?: { force?: boolean },
  ) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }
    setReviewScreenActionKey(`${group.key}:phase:${phase}`);
    try {
      const payload = await requestJson<{ session: { screenPhase: string } }>(`/api/review-screen/sessions/${screenSession.sessionId}/phase`, {
        method: "POST",
        body: JSON.stringify({ phase, force: options?.force === true, ...getReviewScreenTimingPayload(group.key) }),
      });
      const phaseLabel = getReviewScreenPhaseActionLabel(payload.session.screenPhase);
      setReviewScreenSessions((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (value.sessionId === screenSession.sessionId) {
            next[key] = { ...value, message: `阶段已切换为：${phaseLabel}。` };
          }
        }
        return next;
      });
      setScreenLiveData((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (reviewScreenSessions[key]?.sessionId === screenSession.sessionId) {
            next[key] = {
              ...value,
              screenPhase: payload.session.screenPhase,
              phaseLabel,
            };
          }
        }
        return next;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "阶段切换失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const switchReviewScreenProject = async (group: ReviewGroup, packageId?: string) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }
    setReviewScreenActionKey(packageId ? `${group.key}:project:${packageId}` : `${group.key}:next`);
    try {
      await requestJson(`/api/review-screen/sessions/${screenSession.sessionId}/next-project`, {
        method: "POST",
        body: JSON.stringify(packageId ? { packageId } : {}),
      });
      setReviewScreenSessions((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (value.sessionId === screenSession.sessionId) {
            next[key] = { ...value, message: packageId ? "已切换到指定项目，等待下一项目出场。" : "已切换到下一项目，等待下一项目出场。" };
          }
        }
        return next;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "切换项目失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const nextReviewScreenProject = (group: ReviewGroup) => switchReviewScreenProject(group);

  const revealReviewScreenScore = async (group: ReviewGroup) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接");
      return;
    }
    const screenDisplay = normalizeReviewScreenDisplaySettings(
      screenDisplayDrafts[group.key] ?? screenLiveData[group.key]?.screenDisplay ?? screenSession.screenDisplay,
    );
    setReviewScreenActionKey(`${group.key}:reveal`);
    try {
      await requestJson(`/api/review-screen/sessions/${screenSession.sessionId}/reveal`, {
        method: "POST",
      });
      setReviewScreenSessions((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (value.sessionId === screenSession.sessionId) {
            next[key] = {
              ...value,
              message: screenDisplay.showFinalScoreOnScreen
                ? "最终得分已确认并锁定，大屏将按设置展示。"
                : "最终得分已确认并锁定，仅后台归档，大屏不显示分数。",
            };
          }
        }
        return next;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "确认并计算最终得分失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const openMaterial = (assignment: ExpertReviewAssignmentItem, kind: "plan" | "ppt" | "video") => {
    const windowBlockMessage = getReviewWindowBlockMessage(assignment);
    if (windowBlockMessage) {
      setLoadError(windowBlockMessage);
      return;
    }

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
    const windowBlockMessage = getReviewWindowBlockMessage(assignment);
    if (windowBlockMessage) {
      setLoadError(windowBlockMessage);
      return;
    }

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
    const windowBlockMessage = getReviewWindowBlockMessage(activeRoadshowAssignment);
    if (windowBlockMessage) {
      setLoadError(windowBlockMessage);
      return;
    }
    setExpertMode(activeRoadshowAssignment.statusKey === "pending" ? "roadshow-score" : "roadshow-done");
  };

  const prepareNetworkSubmission = (assignment: ExpertReviewAssignmentItem) => {
    if (assignment.score || assignment.statusKey !== "pending" || !assignment.canEdit) {
      setLoadError(getReviewWindowBlockMessage(assignment) ?? "该评审已提交，不能修改");
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
      setLoadError(getReviewWindowBlockMessage(activeRoadshowAssignment) ?? "该路演评分已提交，不能修改");
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

  const renderReviewScreenConsole = (group: ReviewGroup) => {
    if (!canManageReviewMaterials || !isRoadshowAssignment(group.items[0])) {
      return null;
    }

    const screenSession = reviewScreenSessions[group.key];
    const liveData = screenLiveData[group.key];
    const consoleSeats = mergeConsoleSeats(screenSession?.seats ?? [], liveData?.seats ?? []);
    const timingDraft = screenTimingDrafts[group.key] ?? getDefaultScreenTimingDraft();
    const groupDraft = screenGroupDrafts[group.key] ?? "";
    const roadshowProjectCount = getRoadshowProjectCount(group);
    const fallbackProjectOrder = groupedAssignments
      .filter((candidate) =>
        group.projectReviewStageId
          ? candidate.projectReviewStageId === group.projectReviewStageId
          : candidate.key === group.key,
      )
      .map<ReviewScreenProjectOrderItem>((candidate, index) => ({
        orderIndex: index,
        packageId: candidate.key,
        targetName: candidate.targetName,
        roundLabel: candidate.roundLabel,
        groupName: null,
        groupIndex: 0,
        groupSlotIndex: index,
        selfDrawnAt: null,
        revealedAt: null,
      }));
    const projectOrder = liveData?.projectOrder?.length ? liveData.projectOrder : fallbackProjectOrder;
    const currentPhase = liveData?.screenPhase ?? "draw";
    const screenDisplay = normalizeReviewScreenDisplaySettings(
      screenDisplayDrafts[group.key] ?? liveData?.screenDisplay ?? screenSession?.screenDisplay,
    );
    const currentProjectIndex = liveData?.currentProjectIndex ?? Math.max(
      0,
      projectOrder.findIndex((project) => project.packageId === group.key),
    );
    const currentProject =
      projectOrder.find((project) => project.packageId === liveData?.currentPackageId) ??
      projectOrder[currentProjectIndex] ??
      projectOrder[0] ??
      null;
    const currentLiveProject = liveData?.projectResults.find(
      (project) => project.reviewPackage.id === currentProject?.packageId,
    );
    const currentProjectSeats = currentLiveProject?.seats ?? [];
    const currentProjectHasAllSubmitted =
      currentProjectSeats.length > 0 &&
      currentProjectSeats.every((seat) => seat.status === "submitted" || seat.status === "voided") &&
      currentProjectSeats.some((seat) => seat.status === "submitted");
    const currentProjectHasLockedScore = Boolean(
      currentLiveProject?.finalScore.scoreLockedAt || currentProject?.revealedAt,
    );
    const currentPendingSeatNos = currentProjectSeats
      .filter((seat) => seat.status === "pending")
      .map((seat) => seat.seatNo);
    const phaseRemainingSeconds = Math.max(0, liveData?.phaseRemainingSeconds ?? 0);
    const formattedRemaining = `${String(Math.floor(phaseRemainingSeconds / 60)).padStart(2, "0")}:${String(
      phaseRemainingSeconds % 60,
    ).padStart(2, "0")}`;
    const isScreenSessionFinished = currentPhase === "finished";
    const drawControlsVisible = screenDisplay.selfDrawEnabled;
    const getConsolePhaseLabel = (phase: string) => {
      if (phase === "draw" && !screenDisplay.selfDrawEnabled) return "待开始";
      if (phase === "reveal" && !screenDisplay.showFinalScoreOnScreen) return "成绩已锁定";
      return getReviewScreenPhaseActionLabel(phase);
    };
    const canStartPresentation = Boolean(screenSession) && (currentPhase === "draw" || currentPhase === "presentation");
    const canStartQa = Boolean(screenSession) && currentPhase === "presentation";
    const canStartScoring = Boolean(screenSession) && screenDisplay.scoringEnabled && currentPhase === "qa";
    const packageDropHighestCount = group.items[0]?.dropHighestCount ?? 1;
    const packageDropLowestCount = group.items[0]?.dropLowestCount ?? 1;
    const effectiveExpertCount = consoleSeats.length || group.items.length;
    const remainingScoreCount = Math.max(
      0,
      effectiveExpertCount - packageDropHighestCount - packageDropLowestCount,
    );
    const scoreRuleIsInvalid = remainingScoreCount < 2 && effectiveExpertCount >= 2;
    const canRevealScore =
      Boolean(screenSession) &&
      screenDisplay.scoringEnabled &&
      currentPhase === "scoring" &&
      currentProjectHasAllSubmitted &&
      !currentProjectHasLockedScore &&
      !scoreRuleIsInvalid;
    const hasNextProject = (liveData?.currentProjectIndex ?? 0) + 1 < (liveData?.totalProjectCount ?? projectOrder.length);
    const canGoNextProject =
      hasNextProject &&
      (currentPhase === "reveal" ||
        currentPhase === "finished" ||
        currentPhase === "scoring" ||
        (!screenDisplay.scoringEnabled && currentPhase === "qa"));
    const canForceNextWithoutLockedScore =
      screenDisplay.scoringEnabled && currentPhase === "scoring" && !currentProjectHasLockedScore;
    const canEndRound =
      Boolean(screenSession) &&
      !hasNextProject &&
      currentPhase !== "finished" &&
      (currentPhase === "reveal" ||
        currentPhase === "scoring" ||
        (!screenDisplay.scoringEnabled && currentPhase === "qa"));
    const canForceFinishRound = Boolean(screenSession) && currentPhase !== "finished";
    const warningMessages = [
      !screenSession ? "尚未生成投屏链接，现场大屏无法打开。" : null,
      scoreRuleIsInvalid ? "当前去高去低规则导致有效评分不足 2 个，不能计算最终得分。" : null,
      currentPhase === "scoring" && currentPendingSeatNos.length > 0
        ? `仍有专家 ${currentPendingSeatNos.join("、")} 未提交评分。`
        : null,
    ].filter((message): message is string => Boolean(message));
    const adminScoreGroups = projectOrder.reduce<
      Array<{ groupName: string; projects: Array<ReviewScreenProjectOrderItem & { result?: ReviewScreenProjectResult }> }>
    >((groups, project) => {
      const groupName = project.groupName?.trim() || `第${project.groupIndex + 1}组`;
      let targetGroup = groups.find((item) => item.groupName === groupName);
      if (!targetGroup) {
        targetGroup = { groupName, projects: [] };
        groups.push(targetGroup);
      }
      targetGroup.projects.push({
        ...project,
        result: liveData?.projectResults.find((result) => result.reviewPackage.id === project.packageId),
      });
      return groups;
    }, []);
    const progressGroups: Array<{
      groupName: string;
      projects: Array<ReviewScreenProjectOrderItem & { result?: ReviewScreenProjectResult }>;
    }> = adminScoreGroups.length
      ? adminScoreGroups
      : [
          {
            groupName: "第一组",
            projects: projectOrder.map((project) => ({ ...project, result: undefined })),
          },
        ];
    const reviewConsoleTheme = {
      "--ink": "#0B1220",
      "--ink-soft": "#2A3548",
      "--line": "#E6EAF0",
      "--line-soft": "#F0F3F8",
      "--bg": "#F6F7FB",
      "--card": "#FFFFFF",
      "--muted": "#6B7385",
      "--muted-2": "#9098A9",
      "--brand": "#1E5EFF",
      "--brand-soft": "#EAF0FF",
      "--accent": "#FF6A3D",
      "--warn": "#F2A93B",
      "--ok": "#1FB57A",
      "--ok-soft": "#E6F6EE",
      "--danger": "#E5484D",
      "--danger-soft": "#FCEBEC",
      "--stage-dark": "#0E1626",
      "--stage-dark-2": "#152038",
    } as CSSProperties;
    const projectResultByPackageId = new Map(
      (liveData?.projectResults ?? []).map((result) => [result.reviewPackage.id, result]),
    );
    const totalProjectCount = projectOrder.length || 1;
    const completedProjectCount = projectOrder.filter((project, index) => {
      const result = projectResultByPackageId.get(project.packageId);
      return isScreenSessionFinished || Boolean(result?.finalScore.scoreLockedAt || project.revealedAt) || index < currentProjectIndex;
    }).length;
    const progressPercent = Math.min(100, Math.round((completedProjectCount / totalProjectCount) * 100));
    const reviewLifecycleStage = isScreenSessionFinished ? "finished" : currentPhase === "draw" ? "config" : "running";
    const stageSteps = [
      { key: "config", title: "配置评审", description: "顺序 / 规则 / 投屏" },
      { key: "running", title: "现场推进", description: "路演 / 答辩 / 评分" },
      { key: "finished", title: "收尾归档", description: "成绩 / 导出 / 复盘" },
    ];
    const stageIndex = stageSteps.findIndex((step) => step.key === reviewLifecycleStage);
    const isTimerUrgent = currentPhase !== "draw" && currentPhase !== "finished" && phaseRemainingSeconds <= 30;
    const isTimerExpired = currentPhase !== "draw" && currentPhase !== "finished" && phaseRemainingSeconds === 0;
    const singleProjectSeconds =
      Math.max(0, Number.parseInt(timingDraft.presentationMinutes, 10) || 0) * 60 +
      Math.max(0, Number.parseInt(timingDraft.qaMinutes, 10) || 0) * 60 +
      Math.max(0, Number.parseInt(timingDraft.scoringSeconds, 10) || 0);
    const estimatedRemainingSeconds = Math.max(0, totalProjectCount - completedProjectCount) * singleProjectSeconds;
    const estimatedRemainingHours = estimatedRemainingSeconds / 3600;
    const planDeltaMinutes = Math.max(0, currentProjectIndex - completedProjectCount) * Math.round(singleProjectSeconds / 60);
    const monitorSeats =
      consoleSeats.length > 0
        ? consoleSeats
        : group.items.map((assignment, index) => ({
            id: assignment.id,
            seatNo: index + 1,
            displayName: `专家 ${index + 1}`,
            status: assignment.score ? "submitted" as const : "pending" as const,
            voidedAt: null,
            scoreText: assignment.score ? formatScoreForAssignment(assignment) : null,
          }));
    const groupHasLockedScore = group.items.some((item) => Boolean(item.score?.lockedAt));
    const getProjectStatus = (project: ReviewScreenProjectOrderItem, index: number) => {
      const result = projectResultByPackageId.get(project.packageId);
      if (project.packageId === currentProject?.packageId && currentPhase !== "finished") return "current";
      if (isScreenSessionFinished || result?.finalScore.scoreLockedAt || project.revealedAt || index < currentProjectIndex) return "done";
      if (index === currentProjectIndex + 1) return "next";
      return "pending";
    };
    const renderStageStrip = () => (
      <div className="review-stage-strip border-b border-[var(--line)] bg-white px-5 py-4">
        <div className="grid gap-3 md:grid-cols-3">
          {stageSteps.map((step, index) => {
            const done = index < stageIndex;
            const active = index === stageIndex;
            return (
              <div className="flex items-center gap-3" key={step.key}>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-extrabold ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-[var(--brand)] text-white shadow-[0_0_0_4px_var(--brand-soft)]"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {done ? "✓" : index + 1}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-extrabold ${active ? "text-[var(--brand)]" : "text-slate-700"}`}>
                    {step.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">{step.description}</p>
                </div>
                {index < stageSteps.length - 1 ? (
                  <span className={`hidden h-px flex-1 md:block ${done ? "bg-emerald-400" : "border-t border-dashed border-slate-200"}`} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
    const workflowSteps = [
      {
        no: "01",
        phase: "presentation" as const,
        label: "开始路演",
        enabled: canStartPresentation,
        done: ["qa", "scoring", "reveal", "finished"].includes(currentPhase),
        onClick: () => void changeReviewScreenPhase(group, "presentation"),
      },
      {
        no: "02",
        phase: "qa" as const,
        label: "开始答辩",
        enabled: canStartQa,
        done: ["scoring", "reveal", "finished"].includes(currentPhase),
        onClick: () => void changeReviewScreenPhase(group, "qa"),
      },
      {
        no: "03",
        phase: "scoring" as const,
        label: "开始评分",
        enabled: canStartScoring,
        done: ["reveal", "finished"].includes(currentPhase),
        onClick: () => void changeReviewScreenPhase(group, "scoring"),
      },
      {
        no: "04",
        phase: "reveal" as const,
        label: screenDisplay.showFinalScoreOnScreen ? "计算并揭晓" : "确认归档",
        enabled: canRevealScore,
        done: currentProjectHasLockedScore || ["reveal", "finished"].includes(currentPhase),
        onClick: () => {
          if (
            window.confirm(
              screenDisplay.showFinalScoreOnScreen
                ? "确认计算并锁定当前项目得分？大屏将按设置展示最终得分。"
                : "确认计算并锁定当前项目得分？本次只在后台归档，大屏不会显示具体分数或揭晓动画。",
            )
          ) {
            void revealReviewScreenScore(group);
          }
        },
      },
      {
        no: "05",
        phase: "finished" as const,
        label: "完成本项",
        enabled: canGoNextProject || canEndRound,
        done: currentPhase === "finished",
        onClick: () => {
          if (hasNextProject) {
            const nextProject = projectOrder[currentProjectIndex + 1];
            const confirmed = window.confirm(
              nextProject
                ? `下一项目：${nextProject.targetName}（${currentProjectIndex + 2}/${totalProjectCount}），切换到待开始状态？`
                : "确认切换到下一项目？",
            );
            if (!confirmed) return;
            void nextReviewScreenProject(group);
            return;
          }

          if (window.confirm("确认结束本轮？所有未评分项目将标记为未完成，已有成绩将归档。")) {
            void changeReviewScreenPhase(group, "finished");
          }
        },
      },
    ];
    const renderNowBar = () => (
      <div className="review-now-bar sticky top-[72px] z-20 overflow-hidden border-b border-slate-950 bg-[linear-gradient(180deg,var(--stage-dark)_0%,var(--stage-dark-2)_100%)] text-white shadow-[0_4px_20px_rgba(11,18,32,.15)]">
        <div className="grid gap-4 px-5 py-4 xl:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] xl:items-center">
          <div className={`inline-flex w-fit items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-500/15 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-orange-300 ${reviewLifecycleStage === "running" ? "" : "opacity-50"}`}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
            LIVE 直播中
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
              当前项目 {Math.min(currentProjectIndex + 1, totalProjectCount)} / {totalProjectCount}
            </p>
            <p className="mt-1 truncate text-lg font-extrabold text-white">
              {currentProject?.targetName ?? liveData?.reviewPackage?.targetName ?? group.targetName}
            </p>
            <p className="mt-1 truncate text-[11px] text-white/55">
              {currentProject?.groupName ? `${currentProject.groupName} · ` : "第一组 · "}
              序号 {Math.min(currentProjectIndex + 1, totalProjectCount)} · {currentProject?.roundLabel || group.roundLabel}
            </p>
          </div>
          <div className="border-white/10 xl:border-l xl:border-r xl:px-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">当前阶段</p>
            <p className="mt-1 text-sm font-extrabold text-white">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
              {liveData?.phaseLabel ?? getConsolePhaseLabel(currentPhase)}
            </p>
          </div>
          <div className="text-left xl:text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">倒计时</p>
            <p className={`mt-1 font-mono text-[32px] font-extrabold leading-none tabular-nums ${isTimerUrgent ? "animate-pulse text-rose-400" : "text-[var(--accent)]"}`}>
              {formattedRemaining}
            </p>
            {isTimerExpired ? <p className="mt-1 text-[11px] font-bold text-orange-300">倒计时已到，可手动推进</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
              disabled={!screenSession || currentProjectIndex <= 0 || reviewScreenActionKey === `${group.key}:project:${projectOrder[currentProjectIndex - 1]?.packageId}`}
              onClick={() => {
                const previousProject = projectOrder[currentProjectIndex - 1];
                if (previousProject && window.confirm(`确认回到上一项目：${previousProject.targetName}？`)) {
                  void switchReviewScreenProject(group, previousProject.packageId);
                }
              }}
              title="上一项目"
              type="button"
            >
              ←
              <span className="sr-only">上一项目</span>
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-[var(--brand)] px-4 text-xs font-extrabold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
              disabled={!canGoNextProject}
              onClick={() => {
                if (
                  canForceNextWithoutLockedScore &&
                  !window.confirm("当前项目还有未提交专家或尚未计算最终得分，确认强制进入下一项目？未提交专家不会计入当前项目已锁定成绩。")
                ) {
                  return;
                }
                void nextReviewScreenProject(group);
              }}
              type="button"
            >
              下一项目
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 bg-black/20 px-5 py-3 xl:flex-row xl:items-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">流程控制</span>
          <div className="grid flex-1 gap-2 md:grid-cols-5">
            {workflowSteps.map((step) => {
              const active = currentPhase === step.phase && !step.done;
              return (
                <button
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-extrabold transition ${
                    step.done
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                      : active || step.enabled
                        ? "border-[var(--brand)] bg-blue-500/20 text-white shadow-[0_0_0_1px_var(--brand)_inset,0_4px_16px_rgba(30,94,255,.24)]"
                        : "border-white/10 bg-white/5 text-white/40"
                  } disabled:cursor-not-allowed disabled:opacity-35`}
                  disabled={!step.enabled || reviewScreenActionKey?.startsWith(`${group.key}:`)}
                  key={step.no}
                  onClick={step.onClick}
                  type="button"
                >
                  <span className="font-mono text-[10px]">{step.done ? "✓" : step.no}</span>
                  {step.label}
                </button>
              );
            })}
          </div>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/10 px-4 text-xs font-extrabold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!screenSession}
            onClick={() => screenSession && window.open(screenSession.screenUrl, "_blank", "noopener,noreferrer")}
            type="button"
          >
            📺 大屏
          </button>
        </div>
      </div>
    );
    const renderGlobalProgress = () => (
      <div className="review-global-progress grid gap-4 border-b border-[var(--line)] bg-white px-5 py-4 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] lg:items-center">
        <div>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--brand)]">全场进度</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">已完成</p>
          <p className="mt-1 font-mono text-lg font-extrabold text-slate-950">
            {completedProjectCount}<span className="mx-1 text-slate-300">/</span>{totalProjectCount} 项
          </p>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex justify-between text-[11px] text-slate-400">
            <span>开场 {screenSession?.startedAt ? formatDateTime(screenSession.startedAt) : "未开始"}</span>
            <span>预计结束 ~{estimatedRemainingHours.toFixed(1)} h 后</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--ok),var(--brand))]" style={{ width: `${progressPercent}%` }} />
            <span className="absolute top-[-3px] h-4 w-0.5 rounded bg-[var(--accent)]" style={{ left: `${Math.min(98, progressPercent)}%` }} />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">已用时</p>
          <p className="mt-1 font-mono text-sm font-extrabold text-emerald-600">实时</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">较计划</p>
          <p className={`mt-1 font-mono text-sm font-extrabold ${planDeltaMinutes > 0 ? "text-orange-500" : "text-emerald-600"}`}>
            {planDeltaMinutes > 0 ? `+${planDeltaMinutes}` : "0"} 分钟
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">剩余</p>
          <p className="mt-1 font-mono text-sm font-extrabold text-slate-700">~{estimatedRemainingHours.toFixed(1)} h</p>
        </div>
      </div>
    );
    const renderTrackView = () => (
      <div className="review-track-view sticky top-[224px] z-10 border-b border-[var(--line)] bg-white px-5 py-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-extrabold text-slate-950">路演轨道</p>
            <p className="mt-1 text-[11px] text-slate-400">横向显示全部项目，当前项目自动居中，适配 50 项以上场景。</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-white">全部 {totalProjectCount}</span>
            {progressGroups.map((scoreGroup) => (
              <span className="rounded-full bg-slate-100 px-3 py-1" key={scoreGroup.groupName}>
                {scoreGroup.groupName}({scoreGroup.projects.length})
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex min-w-max items-center gap-2">
            {progressGroups.map((scoreGroup) => (
              <div className="flex items-center gap-2" key={scoreGroup.groupName}>
                <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-3 text-[10px] font-extrabold text-slate-500 [writing-mode:vertical-rl]">
                  {scoreGroup.groupName}
                </span>
                {scoreGroup.projects.map((project) => {
                  const globalIndex = projectOrder.findIndex((item) => item.packageId === project.packageId);
                  const status = getProjectStatus(project, globalIndex);
                  return (
                    <button
                      className={`flex h-[54px] w-[50px] shrink-0 flex-col items-center justify-center rounded-lg border font-mono transition ${
                        status === "current"
                          ? "scale-110 border-[var(--brand)] bg-[var(--brand)] text-white shadow-[0_0_0_3px_var(--brand-soft),0_4px_12px_rgba(30,94,255,.28)]"
                          : status === "done"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : status === "next"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-white text-slate-500"
                      }`}
                      key={project.packageId}
                      title={project.targetName}
                      type="button"
                    >
                      <span className="text-xs font-extrabold">{globalIndex + 1}{status === "done" ? "✓" : ""}</span>
                      <span className="mt-1 font-sans text-[9px] font-bold">
                        {status === "current" ? getConsolePhaseLabel(currentPhase) : status === "done" ? project.result?.finalScore.finalScoreText ?? "完成" : status === "next" ? "下个" : "待评"}
                      </span>
                    </button>
                  );
                })}
                <span className="h-12 w-px shrink-0 bg-gradient-to-b from-transparent via-slate-200 to-transparent" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-slate-400">
          <span>■ 已完成</span>
          <span>■ 进行中</span>
          <span>■ 下一个</span>
          <span>□ 待评审</span>
        </div>
      </div>
    );
    const renderAdminScoreMonitor = () => (
      <div className="monitor-matrix overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-100 bg-[linear-gradient(90deg,#FFF8F1,#fff)] px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-extrabold text-slate-950">评分监看矩阵 · 项目 × 专家 · 实时状态</p>
            <p className="mt-1 text-xs text-slate-400">
              后台显示专家实名，大屏继续保持匿名；大屏隐藏分数时，后台仍可查看每组、每个项目和每位实名专家的实时分数。
            </p>
          </div>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-extrabold text-orange-700 ring-1 ring-orange-100">
            ⚠ 后台实名
          </span>
        </div>
        <div className="border-b border-orange-100 bg-orange-50 px-4 py-2 text-[11px] font-bold text-orange-700">
          ⚠ 此区域仅后台可见，包含专家真实姓名与具体分数。大屏显示按“投屏设置”控制。
        </div>
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-100">全部 {totalProjectCount}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-100">已完成 {completedProjectCount}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-100">进行中 {reviewLifecycleStage === "running" ? 1 : 0}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">待评 {Math.max(0, totalProjectCount - completedProjectCount)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
            <span>规则: 去 {packageDropHighestCount} 最高 · 去 {packageDropLowestCount} 最低 · 取均值</span>
            <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600 transition hover:bg-slate-50" type="button">
              ⬇ 导出
            </button>
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 min-w-[190px] border-b border-slate-200 bg-white px-4 py-3 text-left font-extrabold text-slate-500">
                  项目
                </th>
                {monitorSeats.map((seat) => {
                  const expertName = group.items[seat.seatNo - 1]?.expert.name ?? seat.displayName;
                  return (
                    <th className="sticky top-0 z-10 min-w-[76px] border-b border-slate-200 bg-white px-2 py-3 text-center font-extrabold text-slate-500" key={seat.seatNo}>
                      {expertName}
                    </th>
                  );
                })}
                <th className="sticky right-0 top-0 z-20 min-w-[76px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-center font-extrabold text-slate-500">
                  最终
                </th>
              </tr>
            </thead>
            <tbody>
              {projectOrder.map((project, index) => {
                const result = projectResultByPackageId.get(project.packageId);
                const projectGroup = groupedAssignments.find((item) => item.key === project.packageId);
                const isCurrent = project.packageId === currentProject?.packageId && !isScreenSessionFinished;
                return (
                  <tr className={isCurrent ? "bg-[var(--brand-soft)]" : "bg-white hover:bg-slate-50"} key={project.packageId}>
                    <td className={`sticky left-0 z-10 border-b border-slate-100 px-4 py-3 ${isCurrent ? "bg-[var(--brand-soft)]" : "bg-white"}`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-extrabold ${isCurrent ? "bg-[var(--brand)] text-white" : "bg-slate-100 text-slate-500"}`}>
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold text-slate-900">{project.targetName}</p>
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">{project.groupName || `第${project.groupIndex + 1}组`}</p>
                        </div>
                      </div>
                    </td>
                    {monitorSeats.map((seat) => {
                      const seatResult = result?.seats.find((item) => item.seatNo === seat.seatNo);
                      const seatExpertName = projectGroup?.items[seat.seatNo - 1]?.expert.name ?? group.items[seat.seatNo - 1]?.expert.name ?? seat.displayName;
                      const isDropped = Boolean(result?.finalScore.droppedSeatNos.includes(seat.seatNo)) || seatResult?.status === "voided";
                      const isSubmitted = seatResult?.status === "submitted";
                      const cellText =
                        seatResult?.status === "voided"
                          ? "排除"
                          : isSubmitted
                            ? seatResult.scoreText ?? "已交"
                            : isCurrent && currentPhase === "scoring"
                              ? "评分中"
                              : isCurrent && currentPhase === "qa"
                                ? "答辩中"
                                : "—";
                      return (
                        <td className="border-b border-slate-100 px-2 py-3 text-center font-mono" key={`${project.packageId}:${seat.seatNo}`} title={seatExpertName}>
                          <span
                            className={`inline-flex min-w-12 justify-center rounded-md px-2 py-1 font-extrabold ${
                              isDropped
                                ? "bg-rose-50 text-rose-600 line-through"
                                : isSubmitted
                                  ? "bg-emerald-50 text-emerald-700"
                                  : isCurrent && (currentPhase === "qa" || currentPhase === "scoring")
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-slate-50 text-slate-400"
                            }`}
                          >
                            {cellText}
                          </span>
                        </td>
                      );
                    })}
                    <td className={`sticky right-0 z-10 border-b border-slate-100 px-3 py-3 text-center font-mono text-sm font-extrabold ${isCurrent ? "bg-[var(--brand-soft)] text-blue-700" : "bg-slate-50 text-slate-500"}`}>
                      {result?.finalScore.finalScoreText ?? "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {projectOrder.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs font-bold text-slate-400">生成投屏链接后展示后台监看数据</p>
        ) : null}
      </div>
    );
    const canEditConfigFields = reviewLifecycleStage === "config";
    const displayOptions: Array<[keyof ReviewScreenDisplaySettings, string]> = [
      ["scoringEnabled", "启用专家评分环节"],
      ["showScoresOnScreen", "大屏显示专家具体分"],
      ["showFinalScoreOnScreen", "大屏显示最终得分"],
      ["showRankingOnScreen", "大屏显示本轮排名"],
      ["selfDrawEnabled", "开启项目自助抽签"],
    ];
    const renderConfigCard = () => {
      if (!canEditConfigFields) {
        return (
          <div className="review-config-card rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="config-collapsed flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-950">🔒 评审配置已锁定 · 投屏设置已锁定</p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  路演 {timingDraft.presentationMinutes}min · 答辩 {timingDraft.qaMinutes}min · 评分 {timingDraft.scoringSeconds}s ·
                  {screenDisplay.scoringEnabled ? " 含评分环节" : " 仅路演答辩"}
                  {screenDisplay.showScoresOnScreen ? " · 大屏显示分数" : " · 大屏隐藏分数"}
                  {screenDisplay.showRankingOnScreen ? " · 显示排名" : " · 隐藏排名"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                仅可查看
              </span>
            </div>
          </div>
        );
      }

      return (
        <div className="review-config-card rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-extrabold text-slate-950">评审配置</p>
              <p className="mt-1 text-xs text-slate-400">开始前统一设置顺序、时长和投屏显示；开始后自动锁定，避免现场误改。</p>
            </div>
            <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-[11px] font-bold text-[var(--brand)]">
              配置中
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["presentationMinutes", "路演时长", "分钟", timingDraft.presentationMinutes],
              ["qaMinutes", "答辩时长", "分钟", timingDraft.qaMinutes],
              ["scoringSeconds", "评分时长", "秒", timingDraft.scoringSeconds],
            ].map(([field, label, unit, value]) => (
              <label className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" key={field}>
                <span className="block text-[11px] font-bold text-slate-400">{label}</span>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <input
                    className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono text-base font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    inputMode="numeric"
                    onChange={(event) =>
                      updateScreenTimingDraft(group.key, field as "presentationMinutes" | "qaMinutes" | "scoringSeconds", event.target.value)
                    }
                    value={value}
                  />
                  <span className="text-[11px] font-semibold text-slate-400">{unit}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-600">去最高分</span>
                <span className="rounded-lg bg-white px-3 py-1 font-mono text-sm font-extrabold text-blue-700 ring-1 ring-blue-100">
                  {packageDropHighestCount}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-600">去最低分</span>
                <span className="rounded-lg bg-white px-3 py-1 font-mono text-sm font-extrabold text-blue-700 ring-1 ring-blue-100">
                  {packageDropLowestCount}
                </span>
              </div>
            </div>
            <label className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-600">路演分组容量</span>
                <input
                  className="h-8 w-24 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  inputMode="text"
                  onChange={(event) => updateScreenGroupDraft(group.key, event.target.value)}
                  placeholder={`${roadshowProjectCount}`}
                  value={groupDraft}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-400">如 3/3/4；留空为一组</p>
            </label>
          </div>

          <p
            className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
              scoreRuleIsInvalid
                ? "border-rose-100 bg-rose-50 text-rose-600"
                : "border-amber-100 bg-amber-50 text-amber-700"
            }`}
          >
            {scoreRuleIsInvalid
              ? `当前有效专家 ${effectiveExpertCount} 位，去掉后剩余 ${remainingScoreCount} 个有效评分。有效评分不足 2 个，请到评审包里减少去分数量。`
              : `评分规则（来自评审包）：当前有效专家 ${effectiveExpertCount} 位，去掉后剩余 ${remainingScoreCount} 个有效评分。`}
          </p>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-extrabold text-blue-950">投屏显示设置</p>
                <p className="mt-1 text-xs text-blue-700/70">后台管理员监看始终实名显示分数；这里仅控制现场大屏给观众看的内容。</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
                {screenDisplay.scoringEnabled ? "含评分环节" : "仅路演答辩"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {displayOptions.map(([key, label]) => {
                const disabled = key !== "scoringEnabled" && key !== "selfDrawEnabled" && !screenDisplay.scoringEnabled;
                return (
                  <label
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-bold ${
                      disabled ? "border-slate-100 bg-slate-50 text-slate-300" : "border-blue-100 bg-white text-slate-700"
                    }`}
                    key={key}
                  >
                    <span>{label}</span>
                    <input
                      checked={Boolean(screenDisplay[key])}
                      className="h-4 w-4 accent-blue-600"
                      disabled={disabled}
                      onChange={(event) => updateScreenDisplayDraft(group.key, key, event.target.checked)}
                      type="checkbox"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-extrabold text-slate-950">路演顺序</p>
                <p className="mt-1 text-xs text-slate-400">
                  {drawControlsVisible ? "自助抽签开启后，项目可在投屏页完成抽签；后台仍可手动序号兜底。" : "不需要抽签时，只保留手动序号和上下移动。"}
                  {!drawControlsVisible ? " 仅开启“项目自助抽签”时显示随机抽签入口。" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {drawControlsVisible ? (
                  <span className="inline-flex items-center justify-center rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                    自助抽签
                  </span>
                ) : null}
                {drawControlsVisible ? (
                  <button
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!screenSession || reviewScreenActionKey === `${group.key}:draw`}
                    onClick={() => void drawReviewScreenSession(group)}
                    type="button"
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                    随机抽签
                  </button>
                ) : null}
                <button
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!screenSession || reviewScreenActionKey === `${group.key}:order`}
                  onClick={() => saveManualReviewScreenOrder(group, projectOrder)}
                  type="button"
                >
                  按序号保存
                </button>
              </div>
            </div>
            {projectOrder.length ? (
              <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1">
                {projectOrder.map((project, index) => (
                  <div
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                      project.packageId === currentProject?.packageId ? "border-l-4 border-blue-600 bg-blue-50" : "border-slate-100 bg-white"
                    }`}
                    key={project.packageId}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-bold text-white">
                          {index + 1}
                        </span>
                        <p className="truncate text-xs font-bold text-slate-800">{project.targetName}</p>
                      </div>
                      <p className="mt-1 truncate pl-8 text-[11px] text-slate-400">
                        {project.groupName ? `${project.groupName} · ` : ""}{project.roundLabel || "项目路演"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-400">
                        手动序号
                        <input
                          className="h-6 w-10 rounded-md border border-slate-200 px-1 text-center font-mono text-xs font-bold text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-300"
                          disabled={!screenSession}
                          inputMode="numeric"
                          onChange={(event) => updateManualOrderDraft(group.key, project.packageId, event.target.value)}
                          value={manualOrderDrafts[group.key]?.[project.packageId] ?? String(index + 1)}
                        />
                      </label>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300"
                        disabled={!screenSession || index === 0 || reviewScreenActionKey === `${group.key}:order`}
                        onClick={() => moveReviewScreenProject(group, index, -1)}
                        title="上移"
                        type="button"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300"
                        disabled={!screenSession || index === projectOrder.length - 1 || reviewScreenActionKey === `${group.key}:order`}
                        onClick={() => moveReviewScreenProject(group, index, 1)}
                        title="下移"
                        type="button"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center">
            <span className="shrink-0 text-xs font-bold text-slate-500">投屏链接</span>
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-500 outline-none"
              readOnly
              value={screenSession?.screenUrl ?? "请先生成投屏链接"}
            />
            <button
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={reviewScreenActionKey === group.key}
              onClick={() => (screenSession ? void saveReviewScreenTiming(group.key, screenSession) : void createReviewScreenSession(group))}
              type="button"
            >
              {screenSession ? "保存配置" : "生成并复制链接"}
            </button>
          </div>
          {screenSession?.message ? (
            <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{screenSession.message}</p>
          ) : null}
        </div>
      );
    };

    const renderDangerZone = () => (
      <div className="review-danger-zone danger-card rounded-xl border border-rose-100 bg-rose-50/55 p-4">
        <p className="text-sm font-extrabold text-rose-950">收尾操作</p>
        <div className="danger-row mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-extrabold text-rose-900">正常结束本轮</p>
            <p className="mt-1 text-xs leading-5 text-rose-700/75">只关闭当前投屏流程，不会删除评审包、专家分配和已提交成绩。</p>
          </div>
          <button
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canForceFinishRound || reviewScreenActionKey === `${group.key}:phase:finished`}
            onClick={() => {
              if (
                window.confirm(
                  "确认结束本轮所有评审？投屏将进入本轮结束状态，未完成项目和未提交专家不会再进入本轮投屏；后台会保留已有成绩与过程记录。",
                )
              ) {
                void changeReviewScreenPhase(group, "finished", { force: true });
              }
            }}
            type="button"
          >
            正常结束本轮评审
          </button>
        </div>
        <div className="danger-row mt-4 border-t border-rose-100 pt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-extrabold text-rose-900">取消本阶段评审配置</p>
              <p className="mt-1 text-xs leading-5 text-rose-700/70">删除配置会移除当前评审包配置，不等于正常结束现场评审；该操作不可恢复。</p>
            </div>
            <button
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-50"
              onClick={() => {
                if (window.confirm(`确认删除配置“${group.targetName}”？该操作不能恢复。`)) {
                  void deleteReviewAssignment(group.items[0].id, group.targetName, {
                    permanent: groupHasLockedScore,
                  });
                }
              }}
              type="button"
            >
              删除配置
            </button>
          </div>
        </div>
      </div>
    );

    const renderReviewSidebar = () => (
      <aside className="side sticky top-[238px] self-start space-y-4">
        <article className="pkg-info rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-slate-950">{group.roundLabel}</p>
              <p className="mt-1 text-[11px] text-slate-400">{group.targetName}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              reviewLifecycleStage === "finished"
                ? "bg-emerald-50 text-emerald-700"
                : reviewLifecycleStage === "running"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-slate-100 text-slate-500"
            }`}>
              {reviewLifecycleStage === "finished" ? "已结束" : reviewLifecycleStage === "running" ? "进行中" : "配置中"}
            </span>
          </div>
          <div className="overview-grid mt-4 grid grid-cols-2 gap-2">
            {[
              ["项目总数", totalProjectCount],
              ["已完成", completedProjectCount],
              ["进行中", reviewLifecycleStage === "running" ? 1 : 0],
              ["待评审", Math.max(0, totalProjectCount - completedProjectCount)],
            ].map(([label, value]) => (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-center" key={label}>
                <p className="font-mono text-xl font-extrabold text-slate-950">{value}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-slate-950">分组进度</p>
              <p className="mt-1 text-[11px] text-slate-400">{progressGroups.length} 组 · 串行</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {progressGroups.map((scoreGroup) => {
              const completedCount = scoreGroup.projects.filter((project) => Boolean(project.result?.finalScore.scoreLockedAt || project.revealedAt)).length;
              const totalCount = scoreGroup.projects.length || 1;
              const groupProgressPercent = Math.round((completedCount / totalCount) * 100);
              const hasCurrent = scoreGroup.projects.some((project) => project.packageId === currentProject?.packageId && !isScreenSessionFinished);
              return (
                <div className="lane rounded-lg border border-slate-100 bg-slate-50 px-3 py-3" key={scoreGroup.groupName}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-extrabold text-slate-800">{scoreGroup.groupName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      completedCount === totalCount
                        ? "bg-emerald-50 text-emerald-700"
                        : hasCurrent
                          ? "bg-blue-50 text-blue-700"
                          : "bg-white text-slate-400"
                    }`}>
                      {completedCount === totalCount ? "已完成" : hasCurrent ? "进行中" : "待开始"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
                      <div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${groupProgressPercent}%` }} />
                    </div>
                    <span className="font-mono text-[11px] font-bold text-slate-500">{completedCount}/{totalCount}</span>
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-400">
              ＋ 未来支持多组并行评审
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold text-slate-950">专家席位</h3>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">固定席位 {monitorSeats.length}</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">后台实名查看；异常排除仅用于专家离场、设备故障等情况。</p>
          <div className="mt-4 space-y-2">
            {monitorSeats.map((seat) => {
              const assignment = group.items[seat.seatNo - 1];
              const expertName = assignment?.expert.name ?? seat.displayName;
              const isSubmitted = seat.status === "submitted";
              const isVoided = seat.status === "voided";
              const scoreText = seat.scoreText ?? (assignment ? getLiveAssignmentScoreText(assignment) : "--");
              return (
                <div
                  className={`expert-row flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    isSubmitted
                      ? "border-emerald-100 bg-emerald-50"
                      : isVoided
                        ? "border-slate-200 bg-slate-50 opacity-70"
                        : "border-slate-200 bg-white"
                  }`}
                  key={seat.id || seat.seatNo}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-extrabold ${
                    isSubmitted
                      ? "bg-emerald-100 text-emerald-700"
                      : isVoided
                        ? "bg-slate-200 text-slate-400"
                        : "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                  }`}>
                    {seat.seatNo}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-bold ${isVoided ? "text-slate-400 line-through" : "text-slate-900"}`}>{expertName}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">席位 {seat.seatNo} · {scoreText === "--" ? "待评分" : scoreText}</p>
                  </div>
                  {!isSubmitted ? (
                    <button
                      className={`shrink-0 rounded-lg border bg-white px-2 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 ${
                        isVoided ? "border-blue-100 text-blue-700 hover:bg-blue-50" : "border-rose-100 text-rose-600 hover:bg-rose-50"
                      }`}
                      disabled={!screenSession || reviewScreenActionKey === `${group.key}:${seat.id}`}
                      onClick={() => (isVoided ? void restoreReviewScreenSeat(group, seat.id) : void voidReviewScreenSeat(group, seat.id))}
                      type="button"
                    >
                      {isVoided ? "恢复" : "排除"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold text-slate-950">大屏投屏</h3>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${screenSession ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {screenSession ? "已连接" : "未生成"}
            </span>
          </div>
          <input
            className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500 outline-none"
            readOnly
            value={screenSession?.screenUrl ?? "请先生成投屏链接"}
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2 py-2 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={reviewScreenActionKey === group.key}
              onClick={() => (screenSession ? void copyReviewScreenUrl(group.key, screenSession.screenUrl) : void createReviewScreenSession(group))}
              type="button"
            >
              <Copy className="h-3.5 w-3.5" />
              {copiedScreenGroupKey === group.key ? "已复制" : "复制"}
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={reviewScreenActionKey === group.key}
              onClick={() => void createReviewScreenSession(group)}
              type="button"
            >
              重生成
            </button>
            <button
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!screenSession}
              onClick={() => screenSession && window.open(screenSession.screenUrl, "_blank", "noopener,noreferrer")}
              type="button"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开
            </button>
          </div>
        </article>
      </aside>
    );

    return (
      <article
        className="live-section review-large-scene overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg)]"
        style={reviewConsoleTheme}
      >
        {renderStageStrip()}
        {screenSession ? renderNowBar() : null}
        {isScreenSessionFinished ? (
          <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <h3 className="truncate text-sm font-extrabold text-emerald-800">本轮评审已结束</h3>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
              已关闭现场控制
            </span>
          </div>
        ) : null}
        {renderGlobalProgress()}
        {renderTrackView()}
        <div className="review-content-grid content grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            {warningMessages.length ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
                {warningMessages.join(" ")}
              </div>
            ) : null}
            {renderAdminScoreMonitor()}
            {renderConfigCard()}
            {renderDangerZone()}
          </div>
          {renderReviewSidebar()}
        </div>
      </article>
    );
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
            <section className="expert-mobile-shell border-t border-slate-100 px-4 py-6 sm:px-6 sm:py-9 md:px-8 md:py-11">
              <div className="mx-auto max-w-5xl">
                <div className="text-left sm:text-center">
                  <p className="text-sm font-semibold text-blue-600">您好，{currentUser?.name || "评审专家"}</p>
                  <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">请选择本轮评审任务</h1>
                  <p className="mt-3 text-sm text-slate-500">
                    系统仅展示管理员已分配给您的评审任务，提交后评分将锁定。
                  </p>
                </div>
                {activeRoadshowAssignment ? (
                  <div className="live-roadshow-status-card mt-6 overflow-hidden rounded-[24px] border border-blue-100 bg-[linear-gradient(135deg,#eff6ff,#ffffff_50%,#ecfdf5)] p-4 text-left shadow-[0_18px_50px_rgba(37,99,235,0.10)] sm:mt-8 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-bold tracking-[0.18em] text-blue-500">实时同步中</p>
                        <h2 className="mt-2 truncate text-lg font-bold text-slate-950 sm:text-xl">
                          {activeRoadshowAssignment.targetName}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          本轮共 {roadshowAssignments.length} 个项目 · {activeRoadshowAssignment.roundLabel}
                        </p>
                      </div>
                      <span className="roadshow-phase-pill inline-flex w-fit items-center rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-blue-700">
                        {activeRoadshowAssignment.roadshowScreenPhaseLabel ?? "等待开始"}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-slate-500">
                        进入评分阶段后，本页会自动切换到打分界面，提交前系统会再次弹窗确认。
                      </p>
                      <button
                        className="inline-flex w-full touch-manipulation items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-blue-700 sm:w-auto"
                        onClick={startRoadshowReview}
                        type="button"
                      >
                        {activeRoadshowAssignment.canEdit ? "进入评分" : "查看现场状态"}
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-7 grid gap-3 sm:mt-10 md:grid-cols-2 md:gap-5">
                  <button
                    className="expert-task-card group relative overflow-hidden rounded-[20px] border border-blue-100 bg-white px-5 py-5 text-left transition active:scale-[0.99] hover:border-blue-200 hover:bg-blue-50/45 sm:rounded-[22px] sm:px-8 sm:py-8 touch-manipulation"
                    onClick={() => setExpertMode("network-list")}
                    type="button"
                  >
                    <div aria-hidden className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-50 transition group-hover:scale-105" />
                    <div className="relative">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white sm:h-16 sm:w-16 sm:rounded-3xl">
                        <Monitor className="h-6 w-6 sm:h-8 sm:w-8" />
                      </div>
                      <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-950 sm:mt-7 sm:text-2xl">项目网络评审</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-500">审阅计划书、PPT、PDF 和视频材料，完成在线评分。</p>
                      <div className="mt-5 flex items-center gap-2 sm:mt-7 sm:gap-3">
                        <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">待评 {pendingNetworkCount}</span>
                        <span className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-blue-700">已评 {finishedNetworkCount}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    className="expert-task-card group relative overflow-hidden rounded-[20px] border border-emerald-100 bg-white px-5 py-5 text-left transition active:scale-[0.99] hover:border-emerald-200 hover:bg-emerald-50/45 sm:rounded-[22px] sm:px-8 sm:py-8 touch-manipulation"
                    onClick={startRoadshowReview}
                    type="button"
                  >
                    <div aria-hidden className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-50 transition group-hover:scale-105" />
                    <div className="relative">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white sm:h-16 sm:w-16 sm:rounded-3xl">
                        <Users className="h-6 w-6 sm:h-8 sm:w-8" />
                      </div>
                      <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-950 sm:mt-7 sm:text-2xl">项目路演评审</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-500">根据现场展示和答辩表现，提交最终路演分数。</p>
                      <p className="mt-2 text-xs font-semibold text-emerald-700">本轮共 {roadshowAssignments.length} 个项目</p>
                      <div className="mt-5 flex items-center gap-2 sm:mt-7 sm:gap-3">
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
          <section className="expert-mobile-shell px-4 py-5 sm:px-0 sm:py-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-950">项目网络评审</h3>
                <p className="mt-1 text-sm text-slate-500">请逐项查看材料并提交 0.00-100.00 分评分。</p>
              </div>
              <button className="w-fit touch-manipulation text-sm font-semibold text-blue-600 hover:text-blue-700" onClick={() => setExpertMode("home")} type="button">
                返回任务选择
              </button>
            </div>
            <div className="grid gap-4">
              {networkAssignments.map((assignment) => (
                <button
                  className="touch-manipulation flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition active:scale-[0.99] hover:border-blue-200 hover:bg-blue-50/35 sm:p-5"
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
          <section className="expert-mobile-shell px-4 py-5 sm:px-0 sm:py-6">
            <button className="mb-5 touch-manipulation text-sm font-semibold text-blue-600" onClick={() => setExpertMode("network-list")} type="button">
              ← 返回网络评审列表
            </button>
            <div className="detail-layout grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-5">
              <div className="space-y-5">
                <article className="rounded-[22px] border border-slate-200 bg-white p-4 sm:rounded-3xl sm:p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl font-bold text-slate-950 sm:text-2xl">{selectedAssignment.targetName}</h3>
                    <StatusBadge statusKey={selectedAssignment.statusKey} />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">{selectedAssignment.roundLabel}</p>
                  <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                    {selectedAssignment.overview || "暂无项目概述，请结合计划书、路演材料和视频进行评审。"}
                  </p>
                </article>
                <article className="rounded-[22px] border border-slate-200 bg-white p-4 sm:rounded-3xl sm:p-6">
                  <h4 className="text-base font-bold text-slate-950">项目管理已生效材料</h4>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {materialEntries(selectedAssignment).map(([kind, label, material]) => (
                      <button
                        className="material-item touch-manipulation rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition active:scale-[0.99] hover:border-blue-200 hover:bg-blue-50"
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
              <aside className="expert-mobile-score-panel rounded-[24px] border border-blue-100 bg-blue-50/40 p-4 sm:rounded-3xl sm:p-6 xl:sticky xl:top-6">
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
                    className="score-range mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
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
                <div className="expert-score-submit-bar sticky bottom-0 -mx-4 mt-6 border-t border-blue-100 bg-blue-50/95 px-4 py-3 backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
                  <button
                    className="w-full touch-manipulation rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:py-3"
                    disabled={
                      Boolean(selectedAssignment.score) ||
                      !selectedAssignment.canEdit ||
                      submittingAssignmentId === selectedAssignment.id
                    }
                    onClick={() => prepareNetworkSubmission(selectedAssignment)}
                    type="button"
                  >
                    {selectedAssignment.score
                      ? "已提交，不能修改"
                      : submittingAssignmentId === selectedAssignment.id
                        ? "提交中..."
                        : "确认提交评分"}
                  </button>
                </div>
              </aside>
            </div>
          </section>
        ) : null}

        {expertMode === "roadshow-wait" ? (
          <section className="expert-mobile-shell mx-auto max-w-2xl px-4 py-14 text-center sm:px-0 sm:py-16">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
              <Clock3 className="h-8 w-8" />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-slate-950">等待评审开始</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">管理员开始路演节奏并指派项目后，这里会自动出现评分入口。</p>
            {activeRoadshowAssignment ? (
              <div className="live-roadshow-status-card mt-6 rounded-3xl border border-blue-100 bg-white p-5 text-left shadow-[0_14px_40px_rgba(37,99,235,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-slate-400">当前大屏项目</p>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">实时同步中</span>
                </div>
                <h4 className="mt-2 text-lg font-bold text-slate-950">{activeRoadshowAssignment.targetName}</h4>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="roadshow-phase-pill rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    {activeRoadshowAssignment.roadshowScreenPhaseLabel ?? "等待开始"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
                    本轮共 {roadshowAssignments.length} 个项目
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  进入评分阶段后，本页会自动切换到打分界面，无需手动刷新。
                </p>
              </div>
            ) : null}
            <button className="mt-8 touch-manipulation rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 active:scale-[0.98] sm:py-2.5" onClick={() => setExpertMode("home")} type="button">
              返回入口
            </button>
          </section>
        ) : null}

        {expertMode === "roadshow-score" && activeRoadshowAssignment ? (
          <section className="expert-mobile-shell mx-auto max-w-3xl px-4 py-6 sm:px-0 sm:py-10">
            <div className="expert-mobile-score-panel rounded-[24px] border border-indigo-100 bg-indigo-50/45 p-4 sm:rounded-[32px] sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                <div>
                  <p className="text-sm font-semibold text-indigo-600">项目路演评审</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950 sm:text-2xl">{activeRoadshowAssignment.targetName}</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="roadshow-phase-pill rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">
                      {activeRoadshowAssignment.roadshowScreenPhaseLabel ?? "评分进行中"}
                    </span>
                    <span className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-bold text-indigo-600">实时同步中</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
                      本轮共 {roadshowAssignments.length} 个项目
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">{activeRoadshowAssignment.overview || "请根据现场展示和答辩情况给出最终评分。"}</p>
                </div>
                <button className="w-fit touch-manipulation text-sm font-semibold text-slate-500 hover:text-indigo-600" onClick={() => setExpertMode("home")} type="button">
                  返回入口
                </button>
              </div>
              <div className="roadshow-score-input-shell mt-6 rounded-[22px] bg-white p-4 sm:mt-8 sm:rounded-3xl sm:p-6">
                <label className="block text-sm font-semibold text-slate-700">
                  路演评分（精确到两位小数）
                  <input
                    className="mt-3 w-full rounded-3xl border border-slate-200 px-5 py-4 text-center text-4xl font-bold tracking-tight text-slate-950 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:text-5xl"
                    disabled={
                      Boolean(activeRoadshowAssignment.score) ||
                      !activeRoadshowAssignment.canEdit ||
                      submittingAssignmentId === activeRoadshowAssignment.id
                    }
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
                    className="score-range mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600"
                    disabled={
                      Boolean(activeRoadshowAssignment.score) ||
                      !activeRoadshowAssignment.canEdit ||
                      submittingAssignmentId === activeRoadshowAssignment.id
                    }
                    max={100}
                    min={0}
                    onChange={(event) => setRoadshowScoreDraft(Number(event.target.value).toFixed(2))}
                    step="0.01"
                    type="range"
                    value={Number(roadshowScoreDraft || 0)}
                  />
                </label>
                <p className="mt-4 text-sm text-slate-500">
                  若输入整数，如 85，系统会按 85.00 分提交；提交前请确认是否需要保留两位小数，系统会再次弹窗确认。
                </p>
                <div className="expert-score-submit-bar sticky bottom-0 -mx-4 mt-6 border-t border-indigo-100 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
                  <button
                    className="w-full touch-manipulation rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:py-3"
                    disabled={
                      Boolean(activeRoadshowAssignment.score) ||
                      !activeRoadshowAssignment.canEdit ||
                      submittingAssignmentId === activeRoadshowAssignment.id
                    }
                    onClick={prepareRoadshowSubmission}
                    type="button"
                  >
                    {activeRoadshowAssignment.score
                      ? "已提交，不能修改"
                      : submittingAssignmentId === activeRoadshowAssignment.id
                        ? "提交中..."
                        : "确认提交路演分数"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {expertMode === "roadshow-done" ? (
          <section className="expert-mobile-shell mx-auto max-w-2xl px-4 py-14 text-center sm:px-0 sm:py-16">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-slate-950">路演评分已提交</h3>
            <p className="mt-3 text-sm text-slate-500">当前路演评分已提交，感谢完成本轮评审。</p>
            <button className="mt-8 touch-manipulation rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 active:scale-[0.98] sm:py-2.5" onClick={() => setExpertMode("home")} type="button">
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

  const activeStageGroups = activeGroup
    ? groupedAssignments.filter((group) =>
        activeGroup.projectReviewStageId
          ? group.projectReviewStageId === activeGroup.projectReviewStageId
          : group.key === activeGroup.key,
      )
    : [];
  const activeScreenSession = activeGroup ? reviewScreenSessions[activeGroup.key] : undefined;
  const activeSidebarSeats = activeGroup
    ? activeScreenSession?.seats.length
      ? mergeConsoleSeats(activeScreenSession.seats, activeGroupLiveData?.seats ?? [])
      : activeGroup.items.map((assignment, index) => ({
          id: assignment.id,
          seatNo: index + 1,
          displayName: `专家 ${index + 1}`,
          status: assignment.score ? "submitted" as const : "pending" as const,
          voidedAt: null,
          scoreText: assignment.score ? formatScoreForAssignment(assignment) : null,
        }))
    : [];
  const activeExpertSeatCount = activeSidebarSeats.length || activeGroup?.items.length || 0;
  const activeSubmittedSeatCount = activeSidebarSeats.filter((seat) => seat.status === "submitted").length;
  const activePendingSeatCount = activeSidebarSeats.filter((seat) => seat.status === "pending").length;
  const activeDropHighestCount = activeCurrentProjectGroup?.items[0]?.dropHighestCount ?? 1;
  const activeDropLowestCount = activeCurrentProjectGroup?.items[0]?.dropLowestCount ?? 1;
  const activeProjectListSource = activeGroupLiveData?.projectOrder?.length
    ? activeGroupLiveData.projectOrder
    : activeStageGroups.map<ReviewScreenProjectOrderItem>((group, index) => ({
        orderIndex: index,
        packageId: group.key,
        targetName: group.targetName,
        roundLabel: group.roundLabel,
        groupName: null,
        groupIndex: 0,
        groupSlotIndex: index,
        selfDrawnAt: null,
        revealedAt: null,
      }));
  const activeProjectList = activeProjectListSource.map((project, index) => {
    const group = groupedAssignments.find((item) => item.key === project.packageId);
    const liveResult = activeGroupLiveData?.projectResults.find(
      (result) => result.reviewPackage.id === project.packageId,
    );
    const averageScore = group ? getAverageScore(group) : null;
    const scoreText = liveResult?.finalScore.finalScoreText ?? (averageScore == null ? null : averageScore.toFixed(2));
    const isCurrent = activeGroupLiveData?.currentPackageId
      ? project.packageId === activeGroupLiveData.currentPackageId
      : project.packageId === activeGroup?.key;

    return {
      ...project,
      index,
      isCurrent,
      scoreText,
      isCompleted: Boolean(liveResult?.finalScore.ready || project.revealedAt || scoreText),
      pendingCount: group?.items.filter((assignment) => assignment.statusKey === "pending").length ?? 0,
      expertCount: group?.items.length ?? 0,
    };
  });
  const activeGroupIsRoadshow = Boolean(activeGroup && isRoadshowAssignment(activeGroup.items[0]));

  return (
    <div className="review-admin-control-shell mx-auto max-w-[1200px] space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-[22px] font-extrabold text-slate-950">专家评审</h2>
          <p className="mt-1 text-sm text-slate-500">
            {activeGroup
              ? `${activeGroup.roundLabel} · ${isRoadshowAssignment(activeGroup.items[0]) ? "项目路演" : "网络评审"} · 评审管理与投屏控制`
              : "评审管理与投屏控制"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
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
      </section>

      {canCreateReviewPackage && projectStages.length > 0 && groupedAssignments.length === 0 ? (
        <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-600">项目管理阶段</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">可分配评审阶段</h3>
              <p className="mt-2 text-sm text-slate-500">项目管理创建网络评审或项目路演后，可在这里分配专家。</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {projectStages.length} 个阶段
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projectStages.map((stage) => {
              const configuredAssignments = assignmentsByStageId.get(stage.id) ?? [];
              const reviewConfigStatus =
                configuredAssignments.length > 0
                  ? "configured"
                  : stage.reviewConfig?.status ?? "unconfigured";
              const reviewConfigStatusLabel =
                reviewConfigStatus === "configured"
                  ? "已配置"
                  : reviewConfigStatus === "archived"
                    ? "已归档"
                    : "未配置";
              const firstConfiguredGroup = configuredAssignments[0]?.packageId ?? null;
              return (
                <button
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
                  key={stage.id}
                  onClick={() => {
                    if (firstConfiguredGroup) {
                      setActiveGroupKey(firstConfiguredGroup);
                      return;
                    }
                    openReviewAssignmentModal(undefined, stage.id);
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-slate-950">{stage.name}</p>
                      <p className="mt-2 text-sm text-slate-500">{stage.type === "roadshow" ? "项目路演" : "网络评审"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      stage.type === "roadshow" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                    }`}>
                      {stage.type === "roadshow" ? "路演" : "网评"}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">
                    上传窗口：{stage.startAt ? formatDateTime(stage.startAt) : "未设置"} - {stage.deadline ? formatDateTime(stage.deadline) : "未设置"}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                      {reviewConfigStatusLabel}
                    </span>
                    <span className="text-sm font-semibold text-blue-600">
                      {reviewConfigStatus === "configured" ? "查看已配置评审 →" : "分配专家并设置评审时间 →"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {groupedAssignments.length === 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-8">
          <EmptyState description="从项目管理选择已生效材料并分配专家后，专家评分数据会显示在这里。" icon={FileCheck} title="暂无评审任务" />
        </section>
      ) : activeGroupIsRoadshow && activeGroup ? (
        <main className="space-y-5">
          {renderReviewScreenConsole(activeGroup)}
        </main>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-5">
            {activeGroup ? (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 text-white">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-extrabold text-slate-950">{activeGroup.roundLabel}</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">项目路演 · 已配置</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">路演</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                  <span>上传窗口：<strong className="font-bold text-slate-800">{activeGroup.startAt ? formatDateTime(activeGroup.startAt) : "未设置"} - {activeGroup.deadline ? formatDateTime(activeGroup.deadline) : "未设置"}</strong></span>
                  <span>专家席位：<strong className="font-bold text-slate-800">{activeExpertSeatCount} 位</strong></span>
                  <span>项目数：<strong className="font-bold text-slate-800">{activeStageGroups.length || 1} 个</strong></span>
                </div>
              </article>
            ) : null}

            {activeGroup ? renderReviewScreenConsole(activeGroup) : null}
          </main>

          <aside className="space-y-4">
            <article className="review-sidebar-summary rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-950">评审概览</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-blue-50 px-4 py-3 text-center">
                  <p className="font-mono text-2xl font-extrabold text-blue-700">{activeStageGroups.length || groupedAssignments.length}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">项目总数</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center">
                  <p className="font-mono text-2xl font-extrabold text-emerald-700">{activeExpertSeatCount}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">专家席位</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-center">
                  <p className="font-mono text-2xl font-extrabold text-amber-600">{activePendingSeatCount || pendingReviewCount}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">待评审</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center">
                  <p className="font-mono text-2xl font-extrabold text-emerald-700">{activeSubmittedSeatCount || finishedReviewCount}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">已提交</p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
              <p className="text-xs font-bold text-slate-400">后台锁定成绩</p>
              <p className={`mt-3 font-mono text-5xl font-extrabold ${activeGroupFinalScoreText === "--" ? "text-slate-300" : "text-rose-600"}`}>
                {activeGroupFinalScoreText}
              </p>
              <p className="mt-2 text-[11px] font-medium text-slate-400">
                去 {activeDropHighestCount} 最高 · 去 {activeDropLowestCount} 最低 · 取平均
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-slate-950">专家席位</h3>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">固定专家席位 {activeExpertSeatCount}</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">异常排除仅用于专家离场、设备故障等情况。</p>
              <div className="mt-4 space-y-2">
                {activeGroup && activeSidebarSeats.map((seat) => {
                  const assignment = activeGroup.items[seat.seatNo - 1];
                  const expertName = assignment?.expert.name ?? seat.displayName;
                  const scoreText = seat.scoreText ?? (assignment ? getLiveAssignmentScoreText(assignment) : "--");
                  const isSubmitted = seat.status === "submitted";
                  const isVoided = seat.status === "voided";
                  return (
                    <div
                      className={`expert-seat-row flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                        isSubmitted
                          ? "border-emerald-100 bg-emerald-50"
                          : isVoided
                            ? "border-slate-200 bg-slate-50 opacity-70"
                            : "border-slate-200 bg-white"
                      }`}
                      key={seat.id || seat.seatNo}
                    >
                      <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-extrabold ${
                        isSubmitted
                          ? "bg-emerald-100 text-emerald-700"
                          : isVoided
                            ? "bg-slate-200 text-slate-400"
                            : "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                      }`}>
                        {seat.seatNo}
                        {isSubmitted ? (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white ring-2 ring-emerald-50">✓</span>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-bold ${isVoided ? "text-slate-400 line-through" : "text-slate-900"}`}>{expertName}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">专家 {seat.seatNo}</p>
                      </div>
                      <p className={`w-14 text-right font-mono text-sm font-extrabold ${isSubmitted ? "text-emerald-700" : "text-slate-400"}`}>
                        {scoreText === "--" ? "—" : scoreText}
                      </p>
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${
                        isSubmitted
                          ? "bg-emerald-100 text-emerald-700"
                          : isVoided
                            ? "bg-slate-100 text-slate-400 line-through"
                            : "bg-slate-100 text-slate-500"
                      }`}>
                        {isSubmitted ? "已提交" : isVoided ? "已排除" : "待评审"}
                      </span>
                      {!isSubmitted ? (
                        <button
                          className={`shrink-0 rounded-lg border bg-white px-2 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 ${
                            isVoided
                              ? "border-blue-100 text-blue-700 hover:bg-blue-50"
                              : "border-rose-100 text-rose-600 hover:bg-rose-50"
                          }`}
                          disabled={!activeScreenSession || reviewScreenActionKey === `${activeGroup.key}:${seat.id}`}
                          onClick={() =>
                            isVoided
                              ? void restoreReviewScreenSeat(activeGroup, seat.id)
                              : void voidReviewScreenSeat(activeGroup, seat.id)
                          }
                          type="button"
                        >
                          {isVoided ? "恢复" : "排除"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-950">项目列表</h3>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                项目列表仅用于后台核对顺序与成绩；现场推进统一使用控制台的“下一项目”和阶段按钮。
              </p>
              <div className="mt-4 space-y-2">
                {activeProjectList.map((project) => (
                  <div
                    aria-current={project.isCurrent ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                      project.isCurrent
                        ? "border-blue-300 bg-blue-50 shadow-[0_0_0_2px_rgba(59,130,246,0.08)]"
                        : project.isCompleted
                          ? "border-emerald-100 bg-white"
                          : "border-slate-200 bg-white"
                    }`}
                    key={project.packageId}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-extrabold ${
                      project.isCurrent
                        ? "bg-blue-600 text-white"
                        : project.isCompleted
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-400"
                    }`}>
                      {project.index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-950">{project.targetName}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {project.isCompleted ? "已出分" : `待评分 ${project.pendingCount} / 专家 ${project.expertCount}`}
                      </p>
                    </div>
                    <span className={`font-mono text-sm font-bold ${project.scoreText ? "text-emerald-700" : "text-slate-400"}`}>
                      {project.scoreText ?? "--"}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            {canManageReviewMaterials && activeGroup ? (
              <div className="space-y-3">
                <button
                  className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                  onClick={() => openReviewAssignmentModal(activeGroup.items)}
                  type="button"
                >
                  编辑当前评审包
                </button>
                <button
                  className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  onClick={() =>
                    deleteReviewAssignment(activeGroup.items[0].id, activeGroup.targetName, {
                      permanent: activeGroupHasLockedScore,
                    })
                  }
                  type="button"
                >
                  {activeGroupHasLockedScore ? "重置并重新配置评审包" : "取消本阶段评审配置"}
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
