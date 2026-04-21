"use client";

import * as Workspace from "@/components/workspace-context";

export default function TrainingTab() {
  const {
    trainingQuestions,
    trainingSessions,
    trainingStats,
    trainingPanel,
    setTrainingPanel,
    isSaving,
    trainingQuestionDraft,
    setTrainingQuestionDraft,
    editingTrainingQuestionId,
    selectedTrainingQuestionIds,
    setActiveDrillQuestionId,
    qaDrillStats,
    trainingTimerDuration,
    trainingTimerCustomMinutes,
    setTrainingTimerCustomMinutes,
    trainingTimerElapsed,
    trainingTimerRunning,
    setTrainingTimerRunning,
    trainingSessionTitle,
    setTrainingSessionTitle,
    trainingSessionNotes,
    setTrainingSessionNotes,
    canManageTrainingQuestion,
    activeDrillQuestion,
    resetTrainingQuestionDraft,
    saveTrainingQuestion,
    editTrainingQuestion,
    openQuestionImportModal,
    deleteTrainingQuestion,
    toggleTrainingQuestionSelection,
    selectAllManageableTrainingQuestions,
    deleteSelectedTrainingQuestions,
    drawRandomTrainingQuestion,
    recordDrillAnswer,
    applyTrainingTimerPreset,
    applyCustomTrainingTimer,
    resetTrainingTimer,
    saveTrainingSession,
  } = Workspace.useWorkspaceContext();

  const {
    HelpCircle,
    Pause,
    Play,
    RotateCcw,
    Shuffle,
    Timer,
    Upload,
    trainingQuestionCategories,
    trainingTimerPresets,
    surfaceCardClassName,
    fieldClassName,
    textareaClassName,
    formatSeconds,
    SectionHeader,
    DemoResetNote,
    EmptyState,
    ActionButton,
  } = Workspace;

const renderTraining = () => {
    const remainingSeconds = Math.max(trainingTimerDuration - trainingTimerElapsed, 0);
    const overtimeSeconds = Math.max(trainingTimerElapsed - trainingTimerDuration, 0);
    const timerProgress =
      trainingTimerDuration > 0
        ? Math.min(100, Math.round((Math.min(trainingTimerElapsed, trainingTimerDuration) / trainingTimerDuration) * 100))
        : 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeader
            description="分成答辩训练和路演训练两块：前者沉淀 Q&A 题库，后者练陈述节奏和时间控制。"
            title="训练中心"
          />
          <DemoResetNote />
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          {[
            {
              key: "qa",
              icon: HelpCircle,
              title: "答辩训练",
              description: "管理评委追问、标准回答要点和随机抽查。",
              metric: `${trainingStats.questionCount} 题`,
              accent: "blue",
            },
            {
              key: "pitch",
              icon: Timer,
              title: "路演训练",
              description: "练习陈述节奏、超时控制和复盘记录。",
              metric: `${trainingStats.sessionCount} 次`,
              accent: "emerald",
            },
          ].map((item) => {
            const Icon = item.icon;
            const selected = trainingPanel === item.key;

            return (
              <button
                className={`group rounded-xl border bg-white p-5 text-left shadow-sm transition ${
                  selected
                    ? item.accent === "blue"
                      ? "border-blue-200 ring-2 ring-blue-500/10"
                      : "border-emerald-200 ring-2 ring-emerald-500/10"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                key={item.key}
                onClick={() => setTrainingPanel(item.key as "qa" | "pitch")}
                type="button"
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                      item.accent === "blue" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      selected
                        ? item.accent === "blue"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {selected ? "当前板块" : item.metric}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
              </button>
            );
          })}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {(trainingPanel === "qa"
            ? [
                { label: "题库数量", value: `${trainingStats.questionCount} 题`, hint: "覆盖商业、技术、财务等方向" },
                { label: "Q&A 命中率", value: `${trainingStats.qaHitRate}%`, hint: "抽查题回答到位比例" },
                { label: "本轮抽查", value: `${qaDrillStats.total} 题`, hint: `${qaDrillStats.hit} 题命中要点` },
              ]
            : [
                { label: "模拟训练", value: `${trainingStats.sessionCount} 次`, hint: "已保存的完整训练记录" },
                { label: "平均超时", value: formatSeconds(trainingStats.averageOvertimeSeconds), hint: "越接近 0 越稳" },
                { label: "当前计时", value: formatSeconds(trainingTimerDuration), hint: overtimeSeconds > 0 ? "已经超时" : "当前预设时长" },
              ]).map((item) => (
            <article className={surfaceCardClassName} key={item.label}>
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-900">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.hint}</p>
            </article>
          ))}
        </section>

        <section className={`grid gap-4 ${trainingPanel === "qa" ? "xl:grid-cols-[minmax(0,1fr)_420px]" : "xl:grid-cols-1"}`}>
          <article className={`${surfaceCardClassName} ${trainingPanel === "qa" ? "" : "hidden"}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                  答辩训练
                </span>
                <h3 className="mt-3 text-base font-semibold text-slate-900">模拟 Q&A 题库</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  录入常见追问和标准回答要点，也可以先上传文档自动识别，再二次校对入库。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={openQuestionImportModal}>
                  <span className="inline-flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    导入题库
                  </span>
                </ActionButton>
                {editingTrainingQuestionId ? (
                  <ActionButton onClick={resetTrainingQuestionDraft}>取消编辑</ActionButton>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                <label className="text-sm text-slate-500">
                  问题分类
                  <select
                    className={fieldClassName}
                    value={trainingQuestionDraft.category}
                    onChange={(event) =>
                      setTrainingQuestionDraft((current) => ({ ...current, category: event.target.value }))
                    }
                  >
                    {trainingQuestionCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                {trainingQuestionDraft.category === "其他" ? (
                  <label className="text-sm text-slate-500">
                    自定义分类 <span className="text-red-500">*</span>
                    <input
                      className={fieldClassName}
                      placeholder="例如：政策合规、现场追问"
                      value={trainingQuestionDraft.customCategory}
                      onChange={(event) =>
                        setTrainingQuestionDraft((current) => ({
                          ...current,
                          customCategory: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                <label
                  className={`text-sm text-slate-500 ${
                    trainingQuestionDraft.category === "其他" ? "md:col-span-2" : ""
                  }`}
                >
                  评委可能提问 <span className="text-red-500">*</span>
                  <input
                    className={fieldClassName}
                    placeholder="例如：你们的商业模式如何形成可持续收入？"
                    value={trainingQuestionDraft.question}
                    onChange={(event) =>
                      setTrainingQuestionDraft((current) => ({ ...current, question: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="text-sm text-slate-500">
                标准回答要点 <span className="text-red-500">*</span>
                <textarea
                  className={textareaClassName}
                  placeholder="写下 3-5 个回答关键词，便于抽查时快速复盘。"
                  value={trainingQuestionDraft.answerPoints}
                  onChange={(event) =>
                    setTrainingQuestionDraft((current) => ({ ...current, answerPoints: event.target.value }))
                  }
                />
              </label>
              <div className="flex justify-end">
                <ActionButton
                  disabled={isSaving}
                  loading={isSaving}
                  loadingLabel="保存中..."
                  onClick={() => void saveTrainingQuestion()}
                  variant="primary"
                >
                  {editingTrainingQuestionId ? "保存修改" : "加入题库"}
                </ActionButton>
              </div>
            </div>

            {trainingQuestions.length > 0 ? (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">题库管理</p>
                  <p className="mt-1 text-xs text-slate-500">
                    已选择 {selectedTrainingQuestionIds.length} / {trainingQuestions.length} 题；列表固定高度滚动展示。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={selectAllManageableTrainingQuestions}>
                    {selectedTrainingQuestionIds.length > 0 ? "取消选择" : "全选可删题目"}
                  </ActionButton>
                  <ActionButton
                    disabled={selectedTrainingQuestionIds.length === 0}
                    onClick={deleteSelectedTrainingQuestions}
                    variant="danger"
                  >
                    批量删除
                  </ActionButton>
                </div>
              </div>
            ) : null}

            <div className="mt-5 max-h-[640px] space-y-3 overflow-y-auto pr-1">
              {trainingQuestions.length > 0 ? (
                trainingQuestions.map((item) => (
                  <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={item.id}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 gap-3">
                        {canManageTrainingQuestion(item) ? (
                          <input
                            aria-label={`选择题目：${item.question}`}
                            checked={selectedTrainingQuestionIds.includes(item.id)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                            onChange={(event) => toggleTrainingQuestionSelection(item.id, event.target.checked)}
                            type="checkbox"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                            {item.category}
                          </span>
                          <h4 className="mt-3 text-base font-semibold leading-7 text-slate-900">{item.question}</h4>
                          <p className="mt-2 text-sm leading-7 text-slate-500">{item.answerPoints}</p>
                          <p className="mt-2 text-xs text-slate-400">
                            录入：{item.createdByName} · 更新：{item.updatedAt}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <ActionButton onClick={() => setActiveDrillQuestionId(item.id)}>
                          抽这题
                        </ActionButton>
                        {canManageTrainingQuestion(item) ? (
                          <>
                            <ActionButton onClick={() => editTrainingQuestion(item)}>编辑</ActionButton>
                            <ActionButton onClick={() => deleteTrainingQuestion(item)} variant="danger">
                              删除
                            </ActionButton>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200">
                  <EmptyState
                    description="先录入几条评委常问问题，比如商业模式、技术壁垒、财务数据。"
                    icon={HelpCircle}
                    title="题库还是空的"
                  />
                </div>
              )}
            </div>
          </article>

          <div className="space-y-4">
            <article className={`${surfaceCardClassName} ${trainingPanel === "qa" ? "" : "hidden"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">抽查模式</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">随机弹题，训练答辩人的临场反应。</p>
                </div>
                <ActionButton onClick={drawRandomTrainingQuestion} variant="primary">
                  <span className="inline-flex items-center gap-2">
                    <Shuffle className="h-4 w-4" />
                    抽一题
                  </span>
                </ActionButton>
              </div>

              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                {activeDrillQuestion ? (
                  <>
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-blue-600">
                      {activeDrillQuestion.category}
                    </span>
                    <p className="mt-3 text-lg font-semibold leading-8 text-slate-900">
                      {activeDrillQuestion.question}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      <span className="font-medium text-slate-900">回答要点：</span>
                      {activeDrillQuestion.answerPoints}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton onClick={() => recordDrillAnswer(true)} variant="primary">
                        命中要点
                      </ActionButton>
                      <ActionButton onClick={() => recordDrillAnswer(false)}>
                        还需打磨
                      </ActionButton>
                    </div>
                  </>
                ) : (
                  <p className="text-sm leading-7 text-slate-500">题库有内容后，点击“抽一题”开始训练。</p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">本轮抽查</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{qaDrillStats.total} 题</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">命中率</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {qaDrillStats.total > 0 ? Math.round((qaDrillStats.hit / qaDrillStats.total) * 100) : 0}%
                  </p>
                </div>
              </div>
            </article>

            <article className={`${surfaceCardClassName} ${trainingPanel === "pitch" ? "" : "hidden"}`}>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                路演训练
              </span>
              <h3 className="mt-3 text-base font-semibold text-slate-900">模拟计时器</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                可选常用路演时长，也可以自定义分钟数，适合陈述节奏和问答节奏训练。
              </p>

              <div className="mt-4 grid gap-2">
                {trainingTimerPresets.map((preset) => (
                  <button
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      trainingTimerDuration === preset.seconds
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                    key={preset.key}
                    onClick={() => applyTrainingTimerPreset(preset)}
                    type="button"
                  >
                    <span className="text-sm font-semibold">{preset.label}</span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">{preset.description}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-3">
                <label className="text-sm text-slate-500">
                  自定义计时（分钟）
                  <div className="mt-1.5 flex gap-2">
                    <input
                      className={fieldClassName}
                      inputMode="decimal"
                      min="1"
                      max="180"
                      placeholder="例如：6"
                      type="number"
                      value={trainingTimerCustomMinutes}
                      onChange={(event) => setTrainingTimerCustomMinutes(event.target.value)}
                    />
                    <ActionButton onClick={applyCustomTrainingTimer}>应用</ActionButton>
                  </div>
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-950 px-5 py-6 text-center text-white">
                <p className="text-xs tracking-[0.2em] text-white/50">
                  {overtimeSeconds > 0 ? "已超时" : "剩余时间"}
                </p>
                <p className={`mt-2 text-[48px] font-bold tabular-nums ${overtimeSeconds > 0 ? "text-red-300" : ""}`}>
                  {overtimeSeconds > 0 ? `+${formatSeconds(overtimeSeconds)}` : formatSeconds(remainingSeconds)}
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-blue-400" style={{ width: `${timerProgress}%` }} />
                </div>
                <div className="mt-5 flex justify-center gap-2">
                  <ActionButton
                    onClick={() => setTrainingTimerRunning((current) => !current)}
                    variant="primary"
                  >
                    <span className="inline-flex items-center gap-2">
                      {trainingTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {trainingTimerRunning ? "暂停" : "开始"}
                    </span>
                  </ActionButton>
                  <ActionButton onClick={resetTrainingTimer}>
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      重置
                    </span>
                  </ActionButton>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  className={fieldClassName}
                  placeholder="训练标题，例如：校内终审彩排第 1 轮"
                  value={trainingSessionTitle}
                  onChange={(event) => setTrainingSessionTitle(event.target.value)}
                />
                <textarea
                  className={`${textareaClassName} min-h-24`}
                  placeholder="复盘备注：哪里超时、哪类问题没答好、下一轮要练什么。"
                  value={trainingSessionNotes}
                  onChange={(event) => setTrainingSessionNotes(event.target.value)}
                />
                <ActionButton
                  disabled={isSaving}
                  loading={isSaving}
                  loadingLabel="保存中..."
                  onClick={() => void saveTrainingSession()}
                  variant="primary"
                >
                  保存训练记录
                </ActionButton>
              </div>
            </article>

            <article className={`${surfaceCardClassName} ${trainingPanel === "pitch" ? "" : "hidden"}`}>
              <h3 className="text-base font-semibold text-slate-900">最近训练记录</h3>
              <div className="mt-4 space-y-3">
                {trainingSessions.slice(0, 5).map((session) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={session.id}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{session.title}</p>
                      <span className="text-xs text-slate-400">{session.createdAt}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      用时 {formatSeconds(session.durationSeconds)} · 超时 {formatSeconds(session.overtimeSeconds)} · Q&A 命中 {session.qaHitRate}%
                    </p>
                  </div>
                ))}
                {trainingSessions.length === 0 ? (
                  <p className="text-sm leading-7 text-slate-500">还没有训练记录，完成一次计时后可以保存复盘。</p>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      </div>
    );
  };

  return renderTraining();
}
