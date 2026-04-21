import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const teamSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/team-tab.tsx"),
  "utf8",
);

test("team tab merges AI permission controls into the team account table", () => {
  assert.match(teamSource, /全部 AI 状态/);
  assert.match(teamSource, /总成员数/);
  assert.match(teamSource, /已开启 AI/);
  assert.match(teamSource, /累计已用/);
  assert.match(teamSource, /权限开关/);
  assert.match(teamSource, /次数配额/);
  assert.match(teamSource, /已用 \/ 配额/);
  assert.match(teamSource, /留空表示不限次数/);
  assert.match(teamSource, /批量开启权限/);
  assert.match(teamSource, /批量关闭权限/);
  assert.match(teamSource, /批量设置次数/);
  assert.match(teamSource, /批量重置次数/);
});

test("team tab keeps AI controls inside the team account section instead of a standalone card", () => {
  assert.match(teamSource, /团队账号/);
  assert.doesNotMatch(teamSource, /<h3 className=\"text-base font-semibold text-slate-900\">AI 权限管理<\/h3>/);
});
