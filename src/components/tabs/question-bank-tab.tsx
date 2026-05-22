"use client";

import { useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";

export default function QuestionBankTab() {
  const {
    canManageTrainingQuestion,
    setLoadError,
    setTrainingQuestions,
    showSuccessToast,
    teamGroups,
    trainingQuestions,
  } = Workspace.useWorkspaceContext();
  const { Download, HelpCircle, Pencil, Search, SectionHeader, DemoResetNote, EmptyState, surfaceCardClassName } = Workspace;
  const [selectedTeamGroupId, setSelectedTeamGroupId] = useState("all");
  const [questionBankSearch, setQuestionBankSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [revisionAnswerPoints, setRevisionAnswerPoints] = useState("");
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<Workspace.TrainingQuestionItem | null>(null);
  const keyword = questionBankSearch.trim().toLowerCase();
  const teamOptions = useMemo(() => {
    const knownTeamIds = new Set(teamGroups.map((group) => group.id));
    const hasUnassigned = trainingQuestions.some((question) => !question.teamGroupId);
    const dynamicGroups = trainingQuestions
      .filter((question) => question.teamGroupId && !knownTeamIds.has(question.teamGroupId))
      .reduce<Array<{ id: string; name: string }>>((result, question) => {
        if (!question.teamGroupId || result.some((item) => item.id === question.teamGroupId)) return result;
        result.push({ id: question.teamGroupId, name: question.teamGroupName });
        return result;
      }, []);

    return [
      { id: "all", name: "全部团队", count: trainingQuestions.length },
      ...teamGroups.map((group) => ({
        id: group.id,
        name: group.name,
        count: trainingQuestions.filter((question) => question.teamGroupId === group.id).length,
      })),
      ...dynamicGroups.map((group) => ({
        id: group.id,
        name: group.name,
        count: trainingQuestions.filter((question) => question.teamGroupId === group.id).length,
      })),
      ...(hasUnassigned
        ? [
            {
              id: "unassigned",
              name: "未分组题库",
              count: trainingQuestions.filter((question) => !question.teamGroupId).length,
            },
          ]
        : []),
    ].filter((item) => item.id === "all" || item.count > 0);
  }, [teamGroups, trainingQuestions]);

  const selectedTeamName = teamOptions.find((item) => item.id === selectedTeamGroupId)?.name ?? "全部团队";
  const baseQuestions = useMemo(
    () =>
      trainingQuestions.filter((question) => {
        const matchesTeam =
          selectedTeamGroupId === "all"
            ? true
            : selectedTeamGroupId === "unassigned"
              ? !question.teamGroupId
              : question.teamGroupId === selectedTeamGroupId;
        if (!matchesTeam) return false;
        if (!keyword) return true;

        return [question.question, question.answerPoints, question.category, question.createdByName, question.teamGroupName]
          .some((value) => value.toLowerCase().includes(keyword));
      }),
    [keyword, selectedTeamGroupId, trainingQuestions],
  );
  const categoryCounts = baseQuestions.reduce<Record<string, number>>((result, question) => {
    result[question.category] = (result[question.category] ?? 0) + 1;
    return result;
  }, {});
  const scopedQuestions = useMemo(
    () =>
      selectedCategoryFilter === "all"
        ? baseQuestions
        : baseQuestions.filter((question) => question.category === selectedCategoryFilter),
    [baseQuestions, selectedCategoryFilter],
  );
  const exportParams = new URLSearchParams();
  exportParams.set("teamGroupId", selectedTeamGroupId);
  if (questionBankSearch.trim()) {
    exportParams.set("q", questionBankSearch.trim());
  }
  if (selectedCategoryFilter !== "all") {
    exportParams.set("category", selectedCategoryFilter);
  }
  const exportUrl = `/api/training/questions/export?${exportParams.toString()}`;
  const closeRevisionDialog = () => {
    if (revisionSubmitting) return;
    setRevisionTarget(null);
    setRevisionAnswerPoints("");
  };
  const openRevisionDialog = (question: Workspace.TrainingQuestionItem) => {
    setRevisionTarget(question);
    setRevisionAnswerPoints(question.answerPoints);
  };
  const saveQuestionRevision = async () => {
    if (!revisionTarget) return;

    const answerPoints = revisionAnswerPoints.trim();
    if (!answerPoints) {
      setLoadError("请先填写修订后的标准回答要点");
      return;
    }

    setRevisionSubmitting(true);
    try {
      const payload = await Workspace.requestJson<{ question: Workspace.TrainingQuestionItem }>(
        `/api/training/questions/${revisionTarget.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            answerPoints,
            category: revisionTarget.category,
            question: revisionTarget.question,
          }),
        },
      );

      setTrainingQuestions((current) =>
        current.map((question) => (question.id === payload.question.id ? payload.question : question)),
      );
      setRevisionTarget(null);
      setRevisionAnswerPoints("");
      showSuccessToast("答案已修订", "原录入人将收到题库修订通知。");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "题库答案修订失败");
    } finally {
      setRevisionSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="系统管理员总览所有团队沉淀的答辩训练题库，可按团队筛选、关键词检索并导出 Word 版本。"
          title="题库中心"
        />
        <DemoResetNote />
      </div>

      <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className={surfaceCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">团队题库</p>
              <p className="mt-1 text-xs text-slate-500">按团队查看题库沉淀情况。</p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
              {trainingQuestions.length} 题
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {teamOptions.map((team) => (
              <button
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  selectedTeamGroupId === team.id
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-100 hover:bg-blue-50/50"
                }`}
                key={team.id}
                onClick={() => {
                  setSelectedTeamGroupId(team.id);
                  setSelectedCategoryFilter("all");
                }}
                type="button"
              >
                <span className="min-w-0 truncate text-sm font-semibold">{team.name}</span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {team.count}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <article className={surfaceCardClassName}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                {selectedTeamName}
              </span>
              <h3 className="mt-3 text-base font-semibold text-slate-900">答辩问题库</h3>
              <p className="mt-1 text-sm text-slate-500">
                当前显示 {scopedQuestions.length} 题；分类 {Object.keys(categoryCounts).length} 个。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block sm:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="搜索题库中心"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => setQuestionBankSearch(event.target.value)}
                  placeholder="搜索题目、要点、分类或录入人"
                  value={questionBankSearch}
                />
              </label>
              <a
                className="depth-button-primary inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm shadow-sm transition duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
                href={exportUrl}
              >
                <Download className="h-4 w-4" />
                导出 Word
              </a>
            </div>
          </div>

          {Object.keys(categoryCounts).length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedCategoryFilter === "all"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                }`}
                onClick={() => setSelectedCategoryFilter("all")}
                type="button"
              >
                全部 {baseQuestions.length}
              </button>
              {Object.entries(categoryCounts).map(([category, count]) => (
                <button
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedCategoryFilter === category
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                  }`}
                  key={category}
                  onClick={() => setSelectedCategoryFilter((current) => (current === category ? "all" : category))}
                  type="button"
                >
                  {category} {count}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-5 max-h-[680px] space-y-3 overflow-y-auto pr-1">
            {scopedQuestions.length > 0 ? (
              scopedQuestions.map((question) => (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={question.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                          {question.category}
                        </span>
                        <span className="text-xs text-slate-400">{question.teamGroupName}</span>
                        <span className="text-xs text-slate-400">
                          录入：{question.createdByName} · {question.createdAt}
                        </span>
                        {question.lastEditedByName && question.lastEditedAt ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            最近修订：{question.lastEditedByName} · {question.lastEditedAt}
                          </span>
                        ) : null}
                      </div>
                      <h4 className="mt-3 text-base font-semibold leading-7 text-slate-900">{question.question}</h4>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {canManageTrainingQuestion(question) ? (
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 text-xs font-semibold text-blue-600 transition hover:border-blue-200 hover:bg-blue-100"
                          onClick={() => openRevisionDialog(question)}
                          type="button"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          修订答案
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-7 text-slate-600">
                    {question.answerPoints}
                  </p>
                </section>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200">
                <EmptyState
                  description="当前团队或关键词下没有题目。可以切换团队，或清空搜索后再查看。"
                  icon={HelpCircle}
                  title="没有找到匹配的题目"
                />
              </div>
            )}
          </div>
        </article>
      </section>

      {revisionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <section className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold text-blue-600">题库修订</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">修订标准回答要点</h3>
                <p className="mt-1 text-sm text-slate-500">
                  保存后将直接替换原答案；若不是本人录入，系统会通知原录入人。
                </p>
              </div>
              <button
                className="rounded-full px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                onClick={closeRevisionDialog}
                type="button"
              >
                关闭
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                    {revisionTarget.category}
                  </span>
                  <span className="text-xs text-slate-400">{revisionTarget.teamGroupName}</span>
                  <span className="text-xs text-slate-400">
                    录入：{revisionTarget.createdByName} · {revisionTarget.createdAt}
                  </span>
                  {revisionTarget.lastEditedByName && revisionTarget.lastEditedAt ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      最近修订：{revisionTarget.lastEditedByName} · {revisionTarget.lastEditedAt}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold leading-7 text-slate-900">{revisionTarget.question}</p>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">修订后的标准回答要点</span>
                <textarea
                  className="mt-2 min-h-[240px] w-full rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => setRevisionAnswerPoints(event.target.value)}
                  placeholder="可以补充、删减或重写答案要点；保存后会替换原答案。"
                  value={revisionAnswerPoints}
                />
              </label>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                disabled={revisionSubmitting}
                onClick={closeRevisionDialog}
                type="button"
              >
                取消
              </button>
              <button
                className="depth-button-primary h-10 rounded-lg px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={revisionSubmitting}
                onClick={saveQuestionRevision}
                type="button"
              >
                {revisionSubmitting ? "保存中..." : "保存并通知原录入人"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
