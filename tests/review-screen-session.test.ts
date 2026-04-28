import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const readSource = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

describe("roadshow review screen session", () => {
  it("keeps screen seats anonymous and does not expose real expert names", async () => {
    const { buildAnonymousReviewScreenSeats } = await import("../src/lib/review-screen-session");

    const seats = buildAnonymousReviewScreenSeats([
      { assignmentId: "a1", expertUserId: "u1", expertName: "张教授", status: "pending", totalScoreCents: null },
      { assignmentId: "a2", expertUserId: "u2", expertName: "李教授", status: "submitted", totalScoreCents: 8865 },
    ]);

    assert.deepEqual(
      seats.map((seat) => seat.displayName),
      ["专家 1", "专家 2"],
    );
    assert.doesNotMatch(JSON.stringify(seats), /张教授|李教授|u1|u2/);
    assert.equal(seats[1].scoreText, "88.65");
  });

  it("does not reveal a final score until every non-voided seat has submitted", async () => {
    const { calculateReviewScreenFinalScore } = await import("../src/lib/review-screen-session");

    const result = calculateReviewScreenFinalScore(
      [
        { seatNo: 1, status: "submitted", totalScoreCents: 9000 },
        { seatNo: 2, status: "pending", totalScoreCents: null },
        { seatNo: 3, status: "submitted", totalScoreCents: 8000 },
      ],
      { dropHighestCount: 1, dropLowestCount: 1 },
    );

    assert.equal(result.ready, false);
    assert.equal(result.finalScoreText, null);
    assert.equal(result.waitingSeatNos.join(","), "2");
  });

  it("supports voided seats and calculates the locked final score with two decimals", async () => {
    const { calculateReviewScreenFinalScore } = await import("../src/lib/review-screen-session");

    const result = calculateReviewScreenFinalScore(
      [
        { seatNo: 1, status: "submitted", totalScoreCents: 9550 },
        { seatNo: 2, status: "submitted", totalScoreCents: 8800 },
        { seatNo: 3, status: "voided", totalScoreCents: null },
        { seatNo: 4, status: "submitted", totalScoreCents: 8125 },
        { seatNo: 5, status: "submitted", totalScoreCents: 9010 },
      ],
      { dropHighestCount: 1, dropLowestCount: 1 },
    );

    assert.equal(result.ready, true);
    assert.equal(result.effectiveSeatCount, 4);
    assert.deepEqual(result.droppedSeatNos, [1, 3, 4]);
    assert.equal(result.finalScoreText, "89.05");
  });

  it("builds one stable screen seat per expert across all projects in a roadshow stage", async () => {
    const { buildReviewDisplaySeatSeeds } = await import("../src/lib/review-screen-session");

    const seats = buildReviewDisplaySeatSeeds([
      { id: "p1-u1", expertUserId: "u1" },
      { id: "p1-u2", expertUserId: "u2" },
      { id: "p2-u1", expertUserId: "u1" },
      { id: "p2-u2", expertUserId: "u2" },
      { id: "p3-u1", expertUserId: "u1" },
    ]);

    assert.equal(seats.length, 2);
    assert.deepEqual(
      seats.map((seat) => [seat.assignmentId, seat.expertUserId, seat.displayName, seat.status]),
      [
        ["p1-u1", "u1", "专家 1", "pending"],
        ["p1-u2", "u2", "专家 2", "pending"],
      ],
    );
  });

  it("averages all scores when there are too few seats for high-low trimming", async () => {
    const { calculateReviewScreenFinalScore } = await import("../src/lib/review-screen-session");

    const result = calculateReviewScreenFinalScore(
      [
        { seatNo: 1, status: "submitted", totalScoreCents: 7972 },
        { seatNo: 2, status: "submitted", totalScoreCents: 8868 },
      ],
      { dropHighestCount: 1, dropLowestCount: 1 },
    );

    assert.equal(result.ready, true);
    assert.equal(result.effectiveSeatCount, 2);
    assert.deepEqual(result.droppedSeatNos, []);
    assert.equal(result.finalScoreText, "84.20");
  });

  it("keeps the countdown in waiting mode after time expires until all valid seats submit", async () => {
    const { getReviewScreenTimelineState } = await import("../src/lib/review-screen-session");

    const result = getReviewScreenTimelineState({
      status: "scoring",
      startedAt: "2026-04-26T12:00:00.000Z",
      countdownSeconds: 60,
      now: new Date("2026-04-26T12:01:20.000Z"),
      hasFinalScore: false,
    });

    assert.equal(result.phase, "overtime");
    assert.equal(result.remainingSeconds, 0);
    assert.equal(result.label, "等待全部专家提交");
  });

  it("declares durable session and seat tables instead of storing screen state in memory", () => {
    const schemaSource = readSource("prisma/schema.prisma");

    assert.match(schemaSource, /model ReviewDisplaySession/);
    assert.match(schemaSource, /model ReviewDisplaySeat/);
    assert.match(schemaSource, /tokenHash\s+String\s+@unique/);
    assert.match(schemaSource, /dropHighestCount\s+Int\s+@default\(1\)/);
    assert.match(schemaSource, /dropLowestCount\s+Int\s+@default\(1\)/);
    assert.match(schemaSource, /@@unique\(\[sessionId,\s*seatNo\]\)/);
  });

  it("adds token-protected screen APIs and a standalone full-screen display page", () => {
    const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
    const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
    const adminTabSource = readSource("src/components/tabs/expert-review-tab.tsx");
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(sessionRouteSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
    assert.match(sessionRouteSource, /projectReviewStageType:\s*"roadshow"/);
    assert.match(sessionRouteSource, /seats:\s*\{/);
    assert.match(publicRouteSource, /hashReviewScreenToken/);
    assert.match(publicRouteSource, /tokenExpiresAt/);
    assert.doesNotMatch(publicRouteSource, /expertUser:\s*\{\s*select:\s*\{\s*name/);
    assert.match(adminTabSource, /固定专家席位/);
    assert.match(adminTabSource, /异常排除/);
    assert.doesNotMatch(adminTabSource, /作废席位/);
    assert.match(adminTabSource, /voidReviewScreenSeat/);
    assert.match(screenPageSource, /useSearchParams/);
    assert.match(screenPageSource, /专家 1/);
    assert.match(screenPageSource, /等待全部有效席位提交/);
    assert.match(screenPageSource, /最终得分/);
  });

  it("uses one roadshow screen session for all packages under the same project stage", () => {
    const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
    const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
    const orderRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/order/route.ts");
    const nextProjectRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/next-project/route.ts");
    const adminTabSource = readSource("src/components/tabs/expert-review-tab.tsx");
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(sessionRouteSource, /stageReviewPackages/);
    assert.match(sessionRouteSource, /projectReviewStageId/);
    assert.match(sessionRouteSource, /packageIds/);
    assert.match(sessionRouteSource, /buildReviewDisplaySeatSeeds/);
    assert.match(sessionRouteSource, /reviewDisplayProjectOrder\.createMany/);
    assert.match(sessionRouteSource, /reviewPackage\.projectReviewStageId/);
    assert.match(publicRouteSource, /projectResults/);
    assert.match(publicRouteSource, /projectOrderPackages/);
    assert.match(publicRouteSource, /assignmentsByExpertId/);
    assert.doesNotMatch(publicRouteSource, /seat\.assignment\.reviewPackage/);
    assert.match(orderRouteSource, /packageIds/);
    assert.match(orderRouteSource, /本轮已开始，不能调整路演顺序/);
    assert.match(nextProjectRouteSource, /projectOrders/);
    assert.match(adminTabSource, /packageIds/);
    assert.match(adminTabSource, /stageGroupKeys/);
    assert.match(adminTabSource, /现场大屏控制台/);
    assert.match(adminTabSource, /lg:grid-cols-\[minmax\(0,1fr\)_280px\]/);
    assert.match(adminTabSource, /路演顺序/);
    assert.match(adminTabSource, /上移/);
    assert.match(adminTabSource, /下移/);
    assert.match(adminTabSource, /路演时长/);
    assert.match(adminTabSource, /答辩时长/);
    assert.match(adminTabSource, /评分时长/);
    assert.doesNotMatch(adminTabSource, /启动计时/);
    assert.match(screenPageSource, /projectResults/);
  });

  it("lets administrators regenerate a screen link for testing even after the old review deadline", () => {
    const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
    const assignmentRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");

    assert.match(sessionRouteSource, /defaultTokenExpiresAt/);
    assert.doesNotMatch(sessionRouteSource, /评审已截止，不能生成大屏链接/);
    assert.match(assignmentRouteSource, /status:\s*"locked"/);
    assert.match(assignmentRouteSource, /data:\s*\{\s*status:\s*"pending"\s*\}/);
    assert.match(assignmentRouteSource, /重置并重新配置|评审包已重置/);
  });

  it("renders the review screen page in a blue-white theme suitable for large-screen projection", () => {
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(screenPageSource, /bg-gradient-to-br from-blue-50 via-white to-slate-50/);
    assert.match(screenPageSource, /text-slate-900/);
    assert.doesNotMatch(screenPageSource, /bg-slate-950/);
  });

  it("shows current time and phase on the review screen header", () => {
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(screenPageSource, /useCurrentTime/);
    assert.match(screenPageSource, /new Date\(\)/);
    assert.match(screenPageSource, /现场路演评审投屏/);
    assert.match(screenPageSource, /currentTime/);
  });

  it("does not render admin control buttons on the projection screen", () => {
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.doesNotMatch(screenPageSource, /作废席位/);
    assert.doesNotMatch(screenPageSource, /开始评分/);
    assert.doesNotMatch(screenPageSource, /生成并复制链接/);
    assert.doesNotMatch(screenPageSource, /voidReviewScreenSeat/);
    assert.doesNotMatch(screenPageSource, /startReviewScreenScoring/);
    assert.doesNotMatch(screenPageSource, /copyReviewScreenLink/);
    assert.doesNotMatch(screenPageSource, /onClick/);
  });

  it("includes large-screen key copy and anonymous seat status on the projection screen", () => {
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(screenPageSource, /当前评审项目/);
    assert.match(screenPageSource, /匿名专家席位状态/);
    assert.match(screenPageSource, /最终得分/);
    assert.match(screenPageSource, /提交进度/);
    assert.match(screenPageSource, /现场说明/);
    assert.match(screenPageSource, /本轮排名/);
    assert.match(screenPageSource, /专家 1/);
    assert.match(screenPageSource, /专家 2/);
    assert.match(screenPageSource, /专家 3/);
  });
});
