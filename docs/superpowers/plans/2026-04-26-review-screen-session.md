# Review Screen Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stable temporary full-screen roadshow scoring display session that syncs anonymized expert scores in real time.

**Architecture:** Extend the expert-review domain with display sessions and anonymous seats. Admins create/manage display sessions from roadshow review packages; experts continue submitting locked scores through existing scoring APIs; the screen route uses a signed token and 1-second polling to render anonymized status and final scores. Admin review remains the source for实名留档 and CSV export.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma SQLite/libSQL, Tailwind CSS, Node test runner.

---

### Task 1: Data Model And Pure Helpers

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/review-screen.ts`
- Test: `tests/review-screen-session.test.ts`

- [ ] Add `ReviewDisplaySession` and `ReviewDisplaySeat` models with token hash, status, countdown, drop-rule fields, and seat status.
- [ ] Add helper tests for token hashing, valid time-window checks, final score calculation, and anonymous seat serialization.
- [ ] Implement helpers without exposing expert names in screen payloads.

### Task 2: API Routes

**Files:**
- Create: `src/app/api/review-screen/sessions/route.ts`
- Create: `src/app/api/review-screen/sessions/[sessionId]/route.ts`
- Create: `src/app/api/review-screen/sessions/[sessionId]/start/route.ts`
- Create: `src/app/api/review-screen/sessions/[sessionId]/void-seat/route.ts`
- Modify: `src/app/api/expert-reviews/scores/route.ts`
- Test: `tests/review-screen-session.test.ts`

- [ ] Add admin-only create/list and start/void routes.
- [ ] Add public token-protected read route returning anonymized screen payload.
- [ ] Ensure only roadshow packages can create screen sessions.
- [ ] Ensure expert score submission refreshes related screen sessions by using existing score rows as source of truth.

### Task 3: Workspace Context Integration

**Files:**
- Modify: `src/components/workspace-context.tsx`
- Modify: `src/components/tabs/expert-review-tab.tsx`
- Test: `tests/expert-review-v2.test.ts`

- [ ] Add review screen session types and data loading.
- [ ] Add admin actions to generate/copy/start screen link and void seats.
- [ ] Add export rows for real expert names and anonymous seat numbers.

### Task 4: Full-Screen Display Page

**Files:**
- Create: `src/app/review-screen/session/[sessionId]/page.tsx`
- Test: `tests/review-screen-session.test.ts`

- [ ] Implement token read from URL.
- [ ] Poll every second, preserve last good payload on transient failure.
- [ ] Render anonymous experts, countdown/overtime state, smooth transitions, and final score.

### Task 5: Verification

**Commands:**
- `npx tsx --test tests/review-screen-session.test.ts tests/expert-review-v2.test.ts`
- `npx tsx --test tests/*.test.ts`
- `npm run lint`
- `npm run build`
