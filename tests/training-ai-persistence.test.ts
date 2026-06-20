import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");

test("AI defense training persists sessions, turns, attempts, and reviewed revisions", () => {
  assert.match(schema, /model AiTrainingSession/);
  assert.match(schema, /model AiTrainingTurn/);
  assert.match(schema, /model AiTrainingAttempt/);
  assert.match(schema, /model TrainingQuestionRevisionRequest/);
  assert.match(schema, /answerPointsSnapshot\s+String/);
  assert.match(schema, /originalAnswerPoints\s+String/);
  assert.match(schema, /proposedAnswerPoints\s+String/);
  assert.match(schema, /enum TrainingRevisionStatus/);
});

test("AI defense schema has stable uniqueness and scoped indexes", () => {
  assert.match(schema, /@@unique\(\[sessionId, turnNumber\]\)/);
  assert.match(schema, /@@unique\(\[turnId, attemptNumber\]\)/);
  assert.match(schema, /@@index\(\[teamGroupId, status, createdAt\]\)/);
});

test("production has an idempotent AI defense schema provisioning script", () => {
  const scriptPath = "scripts/apply-ai-defense-training-schema.ts";
  assert.equal(existsSync(scriptPath), true);
  const script = readFileSync(scriptPath, "utf8");
  assert.match(script, /CREATE TABLE IF NOT EXISTS/);
  assert.match(script, /AiTrainingSession/);
  assert.match(script, /TrainingQuestionRevisionRequest/);
  assert.match(script, /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/);
});
