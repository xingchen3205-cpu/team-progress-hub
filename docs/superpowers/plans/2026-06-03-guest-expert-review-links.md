# Guest Expert Review Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build no-login expert scoring links so each expert can score all assigned projects in roadshow order without opening the full platform or big screen.

**Architecture:** Add a hashed guest-token model bound to `(expertUserId, projectReviewStageId)`, admin APIs to generate/list/revoke links, guest APIs to read scoped assignments and submit scores, and a mobile-first guest scoring page. Guest scores write to the existing `ExpertReviewScore` table so admin progress, calculation, and export use the current score pipeline.

**Tech Stack:** Next.js App Router, Prisma/Turso, TypeScript, existing auth/permissions/rate-limit helpers, existing expert review serializers and score rules.

---

### Task 1: Schema And Token Utilities

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/expert-review-guest-token.ts`
- Create: `scripts/apply-guest-expert-review-schema.ts`
- Test: `tests/expert-review-guest-links.test.ts`

- [ ] **Step 1: Write failing schema/token tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const readSource = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("guest expert review links", () => {
  it("declares hashed guest expert tokens bound one-per-expert-stage", () => {
    const schema = readSource("prisma/schema.prisma");
    const tokenLib = readSource("src/lib/expert-review-guest-token.ts");
    const schemaScript = readSource("scripts/apply-guest-expert-review-schema.ts");

    assert.match(schema, /model ExpertReviewGuestToken/);
    assert.match(schema, /expertUserId\s+String/);
    assert.match(schema, /projectReviewStageId\s+String/);
    assert.match(schema, /tokenHash\s+String\s+@unique/);
    assert.match(schema, /@@unique\(\[expertUserId,\s*projectReviewStageId\]\)/);
    assert.match(tokenLib, /randomBytes\(32\)/);
    assert.match(tokenLib, /createHash\("sha256"\)/);
    assert.match(schemaScript, /CREATE TABLE IF NOT EXISTS/);
    assert.match(schemaScript, /ExpertReviewGuestToken/);
  });
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `npx tsx --test tests/expert-review-guest-links.test.ts`

Expected: fails because files/model do not exist.

- [ ] **Step 3: Add schema/model/script/token utility**

Add `ExpertReviewGuestToken` with unique `(expertUserId, projectReviewStageId)` and `tokenHash`, plus crypto helpers:

```ts
export const createExpertReviewGuestToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashExpertReviewGuestToken(token) };
};
```

- [ ] **Step 4: Run test**

Run: `npx tsx --test tests/expert-review-guest-links.test.ts`

Expected: passes.

### Task 2: Admin Link APIs

**Files:**
- Create: `src/app/api/expert-reviews/guest-links/route.ts`
- Create: `src/app/api/expert-reviews/guest-links/revoke/route.ts`
- Modify: `tests/expert-review-guest-links.test.ts`

- [ ] **Step 1: Extend tests**

Add assertions that admin APIs require `assertRole(user.role, ["admin", "school_admin"])`, generate one link per expert, use upsert by `(expertUserId, projectReviewStageId)`, and never return raw tokens in GET.

- [ ] **Step 2: Implement `POST` and `GET /guest-links`**

`POST` validates the stage, finds experts with assignments in that stage, creates or regenerates one token per expert, and returns copyable URLs.

`GET` lists metadata only: expert name, assignment count, expiry, revoked state, last used time.

- [ ] **Step 3: Implement revoke route**

`POST /revoke` accepts `projectReviewStageId` and optional `expertUserId`; it sets `revokedAt = now`.

- [ ] **Step 4: Run test**

Run: `npx tsx --test tests/expert-review-guest-links.test.ts`

Expected: passes.

### Task 3: Guest Assignment And Score APIs

**Files:**
- Create: `src/app/api/expert-reviews/guest/[token]/route.ts`
- Create: `src/app/api/expert-reviews/guest/[token]/scores/route.ts`
- Modify: `tests/expert-review-guest-links.test.ts`

- [ ] **Step 1: Extend tests**

Add assertions that guest APIs do not call `getSessionUser`, validate `hashExpertReviewGuestToken`, scope by `expertUserId` and `projectReviewStageId`, order projects by `ReviewDisplayProjectOrder.orderIndex`, do not require big screen scoring state, create `ExpertReviewScore`, and reject assignment IDs outside token scope.

- [ ] **Step 2: Implement guest info API**

Return round/stage info, expert name, progress counts, and assignments ordered by roadshow order when available.

- [ ] **Step 3: Implement guest scoring API**

Validate token, scope, package status, time window, existing score, 0.00-100.00 score precision, then create `ExpertReviewScore` and update assignment status to `submitted`.

- [ ] **Step 4: Run tests**

Run: `npx tsx --test tests/expert-review-guest-links.test.ts tests/expert-review-v2.test.ts`

Expected: passes.

### Task 4: Guest Scoring Page

**Files:**
- Create: `src/app/expert-review/guest/[token]/page.tsx`
- Modify: `tests/expert-review-guest-links.test.ts`

- [ ] **Step 1: Extend tests**

Assert page uses `/api/expert-reviews/guest/${token}`, renders project list, uses submitted/pending states, posts to `/scores`, and includes completion thanks text.

- [ ] **Step 2: Implement page**

Create a mobile-first page with no workspace shell: header, progress, ordered project list, score input, comment textarea, submit confirmation, submitted locked state, expired/revoked error state, and completion message.

- [ ] **Step 3: Run test**

Run: `npx tsx --test tests/expert-review-guest-links.test.ts`

Expected: passes.

### Task 5: Admin UI Controls

**Files:**
- Modify: `src/components/tabs/expert-review-tab-content.tsx`
- Modify: `tests/expert-review-guest-links.test.ts`

- [ ] **Step 1: Extend tests**

Assert admin tab has "专家免登录评分链接", calls `/api/expert-reviews/guest-links`, copies one link per expert, and does not generate one link per project.

- [ ] **Step 2: Implement controls**

Add a compact admin panel on each review group/card showing expert guest link generation, copy, expiry, revoke/regenerate, and assignment count.

- [ ] **Step 3: Run tests**

Run: `npx tsx --test tests/expert-review-guest-links.test.ts tests/expert-review-v2.test.ts`

Expected: passes.

### Task 6: Verify, Schema Apply, Deploy

**Files:**
- No new source files unless verification finds a defect.

- [ ] **Step 1: Run focused tests**

Run: `npx tsx --test tests/expert-review-guest-links.test.ts tests/expert-review-v2.test.ts tests/review-screen-session.test.ts`

Expected: all pass.

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: production build passes.

- [ ] **Step 3: Apply production schema**

Run: `npx tsx scripts/apply-guest-expert-review-schema.ts`

Expected: idempotent output confirming `ExpertReviewGuestToken` table/indexes exist.

- [ ] **Step 4: Deploy**

Run: `vercel --prod --yes`

Expected: production deployment `READY`, aliased to `https://xingchencxcy.com`.

- [ ] **Step 5: Inspect deployment**

Run: `vercel inspect <deployment-url>`

Expected: status `Ready`.

