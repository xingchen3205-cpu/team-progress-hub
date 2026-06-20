"use client";

import { useCallback, useEffect, useState } from "react";

import { ActionButton, textareaClassName } from "@/components/workspace-context";

type RevisionItem = {
  id: string;
  question: string;
  submittedByName: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  originalAnswerPoints: string;
  proposedAnswerPoints: string;
  reason: string;
  reviewComment: string | null;
  canReview: boolean;
  createdAt: string;
};

const statusLabels = { pending: "待审核", approved: "已通过", rejected: "未通过", withdrawn: "已撤回" };

export function QuestionRevisionPanel() {
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/training/question-revisions", { cache: "no-store", credentials: "same-origin" });
    const payload = (await response.json().catch(() => null)) as { requests?: RevisionItem[] } | null;
    if (response.ok) setItems(payload?.requests ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const review = async (item: RevisionItem, action: "approved" | "rejected") => {
    const reviewComment = comments[item.id]?.trim() ?? "";
    if (!reviewComment) { setError("请先填写审核意见"); return; }
    setPendingId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/training/question-revisions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, reviewComment }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "修订申请处理失败");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "修订申请处理失败");
    } finally {
      setPendingId("");
    }
  };

  if (!items.length) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">题库要点修订审核</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">申请通过后仅影响后续训练，历史评分保持不变。</p>
      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold text-slate-900">{item.question}</p><span className="text-xs text-slate-500">{statusLabels[item.status]}</span></div>
            <p className="mt-1 text-xs text-slate-500">提交人：{item.submittedByName} · {item.createdAt}</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><div><p className="text-xs font-semibold text-slate-500">原回答要点</p><p className="mt-1 text-sm leading-6 text-slate-700">{item.originalAnswerPoints}</p></div><div><p className="text-xs font-semibold text-blue-600">建议回答要点</p><p className="mt-1 text-sm leading-6 text-slate-700">{item.proposedAnswerPoints}</p></div></div>
            <p className="mt-3 text-sm text-slate-600"><span className="font-medium text-slate-900">修订说明：</span>{item.reason}</p>
            {item.canReview ? <div className="mt-3"><label className="text-sm text-slate-600">审核意见<textarea className={`${textareaClassName} mt-1 min-h-20`} onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))} value={comments[item.id] ?? ""} /></label><div className="mt-2 flex gap-2"><ActionButton disabled={pendingId === item.id} onClick={() => void review(item, "approved")} variant="primary">批准修订</ActionButton><ActionButton disabled={pendingId === item.id} onClick={() => void review(item, "rejected")} variant="danger">驳回申请</ActionButton></div></div> : item.reviewComment ? <p className="mt-3 text-sm text-slate-600">审核意见：{item.reviewComment}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
