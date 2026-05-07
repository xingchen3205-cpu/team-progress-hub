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
    currentPackageId: string;
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
  const drawEnabled = screenDisplay.selfDrawEnabled;
  const screenStateLabels = [
    drawEnabled ? "抽签分组" : null,
    "评审打分",
    screenDisplay.showRankingOnScreen ? "实时排名" : null,
    screenDisplay.showRankingOnScreen ? "本轮排名" : null,
  ].filter((label): label is string => Boolean(label));
  const phaseRemaining = payload?.session.phaseRemainingSeconds ?? 0;
  const countdownTone = getCountdownTone(phaseRemaining);
  const projectOrder = useMemo(() => payload?.projectOrder ?? [], [payload?.projectOrder]);
  const projectOrderKey = useMemo(
    () => projectOrder.map((project) => `${project.packageId}:${project.orderIndex}`).join("|"),
    [projectOrder],
  );
  const projectResults = useMemo(() => payload?.projectResults ?? [], [payload?.projectResults]);
  const hasDrawStarted = phase !== "draw" || Boolean(payload?.session.phaseStartedAt);
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

  useEffect(() => {
    if (drawEnabled && phase === "draw" && hasDrawStarted && projectOrder.length > 0) {
      const startedAt = Date.now();
      setDrawAnimationStartedAt(startedAt);
      setDrawFrameTime(startedAt);
    }
  }, [drawEnabled, hasDrawStarted, phase, projectOrder.length, projectOrderKey]);

  useEffect(() => {
    if (drawAnimationStartedAt === null) return;

    const duration = Math.min(projectOrder.length, 12) * 1100 + 700;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setDrawFrameTime(now);
      if (now - drawAnimationStartedAt >= duration) {
        window.clearInterval(timer);
      }
    }, 75);
    return () => window.clearInterval(timer);
  }, [drawAnimationStartedAt, projectOrder.length]);

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
  const finishedRankingVisible = phase === "finished" && rankingRows.some((row) => row.score !== null);
  const waitingScreen =
    phase === "finished" && !finishedRankingVisible
      ? {
          eyebrow: "ROUND FINISHED",
          title: "本轮路演已结束",
          description: "请等待管理员开启下一轮评审",
          status: "现场已收尾",
        }
      : phase === "draw" && !drawEnabled
        ? hasCurrentProject
          ? activeProjectCompleted
            ? {
                eyebrow: "PROJECT COMPLETE",
                title: "本项目评审已完成，等待下一项目",
                description: `第 ${orderNumber} / ${Math.max(totalCount, projectOrder.length, 1)} 项 · ${targetName}`,
                status: "等待切换项目",
              }
            : {
                eyebrow: "NEXT PROJECT",
                title: "请等待下一个项目路演开始",
                description: `第 ${orderNumber} / ${Math.max(totalCount, projectOrder.length, 1)} 项 · ${targetName}`,
                status: "等待管理员开始路演",
              }
          : {
              eyebrow: "WAITING",
              title: "请等待管理员分配路演项目",
              description: title,
              status: "等待项目同步",
            }
        : null;
  const activeTab = finishedRankingVisible
    ? "rank"
    : waitingScreen
    ? "waiting"
    : phase === "draw"
      ? "draw"
      : getTabState(phase);

  const drawAnimationDuration = Math.min(projectOrder.length, 12) * 1100 + 700;
  const drawElapsed = drawAnimationStartedAt === null ? 0 : drawFrameTime - drawAnimationStartedAt;
  const drawOverlayActive =
    drawEnabled &&
    phase === "draw" &&
    hasDrawStarted &&
    projectOrder.length > 0 &&
    drawAnimationStartedAt !== null &&
    drawElapsed < drawAnimationDuration;
  const drawOverlayIndex = projectOrder.length > 0
    ? Math.min(projectOrder.length - 1, Math.max(0, Math.floor(drawElapsed / 1100)))
    : 0;
  const drawOverlayItem = projectOrder[drawOverlayIndex] ?? null;
  const drawOverlayRolling = drawElapsed % 1100 < 650;
  const drawRollingNumber = projectOrder.length > 0
    ? ((Math.floor(drawFrameTime / 75) % projectOrder.length) + 1)
    : 1;
  const hasPendingSelfDrawProjects =
    drawEnabled && projectOrder.some((project) => !project.selfDrawnAt);
  const isWaitingNextProject =
    drawEnabled &&
    phase === "draw" &&
    hasDrawStarted &&
    projectOrder.length > 0 &&
    Boolean(payload?.session.currentPackageId) &&
    !drawOverlayActive &&
    !hasPendingSelfDrawProjects;

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
        const startedAt = Date.now();
        setDrawAnimationStartedAt(startedAt);
        setDrawFrameTime(startedAt);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "抽签失败，请重试");
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
          min-width: min(430px, calc(100vw - 48px));
          overflow: hidden;
          border-radius: 18px;
          background: #fff;
          padding: 40px 76px;
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
          min-height: 84px;
          color: #204585;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 76px;
          font-weight: 900;
          line-height: 1;
        }
        .draw-sequence-number.rolling {
          animation: draw-roll .38s steps(5, end) infinite;
        }
        .draw-overlay-card {
          animation: draw-settle 0.72s cubic-bezier(.16,1,.3,1);
        }
        .draw-roll-number {
          animation: draw-roll 1.2s steps(8, end);
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
        .waiting-stage-status {
          margin-top: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.26);
          background: rgba(255,255,255,.14);
          padding: 12px 22px;
          color: rgba(255,255,255,.88);
          font-size: 14px;
          font-weight: 900;
          backdrop-filter: blur(10px);
        }
        .score-reveal-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 72px 48px;
          background:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
            rgba(26, 34, 54, 0.9);
          background-size: 84px 84px, 84px 84px, auto;
          backdrop-filter: blur(18px);
        }
        .score-reveal-card {
          position: relative;
          margin: 0 auto;
          min-width: min(760px, calc(100vw - 48px));
          overflow: hidden;
          border-radius: 18px;
          background: #fff;
          padding: 64px 82px 58px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(15, 32, 64, 0.2);
          animation: reveal-rise 0.5s cubic-bezier(.16,1,.3,1);
          will-change: transform, opacity;
        }
        .score-reveal-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 5px;
          background: linear-gradient(135deg, #1a3a6e, #2856a0 48%, #c22832, #d93440);
        }
        .score-reveal-project-name {
          opacity: 0;
          transform: translateY(-12px);
          color: rgba(15, 23, 42, .68);
          font-size: clamp(24px, 3vh, 36px);
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
          background: linear-gradient(135deg, #1a3a6e 0%, #2856a0 45%, #c22832 80%, #d93440 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
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
          background: rgba(15, 23, 42, .32);
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
        @keyframes panel-in {
          from { transform: translateY(8px); opacity: .2; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <header className="screen-banner screen-hero-gradient relative z-50 flex items-center justify-between px-11 text-white">
        <div className="relative z-10 flex min-w-0 items-center gap-4">
          <Image
            alt="南京铁道职业技术学院校徽"
            className="h-12 w-12 shrink-0 rounded-full bg-white p-1.5 shadow-sm ring-1 ring-white/50"
            height={48}
            priority
            src="/brand/njrts-logo.png"
            width={48}
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
              <p className="text-sm font-black uppercase tracking-[4px] text-white/50">{waitingScreen.eyebrow}</p>
              <h2 className="waiting-stage-title">{waitingScreen.title}</h2>
              <p className="waiting-stage-description">{waitingScreen.description}</p>
              <div className="waiting-stage-status">
                <span className="mr-3 h-2.5 w-2.5 rounded-full bg-white/80 shadow-[0_0_18px_rgba(255,255,255,.75)]" />
                {waitingScreen.status}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "draw" ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black tracking-[2px] text-[#c22832]">ROADSHOW DRAW</p>
                <h2 className="mt-1 text-2xl font-black text-[#0f2040]">路演顺序抽签</h2>
              </div>
              <div className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">
                共 {projectOrder.length || totalCount || 0} 个项目
              </div>
            </div>

            {isWaitingNextProject ? (
              <div className="contest-card flex shrink-0 items-center justify-between gap-6 px-6 py-5">
                <div>
                  <p className="text-xs font-black tracking-[2px] text-blue-600">NEXT PROJECT</p>
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

            <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 overflow-y-auto">
              {visibleDrawGroups.length ? (
                visibleDrawGroups.map((group) => (
                <article className="contest-card draw-overlay-card overflow-hidden" key={group.name}>
                  <div className="flex items-center justify-between border-b border-slate-200 bg-[linear-gradient(135deg,rgba(26,58,110,0.06),rgba(194,40,50,0.04))] px-5 py-4">
                    <h3 className="text-sm font-black text-[#1a3a6e]">{group.name}</h3>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-400">{group.projects.length} 个项目</span>
                  </div>
                  <div className="p-3">
                    {group.projects.map((item) => {
                      const canSelfDrawProject =
                        screenDisplay.selfDrawEnabled &&
                        phase === "draw" &&
                        !item.selfDrawnAt;
                      const drawContent = (
                        <>
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full screen-hero-gradient text-xs font-black text-white ${item.orderIndex === currentIndex ? "draw-roll-number" : ""}`}>
                            {item.selfDrawnAt ? item.orderIndex + 1 : "待"}
                          </span>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate text-sm font-bold text-slate-900">{item.targetName}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-400">
                              {screenDisplay.selfDrawEnabled && !item.selfDrawnAt ? "自助抽签 · 点击确认上场顺序" : item.roundLabel || "项目路演"}
                            </p>
                          </div>
                        </>
                      );
                      return canSelfDrawProject ? (
                        <button
                          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-colors odd:bg-slate-50 hover:bg-blue-50"
                          key={item.packageId}
                          onClick={() => void selfDrawProject(item.packageId)}
                          type="button"
                        >
                          {drawContent}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors odd:bg-slate-50" key={item.packageId}>
                          {drawContent}
                        </div>
                      );
                    })}
                  </div>
                </article>
                ))
              ) : (
                <div className="contest-card col-span-full flex min-h-[420px] flex-col items-center justify-center text-center text-slate-400">
                  <ShieldCheck className="h-14 w-14 text-blue-200" />
                  <p className="mt-4 text-base font-black text-slate-500">等待项目确认出场顺序</p>
                  <p className="mt-1 text-sm">项目自助抽签开启后，现场点击项目卡片即可同步顺序</p>
                </div>
              )}
            </div>
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
              score: row.score ?? Number.NaN,
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

      {drawEnabled && drawOverlayActive && drawOverlayItem ? (
        <section className="draw-sequence-overlay">
          <div className="draw-sequence-card">
            <p className="text-sm font-black tracking-[2px] text-slate-400">抽签进行中</p>
            <p className={`draw-sequence-number mt-5 ${drawOverlayRolling ? "rolling" : ""}`}>
              {String(drawOverlayRolling ? drawRollingNumber : drawOverlayIndex + 1).padStart(2, "0")}
            </p>
            <p className="mt-4 min-h-7 max-w-[520px] truncate text-lg font-black text-slate-900">
              {drawOverlayRolling ? projectOrder[drawRollingNumber - 1]?.targetName : drawOverlayItem.targetName}
            </p>
            <p className="mt-2 min-h-6 text-sm font-bold text-blue-500">
              {drawOverlayRolling ? "" : `→ ${drawOverlayItem.groupName || "第一组"}`}
            </p>
          </div>
        </section>
      ) : null}

      {screenDisplay.showFinalScoreOnScreen && phase === "reveal" ? (
        <section className="score-reveal-overlay">
          <div className="score-reveal-card">
            <p className="text-sm font-black tracking-[3px] text-slate-400">最终得分</p>
            <h2 className={`score-reveal-project-name mt-4 max-w-[680px] truncate ${revealProjectVisible ? "visible" : ""}`}>
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
