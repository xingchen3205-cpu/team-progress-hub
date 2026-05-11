"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";

import { FinalRankingStage } from "@/components/review-screen/FinalRankingStage";
import {
  normalizeReviewScreenDisplaySettings,
  type ReviewScreenDisplaySettings,
} from "@/lib/review-screen-display-settings";

type ScreenSeat = {
  assignmentId: string;
  seatNo: number;
  displayName: string;
  avatarText: string;
  status: "pending" | "submitted" | "timeout" | "closed_by_admin" | "excluded" | "voided";
  scoreText: string | null;
};

type ScreenFinalScore = {
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

type ScreenPhase = "draw" | "presentation" | "qa" | "scoring" | "reveal" | "finished";

type ProjectOrderItem = {
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

type ProjectResult = {
  reviewPackage: {
    id: string;
    targetName: string;
    roundLabel: string;
    overview: string;
    deadline: string | null;
  };
  seats: ScreenSeat[];
  finalScore: ScreenFinalScore;
};

type ScreenPayload = {
  session: {
    id: string;
    status: string;
    screenPhase: ScreenPhase;
    startsAt: string | null;
    tokenExpiresAt: string;
    countdownSeconds: number;
    presentationSeconds: number;
    qaSeconds: number;
    scoringSeconds: number;
    startedAt: string | null;
    phaseStartedAt: string | null;
    revealStartedAt: string | null;
    timeline: {
      phase: "waiting" | "scoring" | "overtime" | "revealed" | "closed";
      remainingSeconds: number;
      label: string;
    };
    phaseLabel: string;
    phaseRemainingSeconds: number;
    currentPackageId: string | null;
    currentProjectIndex: number;
    totalProjectCount: number;
    screenDisplay: ReviewScreenDisplaySettings;
  };
  reviewPackage: {
    targetName: string;
    roundLabel: string;
    overview: string;
    deadline: string | null;
  };
  seats: ScreenSeat[];
  finalScore: ScreenFinalScore;
  projectResults?: ProjectResult[];
  projectOrder?: ProjectOrderItem[];
  serverTime: string;
};

type RankingRow = {
  project: ProjectResult;
  score: number | null;
  roadshowOrder: number;
  isCurrent: boolean;
  isFinished: boolean;
};

type SelfDrawStagePhase = "pickName" | "awaitNum" | "pickNum" | "done";
type SelfDrawReelMode = "name" | "num";
type SelfDrawReelItem = {
  value: string;
  dim: boolean;
};

const SELF_DRAW_ITEM_HEIGHT = 56;
const SELF_DRAW_VIEWPORT_HEIGHT = 460;
const SELF_DRAW_SPIN_COUNT = 22;
const SELF_DRAW_NAME_DURATION_MS = 2400;
const SELF_DRAW_NUMBER_DURATION_MS = 2600;
const SELF_DRAW_REEL_EASING = "cubic-bezier(0.15, 0.7, 0.15, 1)";
const SELF_DRAW_FOCUS_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

const fallbackSeats: ScreenSeat[] = [
  { assignmentId: "fallback-1", seatNo: 1, displayName: "专家 1", avatarText: "1", status: "pending", scoreText: null },
  { assignmentId: "fallback-2", seatNo: 2, displayName: "专家 2", avatarText: "2", status: "pending", scoreText: null },
  { assignmentId: "fallback-3", seatNo: 3, displayName: "专家 3", avatarText: "3", status: "pending", scoreText: null },
];

const buildSelfDrawReelItems = (winner: string, pool: string[]): SelfDrawReelItem[] => {
  const visualPool = pool.length > 0 ? pool : [winner];
  const items: SelfDrawReelItem[] = [];
  for (let index = 0; index < SELF_DRAW_SPIN_COUNT; index += 1) {
    items.push({
      value: visualPool[Math.floor(Math.random() * visualPool.length)] ?? winner,
      dim: true,
    });
  }
  items.push({ value: winner, dim: false });
  items.push({
    value: visualPool[Math.floor(Math.random() * visualPool.length)] ?? winner,
    dim: true,
  });
  items.push({
    value: visualPool[Math.floor(Math.random() * visualPool.length)] ?? winner,
    dim: true,
  });
  return items;
};

const formatSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
};

const useServerClockOffset = (serverTime?: string) => {
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!serverTime) return;
    const parsedServerTime = new Date(serverTime).getTime();
    if (!Number.isNaN(parsedServerTime)) {
      offsetRef.current = parsedServerTime - Date.now();
    }
  }, [serverTime]);

  return offsetRef;
};

const useRevealAnimationFrame = (
  revealStartedAt?: string | null,
  active = false,
  serverClockOffsetRef?: { current: number },
) => {
  const [revealFrameTime, setRevealFrameTime] = useState(() => Date.now());

  useEffect(() => {
    const getFrameTime = () => Date.now() + (serverClockOffsetRef?.current ?? 0);

    if (!active || !revealStartedAt) {
      setRevealFrameTime(getFrameTime());
      return;
    }

    const startedTime = new Date(revealStartedAt).getTime();
    if (Number.isNaN(startedTime)) {
      return;
    }

    let animationFrameId = 0;
    const tick = () => {
      const now = getFrameTime();
      setRevealFrameTime(now);
      if (now - startedTime < 3200) {
        animationFrameId = window.requestAnimationFrame(tick);
      }
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [active, revealStartedAt, serverClockOffsetRef]);

  return revealFrameTime;
};

const usePulseKey = (key: string) => {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setPulse(true));
    const timer = window.setTimeout(() => setPulse(false), 680);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(timer);
    };
  }, [key]);
  return pulse;
};

const getPhaseLabel = (phase: ScreenPhase) => {
  if (phase === "draw") return "抽签排序";
  if (phase === "presentation") return "路演展示";
  if (phase === "qa") return "答辩提问";
  if (phase === "scoring") return "评分进行中";
  if (phase === "reveal") return "得分揭晓";
  return "本轮结束";
};

const getTabState = (phase: ScreenPhase) => {
  if (phase === "draw") return "draw";
  if (phase === "finished") return "rank";
  return "score";
};

const getDropReasonLabel = (reason?: string) => {
  if (reason === "highest") return "去最高分";
  if (reason === "lowest") return "去最低分";
  if (reason === "excluded" || reason === "voided") return "已排除";
  return "";
};

const isExcludedSeatStatus = (status?: string | null) => status === "excluded" || status === "voided";

const getCountdownTone = (seconds: number) => {
  if (seconds <= 10 && seconds > 0) return "danger";
  if (seconds <= 30 && seconds > 10) return "warn";
  return "normal";
};

const getOrderIndex = (projectOrder: ProjectOrderItem[], packageId: string) => {
  const index = projectOrder.findIndex((item) => item.packageId === packageId);
  return index >= 0 ? index + 1 : 0;
};

export default function ReviewScreenSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [payload, setPayload] = useState<ScreenPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [drawAnimationStartedAt, setDrawAnimationStartedAt] = useState<number | null>(null);
  const [drawFrameTime, setDrawFrameTime] = useState(() => Date.now());
  const [drawOrderSubmitting, setDrawOrderSubmitting] = useState(false);
  const [selfDrawCandidatePackageId, setSelfDrawCandidatePackageId] = useState<string | null>(null);
  const [selfDrawModeSeen, setSelfDrawModeSeen] = useState(false);
  const [selfDrawStagePhase, setSelfDrawStagePhase] = useState<SelfDrawStagePhase>("pickName");
  const [selfDrawReelMode, setSelfDrawReelMode] = useState<SelfDrawReelMode>("name");
  const [selfDrawReelItems, setSelfDrawReelItems] = useState<SelfDrawReelItem[]>([
    { value: "—", dim: true },
  ]);
  const [selfDrawReelTransition, setSelfDrawReelTransition] = useState("none");
  const [selfDrawReelTranslateY, setSelfDrawReelTranslateY] = useState(0);
  const [selfDrawReelSpinning, setSelfDrawReelSpinning] = useState(false);
  const [selfDrawMainSubmitting, setSelfDrawMainSubmitting] = useState(false);
  const [selfDrawFlashKey, setSelfDrawFlashKey] = useState(0);
  const [selfDrawJustFilledOrderIndex, setSelfDrawJustFilledOrderIndex] = useState<number | null>(null);
  const [selfDrawResultNotice, setSelfDrawResultNotice] = useState<{
    targetName: string;
    orderIndex: number;
  } | null>(null);
  const [selfDrawRevealRows, setSelfDrawRevealRows] = useState<ProjectOrderItem[]>([]);
  const [selfDrawRevealStageHidden, setSelfDrawRevealStageHidden] = useState(false);
  const [selfDrawRevealVisible, setSelfDrawRevealVisible] = useState(false);
  const [selfDrawRevealHeaderVisible, setSelfDrawRevealHeaderVisible] = useState(false);
  const [selfDrawRevealRowsVisible, setSelfDrawRevealRowsVisible] = useState(0);
  const [selfDrawRevealScanIndex, setSelfDrawRevealScanIndex] = useState<number | null>(null);
  const selfDrawReelRef = useRef<HTMLDivElement | null>(null);
  const selfDrawProjectPoolRef = useRef<HTMLDivElement | null>(null);
  const selfDrawOrderBoardRef = useRef<HTMLDivElement | null>(null);
  const selfDrawReelSpinningRef = useRef(false);
  const selfDrawMutationLockedRef = useRef(false);
  const selfDrawAutoScrollRef = useRef({
    active: false,
    frameId: 0,
    leftScrollPos: 0,
    rightScrollPos: 0,
    lastTime: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      if (!params.sessionId || !token) {
        setErrorMessage("大屏链接无效");
        return;
      }

      try {
        const response = await fetch(
          `/api/review-screen/sessions/${params.sessionId}?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => null)) as ScreenPayload | { message?: string } | null;

        if (!response.ok) {
          throw new Error(data && "message" in data ? data.message ?? "大屏数据加载失败" : "大屏数据加载失败");
        }

        if (!cancelled) {
          if (
            (selfDrawReelSpinningRef.current || selfDrawMutationLockedRef.current) &&
            data &&
            "session" in data &&
            data.session.screenPhase === "draw"
          ) {
            return;
          }
          setPayload(data as ScreenPayload);
          setErrorMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "大屏数据加载失败");
        }
      }
    };

    void loadSession();
    const timer = window.setInterval(loadSession, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [params.sessionId, token]);

  useEffect(() => {
    selfDrawReelSpinningRef.current = selfDrawReelSpinning;
  }, [selfDrawReelSpinning]);

  const phase = payload?.session.screenPhase ?? "draw";
  const serverClockOffsetRef = useServerClockOffset(payload?.serverTime);
  const screenDisplay = normalizeReviewScreenDisplaySettings(payload?.session.screenDisplay);
  const selfDrawEnabled = screenDisplay.selfDrawEnabled;
  const phaseRemaining = payload?.session.phaseRemainingSeconds ?? 0;
  const countdownTone = getCountdownTone(phaseRemaining);
  const projectOrder = useMemo(() => payload?.projectOrder ?? [], [payload?.projectOrder]);
  const projectOrderKey = useMemo(
    () => projectOrder.map((project) => `${project.packageId}:${project.orderIndex}`).join("|"),
    [projectOrder],
  );
  const projectResults = useMemo(() => payload?.projectResults ?? [], [payload?.projectResults]);
  const hasDrawStarted = phase !== "draw" || Boolean(payload?.session.phaseStartedAt);
  const pendingSelfDrawProjects = useMemo(
    () => projectOrder.filter((project) => !project.selfDrawnAt),
    [projectOrder],
  );
  const selfDrawModeActive =
    selfDrawEnabled || (selfDrawModeSeen && phase === "draw" && !hasDrawStarted && projectOrder.length > 0);
  const drawEnabled = selfDrawModeActive || (phase === "draw" && hasDrawStarted);
  const screenStateLabels = [
    drawEnabled ? "抽签分组" : null,
    "评审打分",
    screenDisplay.showRankingOnScreen ? "实时排名" : null,
    screenDisplay.showRankingOnScreen ? "本轮排名" : null,
  ].filter((label): label is string => Boolean(label));
  const drawGroups = useMemo(() => {
    const groups = new Map<string, { name: string; index: number; projects: ProjectOrderItem[] }>();
    projectOrder.forEach((project, index) => {
      const groupIndex = Number.isFinite(project.groupIndex) ? project.groupIndex : 0;
      const groupName = project.groupName?.trim() || `第${groupIndex + 1}组`;
      const key = `${groupIndex}:${groupName}`;
      const current = groups.get(key) ?? { name: groupName, index: groupIndex, projects: [] };
      current.projects.push({ ...project, groupSlotIndex: project.groupSlotIndex ?? index });
      groups.set(key, current);
    });
    return Array.from(groups.values())
      .sort((left, right) => left.index - right.index)
      .map((group) => ({
        ...group,
        projects: group.projects.sort((left, right) => left.groupSlotIndex - right.groupSlotIndex),
      }));
  }, [projectOrder]);
  const visibleDrawGroups = drawEnabled && (hasDrawStarted || selfDrawModeActive) ? drawGroups : [];
  const pendingSelfDrawKey = useMemo(
    () => pendingSelfDrawProjects.map((project) => project.packageId).join("|"),
    [pendingSelfDrawProjects],
  );
  const persistedSelfDrawCandidateId = selfDrawReelSpinning ? null : payload?.session.currentPackageId ?? null;
  const selectedSelfDrawProject =
    pendingSelfDrawProjects.find((project) => project.packageId === selfDrawCandidatePackageId) ??
    pendingSelfDrawProjects.find((project) => project.packageId === persistedSelfDrawCandidateId) ??
    null;
  const selfDrawAvailableSlotIndexes = useMemo(
    () => projectOrder.filter((project) => !project.selfDrawnAt).map((project) => project.orderIndex),
    [projectOrder],
  );
  const activeProjectResult =
    projectResults.find((project) => project.reviewPackage.id === payload?.session.currentPackageId) ??
    projectResults.find((project) => !project.finalScore.ready) ??
    projectResults[0] ??
    null;
  const seats = activeProjectResult?.seats.length
    ? activeProjectResult.seats
    : payload?.seats.length
      ? payload.seats
      : fallbackSeats;

  const activeFinalScore = activeProjectResult?.finalScore ?? payload?.finalScore;
  const title = payload?.reviewPackage.roundLabel ?? "校级初赛";
  const targetName = payload?.reviewPackage.targetName ?? "等待项目同步";
  const currentIndex = payload?.session.currentProjectIndex ?? 0;
  const totalCount = payload?.session.totalProjectCount ?? projectOrder.length;
  const orderNumber = getOrderIndex(projectOrder, payload?.session.currentPackageId ?? "") || currentIndex + 1;
  const activeProjectOrder = projectOrder.find(
    (project) => project.packageId === payload?.session.currentPackageId,
  );
  const hasCurrentProject = Boolean(payload?.session.currentPackageId);
  const activeProjectCompleted = Boolean(activeProjectOrder?.revealedAt || activeFinalScore?.scoreLockedAt);
  const submittedCount = activeFinalScore?.submittedSeatCount ?? seats.filter((seat) => seat.status === "submitted").length;
  const effectiveCount = activeFinalScore?.effectiveSeatCount ?? seats.filter((seat) => !isExcludedSeatStatus(seat.status)).length;
  const progressText = `${submittedCount}/${effectiveCount}`;
  const progressRatio = effectiveCount > 0 ? Math.min(1, submittedCount / effectiveCount) : 0;
  const progressOffset = 188 - progressRatio * 188;
  const seatPulse = usePulseKey(seats.map((seat) => `${seat.assignmentId}:${seat.status}:${seat.scoreText}`).join("|"));
  const revealStartedAt = payload?.session.revealStartedAt;
  const revealFrameTime = useRevealAnimationFrame(
    revealStartedAt,
    screenDisplay.showFinalScoreOnScreen && phase === "reveal",
    serverClockOffsetRef,
  );
  const droppedSeatReasonByNo = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of activeFinalScore?.droppedSeatReasons ?? []) {
      map.set(item.seatNo, item.reason);
    }
    return map;
  }, [activeFinalScore?.droppedSeatReasons]);
  const drawRevealBatchSize =
    projectOrder.length >= 36 ? 8 : projectOrder.length >= 24 ? 6 : projectOrder.length >= 12 ? 4 : 3;
  const drawRevealBatches = useMemo(() => {
    const batches: ProjectOrderItem[][] = [];
    for (let index = 0; index < projectOrder.length; index += drawRevealBatchSize) {
      batches.push(projectOrder.slice(index, index + drawRevealBatchSize));
    }
    return batches;
  }, [drawRevealBatchSize, projectOrder]);
  const drawIntroDuration = projectOrder.length >= 30 ? 980 : 860;
  const drawBatchInterval = projectOrder.length >= 36 ? 420 : projectOrder.length >= 24 ? 480 : 560;
  const drawHoldDuration = 980;
  const drawAnimationDuration =
    projectOrder.length > 0
      ? drawIntroDuration + Math.max(1, drawRevealBatches.length) * drawBatchInterval + drawHoldDuration
      : 0;

  useEffect(() => {
    if (drawEnabled && phase === "draw" && hasDrawStarted && projectOrder.length > 0) {
      const startedAt = Date.now();
      setDrawAnimationStartedAt(startedAt);
      setDrawFrameTime(startedAt);
    }
  }, [drawEnabled, hasDrawStarted, phase, projectOrder.length, projectOrderKey]);

  useEffect(() => {
    if (drawAnimationStartedAt === null) return;

    let frameId = 0;
    const tick = () => {
      const now = Date.now();
      setDrawFrameTime(now);
      if (now - drawAnimationStartedAt < drawAnimationDuration) {
        frameId = window.requestAnimationFrame(tick);
      }
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [drawAnimationDuration, drawAnimationStartedAt]);

  useEffect(() => {
    if (selfDrawEnabled && phase === "draw" && !hasDrawStarted) {
      setSelfDrawModeSeen(true);
    }
    if (phase !== "draw" || hasDrawStarted) {
      setSelfDrawModeSeen(false);
    }
  }, [hasDrawStarted, phase, selfDrawEnabled]);

  useEffect(() => {
    if (!selfDrawModeActive || phase !== "draw") {
      setSelfDrawCandidatePackageId(null);
      setSelfDrawStagePhase("pickName");
      setSelfDrawReelMode("name");
      setSelfDrawReelItems([{ value: "—", dim: true }]);
      setSelfDrawReelTranslateY(0);
      setSelfDrawRevealRows([]);
      setSelfDrawRevealStageHidden(false);
      setSelfDrawRevealVisible(false);
      setSelfDrawRevealHeaderVisible(false);
      setSelfDrawRevealRowsVisible(0);
      setSelfDrawRevealScanIndex(null);
      return;
    }

    if (!pendingSelfDrawProjects.length) {
      setSelfDrawCandidatePackageId(null);
      if (!selfDrawReelSpinning) {
        setSelfDrawStagePhase("done");
        setSelfDrawReelMode("num");
        setSelfDrawReelItems([{ value: "完成", dim: true }]);
        setSelfDrawReelTranslateY(0);
      }
      return;
    }

    setSelfDrawRevealRows([]);
    setSelfDrawRevealStageHidden(false);
    setSelfDrawRevealVisible(false);
    setSelfDrawRevealHeaderVisible(false);
    setSelfDrawRevealRowsVisible(0);
    setSelfDrawRevealScanIndex(null);

    if (
      selfDrawCandidatePackageId &&
      !pendingSelfDrawProjects.some((project) => project.packageId === selfDrawCandidatePackageId)
    ) {
      setSelfDrawCandidatePackageId(null);
    }
  }, [
    pendingSelfDrawKey,
    pendingSelfDrawProjects,
    phase,
    selfDrawCandidatePackageId,
    selfDrawModeActive,
    selfDrawReelSpinning,
  ]);

  useEffect(() => {
    if (!selfDrawModeActive || phase !== "draw" || selfDrawReelSpinning) return;
    const currentPackageId = payload?.session.currentPackageId ?? null;
    if (currentPackageId && pendingSelfDrawProjects.some((project) => project.packageId === currentPackageId)) {
      setSelfDrawCandidatePackageId(currentPackageId);
    }
  }, [payload?.session.currentPackageId, pendingSelfDrawProjects, phase, selfDrawModeActive, selfDrawReelSpinning]);

  useEffect(() => {
    if (!selfDrawModeActive || phase !== "draw" || selfDrawReelSpinning) return;
    if (!pendingSelfDrawProjects.length) {
      setSelfDrawStagePhase("done");
      return;
    }
    if (selectedSelfDrawProject) {
      setSelfDrawStagePhase("awaitNum");
      setSelfDrawReelMode("num");
      setSelfDrawReelItems([{ value: "?", dim: true }]);
      setSelfDrawReelTranslateY(0);
      setSelfDrawReelTransition("none");
      return;
    }
    setSelfDrawStagePhase("pickName");
    setSelfDrawReelMode("name");
    setSelfDrawReelItems([{ value: "—", dim: true }]);
    setSelfDrawReelTranslateY(0);
    setSelfDrawReelTransition("none");
  }, [
    pendingSelfDrawProjects.length,
    phase,
    selectedSelfDrawProject,
    selfDrawModeActive,
    selfDrawReelSpinning,
  ]);

  useEffect(() => {
    if (selfDrawJustFilledOrderIndex === null) return;
    const timer = window.setTimeout(() => {
      setSelfDrawJustFilledOrderIndex(null);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [selfDrawJustFilledOrderIndex]);

  useEffect(() => {
    if (!selfDrawResultNotice) return;
    const timer = window.setTimeout(() => {
      setSelfDrawResultNotice(null);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [selfDrawResultNotice]);

  const revealElapsedMs = useMemo(() => {
    if (!revealStartedAt) return 0;
    const started = new Date(revealStartedAt).getTime();
    if (Number.isNaN(started)) return 0;
    return Math.max(0, revealFrameTime - started);
  }, [revealFrameTime, revealStartedAt]);
  const revealProjectVisible = revealElapsedMs >= 50;
  const revealScoreVisible = revealElapsedMs >= 600;
  const revealScoreSettling = revealElapsedMs >= 2400 && revealElapsedMs < 2530;
  const revealUnderlineVisible = revealElapsedMs >= 2530;
  const revealCaptionVisible = revealElapsedMs >= 2730;
  const finalScoreRevealProgress = Math.min(1, Math.max(0, (revealElapsedMs - 600) / 1800));

  const revealAnimatedScore = useMemo(() => {
    if (!activeFinalScore?.ready || !activeFinalScore.finalScoreText) return "0.00";
    const target = Number.parseFloat(activeFinalScore.finalScoreText);
    if (Number.isNaN(target)) return "0.00";
    const eased = 1 - Math.pow(1 - finalScoreRevealProgress, 3);
    return (target * eased).toFixed(2);
  }, [activeFinalScore?.finalScoreText, activeFinalScore?.ready, finalScoreRevealProgress]);

  const rankingRows = useMemo<RankingRow[]>(() => {
    return projectResults
      .map((project) => {
        const score = project.finalScore.ready && project.finalScore.finalScoreText
          ? Number.parseFloat(project.finalScore.finalScoreText)
          : null;
        return {
          project,
          score: Number.isNaN(score) ? null : score,
          roadshowOrder: getOrderIndex(projectOrder, project.reviewPackage.id),
          isCurrent: project.reviewPackage.id === payload?.session.currentPackageId,
          isFinished: project.finalScore.ready,
        };
      })
      .sort((left, right) => {
        if (left.score === null && right.score === null) return left.roadshowOrder - right.roadshowOrder;
        if (left.score === null) return 1;
        if (right.score === null) return -1;
        return right.score - left.score;
      });
  }, [payload?.session.currentPackageId, projectOrder, projectResults]);
  const finishedRankingVisible = phase === "finished" && rankingRows.length > 0;
  const waitingScreen =
    phase === "finished" && !finishedRankingVisible
      ? {
          title: "本轮路演已结束",
          description: "请等待管理员开启下一轮评审",
        }
      : phase === "draw" && !drawEnabled
        ? hasCurrentProject
          ? activeProjectCompleted
            ? {
                title: "本项目评审已完成，等待下一项目",
                description: `第 ${orderNumber} / ${Math.max(totalCount, projectOrder.length, 1)} 项 · ${targetName}`,
              }
            : {
                title: "请等待下一个项目路演开始",
                description: `第 ${orderNumber} / ${Math.max(totalCount, projectOrder.length, 1)} 项 · ${targetName}`,
              }
          : {
              title: "请等待管理员分配路演项目",
              description: title,
            }
        : null;
  const activeTab = finishedRankingVisible
    ? "rank"
    : waitingScreen
    ? "waiting"
    : phase === "draw"
      ? "draw"
      : getTabState(phase);

  const drawElapsed = drawAnimationStartedAt === null ? 0 : drawFrameTime - drawAnimationStartedAt;
  const drawOverlayActive =
    drawEnabled &&
    phase === "draw" &&
    hasDrawStarted &&
    projectOrder.length > 0 &&
    drawAnimationStartedAt !== null &&
    drawElapsed < drawAnimationDuration;
  const drawRevealElapsed = Math.max(0, drawElapsed - drawIntroDuration);
  const drawVisibleBatchCount = drawElapsed < drawIntroDuration
    ? 0
    : Math.min(drawRevealBatches.length, Math.floor(drawRevealElapsed / drawBatchInterval) + 1);
  const visibleDrawRevealBatches = drawRevealBatches.slice(0, drawVisibleBatchCount);
  const drawRevealedCount = visibleDrawRevealBatches.reduce((count, batch) => count + batch.length, 0);
  const drawOverlayRolling = drawElapsed < drawIntroDuration;
  const drawRollingNumber = projectOrder.length > 0
    ? ((Math.floor(drawFrameTime / 62) % projectOrder.length) + 1)
    : 1;
  const drawRollingProject = projectOrder[drawRollingNumber - 1] ?? null;
  const drawOverlayFinishing =
    drawVisibleBatchCount >= drawRevealBatches.length &&
    drawElapsed >= drawAnimationDuration - drawHoldDuration;
  const hasPendingSelfDrawProjects =
    selfDrawModeActive && pendingSelfDrawProjects.length > 0;
  const isWaitingNextProject =
    drawEnabled &&
    phase === "draw" &&
    hasDrawStarted &&
    projectOrder.length > 0 &&
    Boolean(payload?.session.currentPackageId) &&
    !drawOverlayActive &&
    !hasPendingSelfDrawProjects;
  const selfDrawOrderSlots = useMemo(
    () => [...projectOrder].sort((left, right) => left.orderIndex - right.orderIndex),
    [projectOrder],
  );
  const selfDrawAssignedCount = projectOrder.length - pendingSelfDrawProjects.length;
  const selfDrawButtonText =
    selfDrawMainSubmitting || selfDrawReelSpinning
      ? "抽取中…"
      : selfDrawStagePhase === "done"
        ? "抽签完成"
        : selectedSelfDrawProject
          ? "抽路演序号"
          : "抽下一位上台";
  const selfDrawStageTitle =
    selfDrawStagePhase === "done"
      ? "全部项目抽签完成"
      : selectedSelfDrawProject
        ? `${selectedSelfDrawProject.targetName} 上台`
        : "点击按钮开始抽签";
  const selfDrawStageSubTitle =
    selfDrawStagePhase === "done"
      ? "路演顺序已确认，可导出顺序表留档"
      : selectedSelfDrawProject
        ? "点击「抽路演序号」由该项目抽取顺序"
        : "老师不介入选择，全程随机";

  const stopSelfDrawAutoScroll = () => {
    const state = selfDrawAutoScrollRef.current;
    state.active = false;
    if (state.frameId) {
      window.cancelAnimationFrame(state.frameId);
      state.frameId = 0;
    }
  };

  const startSelfDrawAutoScroll = () => {
    const state = selfDrawAutoScrollRef.current;
    if (state.active || selfDrawReelSpinning) return;
    state.active = true;
    state.lastTime = performance.now();
    if (selfDrawProjectPoolRef.current) {
      selfDrawProjectPoolRef.current.style.transition = "none";
    }
    if (selfDrawOrderBoardRef.current) {
      selfDrawOrderBoardRef.current.style.transition = "none";
    }

    const tick = (now: number) => {
      if (!state.active) return;
      const delta = now - state.lastTime;
      state.lastTime = now;
      const advance = 0.25 * (delta / 16.67);

      const scrollPanel = (panel: HTMLDivElement | null, key: "leftScrollPos" | "rightScrollPos") => {
        if (!panel) return;
        const maxScroll = Math.max(0, panel.scrollHeight - SELF_DRAW_VIEWPORT_HEIGHT);
        if (maxScroll <= 0) return;
        state[key] += advance;
        if (state[key] > maxScroll + 30) {
          state[key] = -30;
        }
        panel.style.transform = `translateY(${-state[key]}px)`;
      };

      scrollPanel(selfDrawProjectPoolRef.current, "leftScrollPos");
      scrollPanel(selfDrawOrderBoardRef.current, "rightScrollPos");
      state.frameId = window.requestAnimationFrame(tick);
    };

    state.frameId = window.requestAnimationFrame(tick);
  };

  const focusSelfDrawPanel = (panel: "left" | "right", index: number) => {
    stopSelfDrawAutoScroll();
    const inner = panel === "left" ? selfDrawProjectPoolRef.current : selfDrawOrderBoardRef.current;
    if (!inner) return;
    window.requestAnimationFrame(() => {
      const child = inner.children[index] as HTMLElement | undefined;
      if (!child) return;
      const targetScroll = child.offsetTop - SELF_DRAW_VIEWPORT_HEIGHT / 2 + child.offsetHeight / 2;
      const maxScroll = Math.max(0, inner.scrollHeight - SELF_DRAW_VIEWPORT_HEIGHT);
      const clamped = Math.max(0, Math.min(maxScroll, targetScroll));
      inner.style.transition = `transform 0.9s ${SELF_DRAW_FOCUS_EASING}`;
      inner.style.transform = `translateY(${-clamped}px)`;
      if (panel === "left") {
        selfDrawAutoScrollRef.current.leftScrollPos = clamped;
      } else {
        selfDrawAutoScrollRef.current.rightScrollPos = clamped;
      }
    });
  };

  const spinToSelfDrawWinner = ({
    winner,
    mode,
    durationMs,
    pool,
    focus,
  }: {
    winner: string;
    mode: SelfDrawReelMode;
    durationMs: number;
    pool: string[];
    focus?: () => void;
  }) =>
    new Promise<void>((resolve) => {
      stopSelfDrawAutoScroll();
      const items = buildSelfDrawReelItems(winner, pool);
      setSelfDrawReelMode(mode);
      setSelfDrawReelItems(items);
      setSelfDrawReelTransition("none");
      setSelfDrawReelTranslateY(0);
      setSelfDrawReelSpinning(true);

      const focusTimer = window.setTimeout(() => focus?.(), 1500);
      window.requestAnimationFrame(() => {
        if (selfDrawReelRef.current) {
          void selfDrawReelRef.current.offsetHeight;
        }
        setSelfDrawReelTransition(`transform ${durationMs}ms ${SELF_DRAW_REEL_EASING}`);
        setSelfDrawReelTranslateY(-SELF_DRAW_SPIN_COUNT * SELF_DRAW_ITEM_HEIGHT);
      });

      window.setTimeout(() => {
        window.clearTimeout(focusTimer);
        setSelfDrawFlashKey((value) => value + 1);
        setSelfDrawReelSpinning(false);
        resolve();
      }, durationMs + 50);
    });

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const runFinalReveal = async (finalProjectOrder: ProjectOrderItem[]) => {
    const finalRows = [...finalProjectOrder]
      .filter((project) => project.selfDrawnAt)
      .sort((left, right) => left.orderIndex - right.orderIndex);

    setSelfDrawRevealRows(finalRows);
    setSelfDrawRevealRowsVisible(0);
    setSelfDrawRevealScanIndex(null);
    stopSelfDrawAutoScroll();
    await sleep(40);

    setSelfDrawRevealStageHidden(true);
    await sleep(500);

    setSelfDrawRevealVisible(true);
    await sleep(150);

    setSelfDrawRevealHeaderVisible(true);
    await sleep(900);

    for (let index = 0; index < finalRows.length; index += 1) {
      setSelfDrawRevealRowsVisible(index + 1);
      await sleep(70);
    }

    await sleep(400);

    for (let index = 0; index < finalRows.length; index += 1) {
      setSelfDrawRevealScanIndex(index);
      await sleep(40);
    }

    await sleep(120);
    setSelfDrawRevealScanIndex(null);
  };

  const drawReviewScreenOrderFromScreen = async () => {
    if (!params.sessionId || !token || selfDrawModeActive || phase !== "draw" || drawOrderSubmitting) {
      return;
    }

    setDrawOrderSubmitting(true);
    try {
      const response = await fetch(
        `/api/review-screen/sessions/${params.sessionId}/draw?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | {
            session?: { currentPackageId?: string | null; phaseStartedAt?: string | null };
            projectOrder?: ProjectOrderItem[];
            message?: string;
          }
        | null;
      if (!response.ok) {
        throw new Error(data?.message ?? "随机抽签失败，请重试");
      }
      if (data?.projectOrder) {
        setPayload((current) =>
          current
            ? {
                ...current,
                projectOrder: data.projectOrder,
                session: {
                  ...current.session,
                  currentPackageId: data.session?.currentPackageId ?? current.session.currentPackageId,
                  phaseStartedAt: data.session?.phaseStartedAt ?? current.session.phaseStartedAt,
                },
              }
            : current,
        );
        const startedAt = Date.now();
        setDrawAnimationStartedAt(startedAt);
        setDrawFrameTime(startedAt);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "随机抽签失败，请重试");
    } finally {
      setDrawOrderSubmitting(false);
    }
  };

  const drawSelfDrawCandidate = async () => {
    if (!params.sessionId || !token || !selfDrawModeActive || phase !== "draw") {
      return null;
    }

    const response = await fetch(
      `/api/review-screen/sessions/${params.sessionId}/self-draw/candidate?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const data = (await response.json().catch(() => null)) as
      | {
          candidate?: { packageId: string };
          session?: { currentPackageId?: string | null };
          message?: string;
        }
      | null;
    if (!response.ok) {
      throw new Error(data?.message ?? "抽取上台项目失败，请重试");
    }
    const candidatePackageId = data?.candidate?.packageId ?? data?.session?.currentPackageId ?? null;
    if (!candidatePackageId) {
      throw new Error("抽取上台项目失败，请重试");
    }
    return {
      candidatePackageId,
      currentPackageId: data?.session?.currentPackageId ?? candidatePackageId,
    };
  };

  const selfDrawProject = async (packageId: string) => {
    if (!params.sessionId || !token || !selfDrawModeActive || phase !== "draw") {
      return null;
    }

    const response = await fetch(
      `/api/review-screen/sessions/${params.sessionId}/self-draw?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      },
    );
    const data = (await response.json().catch(() => null)) as
      | {
          session?: { currentPackageId?: string | null };
          projectOrder?: ProjectOrderItem[];
          pickedOrderIndex?: number;
          remainingCount?: number;
          message?: string;
        }
      | null;
    if (!response.ok) {
      throw new Error(data?.message ?? "抽签失败，请重试");
    }
    if (!data?.projectOrder) {
      throw new Error("抽签失败，请重试");
    }
    return data;
  };

  const handleSelfDrawMainAction = async () => {
    if (
      selfDrawMainSubmitting ||
      selfDrawReelSpinning ||
      selfDrawStagePhase === "done" ||
      !selfDrawModeActive ||
      phase !== "draw"
    ) {
      return;
    }

    setErrorMessage("");
    setSelfDrawMainSubmitting(true);
    selfDrawMutationLockedRef.current = true;
    try {
      if (!selectedSelfDrawProject) {
        setSelfDrawStagePhase("pickName");
        setSelfDrawReelMode("name");
        const candidate = await drawSelfDrawCandidate();
        if (!candidate) return;
        const winnerProject =
          pendingSelfDrawProjects.find((project) => project.packageId === candidate.candidatePackageId) ??
          projectOrder.find((project) => project.packageId === candidate.candidatePackageId);
        if (!winnerProject) {
          throw new Error("抽取上台项目失败，请重试");
        }
        const winnerPool = pendingSelfDrawProjects.map((project) => project.targetName);
        const winnerIndex = projectOrder.findIndex((project) => project.packageId === winnerProject.packageId);

        await spinToSelfDrawWinner({
          winner: winnerProject.targetName,
          mode: "name",
          durationMs: SELF_DRAW_NAME_DURATION_MS,
          pool: winnerPool,
          focus: () => focusSelfDrawPanel("left", winnerIndex),
        });

        setSelfDrawCandidatePackageId(winnerProject.packageId);
        setPayload((current) =>
          current
            ? {
                ...current,
                session: {
                  ...current.session,
                  currentPackageId: candidate.currentPackageId,
                },
              }
            : current,
        );
        setSelfDrawStagePhase("awaitNum");
        focusSelfDrawPanel("left", winnerIndex);
        return;
      }

      setSelfDrawStagePhase("pickNum");
      setSelfDrawReelMode("num");
      setSelfDrawReelItems([{ value: "?", dim: true }]);
      const data = await selfDrawProject(selectedSelfDrawProject.packageId);
      if (!data) return;
      const finalProjectOrder = data.projectOrder ?? [];
      if (!finalProjectOrder.length) {
        throw new Error("抽签失败，请重试");
      }
      const confirmedOrder = finalProjectOrder.find(
        (project) => project.packageId === selectedSelfDrawProject.packageId,
      );
      if (!confirmedOrder) {
        throw new Error("抽签失败，请重试");
      }
      const winnerOrderNumber = String(confirmedOrder.orderIndex + 1);
      const numberPool = selfDrawAvailableSlotIndexes.map((index) => String(index + 1));

      await spinToSelfDrawWinner({
        winner: winnerOrderNumber,
        mode: "num",
        durationMs: SELF_DRAW_NUMBER_DURATION_MS,
        pool: numberPool,
        focus: () => focusSelfDrawPanel("right", confirmedOrder.orderIndex),
      });

      const remainingCount = data.remainingCount ?? finalProjectOrder.filter((project) => !project.selfDrawnAt).length;
      const finalDraw = remainingCount === 0;

      setPayload((current) =>
        current
          ? {
              ...current,
              projectOrder: finalProjectOrder,
              session: {
                ...current.session,
                currentPackageId: data.session?.currentPackageId ?? current.session.currentPackageId,
              },
            }
          : current,
      );
      setSelfDrawJustFilledOrderIndex(confirmedOrder.orderIndex);
      if (!finalDraw) {
        setSelfDrawResultNotice({
          targetName: confirmedOrder.targetName,
          orderIndex: confirmedOrder.orderIndex,
        });
      }
      setSelfDrawCandidatePackageId(null);
      setSelfDrawStagePhase(finalDraw ? "done" : "pickName");
      focusSelfDrawPanel("right", confirmedOrder.orderIndex);
      focusSelfDrawPanel("left", projectOrder.findIndex((project) => project.packageId === confirmedOrder.packageId));
      if (finalDraw) {
        await runFinalReveal(finalProjectOrder);
      } else {
        window.setTimeout(() => {
          setSelfDrawReelMode("name");
          setSelfDrawReelItems([{ value: "—", dim: true }]);
          setSelfDrawReelTranslateY(0);
          setSelfDrawReelTransition("none");
          startSelfDrawAutoScroll();
        }, 2000);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "抽签失败，请重试");
    } finally {
      selfDrawMutationLockedRef.current = false;
      setSelfDrawMainSubmitting(false);
    }
  };

  useEffect(() => {
    if (!selfDrawModeActive || phase !== "draw" || hasDrawStarted || selfDrawReelSpinning) {
      stopSelfDrawAutoScroll();
      return;
    }
    const timer = window.setTimeout(() => startSelfDrawAutoScroll(), 1500);
    return () => {
      window.clearTimeout(timer);
      stopSelfDrawAutoScroll();
    };
  }, [
    hasDrawStarted,
    pendingSelfDrawKey,
    phase,
    projectOrderKey,
    selfDrawModeActive,
    selfDrawReelSpinning,
  ]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f0f4f9] text-slate-900">
      <style>{`
        .screen-hero-gradient {
          background: linear-gradient(135deg, #1a3a6e 0%, #2856a0 38%, #c22832 74%, #d93440 100%);
        }
        .screen-banner {
          position: relative;
          height: 68px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(26, 58, 110, 0.24);
        }
        .screen-banner::before {
          content: "";
          position: absolute;
          inset: -120px -80px auto auto;
          width: 420px;
          height: 420px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%);
        }
        .contest-card {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 1px 4px rgba(15, 32, 64, 0.05);
        }
        .phase-panel {
          animation: panel-in .32s cubic-bezier(.16,1,.3,1);
        }
        .draw-sequence-overlay {
          position: fixed;
          inset: 0;
          z-index: 55;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(26, 34, 54, 0.84);
          backdrop-filter: blur(16px);
        }
        .draw-sequence-card {
          position: relative;
          width: min(1240px, calc(100vw - 88px));
          min-height: min(680px, calc(100vh - 150px));
          overflow: hidden;
          border-radius: 18px;
          background: #fff;
          padding: 34px 42px 38px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(15, 32, 64, 0.2);
          animation: reveal-rise .38s cubic-bezier(.16,1,.3,1);
        }
        .draw-sequence-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 5px;
          background: linear-gradient(135deg, #1a3a6e, #2856a0 48%, #c22832, #d93440);
        }
        .draw-sequence-number {
          min-height: 92px;
          color: #204585;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: clamp(64px, 8vw, 104px);
          font-weight: 900;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .draw-sequence-number.rolling {
          animation: draw-roll .32s cubic-bezier(.16,1,.3,1) infinite;
        }
        .draw-result-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 10px;
          max-height: min(58vh, 520px);
          overflow-y: auto;
          padding: 2px;
          scrollbar-width: thin;
          scrollbar-color: #94a3b8 #eef2f7;
        }
        .draw-result-grid::-webkit-scrollbar { width: 8px; }
        .draw-result-grid::-webkit-scrollbar-track { background: #eef2f7; border-radius: 999px; }
        .draw-result-grid::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 999px; }
        .draw-result-item {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
          border: 1px solid #dbe5f2;
          border-radius: 14px;
          background: #f8fbff;
          padding: 12px 14px;
          text-align: left;
          animation: draw-result-in .34s cubic-bezier(.16,1,.3,1) both;
        }
        .draw-result-index {
          display: flex;
          height: 42px;
          width: 42px;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: #1f4ea7;
          color: #fff;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 16px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .draw-result-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #0f2040;
          font-size: 15px;
          font-weight: 900;
        }
        .draw-result-meta {
          margin-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }
        .draw-overlay-card {
          animation: draw-settle 0.72s cubic-bezier(.16,1,.3,1);
        }
        .draw-roll-number {
          animation: draw-roll 1.2s steps(8, end);
        }
        .self-draw-grid {
          display: grid;
          grid-template-columns: minmax(250px, .9fr) minmax(360px, 1.16fr) minmax(250px, .9fr);
          gap: 14px;
          min-height: 0;
          flex: 1;
        }
        .self-draw-panel {
          min-height: 0;
          overflow: hidden;
          border: 1px solid #dbe5f2;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 1px 4px rgba(15, 32, 64, 0.05);
        }
        .self-draw-panel-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
          padding: 14px 16px;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
        }
        .self-draw-count {
          border-radius: 999px;
          background: #eef5ff;
          padding: 3px 9px;
          color: #1f4ea7;
          font-size: 11px;
          font-weight: 900;
        }
        .self-draw-scroll-viewport {
          height: min(460px, calc(100vh - 250px));
          overflow: hidden;
          padding: 14px;
          mask-image: linear-gradient(to bottom, transparent 0, black 24px, black calc(100% - 24px), transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 24px, black calc(100% - 24px), transparent 100%);
        }
        .self-draw-scroll-inner {
          display: flex;
          flex-direction: column;
          gap: 7px;
          will-change: transform;
        }
        .self-draw-project-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid #dbe5f2;
          border-radius: 12px;
          background: #f8fbff;
          padding: 10px 12px;
          color: #0f2040;
          font-size: 13px;
          font-weight: 800;
          transition: background .4s, opacity .4s, transform .4s, padding .4s, box-shadow .4s, border-color .4s;
        }
        .self-draw-project-row.assigned {
          opacity: .36;
        }
        .self-draw-project-row.onstage {
          transform: scale(1.04);
          border-color: #378add;
          background: #1f4ea7;
          color: #fff;
          box-shadow: 0 0 0 2px #378add;
        }
        .self-draw-project-badge {
          flex-shrink: 0;
          border-radius: 999px;
          background: #eef2f7;
          padding: 3px 8px;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 900;
        }
        .self-draw-project-row.assigned .self-draw-project-badge {
          background: #0f2040;
          color: #fff;
        }
        .self-draw-project-row.onstage .self-draw-project-badge {
          background: rgba(255,255,255,.24);
          color: inherit;
        }
        .self-draw-stage {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 22px 18px 18px;
        }
        .self-draw-stage-main {
          position: relative;
          z-index: 1;
          display: flex;
          width: 100%;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transition: opacity .6s ease-out, transform .6s ease-out;
        }
        .self-draw-stage-main.hide {
          opacity: 0;
          transform: scale(.95);
          pointer-events: none;
        }
        .self-draw-step-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 18px;
          font-size: 12px;
          font-weight: 900;
        }
        .self-draw-step-tab {
          border-radius: 999px;
          background: #eef2f7;
          padding: 6px 14px;
          color: #94a3b8;
        }
        .self-draw-step-tab.active {
          background: #0f2040;
          color: #fff;
        }
        .self-draw-step-tab.done {
          background: #e6f1fb;
          color: #1f4ea7;
        }
        .self-draw-who {
          min-height: 30px;
          max-width: 100%;
          overflow: hidden;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #0f2040;
          font-size: 20px;
          font-weight: 900;
        }
        .self-draw-sub {
          min-height: 20px;
          margin-top: 5px;
          margin-bottom: 18px;
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
        }
        .self-draw-reel-box {
          position: relative;
          height: 200px;
          overflow: hidden;
          border: 1px solid #dbe5f2;
          border-radius: 18px;
          background: #f8fbff;
          transition: width .3s ease;
        }
        .self-draw-reel-box.name-mode {
          width: min(100%, 300px);
        }
        .self-draw-reel-box.num-mode {
          width: 180px;
        }
        .self-draw-reel-box::before,
        .self-draw-reel-box::after {
          content: "";
          position: absolute;
          right: 0;
          left: 0;
          z-index: 2;
          height: 60px;
          pointer-events: none;
        }
        .self-draw-reel-box::before {
          top: 0;
          background: linear-gradient(to bottom, #f8fbff, rgba(248,251,255,0));
        }
        .self-draw-reel-box::after {
          bottom: 0;
          background: linear-gradient(to top, #f8fbff, rgba(248,251,255,0));
        }
        .self-draw-reel-window {
          position: absolute;
          top: 50%;
          right: 10px;
          left: 10px;
          z-index: 1;
          height: 56px;
          transform: translateY(-50%);
          border-top: 1px solid #cbd5e1;
          border-bottom: 1px solid #cbd5e1;
          pointer-events: none;
        }
        .self-draw-strip {
          position: absolute;
          top: 50%;
          right: 0;
          left: 0;
          will-change: transform;
        }
        .self-draw-strip-item {
          position: absolute;
          right: 0;
          left: 0;
          display: flex;
          height: 56px;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          text-align: center;
          color: #0f2040;
        }
        .self-draw-strip-item.name {
          font-size: 15px;
          font-weight: 900;
        }
        .self-draw-strip-item.num {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 44px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .self-draw-strip-item.dim {
          color: #94a3b8;
          font-weight: 700;
        }
        .self-draw-flash {
          position: absolute;
          inset: 0;
          z-index: 3;
          border-radius: 18px;
          background: #1f4ea7;
          opacity: 0;
          pointer-events: none;
        }
        .self-draw-flash.fire {
          animation: self-draw-flash .7s ease-out;
        }
        .self-draw-reel-label {
          margin-top: 9px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 900;
          text-align: center;
        }
        .self-draw-controls {
          display: flex;
          justify-content: center;
          margin-top: 18px;
        }
        .self-draw-final-reveal {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          padding: 24px 20px;
          opacity: 0;
          pointer-events: none;
          transition: opacity .7s ease-out;
        }
        .self-draw-final-reveal.show {
          opacity: 1;
          pointer-events: auto;
        }
        .self-draw-reveal-title-row {
          margin-bottom: 16px;
          text-align: center;
        }
        .self-draw-reveal-eyebrow {
          margin-bottom: 6px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .15em;
          opacity: 0;
          transform: translateY(-6px);
          transition: opacity .6s .1s, transform .6s .1s;
        }
        .self-draw-reveal-main {
          margin-bottom: 4px;
          color: #0f2040;
          font-size: 24px;
          font-weight: 900;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity .7s .25s, transform .7s .25s;
        }
        .self-draw-reveal-sub {
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          opacity: 0;
          transition: opacity .6s .5s;
        }
        .self-draw-reveal-divider {
          width: 50px;
          height: 1px;
          margin: 10px auto 14px;
          background: #94a3b8;
          opacity: 0;
          transform: scaleX(0);
          transition: opacity .5s .6s, transform .6s .6s;
        }
        .self-draw-reveal-eyebrow.show,
        .self-draw-reveal-main.show {
          opacity: 1;
          transform: translateY(0);
        }
        .self-draw-reveal-sub.show {
          opacity: 1;
        }
        .self-draw-reveal-divider.show {
          opacity: 1;
          transform: scaleX(1);
        }
        .self-draw-reveal-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 5px 10px;
          width: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .self-draw-reveal-row {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
          border: .5px solid #dbe5f2;
          border-radius: 12px;
          background: #f8fbff;
          padding: 7px 10px;
          color: #0f2040;
          opacity: 0;
          transform: translateX(-12px);
          transition:
            opacity .4s ease-out,
            transform .4s ease-out,
            background .3s,
            box-shadow .3s,
            color .3s;
        }
        .self-draw-reveal-row.show {
          opacity: 1;
          transform: translateX(0);
        }
        .self-draw-reveal-row.pulse {
          background: #1f4ea7;
          color: #fff;
          box-shadow: 0 0 0 2px #378add;
        }
        .self-draw-reveal-num {
          display: flex;
          width: 22px;
          height: 22px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #0f2040;
          color: #fff;
          font-size: 11px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          transition: background .3s, color .3s;
        }
        .self-draw-reveal-row.pulse .self-draw-reveal-num {
          background: #fff;
          color: #1f4ea7;
        }
        .self-draw-reveal-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 900;
        }
        .self-draw-main-button {
          border: 0;
          border-radius: 12px;
          background: #1f4ea7;
          padding: 13px 28px;
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          transition: opacity .2s ease, transform .1s ease, background .2s ease;
        }
        .self-draw-main-button:active:not(:disabled) {
          transform: scale(.97);
        }
        .self-draw-main-button:disabled {
          cursor: not-allowed;
          opacity: .38;
        }
        .self-draw-order-slot {
          display: flex;
          align-items: center;
          gap: 10px;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 800;
          transition: all .4s;
        }
        .self-draw-order-slot.empty {
          background: #f1f5f9;
          color: #94a3b8;
          opacity: .7;
        }
        .self-draw-order-slot.filled {
          border: 1px solid #dbe5f2;
          background: #fff;
          color: #0f2040;
        }
        .self-draw-order-slot.just-filled {
          animation: self-draw-pop .6s ease-out;
          background: #1f4ea7;
          color: #fff;
        }
        .self-draw-order-num {
          display: flex;
          width: 26px;
          height: 26px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 11px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .self-draw-order-slot.empty .self-draw-order-num {
          border: 1px dashed #cbd5e1;
          color: #94a3b8;
        }
        .self-draw-order-slot.filled .self-draw-order-num {
          background: #0f2040;
          color: #fff;
        }
        .self-draw-order-slot.just-filled .self-draw-order-num {
          background: rgba(255,255,255,.25);
          color: inherit;
        }
        @keyframes self-draw-flash {
          0% { opacity: 0; }
          30% { opacity: .4; }
          100% { opacity: 0; }
        }
        @keyframes self-draw-pop {
          0% { transform: scale(.9); }
          50% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        .self-draw-result-notice {
          position: fixed;
          inset: 0;
          z-index: 70;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 32, 64, .16);
          backdrop-filter: blur(4px);
          pointer-events: none;
          animation: notice-fade .24s ease-out both;
        }
        .self-draw-result-card {
          width: min(560px, calc(100vw - 96px));
          border: 1px solid rgba(191, 219, 254, .9);
          border-radius: 28px;
          background: rgba(255, 255, 255, .98);
          padding: 34px 38px;
          text-align: center;
          box-shadow: 0 28px 80px rgba(15, 32, 64, .24);
          animation: draw-settle .52s cubic-bezier(.16,1,.3,1);
        }
        .self-draw-result-number {
          color: #1f4ea7;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: clamp(84px, 10vw, 140px);
          font-weight: 900;
          line-height: .95;
          font-variant-numeric: tabular-nums;
        }
        .screen-full-countdown {
          position: fixed;
          top: 68px;
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #f0f4f9;
        }
        .screen-stage-countdown-card {
          position: relative;
          z-index: 10;
          display: flex;
          width: min(1180px, calc(100vw - 96px));
          min-height: min(720px, calc(100vh - 150px));
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.96);
          padding: clamp(36px, 5vh, 68px);
          text-align: center;
          box-shadow: 0 18px 48px rgba(15, 32, 64, 0.14);
        }
        .screen-stage-label-row {
          position: absolute;
          top: clamp(24px, 3vh, 34px);
          right: clamp(28px, 4vw, 46px);
          left: clamp(28px, 4vw, 46px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .screen-stage-phase-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: #1d4ed8;
          padding: 12px 22px;
          color: #fff;
          font-size: clamp(18px, 2vw, 30px);
          font-weight: 900;
          line-height: 1;
        }
        .screen-stage-phase-badge.qa {
          background: #c22832;
        }
        .screen-stage-order {
          max-width: min(44vw, 520px);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #64748b;
          font-size: clamp(15px, 1.35vw, 22px);
          font-weight: 800;
        }
        .screen-stage-project-title {
          max-width: 1040px;
          color: #0f2040;
          font-size: clamp(42px, 6vw, 86px);
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1.08;
          overflow-wrap: anywhere;
        }
        .screen-stage-countdown-card .countdown-number {
          margin-top: clamp(34px, 5vh, 62px);
          font-size: clamp(118px, 15vw, 220px);
          letter-spacing: 4px;
          text-shadow: none;
        }
        .screen-stage-countdown-card .countdown-number.normal {
          color: #1d4ed8;
        }
        .screen-stage-countdown-card .countdown-number.warn {
          color: #d97706;
          text-shadow: 0 0 42px rgba(217, 119, 6, 0.18);
        }
        .screen-stage-countdown-card .countdown-number.danger {
          color: #c22832;
          text-shadow: 0 0 42px rgba(194, 40, 50, 0.2);
        }
        .screen-stage-timer-label {
          margin-top: clamp(20px, 3vh, 34px);
          color: #64748b;
          font-size: clamp(18px, 1.8vw, 28px);
          font-weight: 800;
        }
        .countdown-number {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: clamp(108px, 15vw, 200px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: 8px;
          text-shadow: 0 0 80px rgba(90, 154, 239, 0.32);
        }
        .countdown-number.normal { color: #fff; }
        .countdown-number.warn { color: #fbbf24; text-shadow: 0 0 80px rgba(251, 191, 36, 0.35); }
        .countdown-number.danger {
          color: #f43f5e;
          text-shadow: 0 0 80px rgba(244, 63, 94, 0.35);
          animation: pulse-timer 0.8s ease infinite;
        }
        .waiting-stage {
          position: relative;
          display: flex;
          min-height: 0;
          flex: 1;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 18px;
          background:
            linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px),
            linear-gradient(150deg, #0f2040 0%, #1a3a6e 46%, #c22832 100%);
          background-size: 72px 72px, 72px 72px, auto;
          box-shadow: 0 18px 48px rgba(15, 32, 64, 0.18);
          color: white;
          text-align: center;
        }
        .waiting-stage::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.14), transparent 42%, rgba(0,0,0,0.16));
        }
        .waiting-stage-content {
          position: relative;
          z-index: 1;
          width: min(1040px, calc(100vw - 120px));
          padding: 72px 32px;
        }
        .waiting-stage-title {
          margin-top: 18px;
          font-size: clamp(50px, 6.2vw, 92px);
          font-weight: 900;
          line-height: 1.04;
          letter-spacing: 0;
          text-shadow: 0 12px 34px rgba(0,0,0,.22);
        }
        .waiting-stage-description {
          margin-top: 28px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.76);
          font-size: clamp(18px, 2vw, 28px);
          font-weight: 800;
        }
        .score-reveal-overlay {
          position: fixed;
          inset: 68px 0 0 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 36px 48px 48px;
          background: #f0f4f9;
          background-image:
            linear-gradient(rgba(26,58,110,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(26,58,110,0.035) 1px, transparent 1px);
          background-size: 96px 96px, 96px 96px;
        }
        .score-reveal-card {
          position: relative;
          margin: 0 auto;
          width: min(1180px, calc(100vw - 96px));
          min-height: min(620px, calc(100vh - 152px));
          overflow: hidden;
          border: 1px solid rgba(207, 224, 255, .95);
          border-radius: 30px;
          background: #fff;
          padding: clamp(54px, 6vh, 78px) clamp(72px, 8vw, 110px) clamp(46px, 5vh, 66px);
          text-align: center;
          box-shadow: 0 18px 48px rgba(29, 92, 255, 0.10);
          animation: reveal-rise 0.5s cubic-bezier(.16,1,.3,1);
          will-change: transform, opacity;
        }
        .score-reveal-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 4px;
          background: #1d5cff;
        }
        .score-reveal-project-name {
          opacity: 0;
          transform: translateY(-12px);
          color: #0f2040;
          font-size: clamp(36px, 5.2vw, 76px);
          font-weight: 900;
          letter-spacing: 0;
          transition: opacity .5s ease-out, transform .5s ease-out;
        }
        .score-reveal-project-name.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .score-reveal-score {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: clamp(120px, 35vh, 320px);
          font-weight: 900;
          line-height: 1;
          transform: scale(.96);
          opacity: 0;
          color: #1d5cff;
          font-variant-numeric: tabular-nums;
          transition: opacity .4s ease-out, transform .4s ease-out;
          will-change: contents;
        }
        .score-reveal-score.visible {
          opacity: 1;
          transform: scale(1);
        }
        .score-reveal-score.pop {
          transform: scale(1.05);
          transition: transform .12s ease-out;
        }
        .score-reveal-underline {
          height: 1px;
          width: 0;
          margin: 24px auto 0;
          background: rgba(29, 92, 255, .38);
          transition: width .45s cubic-bezier(.22, 1, .36, 1);
        }
        .score-reveal-underline.visible { width: 180px; }
        .score-reveal-caption {
          margin-top: 24px;
          opacity: 0;
          color: rgba(15, 23, 42, .42);
          font-size: clamp(13px, 1.5vh, 16px);
          font-weight: 800;
          letter-spacing: .1em;
          transition: opacity .5s ease-out;
        }
        .score-reveal-caption.visible { opacity: 1; }
        .expert-seat {
          position: relative;
          overflow: hidden;
          border: 2px solid #e2e8f0;
          border-radius: 14px;
          background: #fff;
          transition: border-color .35s, background .35s, box-shadow .35s, transform .35s;
        }
        .expert-seat::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 3px;
          background: #e2e8f0;
          transition: background .35s;
        }
        .expert-seat.submitted {
          border-color: rgba(34, 197, 94, 0.32);
          background: #f0fdf4;
          box-shadow: 0 4px 18px rgba(34, 197, 94, 0.1);
        }
        .expert-seat.submitted::before { background: #22c55e; }
        .expert-seat.dropped {
          border-color: #e2e8f0;
          background: #f8f9fa;
          opacity: .52;
          transform: scale(.92);
          filter: grayscale(1);
        }
        .expert-seat.dropped::before { background: #cbd5e1; }
        .drop-reason-tag {
          position: absolute;
          top: 9px;
          left: 50%;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #fff1f2;
          padding: 3px 8px;
          color: #e11d48;
          font-size: 11px;
          font-weight: 900;
          animation: reveal-rise .38s cubic-bezier(.16,1,.3,1);
        }
        .score-strike {
          position: relative;
          display: inline-block;
          color: #94a3b8;
        }
        .score-strike::after {
          content: "";
          position: absolute;
          left: -4px;
          right: -4px;
          top: 50%;
          height: 3px;
          border-radius: 999px;
          background: #e11d48;
          animation: strike-line .42s cubic-bezier(.16,1,.3,1);
        }
        .seat-avatar {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 900;
          position: relative;
        }
        .seat-avatar.pending {
          border: 2px solid #dce8f8;
          background: linear-gradient(135deg, #edf3fc, #dce8f8);
          color: #2856a0;
        }
        .seat-avatar.submitted {
          border: 2px solid rgba(34, 197, 94, 0.24);
          background: linear-gradient(135deg, #dcfce7, #f0fdf4);
          color: #16a34a;
        }
        .seat-avatar.submitted::after {
          content: "✓";
          position: absolute;
          right: -2px;
          bottom: -2px;
          width: 18px;
          height: 18px;
          border: 2px solid #f0fdf4;
          border-radius: 999px;
          background: #22c55e;
          color: white;
          font-size: 10px;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .waiting-dots {
          display: inline-flex;
          gap: 3px;
          align-items: center;
        }
        .waiting-dots i {
          display: block;
          width: 4px;
          height: 4px;
          border-radius: 999px;
          background: #94a3b8;
          animation: dot-breathe 1.4s ease infinite;
        }
        .waiting-dots i:nth-child(2) { animation-delay: .2s; }
        .waiting-dots i:nth-child(3) { animation-delay: .4s; }
        .seat-pop { animation: seat-pop .5s ease; }
        .seat-score-ticker {
          color: #16a34a;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 26px;
          font-weight: 900;
          line-height: 1;
          animation: score-pop .58s cubic-bezier(.16,1,.3,1);
        }
        @keyframes dot-breathe {
          0%, 80%, 100% { opacity: .32; transform: scale(.8); }
          40% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes seat-pop {
          0% { transform: scale(1); }
          30% { transform: scale(1.06); }
          60% { transform: scale(.97); }
          100% { transform: scale(1); }
        }
        @keyframes score-pop {
          from { transform: translateY(8px) scale(.92); opacity: 0; filter: blur(4px); }
          to { transform: translateY(0) scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes strike-line {
          from { transform: scaleX(0); transform-origin: left center; }
          to { transform: scaleX(1); transform-origin: left center; }
        }
        @keyframes strip-slide {
          from { transform: translateY(24px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse-timer {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .58; transform: scale(.985); }
        }
        @keyframes reveal-rise {
          from { transform: translateY(18px) scale(.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes draw-roll {
          from { filter: blur(4px); transform: translateY(-6px); }
          to { filter: blur(0); transform: translateY(0); }
        }
        @keyframes draw-settle {
          from { transform: translateY(10px); opacity: .4; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes draw-result-in {
          from { transform: translateY(10px) scale(.98); opacity: 0; filter: blur(3px); }
          to { transform: translateY(0) scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes self-draw-action-pulse {
          0%, 100% { box-shadow: 0 10px 22px rgba(194,40,50,.18); }
          50% { box-shadow: 0 14px 30px rgba(194,40,50,.3); }
        }
        @keyframes self-draw-wheel-pulse {
          0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 12px 30px rgba(31,78,167,.10); }
          50% { transform: translateY(-3px) scale(1.015); box-shadow: 0 18px 40px rgba(31,78,167,.18); }
        }
        @keyframes notice-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes panel-in {
          from { transform: translateY(8px); opacity: .2; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <header className="screen-banner screen-hero-gradient relative z-50 flex items-center justify-between px-11 text-white">
        <div className="relative z-10 flex min-w-0 items-center gap-4">
          <Image
            alt="南京铁道职业技术学院校徽"
            className="h-14 w-14 shrink-0 rounded-full bg-white object-contain shadow-sm ring-1 ring-white/50"
            height={56}
            priority
            src="/brand/njrts-logo.png"
            width={56}
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black tracking-[0.5px]">南京铁道职业技术学院</h1>
            <p className="mt-0.5 truncate text-sm font-semibold tracking-[0.5px] text-white/75">{title}</p>
          </div>
        </div>
        <div className="relative z-10 shrink-0">
          <span className="rounded-lg border border-white/20 bg-white/12 px-5 py-2 text-sm font-bold tracking-wide">
            {payload?.session.phaseLabel ?? getPhaseLabel(phase)}
          </span>
        </div>
      </header>

      <div className="sr-only">{screenStateLabels.join(" / ")}</div>

      {errorMessage ? (
        <div className="mx-11 mt-5 rounded-xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm font-bold text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="phase-panel flex h-[calc(100vh-68px)] flex-col gap-5 overflow-hidden px-11 py-6">
        {activeTab === "waiting" && waitingScreen ? (
          <div className="waiting-stage">
            <div className="waiting-stage-content">
              <h2 className="waiting-stage-title">{waitingScreen.title}</h2>
              <p className="waiting-stage-description">{waitingScreen.description}</p>
              {phase === "draw" && !selfDrawModeActive && !hasDrawStarted && projectOrder.length > 0 ? (
                <button
                  className="mt-9 rounded-2xl bg-[#1f4ea7] px-10 py-5 text-2xl font-black text-white shadow-[0_18px_42px_rgba(31,78,167,0.25)] transition hover:-translate-y-0.5 hover:bg-[#1a3f86] disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={drawOrderSubmitting}
                  onClick={() => void drawReviewScreenOrderFromScreen()}
                  type="button"
                >
                  {drawOrderSubmitting ? "正在生成顺序" : "开始随机抽签"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "draw" ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black tracking-[2px] text-[#c22832]">路演抽签</p>
                <h2 className="mt-1 text-2xl font-black text-[#0f2040]">路演顺序抽签</h2>
              </div>
              <div className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">
                共 {projectOrder.length || totalCount || 0} 个项目
              </div>
            </div>

            {isWaitingNextProject ? (
              <div className="contest-card flex shrink-0 items-center justify-between gap-6 px-6 py-5">
                <div>
                  <p className="text-xs font-black tracking-[2px] text-blue-600">下一项目</p>
                  <h3 className="mt-1 text-3xl font-black text-[#0f2040]">请等待下一个项目路演开始</h3>
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    第 {orderNumber} / {Math.max(totalCount, projectOrder.length, 1)} 项 · {targetName}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-right">
                  <p className="text-xs font-bold text-blue-500">现场状态</p>
                  <p className="mt-1 text-xl font-black text-blue-700">等待管理员开始路演</p>
                </div>
              </div>
            ) : null}

            {selfDrawModeActive && !hasDrawStarted ? (
              <div className="self-draw-grid overflow-hidden">
                <article className="self-draw-panel">
                  <div className="self-draw-panel-title">
                    <span>项目池</span>
                    <span className="self-draw-count">{pendingSelfDrawProjects.length} 待抽</span>
                  </div>
                  <div className="self-draw-scroll-viewport">
                    <div className="self-draw-scroll-inner self-draw-project-pool" ref={selfDrawProjectPoolRef}>
                      {projectOrder.map((item) => {
                        const assigned = Boolean(item.selfDrawnAt);
                        const onstage = item.packageId === selectedSelfDrawProject?.packageId && !assigned;
                        return (
                          <div
                            className={`self-draw-project-row ${assigned ? "assigned" : ""} ${onstage ? "onstage" : ""}`}
                            key={item.packageId}
                          >
                            <span className="min-w-0 truncate">{item.targetName}</span>
                            <span className="self-draw-project-badge">
                              {assigned ? `第 ${item.orderIndex + 1} 位` : onstage ? "上台中" : "待抽"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>

                <article aria-label="自助抽签" className="self-draw-panel self-draw-stage">
                  <div className={`self-draw-stage-main ${selfDrawRevealStageHidden ? "hide" : ""}`}>
                    <div className="self-draw-step-tabs">
                      <span
                        className={`self-draw-step-tab ${
                          selectedSelfDrawProject || selfDrawStagePhase === "pickNum" || selfDrawStagePhase === "done"
                            ? "done"
                            : "active"
                        }`}
                      >
                        ① 抽上台项目
                      </span>
                      <span
                        className={`self-draw-step-tab ${
                          selfDrawStagePhase === "awaitNum" || selfDrawStagePhase === "pickNum"
                            ? "active"
                            : selfDrawStagePhase === "done"
                              ? "done"
                              : ""
                        }`}
                      >
                        ② 抽路演序号
                      </span>
                    </div>
                    <p className="self-draw-who">{selfDrawStageTitle}</p>
                    <p className="self-draw-sub">{selfDrawStageSubTitle}</p>

                    <div className={`self-draw-reel-box ${selfDrawReelMode === "name" ? "name-mode" : "num-mode"}`}>
                      <div className="self-draw-reel-window" />
                      <div
                        className="self-draw-strip"
                        ref={selfDrawReelRef}
                        style={{
                          transform: `translateY(${selfDrawReelTranslateY}px)`,
                          transition: selfDrawReelTransition,
                        }}
                      >
                        {selfDrawReelItems.map((item, index) => (
                          <div
                            className={`self-draw-strip-item ${selfDrawReelMode} ${item.dim ? "dim" : ""}`}
                            key={`${item.value}-${index}`}
                            style={{ top: index * SELF_DRAW_ITEM_HEIGHT - SELF_DRAW_ITEM_HEIGHT / 2 }}
                          >
                            {item.value}
                          </div>
                        ))}
                      </div>
                      <div className={`self-draw-flash ${selfDrawFlashKey ? "fire" : ""}`} key={selfDrawFlashKey} />
                    </div>
                    <p className="self-draw-reel-label">
                      {selfDrawReelMode === "name" ? "— 上台项目 —" : "— 路演顺序号 —"}
                    </p>

                    <div className="self-draw-controls">
                      <button
                        className="self-draw-main-button"
                        disabled={selfDrawMainSubmitting || selfDrawReelSpinning || selfDrawStagePhase === "done"}
                        onClick={() => void handleSelfDrawMainAction()}
                        type="button"
                      >
                        {selfDrawButtonText}
                      </button>
                    </div>
                  </div>

                  <div className={`self-draw-final-reveal ${selfDrawRevealVisible ? "show" : ""}`}>
                    <div className="self-draw-reveal-title-row">
                      <p className={`self-draw-reveal-eyebrow ${selfDrawRevealHeaderVisible ? "show" : ""}`}>
                        — 抽签完成 —
                      </p>
                      <h2 className={`self-draw-reveal-main ${selfDrawRevealHeaderVisible ? "show" : ""}`}>
                        最终路演顺序
                      </h2>
                      <p className={`self-draw-reveal-sub ${selfDrawRevealHeaderVisible ? "show" : ""}`}>
                        共 {selfDrawRevealRows.length || projectOrder.length} 个项目 · 全程随机抽取
                      </p>
                      <div className={`self-draw-reveal-divider ${selfDrawRevealHeaderVisible ? "show" : ""}`} />
                    </div>

                    <div className="self-draw-reveal-grid">
                      {selfDrawRevealRows.map((item, index) => {
                        const inScanTail =
                          selfDrawRevealScanIndex !== null &&
                          index <= selfDrawRevealScanIndex &&
                          index >= selfDrawRevealScanIndex - 2;
                        return (
                          <div
                            className={`self-draw-reveal-row ${index < selfDrawRevealRowsVisible ? "show" : ""} ${inScanTail ? "pulse" : ""}`}
                            key={item.packageId}
                          >
                            <span className="self-draw-reveal-num">{item.orderIndex + 1}</span>
                            <span className="self-draw-reveal-name">{item.targetName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>

                <article className="self-draw-panel">
                  <div className="self-draw-panel-title">
                    <span>路演顺序</span>
                    <span className="self-draw-count">{selfDrawAssignedCount} / {projectOrder.length}</span>
                  </div>
                  <div className="self-draw-scroll-viewport">
                    <div className="self-draw-scroll-inner self-draw-order-board" ref={selfDrawOrderBoardRef}>
                      {selfDrawOrderSlots.map((item) => {
                        const filled = Boolean(item.selfDrawnAt);
                        const justFilled = selfDrawJustFilledOrderIndex === item.orderIndex;
                        return (
                          <div
                            className={`self-draw-order-slot ${filled ? "filled" : "empty"} ${justFilled ? "just-filled" : ""}`}
                            key={item.packageId}
                          >
                            <span className="self-draw-order-num">{item.orderIndex + 1}</span>
                            <span className="min-w-0 truncate">{filled ? item.targetName : "待定"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              </div>
            ) : (
              <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 overflow-y-auto">
                {visibleDrawGroups.length ? (
                  visibleDrawGroups.map((group) => (
                  <article className="contest-card draw-overlay-card overflow-hidden" key={group.name}>
                    <div className="flex items-center justify-between border-b border-slate-200 bg-[linear-gradient(135deg,rgba(26,58,110,0.06),rgba(194,40,50,0.04))] px-5 py-4">
                      <h3 className="text-sm font-black text-[#1a3a6e]">{group.name}</h3>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-400">{group.projects.length} 个项目</span>
                    </div>
                    <div className="p-3">
                      {group.projects.map((item) => (
                        <div className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors odd:bg-slate-50" key={item.packageId}>
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full screen-hero-gradient text-xs font-black text-white ${item.orderIndex === currentIndex ? "draw-roll-number" : ""}`}>
                            {item.selfDrawnAt ? item.orderIndex + 1 : "待"}
                          </span>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate text-sm font-bold text-slate-900">{item.targetName}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-400">{item.roundLabel || "项目路演"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                  ))
                ) : (
                  <div className="contest-card col-span-full flex min-h-[420px] flex-col items-center justify-center text-center text-slate-400">
                    <ShieldCheck className="h-14 w-14 text-blue-200" />
                    <p className="mt-4 text-base font-black text-slate-500">等待项目确认出场顺序</p>
                    <p className="mt-1 text-sm">管理员确认路演顺序后，大屏会同步展示；抽签不代表评审已经开始。</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}

        {activeTab === "score" ? (
          <>
            <div className="contest-card flex shrink-0 items-center gap-4 px-6 py-4">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${phase === "scoring" ? "bg-rose-50 text-[#c22832]" : "bg-blue-50 text-blue-600"}`}>
                <Clock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-400">评分倒计时</p>
                <p className={`mt-0.5 font-mono text-3xl font-black tracking-[2px] ${countdownTone === "danger" ? "text-rose-600 animate-pulse" : countdownTone === "warn" ? "text-amber-600" : "text-blue-700"}`}>
                  {formatSeconds(phase === "scoring" ? phaseRemaining : payload?.session.scoringSeconds ?? 60)}
                </p>
              </div>
              <span className={`rounded-full px-4 py-2 text-xs font-bold ${phase === "scoring" ? "bg-rose-50 text-[#c22832]" : phase === "reveal" || phase === "finished" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-600"}`}>
                {phase === "scoring" ? "评分中" : phase === "reveal" || phase === "finished" ? "已截止" : "等待开始"}
              </span>
            </div>

            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_190px] gap-4">
              <article className="contest-card flex items-center gap-5 px-7 py-6">
                <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[14px] screen-hero-gradient font-mono text-2xl font-black text-white shadow-[0_4px_14px_rgba(26,58,110,0.2)]">
                  {String(orderNumber).padStart(2, "0")}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black tracking-[2px] text-blue-600">当前评审项目</p>
                  <h2 className="mt-1 truncate text-3xl font-black text-[#0f2040]">{targetName}</h2>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-500">
                    {payload?.reviewPackage.roundLabel || "项目路演评审"} · 路演顺序 {orderNumber}/{Math.max(totalCount, projectOrder.length, 1)}
                  </p>
                </div>
              </article>

              <aside className="contest-card flex flex-col items-center justify-center gap-2 px-6 py-5">
                <div className="relative h-[72px] w-[72px]">
                  <svg className="-rotate-90" viewBox="0 0 68 68">
                    <circle cx="34" cy="34" fill="none" r="30" stroke="#f0f4f9" strokeWidth="5" />
                    <circle
                      cx="34"
                      cy="34"
                      fill="none"
                      r="30"
                      stroke="#22c55e"
                      strokeDasharray="188"
                      strokeDashoffset={progressOffset}
                      strokeLinecap="round"
                      strokeWidth="5"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-base font-black">{progressText}</span>
                </div>
                <p className="text-xs font-bold text-slate-400">提交进度</p>
              </aside>
            </div>

            <div className="grid flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(156px,1fr))] gap-3 overflow-y-auto">
              {seats.map((seat) => {
                const isSubmitted = seat.status === "submitted";
                const isVoided = isExcludedSeatStatus(seat.status);
                const dropReason = droppedSeatReasonByNo.get(seat.seatNo);
                const isDropped = phase === "reveal" && Boolean(dropReason);
                return (
                  <article
                    className={`expert-seat flex flex-col items-center justify-center gap-3 p-5 text-center ${isSubmitted ? "submitted" : ""} ${isSubmitted && seatPulse ? "seat-pop" : ""} ${isVoided ? "opacity-45 grayscale" : ""} ${isDropped ? "dropped" : ""}`}
                    key={seat.assignmentId}
                  >
                    {isDropped ? <span className="drop-reason-tag">{getDropReasonLabel(dropReason)}</span> : null}
                    <div className={`seat-avatar ${isSubmitted ? "submitted" : "pending"}`}>{seat.seatNo}</div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{seat.displayName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">匿名专家席位状态</p>
                    </div>
                    {phase === "scoring" && isSubmitted && seat.scoreText && screenDisplay.showScoresOnScreen ? (
                      <p className={`seat-score-ticker ${isDropped ? "score-strike" : ""}`}>{seat.scoreText}</p>
                    ) : null}
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${isSubmitted ? "bg-emerald-50 text-emerald-700" : isVoided ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-400"}`}>
                      {isSubmitted ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {screenDisplay.showScoresOnScreen ? "已出分" : "已提交"}
                        </>
                      ) : isVoided ? (
                        "已排除"
                      ) : (
                        <>
                          <span className="waiting-dots"><i /><i /><i /></span>
                          等待中
                        </>
                      )}
                    </span>
                  </article>
                );
              })}
            </div>

            {projectOrder.length > 1 ? (
              <div className="flex shrink-0 items-center justify-between border-t border-slate-200 pt-3">
                <div className="flex flex-wrap gap-1.5">
                  {projectOrder.map((project, index) => {
                    const result = projectResults.find((item) => item.reviewPackage.id === project.packageId);
                    const isDone = Boolean(project.revealedAt || result?.finalScore.ready);
                    const isCurrent = project.packageId === payload?.session.currentPackageId;
                    return (
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-[10px] border text-xs font-black ${
                          isCurrent
                            ? "border-[#1a3a6e] bg-[#1a3a6e] text-white shadow-[0_2px_8px_rgba(26,58,110,0.25)]"
                            : isDone
                              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                              : "border-slate-200 bg-white text-slate-500"
                        }`}
                        key={project.packageId}
                      >
                        {index + 1}
                      </span>
                    );
                  })}
                </div>
                <p className="text-xs font-bold text-slate-400">项目导航 · 当前蓝色高亮 · 已完成绿色</p>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === "rank" ? (
          <FinalRankingStage
            rankings={rankingRows.map((row, index) => ({
              rank: index + 1,
              projectName: row.project.reviewPackage.targetName,
              presentationOrder: row.roadshowOrder || index + 1,
              trackName: row.project.reviewPackage.roundLabel || "项目路演评审",
              score: row.score ?? 0,
            }))}
            roundLabel={`共 ${rankingRows.length} 项`}
            sessionTitle={title}
          />
        ) : null}
      </section>

      {phase === "presentation" || phase === "qa" ? (
        <section className="screen-full-countdown">
          <div className="screen-stage-countdown-card">
            <div className="screen-stage-label-row">
              <span className={`screen-stage-phase-badge ${phase === "qa" ? "qa" : ""}`}>
                {phase === "presentation" ? "路演展示" : "答辩提问"}
              </span>
              <span className="screen-stage-order">
                {payload?.reviewPackage.roundLabel || "项目路演评审"} · 第 {orderNumber} / {Math.max(totalCount, projectOrder.length, 1)} 项
              </span>
            </div>
            <h2 className="screen-stage-project-title">{targetName}</h2>
            <p className={`countdown-number mt-8 ${countdownTone}`}>{formatSeconds(phaseRemaining)}</p>
            <p className="screen-stage-timer-label">
              {phase === "presentation" ? "路演展示时间" : "专家提问时间"}
            </p>
          </div>
        </section>
      ) : null}

      {drawEnabled && drawOverlayActive ? (
        <section className="draw-sequence-overlay">
          <div className="draw-sequence-card">
            <div className="flex items-start justify-between gap-6 text-left">
              <div>
                <p className="text-sm font-black tracking-[3px] text-[#c22832]">公开抽签结果</p>
                <h2 className="mt-2 text-3xl font-black text-[#0f2040]">本轮路演顺序生成中</h2>
                <p className="mt-2 text-sm font-bold text-slate-500">
                  共 {projectOrder.length} 个项目 · 随机抽签结果同步大屏并写入审计日志
                </p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-right">
                <p className="text-xs font-black text-blue-500">已揭示</p>
                <p className="mt-1 font-mono text-2xl font-black text-blue-700 tabular-nums">
                  {drawRevealedCount}/{projectOrder.length}
                </p>
              </div>
            </div>

            {drawOverlayRolling ? (
              <div className="mt-12 flex flex-col items-center justify-center">
                <p className={`draw-sequence-number rolling`}>
                  {String(drawRollingNumber).padStart(2, "0")}
                </p>
                <p className="mt-4 min-h-7 max-w-[620px] truncate text-xl font-black text-slate-900">
                  {drawRollingProject?.targetName ?? "项目顺序滚动中"}
                </p>
                <p className="mt-2 text-sm font-bold text-blue-500">正在随机生成路演顺序</p>
              </div>
            ) : (
              <div className="mt-8">
                <div className="draw-result-grid">
                  {visibleDrawRevealBatches.flatMap((batch, batchIndex) =>
                    batch.map((item, itemIndex) => (
                      <div
                        className="draw-result-item"
                        key={item.packageId}
                        style={{ animationDelay: `${itemIndex * 38}ms` }}
                      >
                        <span className="draw-result-index">{String(item.orderIndex + 1).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <p className="draw-result-title">{item.targetName}</p>
                          <p className="draw-result-meta">
                            {item.groupName || `第 ${batchIndex + 1} 批`} · {item.roundLabel || "项目路演"}
                          </p>
                        </div>
                      </div>
                    )),
                  )}
                </div>
                <p className={`mt-6 text-center text-sm font-black ${drawOverlayFinishing ? "text-emerald-600" : "text-blue-600"}`}>
                  {drawOverlayFinishing ? "抽签结果已生成，等待管理员开始路演" : "抽签结果正在分批揭示"}
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {selfDrawResultNotice ? (
        <section className="self-draw-result-notice">
          <div className="self-draw-result-card">
            <p className="text-xs font-black tracking-[4px] text-[#c22832]">抽签确认</p>
            <p className="self-draw-result-number mt-3">
              {String(selfDrawResultNotice.orderIndex + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-4 truncate text-3xl font-black text-[#0f2040]">
              {selfDrawResultNotice.targetName}
            </h2>
            <p className="mt-3 text-base font-bold text-slate-500">已进入左侧路演顺序，等待下一次抽签</p>
          </div>
        </section>
      ) : null}

      {screenDisplay.showFinalScoreOnScreen && phase === "reveal" ? (
        <section className="score-reveal-overlay">
          <div className="score-reveal-card">
            <p className="text-base font-black tracking-[4px] text-blue-600">最终得分</p>
            <h2 className={`score-reveal-project-name mx-auto mt-5 max-w-[980px] truncate ${revealProjectVisible ? "visible" : ""}`}>
              {targetName}
            </h2>
            <p className={`score-reveal-score mt-8 ${revealScoreVisible ? "visible" : ""} ${revealScoreSettling ? "pop" : ""}`}>
              {revealAnimatedScore}
            </p>
            <div className={`score-reveal-underline ${revealUnderlineVisible ? "visible" : ""}`} />
            <p className={`score-reveal-caption ${revealCaptionVisible ? "visible" : ""}`}>按本轮评分规则计算</p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
