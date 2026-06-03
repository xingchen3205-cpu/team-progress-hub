"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, Send, Star } from "lucide-react";

type GuestProject = {
  assignmentId: string;
  packageId: string;
  orderIndex: number;
  orderNumber: number;
  targetName: string;
  roundLabel: string;
  overview: string;
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

  const submitScore = async () => {
    if (!selectedProject || selectedProject.status === "submitted" || submittingId) return;

    const score = Number(scoreDrafts[selectedProject.assignmentId]);
    if (!Number.isFinite(score) || score < 0 || score > 100 || !Number.isInteger(score * 100)) {
      setMessage("请输入 0.00-100.00 的分数，最多两位小数");
      return;
    }

    setSubmittingId(selectedProject.assignmentId);
    setMessage("");
    try {
      const response = await fetch(`/api/expert-reviews/guest/${encodeURIComponent(token)}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: selectedProject.assignmentId,
          score,
          commentTotal: commentDrafts[selectedProject.assignmentId] ?? "",
        }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(data?.message ?? "评分提交失败，请刷新后重试");
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评分提交失败，请刷新后重试");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-slate-950">
      <style>{`
        .guest-review-shell {
          margin: 0 auto;
          max-width: 980px;
        }
        .guest-review-header {
          border-radius: 22px;
          background: #14315f;
          color: white;
          padding: 22px;
        }
        .guest-review-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 860px) {
          .guest-review-grid {
            grid-template-columns: 330px minmax(0, 1fr);
            align-items: start;
          }
        }
        .guest-review-card {
          border: 1px solid #dce5f2;
          border-radius: 18px;
          background: white;
        }
        .guest-review-project {
          width: 100%;
          border: 0;
          background: transparent;
          text-align: left;
        }
        .guest-review-project-active {
          background: #edf5ff;
        }
        .guest-review-score-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 16px;
          padding: 14px 16px;
          font-size: 28px;
          font-weight: 900;
          outline: none;
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
          background: #1d4ed8;
          color: white;
          font-weight: 900;
        }
        .guest-review-submit:disabled {
          opacity: .45;
        }
      `}</style>
      <div className="guest-review-shell space-y-4">
        <section className="guest-review-header">
          <p className="text-xs font-black tracking-[0.18em] text-blue-100">专家评分入口</p>
          <h1 className="mt-3 text-2xl font-black leading-tight">{state?.stageName ?? "项目评审"}</h1>
          <p className="mt-2 text-sm font-semibold text-white/75">
            {state ? `${state.expertName}，请按路演顺序完成项目评分` : "正在加载评分任务"}
          </p>
          {state ? (
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
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${project.status === "submitted" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {project.status === "submitted" ? "已评分" : "待评分"}
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
                          className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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
                        disabled={submittingId === selectedProject.assignmentId}
                        onClick={submitScore}
                        type="button"
                      >
                        {submittingId === selectedProject.assignmentId ? (
                          <Clock3 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        提交评分
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
    </main>
  );
}
