"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, ShieldCheck, Trophy } from "lucide-react";

type ScreenSeat = {
  assignmentId: string;
  seatNo: number;
  displayName: string;
  avatarText: string;
  status: "pending" | "submitted" | "voided";
  scoreText: string | null;
};

type ScreenFinalScore = {
  ready: boolean;
  finalScoreText: string | null;
  effectiveSeatCount: number;
  submittedSeatCount: number;
  waitingSeatNos: number[];
  droppedSeatNos: number[];
};

type ScreenPhase = "draw" | "presentation" | "qa" | "scoring" | "reveal" | "finished";

type ProjectOrderItem = {
  orderIndex: number;
  packageId: string;
  targetName: string;
  roundLabel: string;
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

const fallbackSeats: ScreenSeat[] = [
  { assignmentId: "fallback-1", seatNo: 1, displayName: "专家 1", avatarText: "评", status: "pending", scoreText: null },
  { assignmentId: "fallback-2", seatNo: 2, displayName: "专家 2", avatarText: "评", status: "pending", scoreText: null },
  { assignmentId: "fallback-3", seatNo: 3, displayName: "专家 3", avatarText: "评", status: "pending", scoreText: null },
];

const formatSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
};

const useCurrentTime = () => {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return time;
};

const usePulseKey = (key: string) => {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setPulse(true));
    const t = window.setTimeout(() => setPulse(false), 600);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [key]);
  return pulse;
};

export default function ReviewScreenSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [payload, setPayload] = useState<ScreenPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const prevSeatKeys = useRef<string>("");
  const currentTime = useCurrentTime();

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

  // Track seat state changes for pulse animation
  const seatKeys = useMemo(() => {
    if (!payload?.seats) return "";
    return payload.seats.map((s) => `${s.assignmentId}:${s.status}:${s.scoreText}`).join("|");
  }, [payload?.seats]);

  useEffect(() => {
    prevSeatKeys.current = seatKeys;
  }, [seatKeys]);

  const pulseAll = usePulseKey(seatKeys);

  const phase = payload?.session.screenPhase ?? "draw";
  const phaseRemaining = payload?.session.phaseRemainingSeconds ?? 0;
  const timeText = useMemo(
    () =>
      [currentTime.getHours(), currentTime.getMinutes(), currentTime.getSeconds()]
        .map((v) => String(v).padStart(2, "0"))
        .join(":"),
    [currentTime],
  );

  const projectResults = payload?.projectResults?.length ? payload.projectResults : [];
  const activeProjectResult =
    projectResults.find((p) => p.reviewPackage.id === payload?.session.currentPackageId) ??
    projectResults.find((p) => !p.finalScore.ready) ??
    projectResults[0] ??
    null;

  const seats = activeProjectResult?.seats.length
    ? activeProjectResult.seats
    : payload?.seats.length
      ? payload.seats
      : fallbackSeats;

  const activeFinalScore = activeProjectResult?.finalScore ?? payload?.finalScore;
  const submittedCount = activeFinalScore?.submittedSeatCount ?? seats.filter((s) => s.status === "submitted").length;
  const effectiveCount = activeFinalScore?.effectiveSeatCount ?? seats.length;
  const progressText = `${submittedCount}/${effectiveCount}`;
  const title = payload?.reviewPackage.roundLabel ?? "项目路演评审";
  const targetName = payload?.reviewPackage.targetName ?? "等待项目同步";
  const projectOrder = payload?.projectOrder ?? [];
  const currentIndex = payload?.session.currentProjectIndex ?? 0;
  const totalCount = payload?.session.totalProjectCount ?? 0;

  // Reveal animation progress
  const revealStartedAt = payload?.session.revealStartedAt;
  const revealProgress = useMemo(() => {
    if (!revealStartedAt) return 0;
    const started = new Date(revealStartedAt).getTime();
    const now = currentTime.getTime();
    return Math.min(1, Math.max(0, (now - started) / 3000));
  }, [revealStartedAt, currentTime]);

  const revealAnimatedScore = useMemo(() => {
    if (!activeFinalScore?.ready || !activeFinalScore.finalScoreText) return "0.00";
    const target = Number.parseFloat(activeFinalScore.finalScoreText);
    if (Number.isNaN(target)) return "0.00";
    // Ease out cubic
    const eased = 1 - Math.pow(1 - revealProgress, 3);
    return (target * eased).toFixed(2);
  }, [revealProgress, activeFinalScore?.ready, activeFinalScore?.finalScoreText]);

  // Countdown color logic
  const countdownUrgent = phaseRemaining <= 10 && phaseRemaining > 0;
  const countdownWarn = phaseRemaining <= 30 && phaseRemaining > 10;
  const countdownColor = countdownUrgent
    ? "text-rose-600"
    : countdownWarn
      ? "text-amber-600"
      : "text-blue-700";
  const countdownBorder = countdownUrgent
    ? "border-rose-200 bg-rose-50"
    : countdownWarn
      ? "border-amber-200 bg-amber-50"
      : "border-blue-200 bg-blue-50";

  const phaseMeta = useMemo(() => {
    if (!payload?.session) {
      return { label: "连接中", tone: "bg-slate-100 text-slate-500 border-slate-200" };
    }
    const p = payload.session.screenPhase;
    if (p === "reveal") return { label: "最终得分", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (p === "finished") return { label: "本轮结束", tone: "bg-slate-100 text-slate-500 border-slate-200" };
    if (p === "draw") return { label: "抽签排序", tone: "bg-blue-50 text-blue-700 border-blue-200" };
    if (p === "presentation") return { label: "路演展示", tone: "bg-blue-50 text-blue-700 border-blue-200" };
    if (p === "qa") return { label: "答辩提问", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    if (p === "scoring") return { label: "评分进行中", tone: "bg-blue-50 text-blue-700 border-blue-200" };
    return { label: "等待开始", tone: "bg-slate-100 text-slate-500 border-slate-200" };
  }, [payload?.session]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-8 py-6">
        {/* Header */}
        <header className="flex items-center justify-between rounded-2xl border border-blue-100 bg-white px-8 py-5 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
              <p className="mt-0.5 text-xs font-semibold tracking-wider text-blue-600 uppercase">
                现场路演评审投屏
                {totalCount > 0 ? ` · 第 ${currentIndex + 1} / ${totalCount} 组` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`rounded-xl border px-5 py-2.5 text-sm font-bold ${phaseMeta.tone}`}>
              {phaseMeta.label}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-slate-700">
              <Clock className="h-4 w-4 text-slate-400" />
              <span className="text-lg font-bold tabular-nums tracking-wide">{timeText}</span>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm font-semibold text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {/* Phase content */}
        <section className="mt-5 grid flex-1 grid-cols-[minmax(0,1fr)_380px] gap-5">
          {/* Left column */}
          <div className="flex flex-col gap-5">
            {/* DRAW phase */}
            {phase === "draw" ? (
              <div className="flex-1 rounded-2xl border border-blue-100 bg-white p-8 shadow-sm">
                <p className="text-sm font-semibold text-blue-600">抽签排序</p>
                <h2 className="mt-2 text-3xl font-black text-slate-900">本轮出场顺序</h2>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {projectOrder.map((item, idx) => (
                    <div
                      key={item.packageId}
                      className={`flex items-center gap-4 rounded-xl border p-4 ${
                        idx === currentIndex ? "border-blue-300 bg-blue-50" : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-slate-900">{item.targetName}</p>
                        <p className="text-xs text-slate-500">{item.roundLabel}</p>
                      </div>
                    </div>
                  ))}
                  {projectOrder.length === 0 ? (
                    <p className="col-span-2 text-center text-sm text-slate-400 py-12">等待管理员生成抽签顺序</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* PRESENTATION / QA phase - big countdown */}
            {(phase === "presentation" || phase === "qa") ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-blue-100 bg-white p-10 shadow-sm">
                <p className="text-lg font-bold text-blue-600">
                  {phase === "presentation" ? "路演展示" : "答辩提问"}
                </p>
                <h2 className="mt-4 text-6xl font-black text-slate-900">{targetName}</h2>
                <div className={`mt-10 rounded-3xl border px-16 py-10 text-center ${countdownBorder}`}>
                  <p className="text-sm font-semibold text-slate-500">剩余时间</p>
                  <p className={`mt-3 text-8xl font-black tabular-nums tracking-tight ${countdownColor}`}>
                    {formatSeconds(phaseRemaining)}
                  </p>
                </div>
                {phaseRemaining === 0 ? (
                  <p className="mt-6 text-lg font-bold text-amber-600">时间到，请进入下一阶段</p>
                ) : null}
              </div>
            ) : null}

            {/* SCORING phase - seats + countdown */}
            {phase === "scoring" ? (
              <>
                <div className="rounded-2xl border border-blue-100 bg-white p-8 shadow-sm">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-600">当前评审项目</p>
                      <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-900">{targetName}</h2>
                      <p className="mt-4 max-w-3xl text-base leading-7 text-slate-500">
                        {payload?.reviewPackage.overview || "评审过程实时同步专家席位状态，全部有效席位提交后生成最终得分。"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="shrink-0 rounded-2xl bg-slate-900 px-8 py-5 text-center text-white shadow-lg">
                        <p className="text-xs font-semibold text-slate-300">提交进度</p>
                        <p className="mt-2 text-5xl font-black tabular-nums">{progressText}</p>
                      </div>
                      <div className={`shrink-0 rounded-2xl border px-6 py-4 text-center ${countdownBorder}`}>
                        <p className="text-xs font-semibold text-slate-500">评分倒计时</p>
                        <p className={`mt-1 text-3xl font-black tabular-nums ${countdownColor}`}>
                          {formatSeconds(phaseRemaining)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="mb-5 text-sm font-semibold text-slate-500">匿名专家席位状态</p>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {seats.map((seat) => {
                      const isSubmitted = seat.status === "submitted";
                      const isVoided = seat.status === "voided";
                      return (
                        <article
                          className={`flex flex-col justify-between rounded-xl border p-5 transition-all duration-500 ${
                            isVoided
                              ? "border-slate-200 bg-slate-50 text-slate-400"
                              : isSubmitted
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm"
                                : "border-blue-100 bg-blue-50/50 text-slate-900 shadow-sm"
                          } ${isSubmitted && pulseAll ? "animate-pulse" : ""}`}
                          key={seat.assignmentId}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-11 w-11 items-center justify-center rounded-lg text-base font-black ${
                                  isSubmitted ? "bg-emerald-600 text-white" : isVoided ? "bg-slate-200 text-slate-500" : "bg-blue-600 text-white"
                                }`}
                              >
                                {seat.avatarText}
                              </div>
                              <div>
                                <p className="text-base font-bold">{seat.displayName}</p>
                                <p className="text-[11px] text-slate-400">匿名席位</p>
                              </div>
                            </div>
                            {isSubmitted ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                          </div>
                          <div className="mt-4">
                            <p className="text-xs font-semibold text-slate-400">当前状态</p>
                            <p className="mt-1 text-3xl font-black tabular-nums">
                              {isSubmitted ? seat.scoreText : isVoided ? "作废" : "待提交"}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}

            {/* REVEAL phase */}
            {phase === "reveal" ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-blue-100 bg-white p-10 shadow-sm">
                <p className="text-lg font-bold text-blue-600">最终评审得分</p>
                <h2 className="mt-4 text-4xl font-black text-slate-900">{targetName}</h2>
                <div className="mt-10 rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 px-20 py-14 text-center text-white shadow-xl">
                  <p className="text-9xl font-black tabular-nums tracking-tight">
                    {revealAnimatedScore}
                  </p>
                  <p className="mt-4 text-sm font-semibold text-blue-100">
                    {activeFinalScore?.ready
                      ? `有效席位 ${activeFinalScore.effectiveSeatCount} · 已提交 ${activeFinalScore.submittedSeatCount}`
                      : "计算中..."}
                  </p>
                </div>
                {activeFinalScore?.ready && revealProgress >= 1 ? (
                  <p className="mt-6 text-lg font-bold text-emerald-600">
                    最终得分 {activeFinalScore.finalScoreText} 分
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* FINISHED phase - ranking */}
            {phase === "finished" ? (
              <div className="flex-1 rounded-2xl border border-blue-100 bg-white p-8 shadow-sm">
                <div className="flex items-center gap-3">
                  <Trophy className="h-6 w-6 text-amber-500" />
                  <h2 className="text-3xl font-black text-slate-900">本轮排名</h2>
                </div>
                <div className="mt-6 space-y-3">
                  {projectResults
                    .filter((p) => p.finalScore.ready)
                    .sort((a, b) => {
                      const as = Number.parseFloat(a.finalScore.finalScoreText ?? "0");
                      const bs = Number.parseFloat(b.finalScore.finalScoreText ?? "0");
                      return bs - as;
                    })
                    .map((project, idx) => (
                      <div
                        key={project.reviewPackage.id}
                        className={`flex items-center gap-4 rounded-xl border p-4 ${
                          idx === 0
                            ? "border-amber-200 bg-amber-50"
                            : idx === 1
                              ? "border-slate-200 bg-slate-100"
                              : idx === 2
                                ? "border-orange-200 bg-orange-50"
                                : "border-slate-100 bg-white"
                        }`}
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-bold ${
                            idx === 0
                              ? "bg-amber-500 text-white"
                              : idx === 1
                                ? "bg-slate-500 text-white"
                                : idx === 2
                                  ? "bg-orange-500 text-white"
                                  : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold text-slate-900">{project.reviewPackage.targetName}</p>
                          <p className="text-xs text-slate-500">{project.reviewPackage.roundLabel}</p>
                        </div>
                        <p className="text-2xl font-black text-blue-700">{project.finalScore.finalScoreText}</p>
                      </div>
                    ))}
                  {projectResults.filter((p) => p.finalScore.ready).length === 0 ? (
                    <p className="text-center text-sm text-slate-400 py-12">暂无已揭晓的得分</p>
                  ) : null}
                  {projectResults
                    .filter((p) => !p.finalScore.ready)
                    .map((project) => (
                      <div
                        key={project.reviewPackage.id}
                        className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 opacity-60"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-base font-bold text-slate-400">
                          -
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold text-slate-500">{project.reviewPackage.targetName}</p>
                          <p className="text-xs text-slate-400">{project.reviewPackage.roundLabel}</p>
                        </div>
                        <p className="text-lg font-bold text-slate-400">待揭晓</p>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Right column */}
          <aside className="flex flex-col gap-5">
            {/* Info panel for presentation / qa / scoring - no final score until reveal */}
            {phase === "presentation" || phase === "qa" || phase === "scoring" ? (
              <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-blue-600">提交进度</p>
                <div className="mt-4 rounded-xl bg-slate-900 px-6 py-8 text-center text-white shadow-lg">
                  <p className="text-6xl font-black tabular-nums tracking-tight">{progressText}</p>
                  <p className="mt-3 text-xs font-semibold text-slate-300">等待全部有效席位提交</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center border border-slate-100">
                    <p className="text-xs text-slate-400">有效席位</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{effectiveCount}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center border border-slate-100">
                    <p className="text-xs text-slate-400">已提交</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{submittedCount}</p>
                  </div>
                </div>
              </section>
            ) : null}

            {/* Reveal phase - show final score */}
            {phase === "reveal" ? (
              <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-blue-600">最终得分</p>
                <div className="mt-4 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-8 text-center text-white shadow-lg">
                  <p className="text-6xl font-black tabular-nums tracking-tight">
                    {revealAnimatedScore}
                  </p>
                  <p className="mt-3 text-xs font-semibold text-blue-100">按管理员设置规则计算</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center border border-slate-100">
                    <p className="text-xs text-slate-400">有效席位</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{effectiveCount}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center border border-slate-100">
                    <p className="text-xs text-slate-400">已提交</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{submittedCount}</p>
                  </div>
                </div>
              </section>
            ) : null}

            {/* Project list / order summary */}
            {projectOrder.length > 1 ? (
              <section className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-hidden flex flex-col">
                <h3 className="text-base font-bold text-slate-900">
                  {phase === "finished" ? "本轮排名" : "本轮项目"}
                </h3>
                <div className="mt-4 space-y-2 overflow-y-auto">
                  {projectOrder.map((project) => {
                    const result = projectResults.find((p) => p.reviewPackage.id === project.packageId);
                    const isCurrent = project.packageId === payload?.session.currentPackageId;
                    const isRevealed = Boolean(project.revealedAt);
                    const scoreText = isRevealed ? (result?.finalScore.finalScoreText ?? "--") : "待揭晓";
                    return (
                      <div
                        className={`rounded-xl border px-4 py-3 ${
                          isCurrent ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"
                        }`}
                        key={project.packageId}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-bold text-slate-900">{project.targetName}</p>
                          <span className={`shrink-0 text-base font-black ${isRevealed ? "text-blue-700" : "text-slate-400"}`}>
                            {scoreText}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {result?.finalScore.submittedSeatCount ?? 0}/{result?.finalScore.effectiveSeatCount ?? 0} 位专家已提交
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Info panel */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">现场说明</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                分数实时读取专家提交状态。倒计时结束后不会自动归零，也不会提前计算，需等待全部有效专家席位提交。
              </p>
            </section>
          </aside>
        </section>
      </div>

    </main>
  );
}
