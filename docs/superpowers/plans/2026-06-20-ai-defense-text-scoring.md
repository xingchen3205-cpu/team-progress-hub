# AI Defense Text Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a text-first AI defense training workflow with persistent attempts, bounded follow-ups, retry-safe interaction, and reviewed question-bank answer-point revisions.

**Architecture:** Keep speech recognition as an optional input adapter that writes into one canonical answer text field. Move scoring validation and revision workflow rules into focused server-side domain helpers, persist immutable question/answer-point snapshots for each attempt, and expose separate student submission and authorized review APIs. Split the existing large training tab by extracting the AI defense workspace and revision review panel while retaining the current workspace context patterns.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6 with SQLite/libSQL, Dify chat and speech APIs, Node test runner through `tsx`.

---

## File Map

- Create `src/lib/training-ai-workflow.ts`: input limits, follow-up limits, revision-state rules, score normalization, and permission helpers.
- Create `src/app/api/training/ai-sessions/route.ts`: create/list AI training sessions.
- Create `src/app/api/training/ai-sessions/[sessionId]/turns/route.ts`: persist a scored turn and immutable snapshots.
- Create `src/app/api/training/ai-sessions/[sessionId]/complete/route.ts`: close a training session and return its summary.
- Modify `src/app/api/training/ai-judge/route.ts`: validate server-owned session context and return a persisted attempt.
- Create `src/app/api/training/question-revisions/route.ts`: list and submit answer-point revision requests.
- Create `src/app/api/training/question-revisions/[requestId]/route.ts`: withdraw, approve, or reject a request.
- Create `src/components/training/ai-defense-workspace.tsx`: unified text/voice input, scoring, retry, follow-up, completion, and revision submission UI.
- Create `src/components/training/question-revision-panel.tsx`: authorized review UI.
- Modify `src/components/tabs/training-tab.tsx`: use the extracted components and remove duplicated AI state.
- Modify `src/components/workspace-context.tsx`: load revision requests and expose refresh hooks.
- Modify `src/data/demo-data.ts`: add API item types for AI sessions, attempts, and revision requests.
- Modify `src/lib/training-ai-judge.ts`: return fixed scoring dimensions and strict structured parsing.
- Modify `src/lib/api-serializers.ts`: serialize new records without leaking internal fields.
- Modify `prisma/schema.prisma`: add AI session, turn, attempt, and revision request models.
- Create `scripts/apply-ai-defense-training-schema.ts`: idempotently provision production libSQL tables and indexes.
- Create `tests/training-ai-workflow.test.ts`: pure workflow and validation tests.
- Create `tests/training-ai-persistence.test.ts`: schema and route contract tests.
- Create `tests/training-question-revision.test.ts`: revision permissions and state transition tests.
- Modify `tests/training-ai-judge.test.ts`: scoring-dimension and prompt tests.
- Modify `tests/workspace-dashboard-split.test.ts`: UI contract and component-boundary tests.

### Task 1: Domain Rules and Structured Scoring

**Files:**
- Create: `src/lib/training-ai-workflow.ts`
- Modify: `src/lib/training-ai-judge.ts`
- Create: `tests/training-ai-workflow.test.ts`
- Modify: `tests/training-ai-judge.test.ts`

- [ ] **Step 1: Write failing tests for input limits, follow-up limits, transitions, and fixed score dimensions**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionRevision,
  normalizeTrainingAnswer,
  validateTrainingTurnNumber,
} from "../src/lib/training-ai-workflow";

test("normalizes answer text and rejects answers outside 10-5000 characters", () => {
  assert.equal(normalizeTrainingAnswer("  有效回答内容超过十个字。  "), "有效回答内容超过十个字。");
  assert.throws(() => normalizeTrainingAnswer("太短"), /至少 10 个字/);
  assert.throws(() => normalizeTrainingAnswer("答".repeat(5001)), /最多 5000 个字/);
});

test("allows no more than three defense turns", () => {
  assert.equal(validateTrainingTurnNumber(3), 3);
  assert.throws(() => validateTrainingTurnNumber(4), /最多进行三轮/);
});

test("revision requests follow explicit transitions", () => {
  assert.equal(canTransitionRevision("pending", "approved"), true);
  assert.equal(canTransitionRevision("pending", "withdrawn"), true);
  assert.equal(canTransitionRevision("approved", "rejected"), false);
});
```

Extend `tests/training-ai-judge.test.ts` to assert the response includes `questionResponse`, `keyPointCoverage`, `logicalStructure`, `evidenceQuality`, and `expressionAccuracy`, each normalized to `0..20`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npx tsx --test tests/training-ai-workflow.test.ts tests/training-ai-judge.test.ts`

Expected: FAIL because `training-ai-workflow.ts` and the five scoring dimensions do not exist.

- [ ] **Step 3: Implement the workflow helper and strict score shape**

```ts
export const TRAINING_MAX_TURNS = 3;
export const TRAINING_ANSWER_MIN_LENGTH = 10;
export const TRAINING_ANSWER_MAX_LENGTH = 5000;

export function normalizeTrainingAnswer(value: unknown) {
  const answer = `${value ?? ""}`.trim();
  if (answer.length < TRAINING_ANSWER_MIN_LENGTH) throw new Error("回答内容至少 10 个字");
  if (answer.length > TRAINING_ANSWER_MAX_LENGTH) throw new Error("回答内容最多 5000 个字");
  return answer;
}

export function validateTrainingTurnNumber(value: unknown) {
  const turnNumber = Number(value);
  if (!Number.isInteger(turnNumber) || turnNumber < 1 || turnNumber > TRAINING_MAX_TURNS) {
    throw new Error("每次训练最多进行三轮问答");
  }
  return turnNumber;
}

const revisionTransitions = {
  pending: new Set(["approved", "rejected", "withdrawn"]),
  approved: new Set(),
  rejected: new Set(),
  withdrawn: new Set(),
} as const;

export function canTransitionRevision(from: keyof typeof revisionTransitions, to: string) {
  return revisionTransitions[from].has(to as never);
}
```

Change `TrainingJudgeFeedback` to include a `dimensions` object with five 20-point integer fields. Compute `score` from their sum on the server instead of trusting an AI-provided total.

- [ ] **Step 4: Run tests and verify they pass**

Run: `npx tsx --test tests/training-ai-workflow.test.ts tests/training-ai-judge.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain layer**

```bash
git add src/lib/training-ai-workflow.ts src/lib/training-ai-judge.ts tests/training-ai-workflow.test.ts tests/training-ai-judge.test.ts
git commit -m "feat: define AI defense scoring rules"
```

### Task 2: Persistent Training and Revision Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `scripts/apply-ai-defense-training-schema.ts`
- Create: `tests/training-ai-persistence.test.ts`

- [ ] **Step 1: Write a failing schema contract test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");

test("persists AI training snapshots and reviewed question revisions", () => {
  assert.match(schema, /model AiTrainingSession/);
  assert.match(schema, /model AiTrainingTurn/);
  assert.match(schema, /model AiTrainingAttempt/);
  assert.match(schema, /model TrainingQuestionRevisionRequest/);
  assert.match(schema, /answerPointsSnapshot\s+String/);
  assert.match(schema, /originalAnswerPoints\s+String/);
  assert.match(schema, /proposedAnswerPoints\s+String/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx tsx --test tests/training-ai-persistence.test.ts`

Expected: FAIL because the models are absent.

- [ ] **Step 3: Add the Prisma models and relations**

Add the following enum and models, then add the matching inverse relation arrays to `User`, `TeamGroup`, and `TrainingQuestion`:

```prisma
model AiTrainingSession {
  id          String    @id @default(cuid())
  createdById String
  teamGroupId String?
  status      String    @default("active")
  startedAt   DateTime  @default(now())
  completedAt DateTime?
  summaryJson String?
  createdBy   User      @relation("AiTrainingSessionCreator", fields: [createdById], references: [id], onDelete: Cascade)
  teamGroup   TeamGroup? @relation(fields: [teamGroupId], references: [id], onDelete: SetNull)
  turns       AiTrainingTurn[]

  @@index([createdById, startedAt])
  @@index([teamGroupId, startedAt])
}

model AiTrainingTurn {
  id                   String   @id @default(cuid())
  sessionId            String
  questionId           String?
  turnNumber           Int
  prompt               String
  questionText         String
  answerPointsSnapshot String
  createdAt            DateTime @default(now())
  session              AiTrainingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  question             TrainingQuestion? @relation(fields: [questionId], references: [id], onDelete: SetNull)
  attempts             AiTrainingAttempt[]

  @@unique([sessionId, turnNumber])
}

model AiTrainingAttempt {
  id           String   @id @default(cuid())
  turnId       String
  attemptNumber Int
  answerText   String
  score        Int
  feedbackJson String
  createdAt    DateTime @default(now())
  turn         AiTrainingTurn @relation(fields: [turnId], references: [id], onDelete: Cascade)

  @@unique([turnId, attemptNumber])
}

enum TrainingRevisionStatus {
  pending
  approved
  rejected
  withdrawn
}

model TrainingQuestionRevisionRequest {
  id                   String   @id @default(cuid())
  questionId           String
  attemptId            String
  submittedById        String
  teamGroupId          String?
  status               TrainingRevisionStatus @default(pending)
  originalAnswerPoints String
  proposedAnswerPoints String
  reason               String
  reviewedById         String?
  reviewComment        String?
  reviewedAt           DateTime?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  question             TrainingQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  attempt              AiTrainingAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  submittedBy          User @relation("TrainingRevisionSubmitter", fields: [submittedById], references: [id], onDelete: Cascade)
  reviewedBy           User? @relation("TrainingRevisionReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)
  teamGroup            TeamGroup? @relation(fields: [teamGroupId], references: [id], onDelete: SetNull)

  @@index([questionId, status, createdAt])
  @@index([submittedById, status, createdAt])
  @@index([teamGroupId, status, createdAt])
}
```

- [ ] **Step 4: Add an idempotent production schema script**

Follow `scripts/apply-team-draw-schema.ts`: connect through `PrismaLibSQL`, execute `CREATE TABLE IF NOT EXISTS` for all four models, create unique/index definitions matching Prisma, and print one success line per table. Do not alter or delete existing rows.

- [ ] **Step 5: Generate Prisma client and run schema tests**

Run: `npm run prisma:generate`

Expected: Prisma Client generated successfully.

Run: `npx tsx --test tests/training-ai-persistence.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the schema**

```bash
git add prisma/schema.prisma scripts/apply-ai-defense-training-schema.ts tests/training-ai-persistence.test.ts
git commit -m "feat: persist AI defense training records"
```

### Task 3: Session-Owned Scoring APIs

**Files:**
- Create: `src/app/api/training/ai-sessions/route.ts`
- Create: `src/app/api/training/ai-sessions/[sessionId]/complete/route.ts`
- Modify: `src/app/api/training/ai-judge/route.ts`
- Modify: `src/lib/api-serializers.ts`
- Modify: `tests/training-ai-persistence.test.ts`

- [ ] **Step 1: Add failing route contract tests**

Assert that the session route uses `buildTeamScopedResourceWhere`, the judge route accepts `sessionId`, obtains previous turns from Prisma rather than `body.previousTurns`, validates the turn number, and writes both `AiTrainingTurn` and `AiTrainingAttempt` in one transaction.

```ts
assert.match(judgeRoute, /sessionId/);
assert.doesNotMatch(judgeRoute, /previousTurns:\s*Array\.isArray\(body\?\.previousTurns\)/);
assert.match(judgeRoute, /validateTrainingTurnNumber/);
assert.match(judgeRoute, /tx\.aiTrainingTurn/);
assert.match(judgeRoute, /tx\.aiTrainingAttempt/);
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run: `npx tsx --test tests/training-ai-persistence.test.ts`

Expected: FAIL on missing routes and old client-owned history.

- [ ] **Step 3: Implement session creation/listing**

`POST /api/training/ai-sessions` creates an active session for the current user and team. `GET` returns the current user's latest 20 sessions; leaders and teachers may use `?scope=team` for their team. Serialize timestamps, status, summary and turn counts only.

- [ ] **Step 4: Make scoring transactional and retry-safe**

The judge route must:

1. authenticate and load the active session within team scope;
2. normalize the confirmed answer;
3. reject turn numbers above three;
4. load the selected question and existing server-owned turns;
5. call `generateTrainingJudgeFeedback`;
6. upsert the turn snapshot and create the next attempt number in a transaction;
7. return `{ sessionId, turn, attempt, feedback, permission }`.

Use an idempotency key `${sessionId}:${turnNumber}:${sha256(answerText)}` stored or checked before creating a duplicate attempt.

- [ ] **Step 5: Implement completion**

`POST /api/training/ai-sessions/[sessionId]/complete` requires at least one scored attempt, sets `status` to `completed`, records `completedAt`, and saves a deterministic summary containing average score, strongest dimension, weakest dimension, and completed turn count. Repeated completion returns the existing summary.

- [ ] **Step 6: Run focused tests**

Run: `npx tsx --test tests/training-ai-workflow.test.ts tests/training-ai-judge.test.ts tests/training-ai-persistence.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the session APIs**

```bash
git add src/app/api/training/ai-sessions src/app/api/training/ai-judge/route.ts src/lib/api-serializers.ts tests/training-ai-persistence.test.ts
git commit -m "feat: add persistent AI defense sessions"
```

### Task 4: Reviewed Question-Bank Revision APIs

**Files:**
- Create: `src/app/api/training/question-revisions/route.ts`
- Create: `src/app/api/training/question-revisions/[requestId]/route.ts`
- Create: `tests/training-question-revision.test.ts`
- Modify: `src/lib/training-ai-workflow.ts`

- [ ] **Step 1: Write failing permission and transition tests**

Test these rules: submitter cannot review their own request; members can submit visible-team questions; only creator, leader, teacher, school administrator, or administrator can review; only pending requests can transition; duplicate pending requests by the same submitter/question are rejected.

```ts
assert.equal(canReviewTrainingRevision({ role: "member", userId: "u1" }, request), false);
assert.equal(canReviewTrainingRevision({ role: "teacher", userId: "u2", teamGroupId: "g1" }, request), true);
assert.equal(canReviewTrainingRevision({ role: "teacher", userId: request.submittedById, teamGroupId: "g1" }, request), false);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test tests/training-question-revision.test.ts`

Expected: FAIL because helper and routes do not exist.

- [ ] **Step 3: Implement submission and listing**

`POST /api/training/question-revisions` accepts `questionId`, `attemptId`, `proposedAnswerPoints`, and `reason`. It verifies the attempt belongs to the submitter, snapshots the current answer points, rejects unchanged or duplicate pending proposals, and creates a pending request. `GET` returns the current user's submissions and, for reviewers, pending requests in their authorized scope.

- [ ] **Step 4: Implement withdraw/approve/reject transaction**

`PATCH /api/training/question-revisions/[requestId]` accepts `{ action, reviewComment }`. Withdraw is submitter-only. Approve/reject requires reviewer authority and a non-empty comment. Approval transaction checks the request is still pending and the question's answer points still equal `originalAnswerPoints`; then updates the question, creates `training_question.revision` audit history, and updates the request. A changed source question returns `409` and leaves the request pending for manual resubmission.

- [ ] **Step 5: Notify the submitter and question owner**

Use `createNotifications` with `targetTab: "training"`. Submission notifies authorized reviewers in the same team; approval/rejection notifies the submitter. Notification failure must be logged but must not roll back a successful database transaction.

- [ ] **Step 6: Run revision tests**

Run: `npx tsx --test tests/training-question-revision.test.ts tests/training-ai-persistence.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the revision workflow**

```bash
git add src/lib/training-ai-workflow.ts src/app/api/training/question-revisions tests/training-question-revision.test.ts
git commit -m "feat: add reviewed training answer revisions"
```

### Task 5: Student AI Defense Workspace

**Files:**
- Create: `src/components/training/ai-defense-workspace.tsx`
- Modify: `src/components/tabs/training-tab.tsx`
- Modify: `src/data/demo-data.ts`
- Modify: `tests/workspace-dashboard-split.test.ts`

- [ ] **Step 1: Add failing UI contract tests**

Assert the extracted component exists and contains the formal labels `开始语音录入`, `确认回答并开始评分`, `修改回答并重新评分`, `继续追问`, `结束本次训练`, and `提交题库要点修订`. Assert the canonical textarea is always rendered while a question is active and the old `提交点评` label is absent.

- [ ] **Step 2: Run UI contract tests and verify failure**

Run: `npx tsx --test tests/workspace-dashboard-split.test.ts`

Expected: FAIL because the component and labels do not exist.

- [ ] **Step 3: Extract the AI workspace and unify input state**

Move recording, browser preview, transcript upload, scoring, and follow-up state out of `training-tab.tsx`. Keep one `answerText` state. Browser recognition and server transcription update that same state. The textarea remains editable except while a scoring request is active.

- [ ] **Step 4: Add persistent session flow and failure recovery**

Create a session on entry, submit confirmed text to the session-owned judge route, and retain `answerText` on every error. Disable only the in-flight command. A retry reuses the same session and turn. On successful retry, replace the error message without clearing the text.

- [ ] **Step 5: Render fixed scoring evidence and bounded actions**

Render total score followed by the five dimensions, hit points, missing points, expression risks, reference answer, and follow-up. Hide `继续追问` after turn three. `修改回答并重新评分` returns focus to the same textarea without deleting the previous attempt card. `结束本次训练` calls completion and shows the deterministic summary.

- [ ] **Step 6: Add the revision submission panel**

The panel shows current question, read-only current answer points, read-only latest confirmed answer, editable proposed answer points, and required reason. It posts `questionId`, latest `attemptId`, proposed text, and reason. On success, close the editor and show `修订申请审核中`.

- [ ] **Step 7: Run focused UI and unit tests**

Run: `npx tsx --test tests/workspace-dashboard-split.test.ts tests/training-ai-workflow.test.ts tests/training-ai-judge.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the student workflow**

```bash
git add src/components/training/ai-defense-workspace.tsx src/components/tabs/training-tab.tsx src/data/demo-data.ts tests/workspace-dashboard-split.test.ts
git commit -m "feat: streamline student AI defense training"
```

### Task 6: Revision Review Panel

**Files:**
- Create: `src/components/training/question-revision-panel.tsx`
- Modify: `src/components/tabs/training-tab.tsx`
- Modify: `src/components/workspace-context.tsx`
- Modify: `tests/workspace-dashboard-split.test.ts`
- Modify: `tests/training-question-revision.test.ts`

- [ ] **Step 1: Add failing reviewer UI tests**

Assert the review panel is visible only for creator/leader/teacher/admin-capable users, displays old and proposed points side by side, requires a review comment, and exposes `批准修订` and `驳回申请` actions. Assert members see only their own request status.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npx tsx --test tests/workspace-dashboard-split.test.ts tests/training-question-revision.test.ts`

Expected: FAIL because review UI and workspace loading are absent.

- [ ] **Step 3: Implement scoped loading and refresh**

Add `trainingQuestionRevisions` to workspace request keys. Load `/api/training/question-revisions` only when the training tab is active. Refresh after submit, withdraw, approve, or reject without reloading unrelated workspace data.

- [ ] **Step 4: Implement the review panel**

Use an unframed section with a compact status summary and one card per request. Show question, applicant, submitted time, original points, proposed points, reason, and mandatory review comment. Confirm approval because it changes future scoring criteria. Do not show reviewer commands to the submitter.

- [ ] **Step 5: Run focused tests**

Run: `npx tsx --test tests/workspace-dashboard-split.test.ts tests/training-question-revision.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the review UI**

```bash
git add src/components/training/question-revision-panel.tsx src/components/tabs/training-tab.tsx src/components/workspace-context.tsx tests/workspace-dashboard-split.test.ts tests/training-question-revision.test.ts
git commit -m "feat: review training answer revisions"
```

### Task 7: Full Verification, Production Schema, and Deployment

**Files:**
- Verify: all files listed in Tasks 1-6.
- Modify: only the exact feature files implicated by a failing verification command.

- [ ] **Step 1: Generate Prisma and run all training tests**

Run: `npm run prisma:generate`

Expected: success.

Run: `npx tsx --test tests/training-ai-workflow.test.ts tests/training-ai-judge.test.ts tests/training-ai-persistence.test.ts tests/training-question-revision.test.ts tests/training-drill-repeat.test.ts tests/training-question-ai-import.test.ts tests/workspace-dashboard-split.test.ts`

Expected: all pass.

- [ ] **Step 2: Run the full build**

Run: `npm run build`

Expected: Next.js production build completes with no TypeScript or route errors.

- [ ] **Step 3: Run production schema provisioning**

Run: `npx tsx scripts/apply-ai-defense-training-schema.ts`

Expected: all four tables and indexes reported as ensured. Running the same command a second time must also succeed without changing existing rows.

- [ ] **Step 4: Perform desktop and mobile interaction verification**

Start the app and verify at desktop and `390x844`: text entry is always available, speech failure retains text, scoring does not shift the layout significantly, retry retains text, third turn hides further follow-up, revision submission retains drafts on failure, and reviewer approval updates only future scoring.

- [ ] **Step 5: Commit verification-only corrections**

```bash
git add prisma/schema.prisma scripts/apply-ai-defense-training-schema.ts src/lib/training-ai-workflow.ts src/lib/training-ai-judge.ts src/lib/api-serializers.ts src/app/api/training/ai-judge/route.ts src/app/api/training/ai-sessions src/app/api/training/question-revisions src/components/training src/components/tabs/training-tab.tsx src/components/workspace-context.tsx src/data/demo-data.ts tests/training-ai-workflow.test.ts tests/training-ai-judge.test.ts tests/training-ai-persistence.test.ts tests/training-question-revision.test.ts tests/workspace-dashboard-split.test.ts
git commit -m "fix: harden AI defense training workflow"
```

Skip this commit when verification requires no code correction.

- [ ] **Step 6: Deploy and verify the formal domain**

Run: `vercel --prod --yes`

Expected: deployment reaches Ready and aliases to `https://xingchencxcy.com`.

Run: `curl -I https://xingchencxcy.com`

Expected: HTTP 200.
