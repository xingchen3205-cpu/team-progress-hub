import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionTrainingRevision,
  normalizeTrainingAnswer,
  validateTrainingTurnNumber,
} from "../src/lib/training-ai-workflow";

test("training answers are trimmed and must contain 10 to 5000 characters", () => {
  assert.equal(normalizeTrainingAnswer("  这是一个内容完整的有效回答。  "), "这是一个内容完整的有效回答。");
  assert.throws(() => normalizeTrainingAnswer("太短"), /至少 10 个字/);
  assert.throws(() => normalizeTrainingAnswer("答".repeat(5001)), /最多 5000 个字/);
});

test("AI defense training allows no more than three turns", () => {
  assert.equal(validateTrainingTurnNumber(1), 1);
  assert.equal(validateTrainingTurnNumber(3), 3);
  assert.throws(() => validateTrainingTurnNumber(0), /一至三轮/);
  assert.throws(() => validateTrainingTurnNumber(4), /一至三轮/);
});

test("question revision requests only transition from pending", () => {
  assert.equal(canTransitionTrainingRevision("pending", "approved"), true);
  assert.equal(canTransitionTrainingRevision("pending", "rejected"), true);
  assert.equal(canTransitionTrainingRevision("pending", "withdrawn"), true);
  assert.equal(canTransitionTrainingRevision("approved", "rejected"), false);
  assert.equal(canTransitionTrainingRevision("withdrawn", "approved"), false);
});
