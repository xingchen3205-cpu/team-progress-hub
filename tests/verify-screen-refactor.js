/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const readSource = (filePath) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

// review-screen-session.test.ts equivalent assertions
{
  const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

  // Blue-white theme
  assert.match(screenPageSource, /bg-gradient-to-br from-blue-50 via-white to-slate-50/);
  assert.match(screenPageSource, /text-slate-900/);
  assert.doesNotMatch(screenPageSource, /bg-slate-950/);

  // Current time
  assert.match(screenPageSource, /useCurrentTime/);
  assert.match(screenPageSource, /new Date\(\)/);
  assert.match(screenPageSource, /现场路演评审投屏/);

  // No admin buttons - the screen can show voided status text, but should not have clickable admin actions
  assert.doesNotMatch(screenPageSource, /onClick/);
  assert.doesNotMatch(screenPageSource, /type="button"/);

  // Key copy
  assert.match(screenPageSource, /当前评审项目/);
  assert.match(screenPageSource, /匿名专家席位状态/);
  assert.match(screenPageSource, /最终得分/);
  assert.match(screenPageSource, /提交进度/);
  assert.match(screenPageSource, /现场说明/);
  assert.match(screenPageSource, /本轮排名/);
  assert.match(screenPageSource, /专家 1/);
  assert.match(screenPageSource, /专家 2/);
  assert.match(screenPageSource, /专家 3/);

  // Anonymous protection still in lib
  const libSource = readSource("src/lib/review-screen-session.ts");
  assert.match(libSource, /displayName:\s*`专家 \${index \+ 1}`/);

  // APIs still present
  const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
  const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
  assert.match(sessionRouteSource, /stageReviewPackages/);
  assert.match(sessionRouteSource, /projectReviewStageId/);
  assert.match(publicRouteSource, /projectResults/);

  // Admin tab still has controls
  const adminTabSource = readSource("src/components/tabs/expert-review-tab.tsx");
  assert.match(adminTabSource, /现场大屏控制/);
  assert.match(adminTabSource, /作废席位/);
  assert.match(adminTabSource, /voidReviewScreenSeat/);
  assert.match(adminTabSource, /打开大屏/);
  assert.match(adminTabSource, /开始评分/);
  assert.match(adminTabSource, /生成并复制链接/);
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
