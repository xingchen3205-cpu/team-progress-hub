import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildStudentRanking,
  canCreateReportEvaluation,
  canViewReportEvaluationThread,
  canRevokeReportEvaluation,
  calculateContinuousSubmitDays,
  calculateMonthlySubmitRate,
} from "@/lib/report-evaluations";

test("teacher can evaluate only reports from the same team group", () => {
  assert.equal(
    canCreateReportEvaluation({
      actorRole: "teacher",
      actorTeamGroupId: "group-a",
      reportOwnerTeamGroupId: "group-a",
    }),
    true,
  );

  assert.equal(
    canCreateReportEvaluation({
      actorRole: "teacher",
      actorTeamGroupId: "group-a",
      reportOwnerTeamGroupId: "group-b",
    }),
    false,
  );

  assert.equal(
    canCreateReportEvaluation({
      actorRole: "member",
      actorTeamGroupId: "group-a",
      reportOwnerTeamGroupId: "group-a",
    }),
    false,
  );
});

test("report evaluation thread is visible only to owner, same-group teacher, or admin", () => {
  assert.equal(
    canViewReportEvaluationThread({
      actorId: "teacher-1",
      actorRole: "teacher",
      actorTeamGroupId: "group-a",
      reportOwnerId: "member-1",
      reportOwnerTeamGroupId: "group-a",
    }),
    true,
  );

  assert.equal(
    canViewReportEvaluationThread({
      actorId: "member-1",
      actorRole: "member",
      actorTeamGroupId: "group-a",
      reportOwnerId: "member-1",
      reportOwnerTeamGroupId: "group-a",
    }),
    true,
  );

  assert.equal(
    canViewReportEvaluationThread({
      actorId: "admin-1",
      actorRole: "admin",
      actorTeamGroupId: null,
      reportOwnerId: "member-1",
      reportOwnerTeamGroupId: "group-a",
    }),
    true,
  );

  assert.equal(
    canViewReportEvaluationThread({
      actorId: "member-2",
      actorRole: "member",
      actorTeamGroupId: "group-a",
      reportOwnerId: "member-1",
      reportOwnerTeamGroupId: "group-a",
    }),
    false,
  );
});

test("evaluation revoke is limited to the creator and 10 minute window", () => {
  const now = new Date("2026-04-22T10:10:00+08:00");

  assert.equal(
    canRevokeReportEvaluation({
      actorId: "teacher-1",
      evaluatorId: "teacher-1",
      createdAt: new Date("2026-04-22T10:03:00+08:00"),
      revokedAt: null,
      now,
    }),
    true,
  );

  assert.equal(
    canRevokeReportEvaluation({
      actorId: "teacher-2",
      evaluatorId: "teacher-1",
      createdAt: new Date("2026-04-22T10:03:00+08:00"),
      revokedAt: null,
      now,
    }),
    false,
  );

  assert.equal(
    canRevokeReportEvaluation({
      actorId: "teacher-1",
      evaluatorId: "teacher-1",
      createdAt: new Date("2026-04-22T09:55:00+08:00"),
      revokedAt: null,
      now,
    }),
    false,
  );
});

test("continuous submit days counts only consecutive calendar dates", () => {
  assert.equal(
    calculateContinuousSubmitDays(["2026-04-22", "2026-04-21", "2026-04-20"]),
    3,
  );

  assert.equal(
    calculateContinuousSubmitDays(["2026-04-22", "2026-04-20", "2026-04-19"]),
    1,
  );
});

test("monthly submit rate uses actual eligible group days and rounds to integer percent", () => {
  assert.equal(
    calculateMonthlySubmitRate({
      submittedDateKeys: ["2026-04-01", "2026-04-05", "2026-04-12"],
      month: "2026-04",
      eligibleDaysInMonth: 12,
    }),
    25,
  );
});

test("student ranking follows the weighted score and last submit tiebreaker", () => {
  const ranking = buildStudentRanking(
    [
      {
        userId: "leader-1",
        submittedDateKeys: ["2026-04-22", "2026-04-21", "2026-04-20", "2026-04-19"],
        praiseCount: 4,
        continuousSubmitDays: 4,
        eligibleDaysInMonth: 4,
        lastSubmittedAt: "2026-04-22T08:10:00+08:00",
      },
      {
        userId: "member-1",
        submittedDateKeys: ["2026-04-22", "2026-04-21", "2026-04-20"],
        praiseCount: 4,
        continuousSubmitDays: 3,
        eligibleDaysInMonth: 4,
        lastSubmittedAt: "2026-04-22T08:30:00+08:00",
      },
      {
        userId: "member-2",
        submittedDateKeys: ["2026-04-22", "2026-04-21", "2026-04-20"],
        praiseCount: 4,
        continuousSubmitDays: 3,
        eligibleDaysInMonth: 4,
        lastSubmittedAt: "2026-04-22T09:10:00+08:00",
      },
    ],
    "2026-04",
  );

  assert.deepEqual(
    ranking.map((item) => item.userId),
    ["leader-1", "member-1", "member-2"],
  );
});

test("student ranking score uses the documented raw weight formula", () => {
  const [entry] = buildStudentRanking(
    [
      {
        userId: "member-1",
        submittedDateKeys: ["2026-04-22", "2026-04-21", "2026-04-20", "2026-04-19"],
        praiseCount: 2,
        continuousSubmitDays: 3,
        eligibleDaysInMonth: 4,
        lastSubmittedAt: "2026-04-22T08:30:00+08:00",
      },
    ],
    "2026-04",
  );

  assert.equal(entry.monthlySubmitRate, 100);
  assert.equal(entry.score, 41.4);
});

test("report evaluation routes and schema extensions exist", () => {
  const schemaSource = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const createRoutePath = path.join(process.cwd(), "src/app/api/reports/[reportId]/evaluations/route.ts");
  const revokeRoutePath = path.join(process.cwd(), "src/app/api/reports/[reportId]/evaluations/[evaluationId]/route.ts");
  const studentEvaluationsRoutePath = path.join(process.cwd(), "src/app/api/students/[userId]/evaluations/route.ts");
  const markReadRoutePath = path.join(process.cwd(), "src/app/api/students/[userId]/evaluations/mark_read/route.ts");
  const statsRoutePath = path.join(process.cwd(), "src/app/api/students/[userId]/stats/route.ts");

  assert.match(schemaSource, /model ReportEvaluation \{/);
  assert.match(schemaSource, /praiseCount\s+Int\s+@default\(0\)/);
  assert.match(schemaSource, /improveCount\s+Int\s+@default\(0\)/);
  assert.match(schemaSource, /commentCount\s+Int\s+@default\(0\)/);
  assert.ok(existsSync(createRoutePath));
  assert.ok(existsSync(revokeRoutePath));
  assert.ok(existsSync(studentEvaluationsRoutePath));
  assert.ok(existsSync(markReadRoutePath));
  assert.ok(existsSync(statsRoutePath));

  const createRouteSource = readFileSync(createRoutePath, "utf8");
  const revokeRouteSource = readFileSync(revokeRoutePath, "utf8");
  const statsRouteSource = readFileSync(statsRoutePath, "utf8");
  const helpersSource = readFileSync(path.join(process.cwd(), "src/lib/report-evaluations.ts"), "utf8");

  assert.match(createRouteSource, /const evaluationType = body\?\.type/);
  assert.match(createRouteSource, /type:\s*evaluationType/);
  assert.match(createRouteSource, /export async function GET/);
  assert.match(createRouteSource, /type:\s*"report_evaluation"/);
  assert.match(revokeRouteSource, /REPORT_EVALUATION_REVOKE_WINDOW_MS/);
  assert.match(helpersSource, /REPORT_EVALUATION_REVOKE_WINDOW_MS = 10 \* 60 \* 1000/);
  assert.match(statsRouteSource, /本月提交率 × 40%/);
  assert.match(statsRouteSource, /累计红花数 × 40%/);
  assert.match(statsRouteSource, /当前连续提交天数 × 20%/);
});

test("teacher praise is one-shot per report and cannot be revoked", () => {
  const createRouteSource = readFileSync(
    path.join(process.cwd(), "src/app/api/reports/[reportId]/evaluations/route.ts"),
    "utf8",
  );
  const revokeRouteSource = readFileSync(
    path.join(process.cwd(), "src/app/api/reports/[reportId]/evaluations/[evaluationId]/route.ts"),
    "utf8",
  );
  const scheduleSource = readFileSync(path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"), "utf8");

  assert.match(createRouteSource, /existingPraiseEvaluation/);
  assert.match(createRouteSource, /evaluationType === "praise"/);
  assert.match(createRouteSource, /今天已经给这份汇报点过赞/);
  assert.match(revokeRouteSource, /evaluation\.type === "praise"/);
  assert.match(revokeRouteSource, /点赞提交后不能撤回/);
  assert.match(scheduleSource, /hasPraisedByCurrentTeacher/);
  assert.match(scheduleSource, /今日已点赞/);
  assert.match(scheduleSource, /evaluation\.type !== "praise"/);
});
