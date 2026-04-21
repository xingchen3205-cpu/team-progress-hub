import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssistantConversationTitle,
  groupAssistantConversationsByDate,
  shouldSendAssistantMessageOnKeydown,
  shouldShowAssistantDateDivider,
} from "../src/components/assistant/assistant-utils";

test("buildAssistantConversationTitle trims long prompts to 20 chars with ellipsis", () => {
  assert.equal(
    buildAssistantConversationTitle("比赛报名和材料提交流程具体应该怎么安排比较稳妥？"),
    "比赛报名和材料提交流程具体应该怎么安排比...",
  );
});

test("groupAssistantConversationsByDate groups items into today yesterday and earlier", () => {
  const grouped = groupAssistantConversationsByDate(
    [
      {
        id: "earlier-1",
        title: "更早对话",
        updatedAt: "2026-04-17T08:00:00.000Z",
      },
      {
        id: "today-1",
        title: "今天对话",
        updatedAt: "2026-04-21T01:00:00.000Z",
      },
      {
        id: "yesterday-1",
        title: "昨天对话",
        updatedAt: "2026-04-20T01:00:00.000Z",
      },
    ],
    new Date("2026-04-21T12:00:00+08:00"),
  );

  assert.deepEqual(
    grouped.map((group) => ({
      label: group.label,
      ids: group.items.map((item) => item.id),
    })),
    [
      { label: "今天", ids: ["today-1"] },
      { label: "昨天", ids: ["yesterday-1"] },
      { label: "更早", ids: ["earlier-1"] },
    ],
  );
});

test("shouldShowAssistantDateDivider returns true when messages are more than 5 minutes apart", () => {
  assert.equal(
    shouldShowAssistantDateDivider("2026-04-21T10:00:00.000Z", "2026-04-21T10:06:00.000Z"),
    true,
  );
  assert.equal(
    shouldShowAssistantDateDivider("2026-04-21T10:00:00.000Z", "2026-04-21T10:04:59.000Z"),
    false,
  );
});

test("shouldSendAssistantMessageOnKeydown only submits on Enter without Shift", () => {
  assert.equal(
    shouldSendAssistantMessageOnKeydown({
      key: "Enter",
      shiftKey: false,
      nativeEvent: { isComposing: false },
    }),
    true,
  );
  assert.equal(
    shouldSendAssistantMessageOnKeydown({
      key: "Enter",
      shiftKey: true,
      nativeEvent: { isComposing: false },
    }),
    false,
  );
  assert.equal(
    shouldSendAssistantMessageOnKeydown({
      key: "a",
      shiftKey: false,
      nativeEvent: { isComposing: false },
    }),
    false,
  );
});
