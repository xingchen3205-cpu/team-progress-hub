/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const readSource = (filePath) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

// review-screen-session.test.ts equivalent assertions
{
  const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

  // Blue-white base with official red-blue banner treatment
  assert.match(screenPageSource, /screen-banner/);
  assert.match(screenPageSource, /screen-hero-gradient/);
  assert.match(screenPageSource, /中国国际大学生创新大赛/);
  assert.match(screenPageSource, /text-slate-900/);
  assert.doesNotMatch(screenPageSource, /bg-slate-950/);

  // Current time
  assert.match(screenPageSource, /useCurrentTime/);
  assert.match(screenPageSource, /new Date\(\)/);
  assert.match(screenPageSource, /路演答辩评审投屏/);

  // No admin buttons - the screen may expose self-draw clicks, but should not expose admin actions
  assert.match(screenPageSource, /selfDrawProject/);
  assert.doesNotMatch(screenPageSource, /voidReviewScreenSeat/);
  assert.doesNotMatch(screenPageSource, /copyReviewScreenLink/);

  // Key copy
  assert.match(screenPageSource, /drawEnabled \? "抽签分组" : null/);
  assert.match(screenPageSource, /评审打分/);
  assert.match(screenPageSource, /screenDisplay\.showRankingOnScreen \? "实时排名" : null/);
  assert.match(screenPageSource, /路演顺序/);
  assert.match(screenPageSource, /当前评审项目/);
  assert.match(screenPageSource, /匿名专家席位状态/);
  assert.match(screenPageSource, /最终得分/);
  assert.match(screenPageSource, /提交进度/);
  assert.match(screenPageSource, /评分倒计时/);
  assert.match(screenPageSource, /screen-full-countdown/);
  assert.match(screenPageSource, /draw-sequence-overlay/);
  assert.match(screenPageSource, /phase-panel/);
  assert.match(screenPageSource, /drawOverlayActive/);
  assert.match(screenPageSource, /phase === "draw" && !drawEnabled/);
  assert.match(screenPageSource, /hasDrawStarted/);
  assert.match(screenPageSource, /payload\?\.session\.phaseStartedAt/);
  assert.doesNotMatch(screenPageSource, /等待管理员点击随机抽签/);
  assert.doesNotMatch(screenPageSource, /等待全部有效席位提交/);
  assert.match(screenPageSource, /seat-score-ticker/);
  assert.match(screenPageSource, /scoreText/);
  assert.match(screenPageSource, /useRevealAnimationFrame/);
  assert.match(screenPageSource, /window\.requestAnimationFrame/);
  assert.match(screenPageSource, /revealFrameTime/);
  assert.match(screenPageSource, /screenDisplay\.showFinalScoreOnScreen && phase === "reveal"/);
  assert.doesNotMatch(screenPageSource, /评分规则：去掉最高分和最低分，取平均值/);
  assert.match(screenPageSource, /score-reveal-overlay/);
  assert.match(screenPageSource, /waiting-dots/);
  assert.match(screenPageSource, /seat-pop/);
  assert.doesNotMatch(screenPageSource, /现场说明/);
  assert.doesNotMatch(screenPageSource, /grid-cols-\[minmax\(0,1fr\)_380px\]/);
  assert.match(screenPageSource, /本轮排名/);
  assert.match(screenPageSource, /专家 1/);
  assert.match(screenPageSource, /专家 2/);
  assert.match(screenPageSource, /专家 3/);

  // Anonymous protection still in lib
  const libSource = readSource("src/lib/review-screen-session.ts");
  assert.match(libSource, /displayName:\s*`专家 \${index \+ 1}`/);
  const scoreRuleSource = readSource("src/lib/review-score-rules.ts");
  assert.match(scoreRuleSource, /getRemainingReviewScoreCount/);
  assert.match(scoreRuleSource, /至少保留 2 个有效评分/);
  const schemaSource = readSource("prisma/schema.prisma");
  assert.match(schemaSource, /groupName\s+String\?/);
  assert.match(schemaSource, /groupIndex\s+Int\s+@default\(0\)/);
  assert.match(schemaSource, /groupSlotIndex\s+Int\s+@default\(0\)/);
  assert.match(schemaSource, /model ExpertReviewPackage[\s\S]*dropHighestCount\s+Int\s+@default\(1\)/);
  assert.match(schemaSource, /model ExpertReviewPackage[\s\S]*dropLowestCount\s+Int\s+@default\(1\)/);
  assert.match(schemaSource, /model ReviewDisplayProjectOrder[\s\S]*finalScoreCents\s+Int\?/);
  assert.match(schemaSource, /model ReviewDisplayProjectOrder[\s\S]*scoreLockedAt\s+DateTime\?/);

  // APIs still present
  const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
  const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
  const phaseRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/phase/route.ts");
  const nextProjectRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/next-project/route.ts");
  const settingsRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/settings/route.ts");
  const revealRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/reveal/route.ts");
  const restoreSeatRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/restore-seat/route.ts");
  assert.match(sessionRouteSource, /stageReviewPackages/);
  assert.match(sessionRouteSource, /projectReviewStageId/);
  assert.match(sessionRouteSource, /roadshowGroupSizes/);
  assert.match(sessionRouteSource, /buildRoadshowProjectOrderRows/);
  assert.match(sessionRouteSource, /dropHighestCount:\s*reviewPackage\.dropHighestCount/);
  assert.match(sessionRouteSource, /dropLowestCount:\s*reviewPackage\.dropLowestCount/);
  assert.match(publicRouteSource, /projectResults/);
  assert.match(publicRouteSource, /formatScoreCents/);
  assert.match(publicRouteSource, /scoreLockedAt/);
  assert.doesNotMatch(publicRouteSource, /dropHighestCount:\s*session\.dropHighestCount/);
  assert.match(phaseRouteSource, /reveal: \["finished"\]/);
  assert.match(phaseRouteSource, /scoring: \["scoring"\]/);
  assert.match(phaseRouteSource, /还有后续项目，请先切换到下一项目/);
  assert.match(phaseRouteSource, /请先完成当前项目流程后再结束本轮/);
  assert.match(nextProjectRouteSource, /targetPackageId/);
  assert.match(nextProjectRouteSource, /项目不在本轮路演顺序中/);
  assert.match(nextProjectRouteSource, /screenPhase:\s*"draw"/);
  assert.match(nextProjectRouteSource, /等待下一项目出场/);
  assert.match(revealRouteSource, /dropHighestCount:\s*currentReviewPackage\.dropHighestCount/);
  assert.match(revealRouteSource, /dropLowestCount:\s*currentReviewPackage\.dropLowestCount/);
  assert.match(revealRouteSource, /validateReviewScoreRule/);
  assert.match(revealRouteSource, /scoreLockedAt/);
  assert.match(revealRouteSource, /droppedSeatNos/);

  // Admin tab still has controls
  const adminTabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
  const shellSource = readSource("src/components/workspace-shell.tsx");
  const contextSource = readSource("src/components/workspace-context.tsx");
  const assignmentRouteSource = readSource("src/app/api/expert-reviews/assignments/route.ts");
  const assignmentItemRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
  assert.match(adminTabSource, /review-large-scene/);
  assert.match(adminTabSource, /review-admin-control-shell/);
  assert.match(adminTabSource, /review-stage-strip/);
  assert.match(adminTabSource, /review-now-bar/);
  assert.match(adminTabSource, /review-global-progress/);
  assert.match(adminTabSource, /review-track-view/);
  assert.match(adminTabSource, /monitor-matrix/);
  assert.match(adminTabSource, /review-config-card/);
  assert.match(adminTabSource, /review-danger-zone/);
  assert.match(adminTabSource, /review-content-grid/);
  assert.match(adminTabSource, /pkg-info/);
  assert.match(adminTabSource, /overview-grid/);
  assert.match(adminTabSource, /expert-row/);
  assert.match(adminTabSource, /--stage-dark/);
  assert.match(adminTabSource, /--brand/);
  assert.match(adminTabSource, /LIVE 直播中/);
  assert.match(adminTabSource, /当前项目/);
  assert.match(adminTabSource, /倒计时/);
  assert.match(adminTabSource, /上一项目/);
  assert.match(adminTabSource, /下一项目/);
  assert.match(adminTabSource, /完成本项/);
  assert.match(adminTabSource, /全场进度/);
  assert.match(adminTabSource, /路演轨道/);
  assert.match(adminTabSource, /评分监看矩阵 · 项目 × 专家 · 实时状态/);
  assert.match(adminTabSource, /⚠ 后台实名/);
  assert.match(adminTabSource, /此区域仅后台可见/);
  assert.match(adminTabSource, /规则: 去/);
  assert.match(adminTabSource, /正常结束本轮评审/);
  assert.match(adminTabSource, /删除配置/);
  assert.match(adminTabSource, /xl:grid-cols-\[minmax\(0,1fr\)_340px\]/);
  assert.doesNotMatch(adminTabSource, /投屏同步中/);
  assert.doesNotMatch(adminTabSource, /phase-control-bar/);
  assert.doesNotMatch(adminTabSource, /现场检查/);
  assert.doesNotMatch(adminTabSource, /下一步建议/);
  assert.match(adminTabSource, /流程控制/);
  assert.match(adminTabSource, /分组进度/);
  assert.match(adminTabSource, /progressGroups/);
  assert.match(adminTabSource, /max-h-\[520px\]/);
  assert.doesNotMatch(adminTabSource, /当前项目最终得分/);
  assert.match(adminTabSource, /expert-row/);
  assert.match(adminTabSource, /确认计算并锁定当前项目得分/);
  assert.doesNotMatch(adminTabSource, /推送到投屏播放揭晓动画/);
  assert.match(adminTabSource, /确认结束本轮所有评审？投屏将进入本轮结束状态/);
  assert.match(adminTabSource, /isScreenSessionFinished/);
  assert.match(adminTabSource, /本轮评审已结束/);
  assert.match(adminTabSource, /已关闭现场控制/);
  assert.match(adminTabSource, /后台显示专家实名，大屏继续保持匿名/);
  assert.match(adminTabSource, /固定专家席位/);
  assert.match(adminTabSource, /异常排除/);
  assert.doesNotMatch(adminTabSource, /作废席位/);
  assert.match(adminTabSource, /voidReviewScreenSeat/);
  assert.match(adminTabSource, /📺 大屏/);
  assert.match(adminTabSource, /开始评分/);
  assert.match(adminTabSource, /生成并复制链接/);
  assert.match(adminTabSource, /确认计算并锁定当前项目得分/);
  assert.match(adminTabSource, /路演分组容量/);
  assert.match(adminTabSource, /评分规则（来自评审包）/);
  assert.match(adminTabSource, /去最高分/);
  assert.match(adminTabSource, /去最低分/);
  assert.doesNotMatch(adminTabSource, /updateScreenTimingDraft\(group\.key,\s*"dropHighestCount"/);
  assert.doesNotMatch(adminTabSource, /updateScreenTimingDraft\(group\.key,\s*"dropLowestCount"/);
  assert.match(adminTabSource, /getRoadshowGroupSizesPayload/);
  assert.match(adminTabSource, /uniqueSessionEntries/);
  assert.match(adminTabSource, /projectResults/);
  assert.match(adminTabSource, /getLiveAssignmentScoreText/);
  assert.match(adminTabSource, /activeGroupFinalScoreText/);
  assert.match(adminTabSource, /mergeConsoleSeats/);
  assert.match(adminTabSource, /restoreReviewScreenSeat/);
  assert.match(adminTabSource, /restore-seat/);
  assert.match(adminTabSource, /copyReviewScreenUrl/);
  assert.match(adminTabSource, /已复制/);
  assert.match(adminTabSource, /排除该专家后，其席位将不参与评分计算。确定排除？/);
  assert.match(adminTabSource, /saveReviewScreenTiming/);
  assert.match(adminTabSource, /settings/);
  assert.match(adminTabSource, /switchReviewScreenProject/);
  assert.match(adminTabSource, /正常结束本轮/);
  assert.match(adminTabSource, /结束本轮评审/);
  assert.match(adminTabSource, /force: true/);
  assert.match(adminTabSource, /取消本阶段评审配置/);
  assert.doesNotMatch(adminTabSource, /匿名专家席位/);
  assert.match(phaseRouteSource, /forceFinish/);
  assert.match(adminTabSource, /changeReviewScreenPhase\(group, "finished"/);
  assert.match(adminTabSource, /currentPhase === "finished"/);
  assert.match(adminTabSource, /canEditConfigFields/);
  assert.match(adminTabSource, /投屏设置已锁定/);
  assert.match(adminTabSource, /drawControlsVisible/);
  assert.match(adminTabSource, /screenDisplay\.selfDrawEnabled/);
  assert.match(adminTabSource, /不需要抽签/);
  assert.match(adminTabSource, /getReviewScreenPhaseActionLabel/);
  assert.doesNotMatch(adminTabSource, /阶段已切换为：\$\{phase\}/);
  assert.doesNotMatch(adminTabSource, /disabled=\{Boolean\(screenSession\)\}/);
  assert.match(restoreSeatRouteSource, /status:\s*"pending"/);
  assert.match(restoreSeatRouteSource, /voidedAt:\s*null/);
  assert.match(restoreSeatRouteSource, /voidReason:\s*null/);
  assert.match(settingsRouteSource, /presentationSeconds/);
  assert.match(settingsRouteSource, /qaSeconds/);
  assert.match(settingsRouteSource, /scoringSeconds/);
  assert.match(settingsRouteSource, /screenPhase:\s*true/);
  assert.match(settingsRouteSource, /session\.screenPhase !== "draw"/);
  assert.match(settingsRouteSource, /本轮已开始，投屏设置已锁定/);
  assert.match(shellSource, /最终得分计算规则/);
  assert.match(shellSource, /当前有效专家/);
  assert.match(shellSource, /去掉后剩余/);
  assert.match(shellSource, /reviewScoreRuleInvalid/);
  assert.match(contextSource, /dropHighestCount/);
  assert.match(contextSource, /dropLowestCount/);
  assert.match(assignmentRouteSource, /validateReviewScoreRule/);
  assert.match(assignmentItemRouteSource, /validateReviewScoreRule/);
}

// expert-review-v2.test.ts spot-checks (string-based only)
{
  const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
  assert.match(tabSource, /项目网络评审/);
  assert.match(tabSource, /项目路演评审/);
  assert.match(tabSource, /确认提交/);
  assert.match(tabSource, /评审管理/);
  assert.match(tabSource, /导出评分明细/);
  assert.match(tabSource, /downloadReviewScoreDetails/);
  assert.match(tabSource, /提交评分/);
  assert.match(tabSource, /toFixed\(2\)/);
  assert.match(tabSource, /reviewDeadlineText/);
  assert.match(tabSource, /提交后不可修改/);

  assert.doesNotMatch(tabSource, /评审规则设置/);
  assert.doesNotMatch(tabSource, /专家评审与大屏投屏/);
  assert.doesNotMatch(tabSource, /投屏模式/);
  assert.doesNotMatch(tabSource, /实时分数段/);
  assert.doesNotMatch(tabSource, /路演投屏与评分规则/);
  assert.doesNotMatch(tabSource, /个人成长/);
  assert.doesNotMatch(tabSource, /项目创新/);
  assert.doesNotMatch(tabSource, /产业价值/);
  assert.doesNotMatch(tabSource, /团队协作/);
}

console.log("All verification assertions passed.");
