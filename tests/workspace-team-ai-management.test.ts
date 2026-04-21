import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-dashboard.tsx"),
  "utf8",
);

const teamBlock = dashboardSource.slice(
  dashboardSource.indexOf("const renderTeam = () => ("),
  dashboardSource.indexOf("const renderProfile = () => {"),
);

test("team tab merges AI permission controls into the team account table", () => {
  assert.match(teamBlock, /全部 AI 状态/);
  assert.match(teamBlock, /总成员数/);
  assert.match(teamBlock, /已开启 AI/);
  assert.match(teamBlock, /累计已用/);
  assert.match(teamBlock, /权限开关/);
  assert.match(teamBlock, /次数配额/);
  assert.match(teamBlock, /已用 \/ 配额/);
  assert.match(teamBlock, /留空表示不限次数/);
  assert.match(teamBlock, /批量开启权限/);
  assert.match(teamBlock, /批量关闭权限/);
  assert.match(teamBlock, /批量设置次数/);
  assert.match(teamBlock, /批量重置次数/);
});

test("team tab keeps AI controls inside the team account section instead of a standalone card", () => {
  assert.match(teamBlock, /团队账号/);
  assert.doesNotMatch(teamBlock, /<h3 className=\"text-base font-semibold text-slate-900\">AI 权限管理<\/h3>/);
});
