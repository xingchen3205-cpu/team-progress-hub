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
const assistantBubblePath = path.join(
  process.cwd(),
  "src/components/assistant/assistant-message-bubble.tsx",
);
const aiChatLibPath = path.join(
  process.cwd(),
  "src/lib/ai-chat.ts",
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
  assert.match(source, /双创竞赛智能问答助手/);
  assert.doesNotMatch(source, /赛事流程与规范智能问答/);
  assert.doesNotMatch(source, /直接通过平台后端调用 Dify，对话记录按会话维度管理。/);
  assert.match(source, /回答仅供参考，以平台实际数据为准/);
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

test("assistant streaming UI keeps a cursor while the answer is still arriving", () => {
  const source = readFileSync(assistantBubblePath, "utf8");

  assert.match(source, /message\.state === "streaming"/);
  assert.match(source, /typingCursor/);
});

test("assistant dify bridge accepts both message and agent_message streaming events", () => {
  const source = readFileSync(aiChatLibPath, "utf8");

  assert.match(source, /payload\.event === "message" \|\| payload\.event === "agent_message"/);
  assert.match(source, /response_mode:\s*"streaming"/);
});
