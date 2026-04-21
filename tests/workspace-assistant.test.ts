import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePageSource = readFileSync(
  path.join(process.cwd(), "src/app/workspace/page.tsx"),
  "utf8",
);

const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-dashboard.tsx"),
  "utf8",
);
const assistantSource = readFileSync(
  path.join(process.cwd(), "src/components/assistant/workspace-assistant.tsx"),
  "utf8",
);

test("workspace route accepts assistant tab", () => {
  assert.match(workspacePageSource, /"assistant"/);
});

test("workspace dashboard exposes AI assistant tab in sidebar config", () => {
  assert.match(dashboardSource, /key:\s*"assistant"/);
  assert.match(dashboardSource, /label:\s*"AI 助手"/);
});

test("assistant experience uses internal APIs and redesigned UI copy", () => {
  assert.match(assistantSource, /\/api\/ai\/permission/);
  assert.match(assistantSource, /\/api\/ai\/chat/);
  assert.match(assistantSource, /\/api\/ai\/conversations/);
  assert.match(assistantSource, /新建对话/);
  assert.match(assistantSource, /有什么可以帮你/);
  assert.match(assistantSource, /暂无使用权限，请联系管理员/);
  assert.doesNotMatch(assistantSource, /https:\/\/udify\.app\/chatbot\//);
});
