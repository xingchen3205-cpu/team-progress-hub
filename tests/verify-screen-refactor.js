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
  assert.match(screenPageSource, /抽签分组/);
  assert.match(screenPageSource, /评审打分/);
  assert.match(screenPageSource, /实时排名/);
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
  assert.match(screenPageSource, /hasDrawStarted/);
  assert.match(screenPageSource, /payload\?\.session\.phaseStartedAt/);
  assert.doesNotMatch(screenPageSource, /等待全部有效席位提交/);
  assert.match(screenPageSource, /seat-score-ticker/);
  assert.match(screenPageSource, /scoreText/);
  assert.match(screenPageSource, /useRevealAnimationFrame/);
  assert.match(screenPageSource, /window\.requestAnimationFrame/);
  assert.match(screenPageSource, /revealFrameTime/);
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
  assert.match(phaseRouteSource, /scoring: \["scoring", "finished"\]/);
  assert.match(nextProjectRouteSource, /targetPackageId/);
  assert.match(nextProjectRouteSource, /项目不在本轮路演顺序中/);
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
  assert.match(adminTabSource, /现场大屏控制/);
  assert.match(adminTabSource, /review-admin-control-shell/);
  assert.match(adminTabSource, /xl:grid-cols-\[minmax\(0,1fr\)_340px\]/);
  assert.match(adminTabSource, /投屏同步中/);
  assert.match(adminTabSource, /phase-control-bar/);
  assert.match(adminTabSource, /当前项目最终得分/);
  assert.match(adminTabSource, /expert-seat-row/);
  assert.match(adminTabSource, /确认提交分数？将按规则计算最终得分并推送到投屏播放揭晓动画。/);
  assert.match(adminTabSource, /确认结束本轮？投屏将显示最终排名。/);
  assert.match(adminTabSource, /固定专家席位/);
  assert.match(adminTabSource, /异常排除/);
  assert.doesNotMatch(adminTabSource, /作废席位/);
  assert.match(adminTabSource, /voidReviewScreenSeat/);
  assert.match(adminTabSource, /打开大屏/);
  assert.match(adminTabSource, /开始评分/);
  assert.match(adminTabSource, /生成并复制链接/);
  assert.match(adminTabSource, /确认并计算最终得分/);
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
  assert.match(adminTabSource, /结束本轮/);
  assert.match(adminTabSource, /changeReviewScreenPhase\(group, "finished"\)/);
  assert.match(adminTabSource, /currentPhase === "finished"/);
  assert.match(adminTabSource, /getReviewScreenPhaseActionLabel/);
  assert.doesNotMatch(adminTabSource, /阶段已切换为：\$\{phase\}/);
  assert.doesNotMatch(adminTabSource, /disabled=\{Boolean\(screenSession\)\}/);
  assert.match(restoreSeatRouteSource, /status:\s*"pending"/);
  assert.match(restoreSeatRouteSource, /voidedAt:\s*null/);
  assert.match(restoreSeatRouteSource, /voidReason:\s*null/);
  assert.match(settingsRouteSource, /presentationSeconds/);
  assert.match(settingsRouteSource, /qaSeconds/);
  assert.match(settingsRouteSource, /scoringSeconds/);
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
