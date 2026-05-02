import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const readSource = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

test("bug feedback api notifies only system administrators", () => {
  const routeSource = readSource("src/app/api/bug-feedback/route.ts");

  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /assertMainWorkspaceRole\(user\.role\)/);
  assert.match(routeSource, /role:\s*"admin"/);
  assert.doesNotMatch(routeSource, /role:\s*"school_admin"/);
  assert.match(routeSource, /createNotifications\(\{/);
  assert.match(routeSource, /type:\s*"bug_feedback"/);
  assert.match(routeSource, /senderId:\s*user\.id/);
});

test("topbar feedback panel submits bug feedback instead of showing shortcut actions", () => {
  const shellSource = readSource("src/components/workspace-shell.tsx");

  assert.match(shellSource, /submitBugFeedback/);
  assert.match(shellSource, /\/api\/bug-feedback/);
  assert.match(shellSource, /Bug 标题/);
  assert.match(shellSource, /问题描述/);
  assert.match(shellSource, /提交反馈/);
  assert.doesNotMatch(shellSource, /placeholder="例如：教师账号显示了发布公告按钮"/);
  assert.doesNotMatch(shellSource, /校级管理员不会收到该类 Bug 反馈/);
  assert.doesNotMatch(shellSource, /<span>待办与消息<\/span>/);
  assert.doesNotMatch(shellSource, /<span>个人资料<\/span>/);
  assert.doesNotMatch(shellSource, /<span>刷新数据<\/span>/);
});
