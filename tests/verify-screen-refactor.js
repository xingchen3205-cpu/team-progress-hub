/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const readSource = (filePath) => readFileSync(path.join(process.cwd(), filePath), "utf8");

const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");
const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
const drawRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/draw/route.ts");
const selfDrawRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/self-draw/route.ts");
const selfDrawCandidateRouteSource = readSource(
  "src/app/api/review-screen/sessions/[sessionId]/self-draw/candidate/route.ts",
);
const orderExportRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/order/export/route.ts");
const adminTabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
const rankingStageSource = readSource("src/components/review-screen/FinalRankingStage.tsx");
const reviewScreenSessionSource = readSource("src/lib/review-screen-session.ts");

assert.match(screenPageSource, /screen-banner/);
assert.match(screenPageSource, /screen-hero-gradient/);
assert.match(screenPageSource, /南京铁道职业技术学院/);
assert.match(screenPageSource, /\/brand\/njrts-logo\.png/);
assert.equal(existsSync(path.join(process.cwd(), "public/brand/njrts-logo.png")), true);
assert.doesNotMatch(screenPageSource, /useCurrentTime/);
assert.doesNotMatch(screenPageSource, /路演答辩评审投屏/);
assert.doesNotMatch(screenPageSource, />校徽</);

assert.match(reviewScreenSessionSource, /randomInt/);
assert.doesNotMatch(reviewScreenSessionSource, /Math\.random/);
assert.match(sessionRouteSource, /currentPackageId:\s*drawMode === "self" \? null : firstPackageId/);
assert.doesNotMatch(sessionRouteSource, /shuffleArray\(orderedStageReviewPackages\)/);
assert.doesNotMatch(sessionRouteSource, /self-draw queue/);
assert.match(publicRouteSource, /currentPackageId = session\.currentPackageId/);

assert.match(drawRouteSource, /hashReviewScreenToken/);
assert.match(drawRouteSource, /tokenAuthorized/);
assert.match(drawRouteSource, /const operator = user/);
assert.match(drawRouteSource, /请使用管理员账号打开大屏后再操作/);
assert.match(drawRouteSource, /review_screen_session\.random_drawn/);
assert.match(drawRouteSource, /phaseStartedAt/);

assert.match(screenPageSource, /drawReviewScreenOrderFromScreen/);
assert.match(screenPageSource, /开始随机抽签/);
assert.match(screenPageSource, /draw-sequence-overlay/);
assert.match(screenPageSource, /drawRevealBatches/);
assert.match(screenPageSource, /公开抽签结果/);

assert.match(selfDrawCandidateRouteSource, /randomInt/);
assert.match(selfDrawCandidateRouteSource, /review_screen_session\.self_draw_candidate_selected/);
assert.match(selfDrawCandidateRouteSource, /currentPackageId:\s*pickedProject\.packageId/);
assert.match(selfDrawRouteSource, /review_screen_session\.self_drawn/);
assert.match(selfDrawRouteSource, /请先在大屏上抽取上台项目，再抽取路演顺序/);
assert.match(screenPageSource, /drawSelfDrawCandidate/);
assert.match(screenPageSource, /toggleSelfDrawCandidateRolling/);
assert.match(screenPageSource, /toggleSelfDrawSlotRolling/);
assert.match(screenPageSource, /候抽项目池/);
assert.match(screenPageSource, /抽取上台项目/);
assert.match(screenPageSource, /确定上台项目/);
assert.match(screenPageSource, /开始抽路演顺序/);
assert.match(screenPageSource, /停下并确认路演号/);

assert.match(adminTabSource, /随机抽签和自助抽签都在大屏窗口完成/);
assert.match(adminTabSource, /打开大屏抽签/);
assert.match(adminTabSource, /导出顺序表/);
assert.match(adminTabSource, /currentPackageId:\s*payload\.session\.currentPackageId \?\? null/);
assert.match(orderExportRouteSource, /application\/vnd\.ms-excel/);
assert.match(orderExportRouteSource, /路演顺序表/);
assert.match(orderExportRouteSource, /orderBy:\s*\[\{ orderIndex: "asc" \}, \{ createdAt: "asc" \}\]/);
assert.match(orderExportRouteSource, /候抽状态/);
assert.match(orderExportRouteSource, /待抽取上台项目/);

assert.match(screenPageSource, /useRevealAnimationFrame/);
assert.match(screenPageSource, /score-reveal-overlay/);
assert.match(screenPageSource, /按本轮评分规则计算/);
assert.doesNotMatch(screenPageSource, /有效评分：/);
assert.match(rankingStageSource, /本轮评审结果/);
assert.match(rankingStageSource, /final-ranking-champion/);

console.log("All verification assertions passed.");
