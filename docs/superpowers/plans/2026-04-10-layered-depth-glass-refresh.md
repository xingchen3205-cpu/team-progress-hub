# Layered Depth Glass Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing glassmorphism styling into a layered-depth system while keeping the layout and feature structure unchanged.

**Architecture:** Tighten the existing global depth tokens in `globals.css`, then route the dashboard shell and repeated card surfaces through those tokens. Add source-level regression tests that lock the shell, badge, and sidebar styling direction before modifying JSX and CSS.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, TypeScript, Node test runner with `tsx`

---

### Task 1: Lock the Visual Contract with Failing Tests

**Files:**
- Create: `tests/workspace-dashboard-visual-depth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-dashboard.tsx"),
  "utf8",
);

test("workspace shell uses layered-depth sidebar styling", () => {
  assert.match(dashboardSource, /depth-sidebar/);
  assert.doesNotMatch(dashboardSource, /bg-\[#0B3B8A\]/);
  assert.doesNotMatch(dashboardSource, /bg-blue-800 text-white shadow-sm/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/workspace-dashboard-visual-depth.test.ts`
Expected: FAIL because the current dashboard still contains hard-coded sidebar blue blocks and lacks the new source contract.

- [ ] **Step 3: Extend the test to cover badge convergence**

```ts
test("dashboard removes multicolor badge palettes from board status chips", () => {
  assert.doesNotMatch(dashboardSource, /border-amber-200 bg-amber-50 text-amber-700/);
  assert.doesNotMatch(dashboardSource, /border-orange-200 bg-orange-50 text-orange-700/);
  assert.doesNotMatch(dashboardSource, /border-emerald-200 bg-emerald-50 text-emerald-700/);
});
```

- [ ] **Step 4: Re-run the test to keep the suite red**

Run: `node --import tsx --test tests/workspace-dashboard-visual-depth.test.ts`
Expected: FAIL on the old badge classes.

### Task 2: Tighten Global Depth Tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update background and depth utilities**

Implement:
- stronger body backdrop tied to the orb field
- mid-layer and foreground-layer utilities aligned to the approved blur, border, fill, and shadow values
- emphasis utility for white floating chips
- muted-text utility and selector overrides for repeated secondary text utilities

- [ ] **Step 2: Run the targeted test**

Run: `node --import tsx --test tests/workspace-dashboard-visual-depth.test.ts`
Expected: still FAIL, because JSX shell usage has not been updated yet.

### Task 3: Apply the Layered Shell to the Workspace Dashboard

**Files:**
- Modify: `src/components/workspace-dashboard.tsx`

- [ ] **Step 1: Route repeated card constants through the new depth classes**

Implement:
- `surfaceCardClassName` -> foreground depth card
- `subtleCardClassName` -> lighter nested surface
- form fields and modal shell aligned to the new glass language

- [ ] **Step 2: Replace hard-coded sidebar blue blocks with mid-layer styling**

Implement:
- `depth-sidebar` on desktop and mobile sidebars
- white leading border active state
- white text without filled active blue background

- [ ] **Step 3: Convert overview metrics and key badges to emphasis surfaces**

Implement:
- solid white metric tiles
- monochrome or blue-only badges
- removal of amber/orange/emerald chip palettes in board and document status affordances

- [ ] **Step 4: Run the targeted test**

Run: `node --import tsx --test tests/workspace-dashboard-visual-depth.test.ts`
Expected: PASS

### Task 4: Align Login and Loading Surfaces

**Files:**
- Modify: `src/components/login-screen.tsx`

- [ ] **Step 1: Update loading and auth-panel surfaces**

Implement:
- depth-card treatment for the loading state
- background shells that visually belong to the layered system

- [ ] **Step 2: Re-run the targeted test**

Run: `node --import tsx --test tests/workspace-dashboard-visual-depth.test.ts`
Expected: PASS

### Task 5: Verify Integration

**Files:**
- No code changes required

- [ ] **Step 1: Run the targeted source test suite**

Run: `node --import tsx --test tests/workspace-dashboard-visual-depth.test.ts tests/login-screen-defaults.test.ts`
Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: successful Next.js production build with no compile failures

- [ ] **Step 3: Start the local dev server for manual review**

Run: `npm run dev`
Expected: local server starts and serves the refreshed UI for browser inspection
