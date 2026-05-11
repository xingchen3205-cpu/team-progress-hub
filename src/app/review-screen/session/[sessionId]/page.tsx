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

const fallbackSeats: ScreenSeat[] = [
  { assignmentId: "fallback-1", seatNo: 1, displayName: "专家 1", avatarText: "1", status: "pending", scoreText: null },
  { assignmentId: "fallback-2", seatNo: 2, displayName: "专家 2", avatarText: "2", status: "pending", scoreText: null },
  { assignmentId: "fallback-3", seatNo: 3, displayName: "专家 3", avatarText: "3", status: "pending", scoreText: null },
];

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
  const [selfDrawCandidateRolling, setSelfDrawCandidateRolling] = useState(false);
  const [selfDrawCandidateFrameTime, setSelfDrawCandidateFrameTime] = useState(() => Date.now());
  const [selfDrawCandidateSubmitting, setSelfDrawCandidateSubmitting] = useState(false);
  const [selfDrawRollingPackageId, setSelfDrawRollingPackageId] = useState<string | null>(null);
  const [selfDrawRollFrameTime, setSelfDrawRollFrameTime] = useState(() => Date.now());
  const [selfDrawSubmitting, setSelfDrawSubmitting] = useState(false);

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
  const drawEnabled = selfDrawEnabled || (phase === "draw" && hasDrawStarted);
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
  const visibleDrawGroups = drawEnabled && (hasDrawStarted || screenDisplay.selfDrawEnabled) ? drawGroups : [];
  const pendingSelfDrawProjects = useMemo(
    () => projectOrder.filter((project) => !project.selfDrawnAt),
    [projectOrder],
  );
  const pendingSelfDrawKey = useMemo(
    () => pendingSelfDrawProjects.map((project) => project.packageId).join("|"),
    [pendingSelfDrawProjects],
  );
  const persistedSelfDrawCandidateId = payload?.session.currentPackageId ?? null;
  const selectedSelfDrawProject =
    pendingSelfDrawProjects.find((project) => project.packageId === selfDrawCandidatePackageId) ??
    pendingSelfDrawProjects.find((project) => project.packageId === persistedSelfDrawCandidateId) ??
    null;
  const rollingSelfDrawCandidate =
    selfDrawCandidateRolling && pendingSelfDrawProjects.length
      ? pendingSelfDrawProjects[Math.floor(selfDrawCandidateFrameTime / 78) % pendingSelfDrawProjects.length]
      : null;
  const selfDrawAvailableSlotIndexes = useMemo(
    () => projectOrder.filter((project) => !project.selfDrawnAt).map((project) => project.orderIndex),
    [projectOrder],
  );
  const selfDrawRollingSlotIndex =
    selfDrawRollingPackageId && selfDrawAvailableSlotIndexes.length
      ? selfDrawAvailableSlotIndexes[Math.floor(selfDrawRollFrameTime / 86) % selfDrawAvailableSlotIndexes.length]
      : null;
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
    if (!selfDrawEnabled || phase !== "draw") {
      setSelfDrawCandidatePackageId(null);
      setSelfDrawCandidateRolling(false);
      setSelfDrawRollingPackageId(null);
      return;
    }

    if (!pendingSelfDrawProjects.length) {
      setSelfDrawCandidatePackageId(null);
      setSelfDrawCandidateRolling(false);
      setSelfDrawRollingPackageId(null);
      return;
    }

    if (
      selfDrawCandidatePackageId &&
      !pendingSelfDrawProjects.some((project) => project.packageId === selfDrawCandidatePackageId)
    ) {
      setSelfDrawCandidatePackageId(null);
    }
  }, [pendingSelfDrawKey, pendingSelfDrawProjects, phase, selfDrawCandidatePackageId, selfDrawEnabled]);

  useEffect(() => {
    if (!selfDrawEnabled || phase !== "draw") return;
    const currentPackageId = payload?.session.currentPackageId ?? null;
    if (currentPackageId && pendingSelfDrawProjects.some((project) => project.packageId === currentPackageId)) {
      setSelfDrawCandidatePackageId(currentPackageId);
    }
  }, [payload?.session.currentPackageId, pendingSelfDrawProjects, phase, selfDrawEnabled]);

  useEffect(() => {
    if (!selfDrawCandidateRolling) return;

    let frameId = 0;
    const tick = () => {
      setSelfDrawCandidateFrameTime(Date.now());
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [selfDrawCandidateRolling]);

  useEffect(() => {
    if (!selfDrawRollingPackageId) return;

    let frameId = 0;
    const tick = () => {
      setSelfDrawRollFrameTime(Date.now());
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [selfDrawRollingPackageId]);

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
    selfDrawEnabled && projectOrder.some((project) => !project.selfDrawnAt);
  const isWaitingNextProject =
    drawEnabled &&
    phase === "draw" &&
    hasDrawStarted &&
    projectOrder.length > 0 &&
    Boolean(payload?.session.currentPackageId) &&
    !drawOverlayActive &&
    !hasPendingSelfDrawProjects;

  const drawReviewScreenOrderFromScreen = async () => {
    if (!params.sessionId || !token || selfDrawEnabled || phase !== "draw" || drawOrderSubmitting) {
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
    if (!params.sessionId || !token || !selfDrawEnabled || phase !== "draw") {
      return;
    }

    try {
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
      setSelfDrawCandidatePackageId(candidatePackageId);
      setPayload((current) =>
        current
          ? {
              ...current,
              session: {
                ...current.session,
                currentPackageId: data?.session?.currentPackageId ?? candidatePackageId,
              },
            }
          : current,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "抽取上台项目失败，请重试");
    }
  };

  const selfDrawProject = async (packageId: string) => {
    if (!params.sessionId || !token || !screenDisplay.selfDrawEnabled || phase !== "draw") {
      return;
    }

    try {
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
            message?: string;
          }
        | null;
      if (!response.ok) {
        throw new Error(data?.message ?? "抽签失败，请重试");
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
                },
              }
            : current,
        );
        setSelfDrawCandidatePackageId(null);
        setSelfDrawRollingPackageId(null);
        setSelfDrawRollFrameTime(Date.now());
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "抽签失败，请重试");
      setSelfDrawRollingPackageId(null);
    }
  };

  const toggleSelfDrawCandidateRolling = async () => {
    if (selfDrawCandidateSubmitting || selfDrawSubmitting || selfDrawRollingPackageId || selectedSelfDrawProject) {
      return;
    }

    if (!selfDrawCandidateRolling) {
      setErrorMessage("");
      setSelfDrawCandidateRolling(true);
      setSelfDrawCandidateFrameTime(Date.now());
      return;
    }

    setSelfDrawCandidateSubmitting(true);
    try {
      await drawSelfDrawCandidate();
    } finally {
      setSelfDrawCandidateRolling(false);
      setSelfDrawCandidateSubmitting(false);
    }
  };

  const toggleSelfDrawSlotRolling = async () => {
    if (!selectedSelfDrawProject || selfDrawSubmitting || selfDrawCandidateRolling || selfDrawCandidateSubmitting) {
      return;
    }

    if (!selfDrawRollingPackageId) {
      setErrorMessage("");
      setSelfDrawRollingPackageId(selectedSelfDrawProject.packageId);
      setSelfDrawRollFrameTime(Date.now());
      return;
    }

    setSelfDrawSubmitting(true);
    try {
      await selfDrawProject(selfDrawRollingPackageId);
    } finally {
      setSelfDrawSubmitting(false);
    }
  };

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
        .self-draw-board {
          display: grid;
          grid-template-columns: minmax(0, 1.16fr) minmax(380px, .84fr);
          gap: 18px;
          min-height: 0;
        }
        .self-draw-panel {
          min-height: 0;
          overflow: hidden;
          border: 1px solid #dbe5f2;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 1px 4px rgba(15, 32, 64, 0.05);
        }
        .self-draw-slots {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 12px;
          max-height: calc(100vh - 270px);
          overflow-y: auto;
          padding: 16px;
          scrollbar-width: thin;
          scrollbar-color: #94a3b8 #eef2f7;
        }
        .self-draw-slots::-webkit-scrollbar,
        .self-draw-pool::-webkit-scrollbar { width: 8px; }
        .self-draw-slots::-webkit-scrollbar-track,
        .self-draw-pool::-webkit-scrollbar-track { background: #eef2f7; border-radius: 999px; }
        .self-draw-slots::-webkit-scrollbar-thumb,
        .self-draw-pool::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 999px; }
        .self-draw-slot {
          display: grid;
          grid-template-columns: 46px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
          min-height: 72px;
          border: 1px solid #dbe5f2;
          border-radius: 14px;
          background: #f8fbff;
          padding: 12px;
          transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
        }
        .self-draw-slot.filled {
          background: #ffffff;
          border-color: #bfdbfe;
        }
        .self-draw-slot.rolling {
          transform: translateY(-2px) scale(1.015);
          border-color: #2563eb;
          background: #eff6ff;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, .12), 0 12px 24px rgba(37, 99, 235, .16);
        }
        .self-draw-slot.just-filled {
          animation: draw-result-in .42s cubic-bezier(.16,1,.3,1) both;
        }
        .self-draw-index {
          display: flex;
          height: 46px;
          width: 46px;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: #1f4ea7;
          color: #fff;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 17px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .self-draw-pool {
          max-height: calc(100vh - 430px);
          overflow-y: auto;
          padding-right: 4px;
        }
        .self-draw-project-button {
          width: 100%;
          border: 1px solid #dbe5f2;
          border-radius: 14px;
          background: #fff;
          padding: 12px 14px;
          text-align: left;
          transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
        }
        .self-draw-project-button:hover {
          transform: translateY(-1px);
          border-color: #93c5fd;
          background: #f8fbff;
        }
        .self-draw-project-button.selected {
          border-color: #2563eb;
          background: #eff6ff;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, .10);
        }
        .self-draw-action {
          transition: transform .16s ease, background .16s ease;
        }
        .self-draw-action:active {
          transform: scale(.985);
        }
        .self-draw-action.rolling {
          animation: self-draw-action-pulse 1.1s ease-in-out infinite;
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
              {phase === "draw" && !selfDrawEnabled && !hasDrawStarted && projectOrder.length > 0 ? (
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

            {selfDrawEnabled && !hasDrawStarted ? (
              <div className="self-draw-board flex-1 overflow-hidden">
                <article className="self-draw-panel">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-[linear-gradient(135deg,rgba(26,58,110,0.06),rgba(194,40,50,0.04))] px-5 py-4">
                    <div>
                      <h3 className="text-base font-black text-[#0f2040]">顺序槽位</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500">抽中后落入左侧顺序；这一步只确定路演顺序，不开始评审。</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                      已抽 {projectOrder.length - pendingSelfDrawProjects.length}/{projectOrder.length}
                    </span>
                  </div>
                  <div className="self-draw-slots">
                    {projectOrder.map((item) => {
                      const isFilled = Boolean(item.selfDrawnAt);
                      const isRolling = selfDrawRollingSlotIndex === item.orderIndex;
                      return (
                        <div
                          className={`self-draw-slot ${isFilled ? "filled just-filled" : ""} ${isRolling ? "rolling" : ""}`}
                          key={item.packageId}
                        >
                          <span className="self-draw-index">{String(item.orderIndex + 1).padStart(2, "0")}</span>
                          <div className="min-w-0">
                            <p className={`truncate text-sm font-black ${isFilled ? "text-slate-950" : "text-slate-400"}`}>
                              {isFilled ? item.targetName : isRolling ? "滚动抽取中" : "等待抽签落位"}
                            </p>
                            <p className="mt-1 truncate text-xs font-bold text-slate-400">
                              {isFilled ? item.roundLabel || "项目路演" : "空槽位"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="self-draw-panel flex min-h-0 flex-col p-5">
                  <div className="shrink-0">
                    <p className="text-xs font-black tracking-[2px] text-[#c22832]">自助抽签</p>
                    <h3 className="mt-1 text-2xl font-black text-[#0f2040]">候抽项目池</h3>
                    <p className="mt-2 text-sm font-bold text-slate-500">
                      第一步随机抽取上台项目；第二步由上台项目抽取路演顺序。抽签只确定顺序，不开始评审。
                    </p>
                  </div>

                  <div className="my-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                    <p className="text-xs font-black text-blue-500">当前上台项目</p>
                    <p className="mt-2 min-h-8 truncate text-xl font-black text-[#0f2040]">
                      {(rollingSelfDrawCandidate ?? selectedSelfDrawProject)?.targetName ?? "等待抽取上台项目"}
                    </p>
                    <p className="mt-2 min-h-5 text-sm font-bold text-blue-700">
                      {selfDrawRollingPackageId
                        ? `顺序槽位滚动中：${selfDrawRollingSlotIndex === null ? "--" : String(selfDrawRollingSlotIndex + 1).padStart(2, "0")}`
                        : selfDrawCandidateRolling
                          ? "项目池滚动中，请现场停下确认"
                          : selectedSelfDrawProject
                            ? "请由该项目抽取路演顺序"
                            : pendingSelfDrawProjects.length
                              ? "等待抽取上台项目"
                              : "请等待管理员确认后续路演安排"}
                    </p>
                  </div>

                  <div className="grid shrink-0 grid-cols-2 gap-3">
                    <button
                      className={`self-draw-action rounded-2xl px-5 py-4 text-base font-black text-white ${
                        selfDrawCandidateRolling ? "rolling bg-[#c22832]" : "bg-[#1f4ea7]"
                      } disabled:cursor-not-allowed disabled:bg-slate-300`}
                      disabled={
                        !pendingSelfDrawProjects.length ||
                        Boolean(selectedSelfDrawProject) ||
                        selfDrawCandidateSubmitting ||
                        selfDrawSubmitting ||
                        Boolean(selfDrawRollingPackageId)
                      }
                      onClick={() => void toggleSelfDrawCandidateRolling()}
                      type="button"
                    >
                      {selfDrawCandidateSubmitting
                        ? "正在确认上台项目"
                        : selfDrawCandidateRolling
                          ? "确定上台项目"
                          : pendingSelfDrawProjects.length
                            ? "抽取上台项目"
                            : "抽签已完成"}
                    </button>
                    <button
                      className={`self-draw-action rounded-2xl px-5 py-4 text-base font-black text-white ${
                        selfDrawRollingPackageId ? "rolling bg-[#c22832]" : "bg-[#1f4ea7]"
                      } disabled:cursor-not-allowed disabled:bg-slate-300`}
                      disabled={!selectedSelfDrawProject || selfDrawSubmitting || selfDrawCandidateRolling}
                      onClick={() => void toggleSelfDrawSlotRolling()}
                      type="button"
                    >
                      {selfDrawSubmitting
                        ? "正在确认路演号"
                        : selfDrawRollingPackageId
                          ? "停下并确认路演号"
                          : selectedSelfDrawProject
                            ? "开始抽路演顺序"
                            : "等待上台项目"}
                    </button>
                  </div>

                  <div className="mt-5 min-h-0 flex-1">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-black text-slate-900">候抽项目</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                        剩余 {pendingSelfDrawProjects.length} 项
                      </span>
                    </div>
                    <div className="self-draw-pool space-y-2">
                      {pendingSelfDrawProjects.map((item) => {
                        const selected =
                          item.packageId === selectedSelfDrawProject?.packageId ||
                          item.packageId === rollingSelfDrawCandidate?.packageId;
                        return (
                          <div
                            className={`self-draw-project-button ${selected ? "selected" : ""}`}
                            key={item.packageId}
                          >
                            <p className="truncate text-sm font-black text-slate-950">{item.targetName}</p>
                            <p className="mt-1 truncate text-xs font-bold text-slate-400">{item.roundLabel || "项目路演"}</p>
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
