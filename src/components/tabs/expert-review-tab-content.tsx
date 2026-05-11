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
  Download,
  ExternalLink,
  Monitor,
  Plus,
  RefreshCw,
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

type ScreenDrawMode = "manual" | "random" | "self";

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

type PendingRevealConfirmation = {
  groupKey: string;
  targetName: string;
  roundLabel: string;
  showFinalScoreOnScreen: boolean;
  finalScoreText: string;
  pendingSeatNos: number[];
} | null;

type ReviewScreenSessionState = {
  sessionId: string;
  screenUrl: string;
  message: string;
  startedAt: string | null;
  phaseStartedAt?: string | null;
  screenDisplay?: ReviewScreenDisplaySettings;
  seats: Array<{
    id: string;
    seatNo: number;
    displayName: string;
    status: "pending" | "submitted" | "timeout" | "closed_by_admin" | "excluded" | "voided";
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
  droppedSeatReasons?: Array<{ seatNo: number; reason: "highest" | "lowest" | "excluded" | "voided" | string }>;
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

type ResetHistoryItem = {
  id: string;
  packageId: string;
  assignmentId: string;
  reviewerId: string | null;
  resetById: string;
  resetReason: string;
  createdAt: string;
  expertName: string;
  totalScoreText: string;
  submittedAt: string | null;
  lockedAt: string | null;
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

const isExcludedSeatStatus = (status?: string | null) => status === "excluded" || status === "voided";

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

const getManualOrderedProjects = (
  projectOrder: ReviewScreenProjectOrderItem[],
  drafts?: Record<string, string>,
) =>
  projectOrder
    .map((item, index) => {
      const manualOrder = Number(drafts?.[item.packageId] || index + 1);
      return {
        item,
        originalIndex: index,
        manualOrder: Number.isFinite(manualOrder) && manualOrder > 0 ? manualOrder : index + 1,
      };
    })
    .sort((left, right) => left.manualOrder - right.manualOrder || left.originalIndex - right.originalIndex)
    .map((entry, index) => ({ ...entry.item, orderIndex: index }));

const buildSequentialManualOrderDrafts = (projectOrder: ReviewScreenProjectOrderItem[]) =>
  projectOrder.reduce<Record<string, string>>((drafts, item, index) => {
    drafts[item.packageId] = String(index + 1);
    return drafts;
  }, {});

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
    timeout: "bg-orange-50 text-orange-700 border-orange-100",
    closed_by_admin: "bg-slate-100 text-slate-500 border-slate-200",
    excluded: "bg-rose-50 text-rose-700 border-rose-100",
  }[statusKey];
  const label = {
    pending: "待评审",
    completed: "已提交",
    locked: "已锁定",
    timeout: "超时未提交",
    closed_by_admin: "已关闭，无需提交",
    excluded: "已排除",
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

function ReviewScreenRevealConfirmModal({
  pendingReveal,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  pendingReveal: PendingRevealConfirmation;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!pendingReveal) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0">
      <div
        aria-live="polite"
        className="w-full max-w-lg overflow-hidden rounded-t-[28px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] sm:rounded-3xl"
        role="dialog"
      >
        <div className="border-b border-blue-100 bg-[linear-gradient(135deg,#eff6ff,#ffffff_62%,#f8fbff)] px-5 py-5 sm:px-6">
          <p className="text-xs font-black tracking-[0.18em] text-blue-600">
            {pendingReveal.showFinalScoreOnScreen ? "计算并揭晓" : "确认归档"}
          </p>
          <h3 className="mt-2 text-xl font-black text-slate-950">
            {pendingReveal.showFinalScoreOnScreen ? "确认揭晓本项目得分？" : "确认锁定本项目得分？"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            成绩锁定后会写入后台记录；{pendingReveal.showFinalScoreOnScreen ? "大屏将立即播放最终得分动画。" : "本次不会在大屏展示具体分数。"}
          </p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="truncate text-sm font-bold text-slate-900">{pendingReveal.targetName}</p>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">{pendingReveal.roundLabel}</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400">后台预计得分</p>
                <p className="mt-1 font-mono text-4xl font-black text-blue-700 tabular-nums">
                  {pendingReveal.finalScoreText}
                </p>
              </div>
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                专家已提交完成
              </span>
            </div>
          </div>
          {pendingReveal.pendingSeatNos.length ? (
            <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              仍有席位 {pendingReveal.pendingSeatNos.join("、")} 未提交，请确认是否继续。
            </p>
          ) : null}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
            <button
              className="touch-manipulation rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition active:scale-[0.98] hover:bg-slate-50 sm:py-2.5"
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
            >
              返回检查
            </button>
            <button
              className="touch-manipulation rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] transition active:scale-[0.98] hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
              disabled={isSubmitting}
              onClick={onConfirm}
              type="button"
            >
              {isSubmitting ? "处理中..." : pendingReveal.showFinalScoreOnScreen ? "确认揭晓" : "确认归档"}
            </button>
          </div>
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
    teamGroups,
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
  const [pendingRevealConfirmation, setPendingRevealConfirmation] = useState<PendingRevealConfirmation>(null);
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);
  const [expertScoreSuccess, setExpertScoreSuccess] = useState<ExpertScoreSuccess>(null);
  const [expertAssignmentsRefreshing, setExpertAssignmentsRefreshing] = useState(false);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [reviewScreenSessions, setReviewScreenSessions] = useState<Record<string, ReviewScreenSessionState>>({});
  const [reviewScreenActionKey, setReviewScreenActionKey] = useState<string | null>(null);
  const [copiedScreenGroupKey, setCopiedScreenGroupKey] = useState<string | null>(null);
  const [reviewConfigModalGroupKey, setReviewConfigModalGroupKey] = useState<string | null>(null);
  const [screenTimingDrafts, setScreenTimingDrafts] = useState<
    Record<string, ReturnType<typeof getDefaultScreenTimingDraft>>
  >({});
  const [screenDisplayDrafts, setScreenDisplayDrafts] = useState<Record<string, ReviewScreenDisplaySettings>>({});
  const [screenDrawModeDrafts, setScreenDrawModeDrafts] = useState<Record<string, ScreenDrawMode>>({});
  const [manualOrderDrafts, setManualOrderDrafts] = useState<Record<string, Record<string, string>>>({});
  const [resetHistoryOpen, setResetHistoryOpen] = useState(false);
  const [resetHistories, setResetHistories] = useState<ResetHistoryItem[]>([]);
  const [resetHistoryLoading, setResetHistoryLoading] = useState(false);
  const [screenLiveData, setScreenLiveData] = useState<
    Record<
      string,
      {
        screenPhase: string;
        phaseStartedAt: string | null;
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
              phaseStartedAt: string | null;
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
                phaseStartedAt: data.session.phaseStartedAt,
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
    const timer = window.setInterval(poll, 1000);
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
  const refreshExpertAssignmentsNow = useCallback(() => {
    if (currentRole !== "expert") {
      return;
    }
    setExpertAssignmentsRefreshing(true);
    refreshWorkspace("reviewAssignments");
    window.setTimeout(() => setExpertAssignmentsRefreshing(false), 700);
  }, [currentRole, refreshWorkspace]);
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

  const openResetHistory = async () => {
    setResetHistoryOpen(true);
    setResetHistoryLoading(true);
    try {
      const payload = await requestJson<{ histories: ResetHistoryItem[] }>(
        "/api/expert-reviews/reset-history",
        undefined,
        { force: true },
      );
      setResetHistories(payload.histories);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "重置历史加载失败");
    } finally {
      setResetHistoryLoading(false);
    }
  };

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
    groupedAssignments.find((group) => isRoadshowAssignment(group.items[0]) && screenLiveData[group.key]?.screenPhase !== "finished") ??
    groupedAssignments[0] ??
    null;
  const getStageGroupsForReviewGroup = useCallback(
    (group: ReviewGroup) =>
      groupedAssignments.filter((candidate) =>
        group.projectReviewStageId
          ? candidate.projectReviewStageId === group.projectReviewStageId
          : candidate.key === group.key,
      ),
    [groupedAssignments],
  );
  const isProjectOrderAlignedWithGroup = useCallback(
    (group: ReviewGroup, projectOrder?: ReviewScreenProjectOrderItem[]) => {
      if (!projectOrder?.length) {
        return true;
      }

      const expectedPackageIds = new Set(getStageGroupsForReviewGroup(group).map((candidate) => candidate.key));
      if (expectedPackageIds.size !== projectOrder.length) {
        return false;
      }

      return projectOrder.every((project) => expectedPackageIds.has(project.packageId));
    },
    [getStageGroupsForReviewGroup],
  );
  const resetRoadshowStageLocalState = useCallback(
    (group: ReviewGroup) => {
      const stageGroupKeys = new Set(getStageGroupsForReviewGroup(group).map((candidate) => candidate.key));
      setReviewScreenSessions((current) => {
        let changed = false;
        const next = { ...current };
        for (const key of stageGroupKeys) {
          if (next[key]) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setScreenLiveData((current) => {
        let changed = false;
        const next = { ...current };
        for (const key of stageGroupKeys) {
          if (next[key]) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setManualOrderDrafts((current) => {
        let changed = false;
        const next = { ...current };
        for (const key of stageGroupKeys) {
          if (next[key]) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setScreenDrawModeDrafts((current) => {
        let changed = false;
        const next = { ...current };
        for (const key of stageGroupKeys) {
          if (next[key]) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setReviewConfigModalGroupKey((current) => (current && stageGroupKeys.has(current) ? null : current));
      setActiveGroupKey((current) => (current && stageGroupKeys.has(current) ? null : current));
    },
    [getStageGroupsForReviewGroup],
  );
  const reconfigurableProjectStages = projectStages.filter((stage) => {
    if (groupedAssignments.length === 0) {
      return true;
    }

    const configuredAssignments = assignmentsByStageId.get(stage.id) ?? [];
    return configuredAssignments.length === 0 && stage.reviewConfig?.status !== "archived";
  });
  const activeGroupRawLiveData = activeGroup ? screenLiveData[activeGroup.key] : undefined;
  const activeGroupLiveData =
    activeGroup && activeGroupRawLiveData && isProjectOrderAlignedWithGroup(activeGroup, activeGroupRawLiveData.projectOrder)
      ? activeGroupRawLiveData
      : undefined;
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

  const getScreenDrawMode = useCallback((groupKey: string): ScreenDrawMode => {
    const draft = screenDrawModeDrafts[groupKey];
    if (draft) {
      return draft;
    }
    const currentDisplay = normalizeReviewScreenDisplaySettings(
      screenDisplayDrafts[groupKey] ?? screenLiveData[groupKey]?.screenDisplay ?? reviewScreenSessions[groupKey]?.screenDisplay,
    );
    return currentDisplay.selfDrawEnabled ? "self" : "random";
  }, [reviewScreenSessions, screenDisplayDrafts, screenDrawModeDrafts, screenLiveData]);

  const updateScreenDrawModeDraft = (groupKey: string, mode: ScreenDrawMode) => {
    setScreenDrawModeDrafts((current) => ({
      ...current,
      [groupKey]: mode,
    }));
    setScreenDisplayDrafts((current) => {
      const currentDraft = normalizeReviewScreenDisplaySettings(
        current[groupKey] ?? screenLiveData[groupKey]?.screenDisplay ?? reviewScreenSessions[groupKey]?.screenDisplay,
      );
      return {
        ...current,
        [groupKey]: normalizeReviewScreenDisplaySettings({
          ...currentDraft,
          selfDrawEnabled: mode === "self",
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
    return getStageGroupsForReviewGroup(group).length;
  };

  const getRoadshowGroupSizesPayload = (group: ReviewGroup) => [getRoadshowProjectCount(group)];

  const createReviewScreenSession = async (group: ReviewGroup) => {
    if (!group.items.some((assignment) => isRoadshowAssignment(assignment))) {
      setLoadError("只有项目路演评审可以生成现场大屏链接");
      return;
    }

    setReviewScreenActionKey(group.key);
    try {
      const roadshowGroupSizes = getRoadshowGroupSizesPayload(group);
      const packageIds = getReviewScreenProjectOrderForGroup(group).map((project) => project.packageId);
      const payload = await requestJson<{
        session: {
          id: string;
          startedAt?: string | null;
          screenPhase?: string;
          phaseStartedAt?: string | null;
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
          drawMode: getScreenDrawMode(group.key),
          roadshowGroupSizes,
          packageIds,
        }),
      });

      await navigator.clipboard?.writeText(payload.screenUrl).catch(() => undefined);
      const stageGroupKeys = payload.packageIds?.length
        ? groupedAssignments
            .filter((candidate) => payload.packageIds?.includes(candidate.key))
            .map((candidate) => candidate.key)
        : getStageGroupsForReviewGroup(group).map((candidate) => candidate.key);
      const nextSessionState: ReviewScreenSessionState = {
          sessionId: payload.session.id,
          screenUrl: payload.screenUrl,
        message: "本轮路演大屏链接已生成；当前只锁定配置和顺序，评审尚未开始，可先导出顺序表。",
          startedAt: payload.session.startedAt ?? null,
          phaseStartedAt: payload.session.phaseStartedAt ?? null,
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
              phaseStartedAt: payload.session.phaseStartedAt ?? null,
              phaseLabel: "待开始",
              phaseRemainingSeconds: 0,
              currentProjectIndex: 0,
              totalProjectCount: payload.projectOrder?.length ?? 0,
              currentPackageId: payload.session.currentPackageId ?? null,
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

  const exportReviewScreenOrder = (group: ReviewGroup) => {
    const screenSession = reviewScreenSessions[group.key];
    if (!screenSession) {
      setLoadError("请先生成现场大屏链接，再导出路演顺序表");
      return;
    }

    window.open(
      `/api/review-screen/sessions/${screenSession.sessionId}/order/export`,
      "_blank",
      "noopener,noreferrer",
    );
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
    const reason = window.prompt("请输入排除原因，例如专家离场或设备故障。");
    if (!reason?.trim()) {
      setLoadError("排除专家席位必须填写原因");
      return;
    }

    setReviewScreenActionKey(`${group.key}:${seatId}`);
    try {
      const payload = await requestJson<{
        seat: ReviewScreenSessionState["seats"][number];
      }>(`/api/review-screen/sessions/${screenSession.sessionId}/void-seat`, {
        method: "POST",
        body: JSON.stringify({ seatId, reason: reason.trim() }),
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
            next[key] = { ...value, message: "路演顺序已调整，大屏已同步；评审尚未开始，可导出顺序表留档。" };
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
      applyLocalReviewScreenOrderDraft(group.key, payload.projectOrder);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "路演顺序调整失败");
    } finally {
      setReviewScreenActionKey(null);
    }
  };

  const moveReviewScreenProject = (group: ReviewGroup, index: number, direction: -1 | 1) => {
    const currentOrder = getReviewScreenProjectOrderForGroup(group);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) {
      return;
    }

    const nextOrder = [...currentOrder];
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    applyLocalReviewScreenOrderDraft(group.key, nextOrder);
    if (reviewScreenSessions[group.key]) {
      void reorderReviewScreenProjects(group, nextOrder.map((item) => item.packageId));
    }
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
      .map((entry) => entry.item);
    applyLocalReviewScreenOrderDraft(group.key, sorted);
    if (reviewScreenSessions[group.key]) {
      void reorderReviewScreenProjects(group, sorted.map((item) => item.packageId));
    }
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

  const closeReviewScreenSession = async (
    group: ReviewGroup,
    options?: { session?: ReviewScreenSessionState; skipConfirm?: boolean },
  ) => {
    const screenSession = options?.session ?? reviewScreenSessions[group.key];
    if (!screenSession) {
      resetRoadshowStageLocalState(group);
      return;
    }

    if (
      options?.skipConfirm !== true &&
      !window.confirm("确认关闭当前大屏链接？关闭后现场大屏会进入结束状态，后台可重新配置并生成新的大屏链接。")
    ) {
      return;
    }

    setReviewScreenActionKey(`${group.key}:close-screen`);
    try {
      await requestJson(`/api/review-screen/sessions/${screenSession.sessionId}/phase`, {
        method: "POST",
        body: JSON.stringify({
          phase: "finished",
          force: true,
          ...getReviewScreenTimingPayload(group.key),
        }),
      });
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? `大屏关闭请求未完成：${error.message}。已先从当前控制台移除旧链接，可重新生成新大屏。`
          : "大屏关闭请求未完成，已先从当前控制台移除旧链接，可重新生成新大屏。",
      );
    } finally {
      resetRoadshowStageLocalState(group);
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

  const confirmPendingReveal = async () => {
    if (!pendingRevealConfirmation) {
      return;
    }
    const targetGroup = groupedAssignments.find((group) => group.key === pendingRevealConfirmation.groupKey);
    if (!targetGroup) {
      setLoadError("当前项目评审配置不存在，请刷新后重试");
      setPendingRevealConfirmation(null);
      return;
    }
    await revealReviewScreenScore(targetGroup);
    setPendingRevealConfirmation(null);
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

  const getFallbackReviewScreenProjectOrder = useCallback((group: ReviewGroup) =>
    getStageGroupsForReviewGroup(group)
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
      })),
    [getStageGroupsForReviewGroup],
  );

  const getReviewScreenProjectOrderForGroup = useCallback((group: ReviewGroup) => {
    const liveOrder = screenLiveData[group.key]?.projectOrder;
    const baseOrder = liveOrder?.length && isProjectOrderAlignedWithGroup(group, liveOrder)
      ? liveOrder
      : getFallbackReviewScreenProjectOrder(group);
    return getManualOrderedProjects(baseOrder, manualOrderDrafts[group.key]);
  }, [getFallbackReviewScreenProjectOrder, isProjectOrderAlignedWithGroup, manualOrderDrafts, screenLiveData]);

  const applyLocalReviewScreenOrderDraft = (groupKey: string, nextOrder: ReviewScreenProjectOrderItem[]) => {
    setManualOrderDrafts((current) => ({
      ...current,
      [groupKey]: buildSequentialManualOrderDrafts(nextOrder),
    }));
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

    const rawScreenSession = reviewScreenSessions[group.key];
    const rawLiveData = screenLiveData[group.key];
    const liveDataMatchesCurrentStage = rawLiveData && isProjectOrderAlignedWithGroup(group, rawLiveData.projectOrder);
    const liveDataIsAligned = !rawLiveData || Boolean(liveDataMatchesCurrentStage);
    const hasStaleProjectionOrder = Boolean(rawLiveData && !liveDataIsAligned);
    const screenSession = liveDataIsAligned ? rawScreenSession : undefined;
    const liveData = liveDataIsAligned ? rawLiveData : undefined;
    const isReviewConfigModalOpen = reviewConfigModalGroupKey === group.key;
    const consoleSeats = mergeConsoleSeats(screenSession?.seats ?? [], liveData?.seats ?? []);
    const timingDraft = screenTimingDrafts[group.key] ?? getDefaultScreenTimingDraft();
    const projectOrder = getReviewScreenProjectOrderForGroup(group);
    const currentPhase = liveData?.screenPhase ?? "draw";
    const screenDisplay = normalizeReviewScreenDisplaySettings(
      screenDisplayDrafts[group.key] ?? liveData?.screenDisplay ?? screenSession?.screenDisplay,
    );
    const drawMode = getScreenDrawMode(group.key);
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
    const packageDropHighestCount = group.items[0]?.dropHighestCount ?? 1;
    const packageDropLowestCount = group.items[0]?.dropLowestCount ?? 1;
    const effectiveExpertCount = consoleSeats.length || group.items.length;
    const remainingScoreCount = Math.max(
      0,
      effectiveExpertCount - packageDropHighestCount - packageDropLowestCount,
    );
    const scoreRuleIsInvalid = remainingScoreCount < 2 && effectiveExpertCount >= 2;
    const currentProjectHasAllSubmitted =
      currentProjectSeats.length > 0 &&
      currentProjectSeats.every((seat) => seat.status === "submitted" || isExcludedSeatStatus(seat.status)) &&
      currentProjectSeats.some((seat) => seat.status === "submitted");
    const currentProjectHasLockedScore = Boolean(
      currentLiveProject?.finalScore.scoreLockedAt || currentProject?.revealedAt,
    );
    const currentPendingSeatNos = currentProjectSeats
      .filter((seat) => seat.status === "pending")
      .map((seat) => seat.seatNo);
    const currentWholeRoundExcludedCount = consoleSeats.filter((seat) => isExcludedSeatStatus(seat.status)).length;
    const currentProjectExcludedCount = currentProjectSeats.filter((seat) => isExcludedSeatStatus(seat.status)).length;
    const currentEffectiveExpertCount =
      currentLiveProject?.finalScore.effectiveSeatCount ??
      Math.max(0, currentProjectSeats.length - currentProjectExcludedCount);
    const currentSubmittedScoreCount =
      currentLiveProject?.finalScore.submittedSeatCount ??
      currentProjectSeats.filter((seat) => seat.status === "submitted").length;
    const currentKeptScoreCount = Math.max(
      0,
      currentEffectiveExpertCount - packageDropHighestCount - packageDropLowestCount,
    );
    const calculationBlockReason = currentProjectHasLockedScore
      ? "当前项目成绩已锁定"
      : scoreRuleIsInvalid
        ? "去高去低后保留评分少于 2 个"
        : currentPendingSeatNos.length > 0
          ? `仍有 ${currentPendingSeatNos.length} 位有效专家未提交`
          : currentProjectHasAllSubmitted
            ? "满足计算条件"
            : "等待进入评分阶段";
    const phaseRemainingSeconds = Math.max(0, liveData?.phaseRemainingSeconds ?? 0);
    const formattedRemaining = `${String(Math.floor(phaseRemainingSeconds / 60)).padStart(2, "0")}:${String(
      phaseRemainingSeconds % 60,
    ).padStart(2, "0")}`;
    const isScreenSessionFinished = currentPhase === "finished";
    const selfDrawControlsVisible = drawMode === "self" && screenDisplay.selfDrawEnabled;
    const drawControlsVisible = Boolean(screenSession) && currentPhase === "draw";
    const screenDrawUrl = screenSession?.screenUrl ?? "";
    const getConsolePhaseLabel = (phase: string) => {
      if (phase === "draw" && !screenDisplay.selfDrawEnabled) return "待开始";
      if (phase === "reveal" && !screenDisplay.showFinalScoreOnScreen) return "成绩已锁定";
      return getReviewScreenPhaseActionLabel(phase);
    };
    const canStartPresentation = Boolean(screenSession) && (currentPhase === "draw" || currentPhase === "presentation");
    const canStartQa = Boolean(screenSession) && currentPhase === "presentation";
    const canStartScoring = Boolean(screenSession) && screenDisplay.scoringEnabled && currentPhase === "qa";
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
      hasStaleProjectionOrder ? "投屏项目数与当前本轮项目不一致，已停止使用旧大屏链接，请关闭旧链接后重新生成。" : null,
      !screenSession ? "尚未生成投屏链接，现场大屏无法打开。" : null,
      scoreRuleIsInvalid ? "当前去高去低规则导致有效评分不足 2 个，不能计算最终得分。" : null,
      currentPhase === "scoring" && currentPendingSeatNos.length > 0
        ? `仍有专家 ${currentPendingSeatNos.join("、")} 未提交评分。`
        : null,
    ].filter((message): message is string => Boolean(message));
    const projectProgressItems = projectOrder.map((project) => ({
      ...project,
      result: liveData?.projectResults.find((result) => result.reviewPackage.id === project.packageId),
    }));
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
        onClick: () => setPendingRevealConfirmation({
          groupKey: group.key,
          targetName: currentProject?.targetName ?? group.targetName,
          roundLabel: currentProject?.roundLabel || group.roundLabel,
          showFinalScoreOnScreen: screenDisplay.showFinalScoreOnScreen,
          finalScoreText: currentLiveProject?.finalScore.finalScoreText ?? activeGroupFinalScoreText,
          pendingSeatNos: currentPendingSeatNos,
        }),
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
              canForceNextWithoutLockedScore
                ? `当前项目还有未提交专家或尚未计算最终得分，确认进入下一项目：${nextProject?.targetName ?? "下一项目"}？未提交专家任务将显示为“已关闭，无需提交”。`
                : nextProject
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
    const guideStepKey =
      isScreenSessionFinished
        ? "finished"
        : currentPhase === "draw"
          ? "config"
          : currentPhase === "presentation" || currentPhase === "qa"
            ? "live"
            : currentPhase === "scoring"
              ? "scoring"
              : currentPhase === "reveal"
                ? "reveal"
                : "config";
    const guideSteps = [
      { key: "config", title: "配置准备", hint: "顺序 / 时长 / 投屏" },
      { key: "live", title: "现场推进", hint: "路演 / 答辩" },
      { key: "scoring", title: "专家评分", hint: "提交进度 / 异常" },
      { key: "reveal", title: "出分确认", hint: "复核 / 揭分" },
      { key: "finished", title: "结束归档", hint: "排名 / 复盘" },
    ] as const;
    const activeGuideStepIndex = Math.max(0, guideSteps.findIndex((step) => step.key === guideStepKey));
    const primaryGuideAction =
      !screenSession
        ? {
            label: "配置本轮",
            description: "先确定项目顺序、抽签方式、时长和大屏显示；生成链接后只锁定配置，不会自动开始评审。",
            disabled: false,
            onClick: () => setReviewConfigModalGroupKey(group.key),
          }
        : guideStepKey === "config"
          ? {
              label: "正式开始当前项目路演",
              description: "抽签/排序已完成并可导出留档；评审尚未开始，等现场准备好后再进入当前项目路演展示。",
              disabled: !canStartPresentation || reviewScreenActionKey?.startsWith(`${group.key}:`),
              onClick: workflowSteps[0].onClick,
            }
          : currentPhase === "presentation"
            ? {
                label: "开始答辩",
                description: "路演结束后进入专家提问倒计时。",
                disabled: !canStartQa || reviewScreenActionKey?.startsWith(`${group.key}:`),
                onClick: workflowSteps[1].onClick,
              }
            : currentPhase === "qa"
              ? {
                  label: screenDisplay.scoringEnabled ? "开始评分" : "完成本项",
                  description: screenDisplay.scoringEnabled ? "答辩结束后开放专家手机端评分。" : "当前配置未启用评分，可直接推进下一项目。",
                  disabled: screenDisplay.scoringEnabled
                    ? !canStartScoring || reviewScreenActionKey?.startsWith(`${group.key}:`)
                    : !workflowSteps[4].enabled || reviewScreenActionKey?.startsWith(`${group.key}:`),
                  onClick: screenDisplay.scoringEnabled ? workflowSteps[2].onClick : workflowSteps[4].onClick,
                }
              : guideStepKey === "scoring"
                ? {
                    label: canRevealScore ? "确认并计算最终得分" : "等待专家提交评分",
                    description: canRevealScore
                      ? "所有有效专家已提交，点击后锁定后台分数并按投屏设置揭分。"
                      : calculationBlockReason,
                    disabled: !canRevealScore || reviewScreenActionKey?.startsWith(`${group.key}:`),
                    onClick: workflowSteps[3].onClick,
                  }
                : guideStepKey === "reveal"
                  ? {
                      label: hasNextProject ? "完成本项，进入下一项目" : "结束本轮评审",
                      description: hasNextProject ? "当前项目已出分，切到下一项目等待开始。" : "本轮最后一个项目已完成，关闭现场流程并进入归档。",
                      disabled: !workflowSteps[4].enabled || reviewScreenActionKey?.startsWith(`${group.key}:`),
                      onClick: workflowSteps[4].onClick,
                    }
                  : {
                      label: "本轮已结束",
                      description: "现场控制已关闭，可查看成绩和重置历史。",
                      disabled: true,
                      onClick: () => undefined,
                    };
    const secondaryGuideActions = [
      screenSession
        ? {
            label: "查看配置",
            disabled: false,
            onClick: () => setReviewConfigModalGroupKey(group.key),
          }
        : null,
      screenSession
        ? {
            label: "打开大屏",
            disabled: false,
            onClick: () => window.open(screenSession.screenUrl, "_blank", "noopener,noreferrer"),
          }
        : null,
      screenSession
        ? {
            label: "导出顺序表",
            disabled: false,
            onClick: () => exportReviewScreenOrder(group),
          }
        : null,
      rawScreenSession
        ? {
            label: hasStaleProjectionOrder ? "关闭旧大屏链接" : "关闭当前大屏链接",
            disabled: reviewScreenActionKey === `${group.key}:close-screen`,
            onClick: () => void closeReviewScreenSession(group, { session: rawScreenSession }),
          }
        : null,
    ].filter((action): action is { label: string; disabled: boolean; onClick: () => void } => Boolean(action));
    const renderGuidedControlPanel = () => (
      <section className="review-guided-control-panel overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
        <div className="border-b border-blue-100 bg-[linear-gradient(90deg,#f8fbff,#ffffff)] px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-blue-600">流程控制 · 当前阶段操作</p>
              <h3 className="mt-1 truncate text-xl font-extrabold text-slate-950">
                {guideSteps[activeGuideStepIndex]?.title ?? "现场推进"}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {guideSteps.map((step, index) => {
                const done = index < activeGuideStepIndex;
                const active = step.key === guideStepKey;
                return (
                  <div
                    className={`min-w-[92px] rounded-xl border px-3 py-2 ${
                      active
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : done
                          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                          : "border-slate-100 bg-slate-50 text-slate-400"
                    }`}
                    key={step.key}
                  >
                    <p className="text-xs font-extrabold">{done ? "已完成" : active ? "当前" : "待进行"}</p>
                    <p className="mt-1 text-sm font-extrabold">{step.title}</p>
                    <p className="mt-0.5 text-[10px] font-semibold opacity-70">{step.hint}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="review-guide-body px-5 py-5">
          <div className="review-guide-message-card rounded-xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-950">
                  {currentProject?.targetName ?? liveData?.reviewPackage?.targetName ?? group.targetName}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{primaryGuideAction.description}</p>
              </div>
              <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">
                项目 {Math.min(currentProjectIndex + 1, totalProjectCount)} / {totalProjectCount}
              </span>
            </div>

            <div className="review-guide-status-row mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold text-slate-400">当前阶段</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">
                  {liveData?.phaseLabel ?? getConsolePhaseLabel(currentPhase)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold text-slate-400">提交状态</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">
                  {currentSubmittedScoreCount} / {Math.max(currentEffectiveExpertCount, currentSubmittedScoreCount)}
                </p>
              </div>
              <div className={currentProjectHasAllSubmitted && !scoreRuleIsInvalid ? "rounded-xl bg-emerald-50 px-4 py-3" : "rounded-xl bg-amber-50 px-4 py-3"}>
                <p className={currentProjectHasAllSubmitted && !scoreRuleIsInvalid ? "text-[11px] font-bold text-emerald-600" : "text-[11px] font-bold text-amber-600"}>
                  计算状态
                </p>
                <p className={currentProjectHasAllSubmitted && !scoreRuleIsInvalid ? "mt-1 text-sm font-extrabold text-emerald-800" : "mt-1 text-sm font-extrabold text-amber-800"}>
                  {calculationBlockReason}
                </p>
              </div>
            </div>

            {warningMessages.length ? (
              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
                {warningMessages.join(" ")}
              </div>
            ) : null}
            {screenSession && guideStepKey === "config" ? (
              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-800">
                当前处于“顺序已确认、评审未开始”状态。可以先导出 Excel 顺序表，正式现场开始时再点击“正式开始当前项目路演”。
              </div>
            ) : null}
          </div>

          <div className="review-guide-action-row mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {secondaryGuideActions.map((action) => (
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={action.disabled}
                key={action.label}
                onClick={action.onClick}
                type="button"
              >
                {action.label}
              </button>
            ))}
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:ml-auto"
              disabled={primaryGuideAction.disabled}
              onClick={primaryGuideAction.onClick}
              type="button"
            >
              {primaryGuideAction.label}
            </button>
          </div>
        </div>
      </section>
    );
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
      <div className="review-track-view border-b border-[var(--line)] bg-white px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-extrabold text-slate-950">本轮项目进度</p>
            <p className="mt-1 text-[11px] text-slate-400">按第一步确认的项目顺序推进，当前项目自动高亮。</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-white">全部 {totalProjectCount}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">当前 {Math.min(currentProjectIndex + 1, totalProjectCount)}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">已完成 {completedProjectCount}</span>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex min-w-max items-center gap-2">
            {projectProgressItems.map((project, index) => {
              const status = getProjectStatus(project, index);
              return (
                <button
                  className={`flex h-[54px] w-[58px] shrink-0 flex-col items-center justify-center rounded-lg border font-mono transition ${
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
                  <span className="text-xs font-extrabold">{index + 1}{status === "done" ? "✓" : ""}</span>
                  <span className="mt-1 font-sans text-[9px] font-bold">
                    {status === "current" ? getConsolePhaseLabel(currentPhase) : status === "done" ? project.result?.finalScore.finalScoreText ?? "完成" : status === "next" ? "下个" : "待评"}
                  </span>
                </button>
              );
            })}
          </div>
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
        <div className="grid gap-2 border-b border-slate-100 bg-white px-4 py-3 text-[11px] font-bold text-slate-500 md:grid-cols-5">
          <span>有效专家 {currentEffectiveExpertCount} 位</span>
          <span>排除整轮 {currentWholeRoundExcludedCount} 人 · 本项目 {currentProjectExcludedCount} 人</span>
          <span>已提交 {currentSubmittedScoreCount} / {currentEffectiveExpertCount}</span>
          <span>去高去低后保留 {currentKeptScoreCount} 个</span>
          <span className={currentProjectHasAllSubmitted && !scoreRuleIsInvalid ? "text-emerald-700" : "text-amber-700"}>
            是否可计算：{currentProjectHasAllSubmitted && !scoreRuleIsInvalid ? "是" : "否"} · {calculationBlockReason}
          </span>
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
                      const isDropped = Boolean(result?.finalScore.droppedSeatNos.includes(seat.seatNo)) || isExcludedSeatStatus(seatResult?.status);
                      const isSubmitted = seatResult?.status === "submitted";
                      const cellText =
                        isExcludedSeatStatus(seatResult?.status)
                          ? "排除"
                          : isSubmitted
                            ? seatResult.scoreText ?? "已交"
                            : seatResult?.status === "closed_by_admin"
                              ? "已关闭"
                              : seatResult?.status === "timeout"
                                ? "超时"
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
    const canEditConfigFields = !screenSession;
    const displayOptions: Array<[keyof ReviewScreenDisplaySettings, string]> = [
      ["scoringEnabled", "启用专家评分环节"],
      ["showScoresOnScreen", "大屏显示专家具体分"],
      ["showFinalScoreOnScreen", "大屏显示最终得分"],
      ["showRankingOnScreen", "大屏显示本轮排名"],
    ];
    const drawModeOptions: Array<{
      key: ScreenDrawMode;
      title: string;
      description: string;
      meta: string;
    }> = [
      {
        key: "manual",
        title: "手动排序",
        description: "管理员在后台按序号确认顺序，大屏打开后直接等待路演开始。",
        meta: "后台确认",
      },
      {
        key: "random",
        title: "大屏随机抽签",
        description: "生成链接后在大屏点击开始抽签，结果滚动揭示并写入顺序表。",
        meta: "大屏执行",
      },
      {
        key: "self",
        title: "大屏自助抽签",
        description: "大屏先随机抽上台项目，再由该项目抽取路演顺序。",
        meta: "两步抽签",
      },
    ];
    const selectedDrawMode = drawModeOptions.find((option) => option.key === drawMode) ?? drawModeOptions[1];
    const drawModeHelpText =
      drawMode === "manual"
        ? "手动排序模式：保存序号后生成大屏链接，大屏不再执行抽签。"
        : drawMode === "self"
          ? "自助抽签模式：后台只生成链接和导出结果，所有抽签动作都在大屏完成。"
          : "随机抽签模式：后台生成链接后，现场打开大屏点击“开始随机抽签”。";
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
                  {` · ${selectedDrawMode.title}`}
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
              <p className="mt-1 text-xs text-slate-400">先确定路演顺序方式，再设置时长和大屏显示；生成链接后配置锁定，抽签在大屏完成。</p>
            </div>
            <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-[11px] font-bold text-[var(--brand)]">
              配置中
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-extrabold text-indigo-950">1 选择路演顺序方式</p>
                <p className="mt-1 text-xs text-indigo-700/70">抽签只是确定顺序，不会自动开始路演；评审开始仍由后台控制台逐步推进。</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-100">
                当前：{selectedDrawMode.title}
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {drawModeOptions.map((option) => {
                const active = option.key === drawMode;
                return (
                  <button
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-blue-500 bg-white shadow-sm ring-2 ring-blue-100"
                        : "border-indigo-100 bg-white/80 hover:border-blue-200 hover:bg-white"
                    }`}
                    key={option.key}
                    onClick={() => updateScreenDrawModeDraft(group.key, option.key)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-sm font-extrabold ${active ? "text-blue-700" : "text-slate-900"}`}>
                        {option.title}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {option.meta}
                      </span>
                    </div>
                    <p className="mt-2 min-h-10 text-xs font-semibold leading-5 text-slate-500">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-black text-white">2</span>
            <p className="text-sm font-extrabold text-slate-950">设置环节时间与评分规则</p>
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

          <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                <p className="text-sm font-extrabold text-blue-950">3 投屏显示设置</p>
                <p className="mt-1 text-xs text-blue-700/70">后台管理员监看始终实名显示分数；这里仅控制现场大屏给观众看的内容。</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
                {screenDisplay.scoringEnabled ? "含评分环节" : "仅路演答辩"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {displayOptions.map(([key, label]) => {
                const disabled = key !== "scoringEnabled" && !screenDisplay.scoringEnabled;
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
                <p className="text-sm font-extrabold text-slate-950">4 确认顺序并生成大屏链接</p>
                <p className="mt-1 text-xs text-slate-400">
                  {drawModeHelpText} 随机抽签和自助抽签都在大屏窗口完成，后台只同步结果和导出顺序表。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                  {selectedDrawMode.title}
                </span>
                <button
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={drawMode === "manual" || !screenDrawUrl || !drawControlsVisible}
                  onClick={() => {
                    if (!screenDrawUrl) return;
                    window.open(screenDrawUrl, "_blank", "noopener,noreferrer");
                  }}
                  type="button"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  {drawMode === "self" ? "打开自助抽签大屏" : "打开大屏抽签"}
                </button>
                <button
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!screenSession}
                  onClick={() => exportReviewScreenOrder(group)}
                  type="button"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出顺序表
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={drawMode !== "manual" || reviewScreenActionKey === `${group.key}:order`}
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
                    {drawMode === "manual" ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-400">
                          手动序号
                          <input
                            className="h-6 w-10 rounded-md border border-slate-200 px-1 text-center font-mono text-xs font-bold text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-300"
                            inputMode="numeric"
                            onChange={(event) => updateManualOrderDraft(group.key, project.packageId, event.target.value)}
                            value={manualOrderDrafts[group.key]?.[project.packageId] ?? String(index + 1)}
                          />
                        </label>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300"
                          disabled={index === 0 || reviewScreenActionKey === `${group.key}:order`}
                          onClick={() => moveReviewScreenProject(group, index, -1)}
                          title="上移"
                          type="button"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300"
                          disabled={index === projectOrder.length - 1 || reviewScreenActionKey === `${group.key}:order`}
                          onClick={() => moveReviewScreenProject(group, index, 1)}
                          title="下移"
                          type="button"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                        project.selfDrawnAt ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {project.selfDrawnAt ? "已抽取" : "待大屏抽取"}
                      </span>
                    )}
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
              value="确认配置后生成投屏链接"
            />
            <button
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={reviewScreenActionKey === group.key}
              onClick={() => void createReviewScreenSession(group)}
              type="button"
            >
              确认配置并生成大屏链接
            </button>
          </div>
        </div>
      );
    };

    const renderDangerZone = () => (
      <div className="review-danger-zone danger-card rounded-xl border border-rose-100 bg-rose-50/55 p-4">
        <p className="text-sm font-extrabold text-rose-950">更多管理操作</p>
        <div className="danger-row mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-extrabold text-rose-900">关闭当前大屏链接</p>
            <p className="mt-1 text-xs leading-5 text-rose-700/75">只关闭投屏会话并清理当前控制台状态，不删除评审包和专家分配；关闭后可以重新生成大屏链接。</p>
          </div>
          <button
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!rawScreenSession || reviewScreenActionKey === `${group.key}:close-screen`}
            onClick={() => rawScreenSession && void closeReviewScreenSession(group, { session: rawScreenSession })}
            type="button"
          >
            关闭当前大屏链接
          </button>
        </div>
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
              <p className="text-xs font-extrabold text-rose-900">重置本轮配置</p>
              <p className="mt-1 text-xs leading-5 text-rose-700/70">删除配置会移除本阶段全部项目组的专家分配、评审时间和投屏链接；项目管理阶段保留，可重新配置。</p>
            </div>
            <button
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-50"
              onClick={() => {
                void deleteReviewStageAssignments(group);
              }}
              type="button"
            >
              {activeStageHasLockedScore ? "重置本轮配置" : "删除本阶段全部配置"}
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
            <h3 className="text-sm font-extrabold text-slate-950">专家席位</h3>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">固定席位 {monitorSeats.length}</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">后台实名查看；异常排除仅用于专家离场、设备故障等情况。</p>
          <div className="mt-4 space-y-2">
            {monitorSeats.map((seat) => {
              const assignment = group.items[seat.seatNo - 1];
              const expertName = assignment?.expert.name ?? seat.displayName;
              const isSubmitted = seat.status === "submitted";
              const isVoided = isExcludedSeatStatus(seat.status);
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
          <div className="mt-3 grid grid-cols-2 gap-2">
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
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!screenSession}
              onClick={() => screenSession && window.open(screenSession.screenUrl, "_blank", "noopener,noreferrer")}
              type="button"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开
            </button>
            <button
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-2 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!screenSession}
              onClick={() => exportReviewScreenOrder(group)}
              type="button"
            >
              <Download className="h-3.5 w-3.5" />
              顺序表
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={reviewScreenActionKey === group.key}
              onClick={() => void createReviewScreenSession(group)}
              type="button"
            >
              重生成
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
        {isReviewConfigModalOpen ? (
          <Workspace.Modal title="本轮配置" onClose={() => setReviewConfigModalGroupKey(null)}>
            <div className="max-h-[72vh] overflow-auto pr-1">
              {renderConfigCard()}
            </div>
          </Workspace.Modal>
        ) : null}
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
            {renderGuidedControlPanel()}
            {["scoring", "reveal", "finished"].includes(guideStepKey) ? renderAdminScoreMonitor() : null}
            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-extrabold text-slate-700">
                更多管理操作
              </summary>
              <div className="mt-4 space-y-4">
                {guideStepKey !== "config" ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-bold text-slate-500">
                      配置内容已收起，避免现场推进时误改。如需调整，请先结束或重置本轮。
                    </p>
                  </div>
                ) : null}
                {renderDangerZone()}
              </div>
            </details>
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
                      <button
                        className="inline-flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 transition active:scale-[0.98] hover:bg-blue-50 sm:w-auto"
                        disabled={expertAssignmentsRefreshing}
                        onClick={refreshExpertAssignmentsNow}
                        type="button"
                      >
                        <RefreshCw className={`h-4 w-4 ${expertAssignmentsRefreshing ? "animate-spin" : ""}`} />
                        {expertAssignmentsRefreshing ? "正在刷新" : "刷新现场状态"}
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
                  进入评分阶段后，本页会自动切换到打分界面；如现场已推进但页面未变化，请手动刷新现场状态。
                </p>
              </div>
            ) : null}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                className="touch-manipulation rounded-xl border border-blue-100 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700 active:scale-[0.98] disabled:opacity-60 sm:py-2.5"
                disabled={expertAssignmentsRefreshing}
                onClick={refreshExpertAssignmentsNow}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCw className={`h-4 w-4 ${expertAssignmentsRefreshing ? "animate-spin" : ""}`} />
                  {expertAssignmentsRefreshing ? "正在刷新" : "刷新现场状态"}
                </span>
              </button>
              <button className="touch-manipulation rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 active:scale-[0.98] sm:py-2.5" onClick={() => setExpertMode("home")} type="button">
                返回入口
              </button>
            </div>
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
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    className="inline-flex touch-manipulation items-center gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
                    disabled={expertAssignmentsRefreshing}
                    onClick={refreshExpertAssignmentsNow}
                    type="button"
                  >
                    <RefreshCw className={`h-4 w-4 ${expertAssignmentsRefreshing ? "animate-spin" : ""}`} />
                    {expertAssignmentsRefreshing ? "正在刷新" : "刷新现场状态"}
                  </button>
                  <button className="touch-manipulation rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:text-indigo-600" onClick={() => setExpertMode("home")} type="button">
                    返回入口
                  </button>
                </div>
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
        <ReviewScreenRevealConfirmModal
          isSubmitting={Boolean(pendingRevealConfirmation && reviewScreenActionKey === `${pendingRevealConfirmation.groupKey}:reveal`)}
          onCancel={() => setPendingRevealConfirmation(null)}
          onConfirm={() => void confirmPendingReveal()}
          pendingReveal={pendingRevealConfirmation}
        />
        <ExpertScoreSuccessModal
          success={expertScoreSuccess}
          onClose={() => setExpertScoreSuccess(null)}
        />
      </div>
    );
  }

  const activeStageGroups = activeGroup
    ? getStageGroupsForReviewGroup(activeGroup)
    : [];
  const activeProjectStage = activeGroup?.projectReviewStageId
    ? projectStages.find((stage) => stage.id === activeGroup.projectReviewStageId) ?? null
    : null;
  const activeStageAllowedTeamGroupIds =
    activeProjectStage?.allowedTeamGroupIds ??
    (activeProjectStage?.teamGroup?.id ? [activeProjectStage.teamGroup.id] : []);
  const activeReviewStageTeamGroups = activeProjectStage
    ? teamGroups.filter((group) =>
        activeStageAllowedTeamGroupIds.length === 0 || activeStageAllowedTeamGroupIds.includes(group.id),
      )
    : [];
  const configuredActiveStageTeamGroupIds = new Set(
    activeStageGroups
      .map((group) => group.items[0]?.teamGroupId)
      .filter((teamGroupId): teamGroupId is string => Boolean(teamGroupId)),
  );
  const resettableRoadshowGroups =
    activeProjectStage?.type === "roadshow"
      ? activeReviewStageTeamGroups.filter((group) => !configuredActiveStageTeamGroupIds.has(group.id))
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
  const activeStageHasLockedScore = activeStageGroups.some((group) =>
    group.items.some((assignment) => Boolean(assignment.score?.lockedAt)),
  );
  const deleteReviewStageAssignments = (group: ReviewGroup) =>
    deleteReviewAssignment(group.items[0].id, group.roundLabel || group.targetName, {
      permanent: activeStageHasLockedScore,
      scope: "stage",
      onSuccess: () => resetRoadshowStageLocalState(group),
    });
  const roadshowGroupCards =
    activeGroupIsRoadshow && activeStageGroups.length > 0
      ? activeStageGroups.map((group, index) => {
          const rawLiveData = screenLiveData[group.key];
          const liveData =
            rawLiveData && isProjectOrderAlignedWithGroup(group, rawLiveData.projectOrder) ? rawLiveData : undefined;
          const phase = liveData?.screenPhase ?? "draw";
          const liveResult = liveData?.projectResults.find((project) => project.reviewPackage.id === group.key);
          const averageScore = getAverageScore(group);
          const scoreText = liveResult?.finalScore.finalScoreText ?? (averageScore == null ? "--" : averageScore.toFixed(2));
          const submittedCount = group.items.filter((assignment) => assignment.statusKey !== "pending" || assignment.score).length;
          const isFinished = phase === "finished";
          const isCurrent = activeGroup?.key === group.key;
          return {
            group,
            index,
            isCurrent,
            isFinished,
            phaseLabel: isFinished ? "本轮已结束" : getReviewScreenPhaseActionLabel(phase),
            scoreText,
            submittedCount,
          };
        })
      : [];
  const activeRoadshowConsoleFinished = Boolean(
    activeGroupIsRoadshow && activeGroup && activeGroupLiveData?.screenPhase === "finished",
  );
  const renderRoadshowGroupCards = () =>
    roadshowGroupCards.length > 0 ? (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-950">本轮项目</h3>
            <p className="mt-1 text-xs text-slate-500">项目卡片只展示顺序、提交和分数；现场推进请使用下方控制台。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            共 {roadshowGroupCards.length} 项
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roadshowGroupCards.map(({ group, index, isCurrent, isFinished, phaseLabel, scoreText, submittedCount }) => (
            <div
              className={`rounded-2xl border p-4 text-left ${
                isCurrent
                  ? "border-blue-300 bg-blue-50 shadow-[0_0_0_2px_rgba(37,99,235,0.08)]"
                  : isFinished
                    ? "border-emerald-100 bg-emerald-50/70"
                    : "border-slate-200 bg-white"
              }`}
              key={group.key}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-extrabold ${
                  isFinished ? "bg-emerald-100 text-emerald-700" : isCurrent ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  isFinished ? "bg-emerald-100 text-emerald-700" : isCurrent ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                }`}>
                  {phaseLabel}
                </span>
              </div>
              <p className="mt-3 truncate text-sm font-extrabold text-slate-950">{group.targetName}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-xs text-slate-500">
                  已提交 {submittedCount}/{group.items.length}
                </p>
                <p className={`font-mono text-xl font-extrabold ${scoreText === "--" ? "text-slate-300" : "text-emerald-700"}`}>
                  {scoreText}
                </p>
              </div>
              <p className="mt-3 text-[11px] font-bold text-blue-600">
                {isCurrent ? "当前控制中" : isFinished ? "已完成" : "等待按顺序推进"}
              </p>
            </div>
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div className="review-admin-control-shell mx-auto max-w-[1200px] space-y-5">
      {resetHistoryOpen ? (
        <Workspace.Modal title="重置历史" onClose={() => setResetHistoryOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-500">
              每次评审包重置前的专家评分快照都会保留在这里，用于后台审计和复核。
            </p>
            <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200">
              {resetHistoryLoading ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">加载中...</p>
              ) : resetHistories.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">暂无重置历史</p>
              ) : (
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">专家</th>
                      <th className="px-4 py-3 text-left font-bold">原分数</th>
                      <th className="px-4 py-3 text-left font-bold">重置时间</th>
                      <th className="px-4 py-3 text-left font-bold">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resetHistories.map((history) => (
                      <tr className="border-t border-slate-100" key={history.id}>
                        <td className="px-4 py-3 font-semibold text-slate-800">{history.expertName}</td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-700">{history.totalScoreText}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(history.createdAt)}</td>
                        <td className="px-4 py-3 text-slate-500">{history.resetReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <Workspace.ModalActions>
              <ActionButton onClick={() => setResetHistoryOpen(false)}>关闭</ActionButton>
            </Workspace.ModalActions>
          </div>
        </Workspace.Modal>
      ) : null}
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
          {canManageReviewMaterials ? (
            <button
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              onClick={() => void openResetHistory()}
              type="button"
            >
              重置历史
            </button>
          ) : null}
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

      {canCreateReviewPackage && reconfigurableProjectStages.length > 0 ? (
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
            {reconfigurableProjectStages.map((stage) => {
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
          {renderRoadshowGroupCards()}
          {canCreateReviewPackage && activeProjectStage && resettableRoadshowGroups.length > 0 ? (
            <section className="rounded-2xl border border-amber-100 bg-amber-50/80 p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-amber-700">已重置 / 未配置项目组</p>
                  <h3 className="mt-1 text-lg font-extrabold text-slate-950">可在当前路演轮次内重新配置</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {resettableRoadshowGroups.map((group) => group.name).join("、")} 已不在当前评审包列表中，无需返回项目管理重建轮次。
                  </p>
                </div>
                <ActionButton
                  onClick={() =>
                    openReviewAssignmentModal(undefined, activeProjectStage.id, {
                      initialTeamGroupIds: resettableRoadshowGroups.map((group) => group.id),
                    })
                  }
                  variant="primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    重新配置项目组
                  </span>
                </ActionButton>
              </div>
            </section>
          ) : null}
          {activeRoadshowConsoleFinished ? (
            <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-700">本轮已结束，已收起现场控制台</p>
                  <h3 className="mt-1 text-xl font-extrabold text-slate-950">{activeGroup.targetName}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    该项目已完成，不再展开阶段按钮和现场倒计时。需要继续操作时，请从上方项目卡片切换到未结束项目，或删除本阶段配置后重新配置。
                  </p>
                </div>
                {canManageReviewMaterials ? (
                  <button
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm font-extrabold text-rose-600 transition hover:bg-rose-50"
                    onClick={() => deleteReviewStageAssignments(activeGroup)}
                    type="button"
                  >
                    删除本阶段全部评审配置
                  </button>
                ) : null}
              </div>
            </section>
          ) : (
            renderReviewScreenConsole(activeGroup)
          )}
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
                  const isVoided = isExcludedSeatStatus(seat.status);
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
                      permanent: activeStageHasLockedScore,
                      scope: "stage",
                    })
                  }
                  type="button"
                >
                  {activeStageHasLockedScore ? "重置并重新配置本阶段" : "删除本阶段全部评审配置"}
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      )}
      <ReviewScreenRevealConfirmModal
        isSubmitting={Boolean(pendingRevealConfirmation && reviewScreenActionKey === `${pendingRevealConfirmation.groupKey}:reveal`)}
        onCancel={() => setPendingRevealConfirmation(null)}
        onConfirm={() => void confirmPendingReveal()}
        pendingReveal={pendingRevealConfirmation}
      />
    </div>
  );
}
