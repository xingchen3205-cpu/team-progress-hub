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
    assert.match(adminTabSource, /作废席位/);
    assert.match(adminTabSource, /voidReviewScreenSeat/);
    assert.match(screenPageSource, /useSearchParams/);
    assert.match(screenPageSource, /专家 1/);
    assert.match(screenPageSource, /等待全部专家提交/);
    assert.match(screenPageSource, /最终得分/);
  });
});
