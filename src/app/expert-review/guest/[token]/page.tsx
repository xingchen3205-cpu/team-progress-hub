"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, Send, ShieldCheck, Star } from "lucide-react";

type GuestProject = {
  assignmentId: string;
  packageId: string;
  orderIndex: number;
  orderNumber: number;
  targetName: string;
  roundLabel: string;
  overview: string;
  startAt: string | null;
  deadline: string | null;
  reviewWindowState: "not_started" | "open" | "ended";
  reviewWindowLabel: "未开始" | "进行中" | "已结束";
  status: string;
  scoreText: string | null;
  submittedAt: string | null;
  commentTotal: string;
  materials: Array<{
    id: string;
    kind: string;
    name: string;
    fileName: string;
  }>;
};

type GuestReviewState = {
  expertName: string;
  stageName: string;
  tokenExpiresAt: string;
  submittedCount: number;
  pendingCount: number;
  totalCount: number;
  completionMessage: string | null;
  projects: GuestProject[];
};

type PendingGuestSubmission = {
  assignmentId: string;
  targetName: string;
  orderNumber: number;
  score: number;
  displayScore: string;
  commentTotal: string;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function GuestExpertReviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [state, setState] = useState<GuestReviewState | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<PendingGuestSubmission | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    if (!token) {
      setMessage("专家评分链接无效");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/expert-reviews/guest/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as GuestReviewState | { message?: string } | null;
      if (!response.ok) {
        throw new Error(data && "message" in data ? data.message ?? "专家评分链接无效" : "专家评分链接无效");
      }
      const payload = data as GuestReviewState;
      setState(payload);
      setSelectedAssignmentId((current) => current ?? payload.projects.find((project) => project.status !== "submitted")?.assignmentId ?? payload.projects[0]?.assignmentId ?? null);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "专家评分链接无效");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const projects = state?.projects ?? [];
  const selectedProject = useMemo(
    () => projects.find((project) => project.assignmentId === selectedAssignmentId) ?? projects[0] ?? null,
    [projects, selectedAssignmentId],
  );
  const allSubmitted = Boolean(state && state.totalCount > 0 && state.pendingCount === 0);
  const selectedCanSubmit = Boolean(
    selectedProject &&
      selectedProject.status !== "submitted" &&
      selectedProject.reviewWindowState === "open",
  );

  const getReviewWindowHint = (project: GuestProject) => {
    if (project.reviewWindowState === "not_started") {
      return `评审尚未开始${project.startAt ? `，开始时间 ${formatDateTime(project.startAt)}` : ""}`;
    }
    if (project.reviewWindowState === "ended") {
      return `评审已截止${project.deadline ? `，截止时间 ${formatDateTime(project.deadline)}` : ""}`;
    }
    return project.deadline ? `当前可评分，截止时间 ${formatDateTime(project.deadline)}` : "当前可评分";
  };

  const openSubmitConfirmation = () => {
    if (!selectedProject || selectedProject.status === "submitted" || submittingId) return;
    if (selectedProject.reviewWindowState !== "open") {
      setMessage(getReviewWindowHint(selectedProject));
      return;
    }
    const score = Number(scoreDrafts[selectedProject.assignmentId]);
    if (!Number.isFinite(score) || score < 0 || score > 100 || !Number.isInteger(score * 100)) {
      setMessage("请输入 0.00-100.00 的分数，最多两位小数");
      return;
    }
    const displayScore = score.toFixed(2);
    setMessage("");
    setPendingSubmission({
      assignmentId: selectedProject.assignmentId,
      targetName: selectedProject.targetName,
      orderNumber: selectedProject.orderNumber,
      score,
      displayScore,
      commentTotal: commentDrafts[selectedProject.assignmentId] ?? "",
    });
  };

  const submitScore = async () => {
    if (!pendingSubmission || submittingId) return;

    setSubmittingId(pendingSubmission.assignmentId);
    setMessage("");
    try {
      const response = await fetch(`/api/expert-reviews/guest/${encodeURIComponent(token)}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: pendingSubmission.assignmentId,
          score: pendingSubmission.score,
          commentTotal: pendingSubmission.commentTotal,
        }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(data?.message ?? "评分提交失败，请刷新后重试");
      }
      setPendingSubmission(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评分提交失败，请刷新后重试");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <main className="guest-review-page min-h-screen px-4 py-5 text-slate-950">
      <style>{`
        .guest-review-page {
          background:
            linear-gradient(180deg, rgba(14, 43, 82, .06), rgba(244, 246, 250, 0) 280px),
            repeating-linear-gradient(90deg, rgba(15, 23, 42, .035) 0, rgba(15, 23, 42, .035) 1px, transparent 1px, transparent 42px),
            #f4f6fa;
          font-family: "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;
        }
        .guest-review-shell {
          margin: 0 auto;
          max-width: 980px;
          animation: guestReviewEnter .42s ease both;
        }
        .guest-review-header {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 24px;
          background:
            linear-gradient(135deg, rgba(8, 28, 58, .96) 0%, rgba(15, 52, 103, .94) 58%, rgba(120, 28, 42, .93) 100%),
            #102442;
          color: white;
          padding: 24px;
          box-shadow: 0 24px 70px rgba(11, 31, 61, .2);
        }
        .guest-review-header::after {
          content: "";
          position: absolute;
          inset: auto 20px 0 20px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent);
        }
        .guest-review-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .guest-review-logo-mark {
          display: flex;
          min-height: 46px;
          width: 116px;
          align-items: center;
        }
        .guest-review-logo-mark img {
          height: auto;
          max-height: 42px;
          width: 100%;
          object-fit: contain;
          filter: brightness(0) invert(1) drop-shadow(0 8px 18px rgba(0,0,0,.22));
        }
        .guest-review-brand-title {
          min-width: 0;
          border-left: 1px solid rgba(255,255,255,.24);
          padding-left: 12px;
        }
        .guest-review-eyebrow {
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 999px;
          background: rgba(255,255,255,.1);
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 900;
        }
        .guest-review-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 860px) {
          .guest-review-grid {
            grid-template-columns: 330px minmax(0, 1fr);
            align-items: start;
          }
        }
        .guest-review-card {
          border: 1px solid #d8e1ee;
          border-radius: 20px;
          background: white;
          box-shadow: 0 16px 44px rgba(15, 35, 65, .08);
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }
        .guest-review-card:hover {
          border-color: #c7d5e7;
        }
        .guest-review-project {
          width: 100%;
          border: 0;
          background: transparent;
          text-align: left;
          transition: background .18s ease, transform .14s ease, box-shadow .18s ease;
        }
        .guest-review-project-active {
          background: linear-gradient(90deg, #edf5ff, #fff);
          box-shadow: inset 4px 0 0 #1d4ed8;
        }
        .guest-review-project:active {
          transform: scale(.99);
        }
        .guest-review-score-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 16px;
          padding: 14px 16px;
          font-size: 28px;
          font-weight: 900;
          outline: none;
          transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .guest-review-score-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, .12);
        }
        .guest-review-textarea {
          min-height: 96px;
          width: 100%;
          resize: none;
          border-radius: 18px;
          border: 1px solid #d8e1ee;
          padding: 13px 15px;
          font-size: 14px;
          outline: none;
          transition: border-color .18s ease, box-shadow .18s ease;
        }
        .guest-review-textarea:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, .1);
        }
        .guest-review-submit {
          display: inline-flex;
          width: 100%;
          height: 50px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, #1d4ed8, #153e75);
          color: white;
          font-weight: 900;
          transition: transform .14s ease, background .18s ease, opacity .18s ease;
        }
        .guest-review-submit:active:not(:disabled) {
          transform: scale(.985);
        }
        .guest-review-submit:disabled {
          opacity: .45;
        }
        .guest-review-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, .48);
          padding: 18px;
          backdrop-filter: blur(8px);
        }
        .guest-review-confirm-panel {
          width: min(100%, 430px);
          border: 1px solid rgba(226, 232, 240, .9);
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 28px 80px rgba(15, 23, 42, .28);
          animation: guestReviewConfirmEnter .2s ease both;
        }
        .guest-review-progress {
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.18);
        }
        .guest-review-progress-bar {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #f9d77e, #fff);
          transition: width .28s ease;
        }
        @keyframes guestReviewEnter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes guestReviewConfirmEnter {
          from {
            opacity: 0;
            transform: translateY(8px) scale(.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (max-width: 520px) {
          .guest-review-brand {
            align-items: flex-start;
            flex-direction: column;
          }
          .guest-review-brand-title {
            border-left: 0;
            padding-left: 0;
          }
        }
      `}</style>
      <div className="guest-review-shell space-y-4">
        <section className="guest-review-header">
          <div className="guest-review-brand">
            <div className="guest-review-logo-mark">
              <Image alt="南京铁道职业技术学院" height={77} priority src="/official-logo.png" width={430} />
            </div>
            <div className="guest-review-brand-title">
              <p className="text-sm font-black leading-tight text-white">南京铁道职业技术学院</p>
              <p className="mt-1 text-xs font-bold text-white/72">创新创业管理平台</p>
            </div>
          </div>
          <p className="guest-review-eyebrow mt-5">专家临时评审入口</p>
          <h1 className="mt-3 text-2xl font-black leading-tight">{state?.stageName ?? "项目评审"}</h1>
          <p className="mt-2 text-sm font-semibold text-white/75">
            {state ? `${state.expertName}，请按路演顺序完成本轮评审` : "正在加载评审任务"}
          </p>
          {state ? (
            <>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/12 px-3 py-2">
                <p className="text-lg font-black">{state.totalCount}</p>
                <p className="text-[11px] font-bold text-white/70">全部项目</p>
              </div>
              <div className="rounded-2xl bg-white/12 px-3 py-2">
                <p className="text-lg font-black">{state.submittedCount}</p>
                <p className="text-[11px] font-bold text-white/70">已评分</p>
              </div>
              <div className="rounded-2xl bg-white/12 px-3 py-2">
                <p className="text-lg font-black">{state.pendingCount}</p>
                <p className="text-[11px] font-bold text-white/70">待评分</p>
              </div>
            </div>
            <div className="guest-review-progress mt-4">
              <div
                className="guest-review-progress-bar"
                style={{ width: `${state.totalCount ? Math.round((state.submittedCount / state.totalCount) * 100) : 0}%` }}
              />
            </div>
            </>
          ) : null}
        </section>

        {loading ? (
          <div className="guest-review-card flex items-center justify-center gap-2 p-10 text-sm font-bold text-slate-500">
            <Clock3 className="h-4 w-4 animate-spin" />
            正在加载
          </div>
        ) : state ? (
          allSubmitted ? (
            <section className="guest-review-card p-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h2 className="mt-4 text-xl font-black text-slate-950">评分已全部完成</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                {state.completionMessage ?? "感谢您的辛苦付出，所有项目评分已完成。"}
              </p>
            </section>
          ) : (
            <div className="guest-review-grid">
              <section className="guest-review-card overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-black text-slate-900">项目列表</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">按路演顺序排列，已提交后自动锁定</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {projects.map((project) => (
                    <button
                      className={`guest-review-project px-4 py-3 ${project.assignmentId === selectedProject?.assignmentId ? "guest-review-project-active" : ""}`}
                      key={project.assignmentId}
                      onClick={() => setSelectedAssignmentId(project.assignmentId)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-blue-600">第 {project.orderNumber} 项</p>
                          <p className="mt-1 line-clamp-2 text-sm font-black text-slate-900">{project.targetName}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-400">{getReviewWindowHint(project)}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${
                          project.status === "submitted"
                            ? "bg-emerald-50 text-emerald-700"
                            : project.reviewWindowState === "open"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-100 text-slate-500"
                        }`}>
                          {project.status === "submitted" ? "已评分" : project.reviewWindowLabel}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {selectedProject ? (
                <section className="guest-review-card p-5">
                  <p className="text-xs font-black text-blue-600">第 {selectedProject.orderNumber} 项</p>
                  <h2 className="mt-2 text-xl font-black leading-snug">{selectedProject.targetName}</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-500">{selectedProject.roundLabel}</p>
                  {selectedProject.overview ? (
                    <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{selectedProject.overview}</p>
                  ) : null}

                  {selectedProject.materials.length ? (
                    <div className="mt-4 rounded-2xl border border-slate-100 p-4">
                      <p className="text-xs font-black text-slate-500">材料</p>
                      <div className="mt-2 space-y-2">
                        {selectedProject.materials.map((material) => (
                          <p className="text-sm font-semibold text-slate-700" key={material.id}>
                            {material.name || material.fileName}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedProject.status === "submitted" ? (
                    <div className="mt-5 rounded-2xl bg-emerald-50 p-4">
                      <p className="text-sm font-black text-emerald-700">已提交评分：{selectedProject.scoreText}</p>
                      <p className="mt-1 text-xs font-semibold text-emerald-700/70">
                        提交时间 {formatDateTime(selectedProject.submittedAt)}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                        selectedProject.reviewWindowState === "open"
                          ? "border border-blue-100 bg-blue-50 text-blue-700"
                          : "border border-slate-200 bg-slate-50 text-slate-500"
                      }`}>
                        {getReviewWindowHint(selectedProject)}
                      </div>
                      <label className="block">
                        <span className="text-sm font-black text-slate-800">评分</span>
                        <input
                          className="guest-review-score-input mt-2"
                          inputMode="decimal"
                          max="100"
                          min="0"
                          onChange={(event) =>
                            setScoreDrafts((current) => ({
                              ...current,
                              [selectedProject.assignmentId]: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                          type="number"
                          value={scoreDrafts[selectedProject.assignmentId] ?? ""}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-black text-slate-800">评语</span>
                        <textarea
                          className="guest-review-textarea mt-2"
                          onChange={(event) =>
                            setCommentDrafts((current) => ({
                              ...current,
                              [selectedProject.assignmentId]: event.target.value,
                            }))
                          }
                          placeholder="可填写简要意见"
                          value={commentDrafts[selectedProject.assignmentId] ?? ""}
                        />
                      </label>
                      <button
                        className="guest-review-submit"
                        disabled={submittingId === selectedProject.assignmentId || !selectedCanSubmit}
                        onClick={openSubmitConfirmation}
                        type="button"
                      >
                        {submittingId === selectedProject.assignmentId ? (
                          <Clock3 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        {selectedProject.reviewWindowState === "not_started"
                          ? "未到评分时间"
                          : selectedProject.reviewWindowState === "ended"
                            ? "已截止"
                            : "提交评分"}
                      </button>
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          )
        ) : null}

        {message ? (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-700">
            {message}
          </p>
        ) : null}

        {state ? (
          <p className="text-center text-[11px] font-semibold text-slate-400">
            <Star className="mr-1 inline h-3 w-3" />
            链接有效期至 {formatDateTime(state.tokenExpiresAt)}
          </p>
        ) : null}
      </div>
      {pendingSubmission ? (
        <div className="guest-review-confirm-overlay" role="dialog" aria-modal="true">
          <section className="guest-review-confirm-panel p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-950">确认提交评分</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  提交后该项目评分将锁定，不能再次修改。
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black text-blue-600">第 {pendingSubmission.orderNumber} 项</p>
              <p className="mt-1 text-sm font-black leading-6 text-slate-900">{pendingSubmission.targetName}</p>
              <p className="mt-3 font-mono text-3xl font-black text-slate-950">{pendingSubmission.displayScore}</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600 transition hover:bg-slate-50"
                disabled={submittingId === pendingSubmission.assignmentId}
                onClick={() => setPendingSubmission(null)}
                type="button"
              >
                返回修改
              </button>
              <button
                className="guest-review-submit h-11"
                disabled={submittingId === pendingSubmission.assignmentId}
                onClick={submitScore}
                type="button"
              >
                {submittingId === pendingSubmission.assignmentId ? <Clock3 className="h-4 w-4 animate-spin" /> : null}
                确认提交
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
