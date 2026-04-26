"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

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

type ScreenPayload = {
  session: {
    id: string;
    status: "waiting" | "scoring" | "revealed" | "closed";
    countdownSeconds: number;
    startedAt: string | null;
    tokenExpiresAt: string;
    timeline: {
      phase: "waiting" | "scoring" | "overtime" | "revealed" | "closed";
      remainingSeconds: number;
      label: string;
    };
  };
  reviewPackage: {
    targetName: string;
    roundLabel: string;
    overview: string;
    deadline: string | null;
  };
  seats: ScreenSeat[];
  finalScore: ScreenFinalScore;
  projectResults?: Array<{
    reviewPackage: {
      id: string;
      targetName: string;
      roundLabel: string;
      overview: string;
      deadline: string | null;
    };
    seats: ScreenSeat[];
    finalScore: ScreenFinalScore;
  }>;
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

export default function ReviewScreenSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [payload, setPayload] = useState<ScreenPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

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

  const projectResults = payload?.projectResults?.length ? payload.projectResults : [];
  const activeProjectResult =
    projectResults.find((project) => !project.finalScore.ready) ??
    projectResults[0] ??
    null;
  const seats = activeProjectResult?.seats.length
    ? activeProjectResult.seats
    : payload?.seats.length
      ? payload.seats
      : fallbackSeats;
  const activeFinalScore = activeProjectResult?.finalScore ?? payload?.finalScore;
  const submittedCount = activeFinalScore?.submittedSeatCount ?? seats.filter((seat) => seat.status === "submitted").length;
  const effectiveCount = activeFinalScore?.effectiveSeatCount ?? seats.length;
  const timeline = payload?.session.timeline;
  const title = activeProjectResult?.reviewPackage.roundLabel ?? payload?.reviewPackage.roundLabel ?? "项目路演评审";
  const targetName = activeProjectResult?.reviewPackage.targetName ?? payload?.reviewPackage.targetName ?? "等待项目同步";
  const finalScoreText = activeFinalScore?.finalScoreText ?? "--";
  const progressText = `${submittedCount}/${effectiveCount}`;
  const phaseMeta = useMemo(() => {
    if (!timeline) {
      return { label: "连接中", tone: "bg-slate-100 text-slate-500", time: "--:--" };
    }

    if (timeline.phase === "revealed") {
      return { label: "最终得分", tone: "bg-emerald-50 text-emerald-700", time: "完成" };
    }

    if (timeline.phase === "overtime") {
      return { label: "等待全部专家提交", tone: "bg-amber-50 text-amber-700", time: "超时" };
    }

    if (timeline.phase === "scoring") {
      return { label: "评分进行中", tone: "bg-blue-50 text-blue-700", time: formatSeconds(timeline.remainingSeconds) };
    }

    return { label: "等待开始", tone: "bg-slate-100 text-slate-500", time: formatSeconds(timeline.remainingSeconds) };
  }, [timeline]);

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="relative min-h-screen">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.34),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.22),transparent_30%),linear-gradient(135deg,#020617_0%,#0f172a_48%,#111827_100%)]" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)] opacity-70" />
        <div className="relative mx-auto flex min-h-screen max-w-[1480px] flex-col px-10 py-8">
          <header className="flex items-center justify-between rounded-[28px] border border-white/10 bg-white/8 px-8 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-blue-200 ring-1 ring-white/15">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-[0.28em] text-blue-200">ROADSHOW REVIEW SCREEN</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`rounded-2xl px-5 py-3 text-sm font-bold ${phaseMeta.tone}`}>
                {phaseMeta.label}
              </div>
              <div className="min-w-36 rounded-2xl bg-white px-6 py-3 text-center text-slate-950 shadow-[0_12px_36px_rgba(15,23,42,0.20)]">
                <p className="text-xs font-semibold text-slate-400">倒计时</p>
                <p className="mt-1 text-3xl font-black tabular-nums">{phaseMeta.time}</p>
              </div>
            </div>
          </header>

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-6 py-4 text-sm font-semibold text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <section className="mt-8 grid flex-1 grid-cols-[minmax(0,1fr)_360px] gap-8">
            <div className="flex flex-col rounded-[36px] border border-white/10 bg-white px-8 py-8 text-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-semibold text-blue-600">当前评审项目</p>
                  <h2 className="mt-3 text-5xl font-black tracking-tight">{targetName}</h2>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-slate-500">
                    {payload?.reviewPackage.overview || "评审过程实时同步专家席位状态，全部有效席位提交后生成最终得分。"}
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-950 px-7 py-5 text-white">
                  <p className="text-sm text-slate-300">提交进度</p>
                  <p className="mt-2 text-5xl font-black tabular-nums">{progressText}</p>
                </div>
              </div>

              <div className="mt-10 grid flex-1 grid-cols-4 gap-5">
                {seats.map((seat) => {
                  const isSubmitted = seat.status === "submitted";
                  const isVoided = seat.status === "voided";
                  return (
                    <article
                      className={`flex min-h-48 flex-col justify-between rounded-[28px] border p-5 transition-all duration-500 ${
                        isVoided
                          ? "border-slate-200 bg-slate-50 text-slate-400"
                          : isSubmitted
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-[0_16px_38px_rgba(16,185,129,0.12)]"
                            : "border-slate-200 bg-white text-slate-950 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
                      }`}
                      key={seat.assignmentId}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black ${
                            isSubmitted ? "bg-emerald-600 text-white" : isVoided ? "bg-slate-200 text-slate-500" : "bg-blue-600 text-white"
                          }`}>
                            {seat.avatarText}
                          </div>
                          <div>
                            <p className="text-lg font-black">{seat.displayName}</p>
                            <p className="text-xs text-slate-400">匿名席位</p>
                          </div>
                        </div>
                        {isSubmitted ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : null}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400">当前状态</p>
                        <p className="mt-2 text-4xl font-black tabular-nums">
                          {isSubmitted ? seat.scoreText : isVoided ? "作废" : "待提交"}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <aside className="flex flex-col gap-6">
              <section className="rounded-[36px] border border-white/10 bg-white/10 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.20)] backdrop-blur-xl">
                <p className="text-sm font-semibold text-blue-200">最终得分</p>
                <div className="mt-4 rounded-[30px] bg-white px-6 py-8 text-center text-slate-950">
                  <p className="text-7xl font-black tabular-nums tracking-tight">{finalScoreText}</p>
                  <p className="mt-3 text-sm font-semibold text-slate-400">按管理员设置规则计算</p>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-white/50">有效席位</p>
                    <p className="mt-1 text-2xl font-black">{effectiveCount}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-white/50">已提交</p>
                    <p className="mt-1 text-2xl font-black">{submittedCount}</p>
                  </div>
                </div>
              </section>

              {projectResults.length > 1 ? (
                <section className="rounded-[36px] border border-white/10 bg-white/10 p-7 backdrop-blur-xl">
                  <h3 className="text-lg font-bold">本轮项目</h3>
                  <div className="mt-4 space-y-3">
                    {projectResults.map((project) => (
                      <div
                        className="rounded-2xl bg-white/10 px-4 py-3"
                        key={project.reviewPackage.id}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-bold text-white">{project.reviewPackage.targetName}</p>
                          <span className="text-sm font-black text-blue-100">
                            {project.finalScore.finalScoreText ?? "--"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-white/50">
                          {project.finalScore.submittedSeatCount}/{project.finalScore.effectiveSeatCount} 位专家已提交
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-[36px] border border-white/10 bg-white/10 p-7 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <Clock3 className="h-5 w-5 text-blue-200" />
                  <h3 className="text-lg font-bold">现场说明</h3>
                </div>
                <p className="mt-4 text-sm leading-7 text-white/62">
                  分数实时读取专家提交状态。倒计时结束后不会自动归零，也不会提前计算，需等待全部有效专家席位提交。
                </p>
              </section>
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}
