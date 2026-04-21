import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const assistantComponentPath = path.join(
  process.cwd(),
  "src/components/assistant/workspace-assistant.tsx",
);
const assistantChatRoutePath = path.join(
  process.cwd(),
  "src/app/api/ai/chat/route.ts",
);
const conversationsRoutePath = path.join(
  process.cwd(),
  "src/app/api/ai/conversations/route.ts",
);
const conversationDetailRoutePath = path.join(
  process.cwd(),
  "src/app/api/ai/conversations/[conversationId]/route.ts",
);

test("assistant redesign extracts a dedicated workspace assistant component", () => {
  assert.equal(existsSync(assistantComponentPath), true);

  const source = readFileSync(assistantComponentPath, "utf8");
  assert.match(source, /新建对话/);
  assert.match(source, /有什么可以帮你/);
  assert.match(source, /重新设计|赛事流程与规范/);
});

test("assistant redesign adds conversation history routes", () => {
  assert.equal(existsSync(conversationsRoutePath), true);
  assert.equal(existsSync(conversationDetailRoutePath), true);

  const listSource = readFileSync(conversationsRoutePath, "utf8");
  const detailSource = readFileSync(conversationDetailRoutePath, "utf8");

  assert.match(listSource, /export async function GET/);
  assert.match(detailSource, /export async function GET/);
  assert.match(detailSource, /export async function DELETE/);
});

test("assistant chat route supports conversation ids and streaming responses", () => {
  const source = readFileSync(assistantChatRoutePath, "utf8");

  assert.match(source, /conversationId/);
  assert.match(source, /stream/);
  assert.match(source, /text\/event-stream/);
});
