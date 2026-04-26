import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const readSource = (filePath: string) => readFileSync(join(process.cwd(), filePath), "utf8");

test("student daily reports only require today's completed work", () => {
  const contextSource = readSource("src/components/workspace-context.tsx");
  const shellSource = readSource("src/components/workspace-shell.tsx");
  const reportsRouteSource = readSource("src/app/api/reports/route.ts");
  const reminderSource = readSource("src/app/api/cron/daily-report-reminders/route.ts");

  const saveReportBlock = contextSource.match(/const saveReport = async \(\) => \{[\s\S]*?const removeReportRequest/)?.[0] ?? "";
  assert.match(saveReportBlock, /if \(!reportDraft\.summary\.trim\(\)\)/);
  assert.doesNotMatch(saveReportBlock, /nextPlan\.trim\(\)/);

  const reportModalBlock = shellSource.match(/\{reportModalOpen \? \([\s\S]*?\{announcementModalOpen \?/)?.[0] ?? "";
  assert.match(reportModalBlock, /今日完成/);
  assert.doesNotMatch(reportModalBlock, /明日计划/);

  const studentReportsBlock = readSource("src/components/tabs/schedule-tab.tsx").match(/const StudentReportsView =[\s\S]*?const TeacherReportsView/)?.[0] ?? "";
  assert.doesNotMatch(studentReportsBlock, /明日计划/);

  assert.match(reportsRouteSource, /const nextPlan = body\?\.nextPlan\?\.trim\(\) \?\? ""/);
  assert.match(reportsRouteSource, /if \(!summary\)/);
  assert.doesNotMatch(reportsRouteSource, /请填写今日完成和明日计划/);
  assert.doesNotMatch(reminderSource, /明日计划/);
});

test("expert opinion ledger supports admin assignment and group submissions", () => {
  const contextSource = readSource("src/components/workspace-context.tsx");
  const shellSource = readSource("src/components/workspace-shell.tsx");
  const expertsRouteSource = readSource("src/app/api/experts/route.ts");
  const serializerSource = readSource("src/lib/api-serializers.ts");
  const opinionTabSource = readSource("src/components/tabs/expert-opinion-tab.tsx");

  const memberPermissionBlock = contextSource.match(/member:\s*\{[\s\S]*?\n  expert:/)?.[0] ?? "";
  assert.match(memberPermissionBlock, /canUploadExpert:\s*true/);
  assert.match(memberPermissionBlock, /canDeleteExpert:\s*false/);

  assert.match(expertsRouteSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin",\s*"teacher",\s*"leader",\s*"member"\]\)/);
  assert.match(expertsRouteSource, /const requestedTeamGroupId =/);
  assert.match(expertsRouteSource, /hasGlobalAdminPrivileges\(user\.role\)\s*\?\s*requestedTeamGroupId/);
  assert.match(expertsRouteSource, /include:\s*\{[\s\S]*teamGroup:\s*\{[\s\S]*select:\s*\{\s*id:\s*true,\s*name:\s*true\s*\}/);
  assert.doesNotMatch(expertsRouteSource, /includeUnassignedForGroupedUsers:\s*true/);

  assert.match(shellSource, /适用项目组/);
  assert.match(shellSource, /expertDraft\.teamGroupId/);
  assert.match(serializerSource, /teamGroupId:\s*feedback\.teamGroupId/);
  assert.match(serializerSource, /teamGroupName:\s*feedback\.teamGroup\?\.name/);
  assert.match(opinionTabSource, /录入专家意见/);
});

test("administrator navigation removes training and task center copy uses global scope", () => {
  const contextSource = readSource("src/components/workspace-context.tsx");
  const tasksTabSource = readSource("src/components/tabs/tasks-tab.tsx");

  const adminPermissionBlock = contextSource.match(/admin:\s*\{[\s\S]*?\n  school_admin:/)?.[0] ?? "";
  const schoolAdminPermissionBlock = contextSource.match(/school_admin:\s*\{[\s\S]*?\n  teacher:/)?.[0] ?? "";
  assert.doesNotMatch(adminPermissionBlock, /"training"/);
  assert.doesNotMatch(schoolAdminPermissionBlock, /"training"/);

  assert.match(tasksTabSource, /全校任务台账/);
  assert.match(tasksTabSource, /currentRole === "admin" \|\| currentRole === "school_admin"/);
});
