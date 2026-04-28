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

  // No admin buttons - the screen can show voided status text, but should not have clickable admin actions
  assert.doesNotMatch(screenPageSource, /onClick/);
  assert.doesNotMatch(screenPageSource, /type="button"/);

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
  const schemaSource = readSource("prisma/schema.prisma");
  assert.match(schemaSource, /groupName\s+String\?/);
  assert.match(schemaSource, /groupIndex\s+Int\s+@default\(0\)/);
  assert.match(schemaSource, /groupSlotIndex\s+Int\s+@default\(0\)/);

  // APIs still present
  const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
  const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
  const phaseRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/phase/route.ts");
  assert.match(sessionRouteSource, /stageReviewPackages/);
  assert.match(sessionRouteSource, /projectReviewStageId/);
  assert.match(sessionRouteSource, /roadshowGroupSizes/);
  assert.match(sessionRouteSource, /buildRoadshowProjectOrderRows/);
  assert.match(publicRouteSource, /projectResults/);
  assert.match(phaseRouteSource, /reveal: \["finished"\]/);
  assert.match(phaseRouteSource, /scoring: \["scoring", "finished"\]/);

  // Admin tab still has controls
  const adminTabSource = readSource("src/components/tabs/expert-review-tab.tsx");
  assert.match(adminTabSource, /现场大屏控制/);
  assert.match(adminTabSource, /固定专家席位/);
  assert.match(adminTabSource, /异常排除/);
  assert.doesNotMatch(adminTabSource, /作废席位/);
  assert.match(adminTabSource, /voidReviewScreenSeat/);
  assert.match(adminTabSource, /打开大屏/);
  assert.match(adminTabSource, /开始评分/);
  assert.match(adminTabSource, /生成并复制链接/);
  assert.match(adminTabSource, /路演分组容量/);
  assert.match(adminTabSource, /getRoadshowGroupSizesPayload/);
  assert.match(adminTabSource, /mergeConsoleSeats/);
  assert.match(adminTabSource, /结束本轮/);
  assert.match(adminTabSource, /changeReviewScreenPhase\(group, "finished"\)/);
  assert.match(adminTabSource, /getReviewScreenPhaseActionLabel/);
  assert.doesNotMatch(adminTabSource, /阶段已切换为：\$\{phase\}/);
  assert.doesNotMatch(adminTabSource, /disabled=\{Boolean\(screenSession\)\}/);
}

// expert-review-v2.test.ts spot-checks (string-based only)
{
  const tabSource = readSource("src/components/tabs/expert-review-tab.tsx");
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
