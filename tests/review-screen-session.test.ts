import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FinalRankingStage, type FinalRankingStageProps } from "../src/components/review-screen/FinalRankingStage";

const readSource = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

const countMatches = (source: string, pattern: RegExp) => source.match(pattern)?.length ?? 0;

const buildRankingItems = (count: number): FinalRankingStageProps["rankings"] =>
  Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    projectName: `测试项目 ${index + 1}`,
    presentationOrder: index + 1,
    trackName: "校赛路演测试",
    score: 90 - index,
  }));

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

  it("validates review package score trimming rules and keeps at least two valid scores", async () => {
    const { getRemainingReviewScoreCount, validateReviewScoreRule } = await import("../src/lib/review-score-rules");

    assert.equal(
      getRemainingReviewScoreCount({ expertCount: 7, dropHighestCount: 1, dropLowestCount: 1 }),
      5,
    );
    assert.equal(
      validateReviewScoreRule({ expertCount: 7, dropHighestCount: 1, dropLowestCount: 1 }),
      null,
    );
    assert.match(
      validateReviewScoreRule({ expertCount: 7, dropHighestCount: 3, dropLowestCount: 3 }) ?? "",
      /至少保留 2 个有效评分/,
    );
  });

  it("normalizes configurable roadshow screen display settings", async () => {
    const {
      defaultReviewScreenDisplaySettings,
      normalizeReviewScreenDisplaySettings,
    } = await import("../src/lib/review-screen-display-settings");

    assert.deepEqual(defaultReviewScreenDisplaySettings, {
      scoringEnabled: true,
      showScoresOnScreen: false,
      showFinalScoreOnScreen: false,
      showRankingOnScreen: false,
      selfDrawEnabled: false,
    });
    assert.deepEqual(
      normalizeReviewScreenDisplaySettings({
        scoringEnabled: false,
        showScoresOnScreen: false,
        showFinalScoreOnScreen: false,
        showRankingOnScreen: false,
        selfDrawEnabled: true,
      }),
      {
        scoringEnabled: false,
        showScoresOnScreen: false,
        showFinalScoreOnScreen: false,
        showRankingOnScreen: false,
        selfDrawEnabled: true,
      },
    );
    assert.equal(
      normalizeReviewScreenDisplaySettings({
        scoringEnabled: false,
        showScoresOnScreen: true,
        showFinalScoreOnScreen: true,
        showRankingOnScreen: true,
      }).scoringEnabled,
      false,
    );
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
    assert.match(schemaSource, /groupName\s+String\?/);
    assert.match(schemaSource, /groupIndex\s+Int\s+@default\(0\)/);
    assert.match(schemaSource, /groupSlotIndex\s+Int\s+@default\(0\)/);
    assert.match(schemaSource, /tokenHash\s+String\s+@unique/);
    assert.match(schemaSource, /model ExpertReviewPackage[\s\S]*dropHighestCount\s+Int\s+@default\(1\)/);
    assert.match(schemaSource, /model ExpertReviewPackage[\s\S]*dropLowestCount\s+Int\s+@default\(1\)/);
    assert.match(schemaSource, /model ReviewDisplayProjectOrder[\s\S]*finalScoreCents\s+Int\?/);
    assert.match(schemaSource, /model ReviewDisplayProjectOrder[\s\S]*finalScoreText\s+String\?/);
    assert.match(schemaSource, /model ReviewDisplayProjectOrder[\s\S]*scoreLockedAt\s+DateTime\?/);
    assert.match(schemaSource, /model ReviewDisplayProjectOrder[\s\S]*droppedSeatNos\s+String\?/);
    assert.match(schemaSource, /model ReviewDisplaySession[\s\S]*scoringEnabled\s+Boolean\s+@default\(true\)/);
    assert.match(schemaSource, /model ReviewDisplaySession[\s\S]*showScoresOnScreen\s+Boolean\s+@default\(false\)/);
    assert.match(schemaSource, /model ReviewDisplaySession[\s\S]*showFinalScoreOnScreen\s+Boolean\s+@default\(false\)/);
    assert.match(schemaSource, /model ReviewDisplaySession[\s\S]*showRankingOnScreen\s+Boolean\s+@default\(false\)/);
    assert.match(schemaSource, /model ReviewDisplaySession[\s\S]*selfDrawEnabled\s+Boolean\s+@default\(false\)/);
    assert.match(schemaSource, /model ReviewDisplayProjectOrder[\s\S]*selfDrawnAt\s+DateTime\?/);
    assert.match(schemaSource, /@@unique\(\[sessionId,\s*seatNo\]\)/);
  });

  it("declares audit logs, score reset snapshots, and stable task status enums for review auditability", () => {
    const schemaSource = readSource("prisma/schema.prisma");

    assert.match(schemaSource, /enum ExpertReviewAssignmentStatus[\s\S]*pending[\s\S]*submitted[\s\S]*timeout[\s\S]*closed_by_admin[\s\S]*excluded/);
    assert.match(schemaSource, /enum ReviewDisplaySeatStatus[\s\S]*pending[\s\S]*submitted[\s\S]*timeout[\s\S]*closed_by_admin[\s\S]*excluded/);
    assert.match(schemaSource, /model AuditLog/);
    assert.match(schemaSource, /operatorId\s+String/);
    assert.match(schemaSource, /operatorRole\s+Role/);
    assert.match(schemaSource, /beforeState\s+String\?/);
    assert.match(schemaSource, /afterState\s+String\?/);
    assert.match(schemaSource, /reason\s+String\?/);
    assert.match(schemaSource, /model ExpertReviewScoreHistory/);
    assert.match(schemaSource, /snapshot\s+String/);
    assert.match(schemaSource, /resetReason\s+String/);
  });

  it("keeps destructive review reset auditable with required reason, score snapshots, and transactional logs", () => {
    const routeSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const auditSource = readSource("src/lib/audit-log.ts");

    assert.match(routeSource, /reason/);
    assert.match(routeSource, /重置原因不能为空/);
    assert.match(routeSource, /expertReviewScoreHistory\.createMany/);
    assert.match(routeSource, /createAuditLogEntry/);
    assert.match(routeSource, /action:\s*"expert_review_package\.reset"/);
    assert.match(auditSource, /requiresAuditReason/);
    assert.match(auditSource, /beforeState/);
    assert.match(auditSource, /afterState/);
  });

  it("closes unsubmitted roadshow assignments when administrators force-switch away from a scoring project", () => {
    const nextProjectRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/next-project/route.ts");
    const phaseRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/phase/route.ts");
    const serializerSource = readSource("src/lib/expert-review.ts");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(nextProjectRouteSource, /closeUnsubmittedReviewAssignments/);
    assert.match(nextProjectRouteSource, /status:\s*"closed_by_admin"/);
    assert.match(phaseRouteSource, /closeUnsubmittedReviewAssignments/);
    assert.match(serializerSource, /closed_by_admin/);
    assert.match(serializerSource, /已关闭，无需提交/);
    assert.match(tabSource, /closed_by_admin/);
    assert.match(tabSource, /已关闭，无需提交/);
  });

  it("stores score rules on review packages and locks final scores in the backend reveal route", () => {
    const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
    const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
    const revealRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/reveal/route.ts");
    const assignmentRouteSource = readSource("src/app/api/expert-reviews/assignments/route.ts");
    const assignmentItemRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const contextSource = readSource("src/components/workspace-context.tsx");
    const shellSource = readSource("src/components/workspace-shell.tsx");

    assert.match(assignmentRouteSource, /dropHighestCount/);
    assert.match(assignmentRouteSource, /dropLowestCount/);
    assert.match(assignmentRouteSource, /validateReviewScoreRule/);
    assert.match(assignmentItemRouteSource, /validateReviewScoreRule/);
    assert.match(contextSource, /dropHighestCount/);
    assert.match(contextSource, /dropLowestCount/);
    assert.match(shellSource, /最终得分计算规则/);
    assert.match(shellSource, /当前有效专家/);
    assert.match(shellSource, /去掉后剩余/);
    assert.match(shellSource, /reviewScoreRuleInvalid/);
    assert.match(sessionRouteSource, /dropHighestCount:\s*reviewPackage\.dropHighestCount/);
    assert.match(sessionRouteSource, /dropLowestCount:\s*reviewPackage\.dropLowestCount/);
    assert.match(revealRouteSource, /dropHighestCount:\s*currentReviewPackage\.dropHighestCount/);
    assert.match(revealRouteSource, /dropLowestCount:\s*currentReviewPackage\.dropLowestCount/);
    assert.match(revealRouteSource, /validateReviewScoreRule/);
    assert.match(revealRouteSource, /finalScoreCents/);
    assert.match(revealRouteSource, /finalScoreText/);
    assert.match(revealRouteSource, /scoreLockedAt/);
    assert.match(revealRouteSource, /droppedSeatNos/);
    assert.doesNotMatch(revealRouteSource, /dropHighestCount:\s*session\.dropHighestCount/);
    assert.match(publicRouteSource, /formatScoreCents/);
    assert.match(publicRouteSource, /scoreLockedAt/);
    assert.doesNotMatch(publicRouteSource, /dropHighestCount:\s*session\.dropHighestCount/);
  });

  it("adds token-protected screen APIs and a standalone full-screen display page", () => {
    const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
    const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
    const adminTabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
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
    assert.doesNotMatch(screenPageSource, /等待全部有效席位提交/);
    assert.match(screenPageSource, /最终得分/);
  });

  it("uses one roadshow screen session for all packages under the same project stage", () => {
    const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
    const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
    const orderRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/order/route.ts");
    const nextProjectRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/next-project/route.ts");
    const phaseRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/phase/route.ts");
    const settingsRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/settings/route.ts");
    const restoreSeatRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/restore-seat/route.ts");
    const adminTabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(sessionRouteSource, /stageReviewPackages/);
    assert.match(sessionRouteSource, /projectReviewStageId/);
    assert.match(sessionRouteSource, /packageIds/);
    assert.match(sessionRouteSource, /buildReviewDisplaySeatSeeds/);
    assert.match(sessionRouteSource, /reviewDisplayProjectOrder\.createMany/);
    assert.match(sessionRouteSource, /buildRoadshowProjectOrderRows/);
    assert.match(sessionRouteSource, /roadshowGroupSizes/);
    assert.match(sessionRouteSource, /reviewPackage\.projectReviewStageId/);
    assert.match(publicRouteSource, /projectResults/);
    assert.match(publicRouteSource, /projectOrderPackages/);
    assert.match(publicRouteSource, /assignmentsByExpertId/);
    assert.doesNotMatch(publicRouteSource, /seat\.assignment\.reviewPackage/);
    assert.match(orderRouteSource, /packageIds/);
    assert.match(orderRouteSource, /roadshowGroupSizes/);
    assert.match(orderRouteSource, /本轮已开始，不能调整路演顺序/);
    assert.match(nextProjectRouteSource, /projectOrders/);
    assert.match(nextProjectRouteSource, /packageId/);
    assert.match(nextProjectRouteSource, /targetPackageId/);
    assert.match(nextProjectRouteSource, /项目不在本轮路演顺序中/);
    assert.match(nextProjectRouteSource, /screenPhase:\s*"draw"/);
    assert.match(nextProjectRouteSource, /等待下一项目出场/);
    assert.match(adminTabSource, /packageIds/);
    assert.match(adminTabSource, /stageGroupKeys/);
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
    assert.match(adminTabSource, /确认揭晓本项目得分/);
    assert.doesNotMatch(adminTabSource, /推送到投屏播放揭晓动画/);
    assert.match(adminTabSource, /确认结束本轮所有评审？投屏将进入本轮结束状态/);
    assert.match(adminTabSource, /isScreenSessionFinished/);
    assert.match(adminTabSource, /本轮评审已结束/);
    assert.match(adminTabSource, /已关闭现场控制/);
    assert.match(adminTabSource, /后台显示专家实名，大屏继续保持匿名/);
    assert.match(adminTabSource, /路演顺序/);
    assert.match(adminTabSource, /上移/);
    assert.match(adminTabSource, /下移/);
    assert.match(adminTabSource, /getManualOrderedProjects/);
    assert.match(adminTabSource, /applyLocalReviewScreenOrderDraft/);
    assert.match(sessionRouteSource, /packageIds/);
    assert.match(sessionRouteSource, /orderedStageReviewPackages/);
    assert.match(adminTabSource, /路演时长/);
    assert.match(adminTabSource, /答辩时长/);
    assert.match(adminTabSource, /评分时长/);
    assert.match(adminTabSource, /评分规则（来自评审包）/);
    assert.match(adminTabSource, /去最高分/);
    assert.match(adminTabSource, /去最低分/);
    assert.doesNotMatch(adminTabSource, /updateScreenTimingDraft\(group\.key,\s*"dropHighestCount"/);
    assert.doesNotMatch(adminTabSource, /updateScreenTimingDraft\(group\.key,\s*"dropLowestCount"/);
    assert.match(adminTabSource, /路演分组容量/);
    assert.match(adminTabSource, /getRoadshowGroupSizesPayload/);
    assert.match(adminTabSource, /uniqueSessionEntries/);
    assert.match(adminTabSource, /projectResults/);
    assert.match(adminTabSource, /getLiveAssignmentScoreText/);
    assert.match(adminTabSource, /activeGroupFinalScoreText/);
    assert.match(adminTabSource, /确认并计算最终得分/);
    assert.doesNotMatch(adminTabSource, /disabled=\{Boolean\(screenSession\)\}/);
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
    assert.match(phaseRouteSource, /forceFinish/);
    assert.match(adminTabSource, /changeReviewScreenPhase\(group, "finished"/);
    assert.match(adminTabSource, /currentPhase === "finished"/);
    assert.match(adminTabSource, /canEditConfigFields/);
    assert.match(adminTabSource, /投屏设置已锁定/);
    assert.match(adminTabSource, /drawControlsVisible/);
    assert.match(adminTabSource, /screenDisplay\.selfDrawEnabled/);
    assert.match(adminTabSource, /不需要抽签/);
    assert.doesNotMatch(adminTabSource, /项目列表只展示本轮顺序和后台分数/);
    assert.doesNotMatch(adminTabSource, /匿名专家席位/);
    assert.doesNotMatch(adminTabSource, /setActiveGroupKey\(project\.packageId\)/);
    assert.doesNotMatch(adminTabSource, /switchReviewScreenProject\(activeGroup,\s*project\.packageId\)/);
    assert.match(adminTabSource, /getReviewScreenPhaseActionLabel/);
    assert.match(restoreSeatRouteSource, /status:\s*"pending"/);
    assert.match(restoreSeatRouteSource, /voidedAt:\s*null/);
    assert.match(restoreSeatRouteSource, /voidReason:\s*null/);
    assert.match(settingsRouteSource, /presentationSeconds/);
    assert.match(settingsRouteSource, /qaSeconds/);
    assert.match(settingsRouteSource, /scoringSeconds/);
    assert.match(settingsRouteSource, /screenPhase:\s*true/);
    assert.match(settingsRouteSource, /session\.screenPhase !== "draw"/);
    assert.match(settingsRouteSource, /本轮已开始，投屏设置已锁定/);
    assert.match(settingsRouteSource, /normalizeReviewScreenDisplaySettings/);
    assert.match(settingsRouteSource, /scoringEnabled/);
    assert.match(settingsRouteSource, /showScoresOnScreen/);
    assert.match(settingsRouteSource, /showFinalScoreOnScreen/);
    assert.match(settingsRouteSource, /showRankingOnScreen/);
    assert.match(settingsRouteSource, /selfDrawEnabled/);
    assert.doesNotMatch(adminTabSource, /阶段已切换为：\$\{phase\}/);
    assert.doesNotMatch(adminTabSource, /启动计时/);
    assert.match(phaseRouteSource, /reveal: \["finished"\]/);
    assert.match(phaseRouteSource, /scoring: \["scoring"\]/);
    assert.match(phaseRouteSource, /还有后续项目，请先切换到下一项目/);
    assert.match(phaseRouteSource, /请先完成当前项目流程后再结束本轮/);
    assert.match(phaseRouteSource, /session\.scoringEnabled/);
    assert.match(screenPageSource, /projectResults/);
    assert.match(screenPageSource, /hasDrawStarted/);
    assert.match(screenPageSource, /isWaitingNextProject/);
    assert.match(screenPageSource, /请等待下一个项目路演开始/);
    assert.match(screenPageSource, /本项目评审已完成，等待下一项目/);
    assert.match(screenPageSource, /本轮路演已结束/);
    assert.match(screenPageSource, /请等待管理员分配路演项目/);
    assert.match(screenPageSource, /phase === "finished" && rankingRows\.length > 0/);
    assert.doesNotMatch(screenPageSource, /phase === "finished" && !screenDisplay\.showRankingOnScreen/);
    assert.doesNotMatch(screenPageSource, /phase === "finished" && screenDisplay\.showRankingOnScreen/);
    assert.doesNotMatch(screenPageSource, /phase === "draw" && !drawEnabled\s*\?\s*"score"/);
    assert.doesNotMatch(screenPageSource, /phase === "finished"[\s\S]{0,120}\?\s*"score"/);
    assert.match(screenPageSource, /payload\?\.session\.phaseStartedAt/);
    assert.doesNotMatch(screenPageSource, /等待全部有效席位提交/);
    assert.match(screenPageSource, /seat-score-ticker/);
    assert.match(screenPageSource, /scoreText/);
    assert.match(screenPageSource, /useRevealAnimationFrame/);
    assert.match(screenPageSource, /window\.requestAnimationFrame/);
    assert.match(screenPageSource, /revealFrameTime/);
    assert.match(screenPageSource, /finalScoreRevealProgress/);
    assert.match(screenPageSource, /score-reveal-project-name/);
    assert.match(screenPageSource, /score-reveal-underline/);
    assert.match(screenPageSource, /score-reveal-caption/);
    assert.match(screenPageSource, /revealElapsedMs >= 600/);
    assert.match(screenPageSource, /revealElapsedMs >= 2530/);
    assert.doesNotMatch(screenPageSource, /revealStep/);
    assert.doesNotMatch(screenPageSource, /valid-score-strip/);
    assert.doesNotMatch(screenPageSource, /有效评分：/);
    assert.match(screenPageSource, /按本轮评分规则计算/);
    assert.doesNotMatch(screenPageSource, /评分规则：去掉最高分和最低分，取平均值/);
  });

  it("supports manual order entry, self draw, screen visibility switches, and admin-only score monitoring", () => {
    const schemaSource = readSource("prisma/schema.prisma");
    const sessionRouteSource = readSource("src/app/api/review-screen/sessions/route.ts");
    const publicRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/route.ts");
    const settingsRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/settings/route.ts");
    const selfDrawRouteSource = readSource("src/app/api/review-screen/sessions/[sessionId]/self-draw/route.ts");
    const adminTabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(schemaSource, /scoringEnabled\s+Boolean\s+@default\(true\)/);
    assert.match(schemaSource, /showScoresOnScreen\s+Boolean\s+@default\(false\)/);
    assert.match(schemaSource, /showFinalScoreOnScreen\s+Boolean\s+@default\(false\)/);
    assert.match(schemaSource, /showRankingOnScreen\s+Boolean\s+@default\(false\)/);
    assert.match(schemaSource, /selfDrawEnabled\s+Boolean\s+@default\(false\)/);
    assert.match(schemaSource, /selfDrawnAt\s+DateTime\?/);
    assert.match(sessionRouteSource, /normalizeReviewScreenDisplaySettings/);
    assert.match(sessionRouteSource, /screenDisplay/);
    assert.match(settingsRouteSource, /screenDisplay/);
    assert.match(selfDrawRouteSource, /hashReviewScreenToken/);
    assert.match(selfDrawRouteSource, /selfDrawEnabled/);
    assert.match(selfDrawRouteSource, /selfDrawnAt/);
    assert.match(selfDrawRouteSource, /remainingOrderIndexes/);
    assert.match(publicRouteSource, /viewer"\)\s*===\s*"admin"/);
    assert.match(publicRouteSource, /adminCanSeeScores/);
    assert.match(publicRouteSource, /screenDisplay/);
    assert.match(publicRouteSource, /showScoresOnScreen/);
    assert.match(publicRouteSource, /showFinalScoreOnScreen/);
    assert.match(publicRouteSource, /showRankingOnScreen/);
    assert.match(publicRouteSource, /selfDrawEnabled/);
    assert.match(adminTabSource, /viewer=admin/);
    assert.match(adminTabSource, /投屏显示设置/);
    assert.match(adminTabSource, /管理员监看/);
    assert.match(adminTabSource, /后台显示专家实名/);
    assert.match(adminTabSource, /seatExpertName/);
    assert.match(adminTabSource, /手动序号/);
    assert.match(adminTabSource, /自助抽签/);
    assert.match(adminTabSource, /drawControlsVisible/);
    assert.match(adminTabSource, /仅开启“项目自助抽签”时显示/);
    assert.match(adminTabSource, /manualOrderDrafts/);
    assert.match(adminTabSource, /showScoresOnScreen/);
    assert.match(adminTabSource, /showRankingOnScreen/);
    assert.match(adminTabSource, /screenDisplayDrafts/);
    assert.match(screenPageSource, /screenDisplay/);
    assert.match(screenPageSource, /drawEnabled/);
    assert.match(screenPageSource, /phase === "draw" && !drawEnabled/);
    assert.match(screenPageSource, /showScoresOnScreen/);
    assert.match(screenPageSource, /showFinalScoreOnScreen/);
    assert.match(screenPageSource, /showRankingOnScreen/);
    assert.match(screenPageSource, /selfDrawProject/);
    assert.match(screenPageSource, /自助抽签/);
    assert.match(screenPageSource, /screenDisplay\.showFinalScoreOnScreen && phase === "reveal"/);
    assert.doesNotMatch(screenPageSource, /等待管理员点击随机抽签/);
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

    assert.match(screenPageSource, /screen-banner/);
    assert.match(screenPageSource, /screen-hero-gradient/);
    assert.match(screenPageSource, /南京铁道职业技术学院/);
    assert.match(screenPageSource, /text-slate-900/);
    assert.doesNotMatch(screenPageSource, /bg-slate-950/);
  });

  it("shows school, configured round label, and phase without Beijing time on the review screen header", () => {
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(screenPageSource, /南京铁道职业技术学院/);
    assert.match(screenPageSource, /payload\?\.reviewPackage\.roundLabel/);
    assert.match(screenPageSource, /payload\?\.session\.phaseLabel \?\? getPhaseLabel\(phase\)/);
    assert.match(screenPageSource, /\/brand\/njrts-logo\.png/);
    assert.match(screenPageSource, /南京铁道职业技术学院校徽/);
    assert.match(screenPageSource, /object-contain/);
    assert.equal(existsSync(path.join(process.cwd(), "public/brand/njrts-logo.png")), true);
    assert.doesNotMatch(screenPageSource, />校徽</);
    assert.doesNotMatch(screenPageSource, /rounded-full bg-white p-1\.5/);
    assert.doesNotMatch(screenPageSource, /useCurrentTime/);
    assert.doesNotMatch(screenPageSource, /timeText/);
    assert.doesNotMatch(screenPageSource, /currentTime/);
    assert.doesNotMatch(screenPageSource, /路演答辩评审投屏/);
    assert.doesNotMatch(screenPageSource, /中国国际大学生创新大赛/);
  });

  it("renders final ranking as champion, two podium cards, and compact table rows", () => {
    const markup = renderToStaticMarkup(createElement(FinalRankingStage, {
      rankings: buildRankingItems(6),
      sessionTitle: "校赛路演测试",
      roundLabel: "第一轮",
    }));

    assert.equal(countMatches(markup, /class="final-ranking-champion"/g), 1);
    assert.equal(countMatches(markup, /class="final-ranking-podium-card/g), 2);
    assert.equal(countMatches(markup, /class="final-ranking-table(?:\s|")/g), 1);
    assert.equal(countMatches(markup, /class="final-ranking-table-row/g), 3);
  });

  it("keeps admin console countdown polling in sync with the projection screen", () => {
    const adminTabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(adminTabSource, /phaseRemainingSeconds:\s*data\.session\.phaseRemainingSeconds/);
    assert.match(adminTabSource, /window\.setInterval\(poll,\s*1000\)/);
    assert.match(screenPageSource, /window\.setInterval\(loadSession,\s*1000\)/);
  });

  it("uses a lighter champion card so final ranking does not look like a dark empty block", () => {
    const rankingStageSource = readSource("src/components/review-screen/FinalRankingStage.tsx");

    assert.match(rankingStageSource, /background:\s*#eef5ff/);
    assert.match(rankingStageSource, /border:\s*1px solid #cfe0ff/);
    assert.match(rankingStageSource, /final-ranking-champion-score[\s\S]*color:\s*#1d5cff/);
    assert.doesNotMatch(rankingStageSource, /final-ranking-champion[\s\S]{0,260}background:\s*#0f2040/);
  });

  it("renders two final ranking projects without a table and keeps the runner-up half-width", () => {
    const markup = renderToStaticMarkup(createElement(FinalRankingStage, {
      rankings: buildRankingItems(2),
      sessionTitle: "校赛路演测试",
      roundLabel: "第一轮",
    }));

    assert.equal(countMatches(markup, /class="final-ranking-champion"/g), 1);
    assert.equal(countMatches(markup, /class="final-ranking-podium-card/g), 1);
    assert.equal(countMatches(markup, /class="final-ranking-table(?:\s|")/g), 0);
    assert.match(markup, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("uses a large readable project title for presentation and Q&A countdown stages", () => {
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.match(screenPageSource, /screen-stage-countdown-card/);
    assert.match(screenPageSource, /screen-stage-project-title/);
    assert.match(screenPageSource, /font-size:\s*clamp\(42px,\s*6vw,\s*86px\)/);
    assert.match(screenPageSource, /phase === "presentation" \? "路演展示" : "答辩提问"/);
    assert.doesNotMatch(screenPageSource, /screen-stage-countdown-card::before/);
    assert.doesNotMatch(screenPageSource, /max-w-\[980px\] truncate text-2xl font-black text-white\/85/);
  });

  it("does not render admin control buttons on the projection screen", () => {
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");

    assert.doesNotMatch(screenPageSource, /作废席位/);
    assert.doesNotMatch(screenPageSource, /开始评分/);
    assert.doesNotMatch(screenPageSource, /生成并复制链接/);
    assert.doesNotMatch(screenPageSource, /voidReviewScreenSeat/);
    assert.doesNotMatch(screenPageSource, /startReviewScreenScoring/);
    assert.doesNotMatch(screenPageSource, /copyReviewScreenLink/);
    assert.match(screenPageSource, /selfDrawProject/);
  });

  it("includes large-screen key copy and anonymous seat status on the projection screen", () => {
    const screenPageSource = readSource("src/app/review-screen/session/[sessionId]/page.tsx");
    const rankingStageSource = readSource("src/components/review-screen/FinalRankingStage.tsx");

    assert.match(screenPageSource, /drawEnabled \? "抽签分组" : null/);
    assert.match(screenPageSource, /评审打分/);
    assert.match(screenPageSource, /实时排名/);
    assert.match(screenPageSource, /路演顺序/);
    assert.match(screenPageSource, /drawGroups/);
    assert.match(screenPageSource, /groupName/);
    assert.match(screenPageSource, /当前评审项目/);
    assert.match(screenPageSource, /匿名专家席位状态/);
    assert.match(screenPageSource, /最终得分/);
    assert.match(screenPageSource, /提交进度/);
    assert.match(screenPageSource, /评分倒计时/);
    assert.match(rankingStageSource, /本轮评审结果/);
    assert.match(rankingStageSource, /第一名/);
    assert.match(rankingStageSource, /最终得分/);
    assert.match(screenPageSource, /screen-full-countdown/);
    assert.match(screenPageSource, /draw-sequence-overlay/);
    assert.match(screenPageSource, /phase-panel/);
    assert.match(screenPageSource, /drawOverlayActive/);
    assert.match(screenPageSource, /score-reveal-overlay/);
    assert.match(screenPageSource, /score-reveal-overlay[\s\S]*background:\s*#f0f4f9/);
    assert.match(screenPageSource, /score-reveal-score[\s\S]*color:\s*#1d5cff/);
    assert.doesNotMatch(screenPageSource, /\.score-reveal-score\s*\{[^}]*background:\s*linear-gradient/);
    assert.doesNotMatch(screenPageSource, /rgba\(26,\s*34,\s*54,\s*0\.9\)/);
    assert.match(screenPageSource, /waiting-dots/);
    assert.match(screenPageSource, /seat-pop/);
    assert.match(screenPageSource, /FinalRankingStage/);
    assert.match(screenPageSource, /activeTab === "rank"/);
    assert.match(screenPageSource, /score:\s*row\.score \?\? 0/);
    assert.doesNotMatch(screenPageSource, /activeTab === "rank" && screenDisplay\.showRankingOnScreen/);
    assert.doesNotMatch(screenPageSource, /ROUND FINISHED|PROJECT COMPLETE|WAITING/);
    assert.doesNotMatch(screenPageSource, /现场已收尾|waiting-stage-status/);
    assert.match(rankingStageSource, /final-ranking-stage/);
    assert.match(rankingStageSource, /final-ranking-champion/);
    assert.match(rankingStageSource, /final-ranking-podium-card/);
    assert.match(rankingStageSource, /final-ranking-table/);
    assert.match(rankingStageSource, /fontVariantNumeric:\s*"tabular-nums"/);
    assert.match(rankingStageSource, /console\.warn/);
    assert.doesNotMatch(rankingStageSource, /FINAL RANKING|TOP PROJECT|SCORE|#f5f3ee|#2c2c2a|#d4af37|CHAMPION/);
    assert.doesNotMatch(screenPageSource, /实时刷新中/);
    assert.doesNotMatch(screenPageSource, /FINAL SCORE/);
    assert.doesNotMatch(screenPageSource, /现场说明/);
    assert.doesNotMatch(screenPageSource, /grid-cols-\[minmax\(0,1fr\)_380px\]/);
    assert.match(screenPageSource, /本轮排名/);
    assert.match(screenPageSource, /专家 1/);
    assert.match(screenPageSource, /专家 2/);
    assert.match(screenPageSource, /专家 3/);
  });
});
