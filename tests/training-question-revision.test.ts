import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { canReviewTrainingRevision } from "../src/lib/training-ai-workflow";

const request = {
  submittedById: "student-1",
  questionCreatedById: "creator-1",
  teamGroupId: "group-1",
};

test("revision review excludes submitters and enforces team scope", () => {
  assert.equal(canReviewTrainingRevision({ id: "student-1", role: "teacher", teamGroupId: "group-1" }, request), false);
  assert.equal(canReviewTrainingRevision({ id: "teacher-1", role: "teacher", teamGroupId: "group-1" }, request), true);
  assert.equal(canReviewTrainingRevision({ id: "leader-1", role: "leader", teamGroupId: "group-2" }, request), false);
  assert.equal(canReviewTrainingRevision({ id: "creator-1", role: "member", teamGroupId: "group-1" }, request), true);
  assert.equal(canReviewTrainingRevision({ id: "admin-1", role: "admin", teamGroupId: null }, request), true);
});

test("revision routes expose submit, list, withdraw, approve, and reject contracts", () => {
  const collectionPath = "src/app/api/training/question-revisions/route.ts";
  const itemPath = "src/app/api/training/question-revisions/[requestId]/route.ts";
  assert.equal(existsSync(collectionPath), true);
  assert.equal(existsSync(itemPath), true);
  const collection = readFileSync(collectionPath, "utf8");
  const item = readFileSync(itemPath, "utf8");
  assert.match(collection, /export async function GET/);
  assert.match(collection, /export async function POST/);
  assert.match(collection, /status:\s*"pending"/);
  assert.match(collection, /proposedAnswerPoints/);
  assert.match(collection, /attemptId/);
  assert.match(item, /withdrawn/);
  assert.match(item, /approved/);
  assert.match(item, /rejected/);
  assert.match(item, /trainingQuestion\.update/);
  assert.match(item, /createAuditLogEntry/);
  assert.match(item, /canReviewTrainingRevision/);
});
