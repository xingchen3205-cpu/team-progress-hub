"use client";

import { ActionButton, textareaClassName } from "@/components/workspace-context";

type Dimensions = {
  questionResponse: number;
  keyPointCoverage: number;
  logicalStructure: number;
  evidenceQuality: number;
  expressionAccuracy: number;
};

export function AiDefenseFeedbackDetails({
  dimensions,
  hitPoints,
  missingPoints,
  expressionRisks,
  improvedAnswer,
}: {
  dimensions: Dimensions;
  hitPoints: string[];
  missingPoints: string[];
  expressionRisks: string[];
  improvedAnswer: string;
}) {
  return (
    <>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {[
          ["问题回应", dimensions.questionResponse],
          ["要点覆盖", dimensions.keyPointCoverage],
          ["逻辑结构", dimensions.logicalStructure],
          ["事实依据", dimensions.evidenceQuality],
          ["表达准确", dimensions.expressionAccuracy],
        ].map(([label, value]) => (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center" key={label}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {value}<span className="text-xs font-normal text-slate-400">/20</span>
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {[
          { title: "命中要点", items: hitPoints, tone: "emerald" },
          { title: "遗漏重点", items: missingPoints, tone: "amber" },
          { title: "表达风险", items: expressionRisks, tone: "rose" },
        ].map((block) => (
          <div className="min-h-[160px] rounded-xl border border-slate-100 bg-slate-50 p-4" key={block.title}>
            <p className={`text-xs font-semibold ${block.tone === "emerald" ? "text-emerald-600" : block.tone === "amber" ? "text-amber-600" : "text-rose-600"}`}>
              {block.title}
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {block.items.length ? block.items.map((item) => <li className="rounded-lg bg-white/70 px-3 py-2" key={item}>{item}</li>) : <li className="rounded-lg bg-white/70 px-3 py-2">暂无明显记录</li>}
            </ul>
          </div>
        ))}
      </div>
      {improvedAnswer ? <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="text-xs font-semibold text-blue-600">优化回答参考</p><p className="mt-2 text-sm leading-7 text-slate-700">{improvedAnswer}</p></div> : null}
    </>
  );
}

export function QuestionRevisionForm({ points, reason, pending, onPointsChange, onReasonChange, onSubmit, onCancel }: {
  points: string;
  reason: string;
  pending: boolean;
  onPointsChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <p className="text-sm font-semibold text-slate-900">提交题库回答要点修订</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">申请不会改变当前评分，审核通过后仅用于后续训练。</p>
      <label className="mt-3 block text-sm text-slate-600">建议修订后的回答要点<textarea className={`${textareaClassName} mt-1 min-h-28`} onChange={(event) => onPointsChange(event.target.value)} value={points} /></label>
      <label className="mt-3 block text-sm text-slate-600">修订说明<textarea className={`${textareaClassName} mt-1 min-h-20`} onChange={(event) => onReasonChange(event.target.value)} placeholder="请说明新增要点的依据或原要点需要调整的原因。" value={reason} /></label>
      <div className="mt-3 flex gap-2">
        <ActionButton disabled={pending} loading={pending} loadingLabel="提交中..." onClick={onSubmit} variant="primary">提交审核</ActionButton>
        <ActionButton disabled={pending} onClick={onCancel}>取消</ActionButton>
      </div>
    </div>
  );
}
