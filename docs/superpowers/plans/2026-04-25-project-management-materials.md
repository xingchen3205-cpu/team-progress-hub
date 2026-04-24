# Project Management Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase 1 of the expert-review redesign: project review stages, team-scoped material upload, and approval by any bound teacher.

**Architecture:** Add a project-material domain beside the existing document and expert-review modules. Data is stored in new Prisma models, API routes enforce role/team boundaries, workspace context loads the new resource only for the new project-management tab, and the tab renders role-specific views for admins, teachers, and students.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, SQLite/Turso, Tailwind CSS, existing R2 upload helpers, Node test runner via `npx tsx --test`.

---

## Scope

This plan implements only phase 1 from `docs/superpowers/specs/2026-04-24-project-materials-expert-review-design.md`.

Included:

- Admin creates and manages project review stages.
- Students and project leaders upload materials only for their own team group.
- Uploads notify all bound teachers in the same team group.
- Any one bound teacher can approve or reject a pending material.
- Approved material becomes the current usable project material for that team and stage.
- Workspace gets a new “项目管理” tab visible to admin, school admin, teacher, leader, and member.

Excluded:

- Expert round assignment.
- Score submission.
- Projection screen.
- Migration away from old expert review package tables.

Deferred-but-preserved rules:

- Phase 2 must keep `online_review` and `roadshow` fully separated. Online review may bind only an approved `ProjectMaterialSubmission`; roadshow must never expose project materials to experts.
- Phase 3 owns scoring: one total score only, saved as `scoreCents` from 0 to 10000, displayed as 0.00 to 100.00, optional comment for online review only, no comment for roadshow, second confirmation before submit, and immutable scores after submit.
- Phase 4 owns the read-only projection screen for current round, expert submission status, and live scores.
- Phase 1 does not create a mutable “current material” flag. The current usable material is derived as the latest approved submission for the same `stageId + teamGroupId`, ordered by `approvedAt desc, createdAt desc`.

## File Structure

- Modify: `prisma/schema.prisma`
  - Add enums and models for project review stages and submissions.
  - Add relations to `User` and `TeamGroup`.
- Create: `src/lib/project-materials.ts`
  - Centralize permissions, validation, status labels, and query builders.
- Modify: `src/lib/api-serializers.ts`
  - Add serializers for stages and material submissions.
- Create: `src/app/api/project-stages/route.ts`
  - List and create stages.
- Create: `src/app/api/project-stages/[stageId]/route.ts`
  - Update stage metadata and open/closed state.
- Create: `src/app/api/project-materials/route.ts`
  - List and create material submissions.
- Create: `src/app/api/project-materials/upload-url/route.ts`
  - Create R2 signed upload URLs for project material files.
- Create: `src/app/api/project-materials/[submissionId]/approve/route.ts`
  - Approve a pending submission.
- Create: `src/app/api/project-materials/[submissionId]/reject/route.ts`
  - Reject a pending submission with reason.
- Modify: `src/data/demo-data.ts`
  - Add TypeScript types for project stages and project materials.
- Modify: `src/components/workspace-context.tsx`
  - Add `project` tab key, resource state, loader, modal state, and actions.
- Modify: `src/components/workspace-dashboard.tsx`
  - Dynamically load project-management tab.
- Create: `src/components/tabs/project-management-tab.tsx`
  - Role-specific project material UI.
- Modify: `src/components/workspace-shell.tsx`
  - Add modal for stage creation/editing and upload approval actions if needed by context actions.
- Test: `tests/project-materials.test.ts`
  - Domain and static route assertions.
- Test: `tests/workspace-project-management.test.ts`
  - Tab visibility, role-specific UI, and resource loading assertions.

---

### Task 1: Add Project Material Schema

**Files:**

- Modify: `prisma/schema.prisma`
- Test: `tests/project-materials.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `tests/project-materials.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const schemaSource = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");

test("project material schema contains stages and submissions", () => {
  assert.match(schemaSource, /enum ProjectReviewStageType \{/);
  assert.match(schemaSource, /online_review/);
  assert.match(schemaSource, /roadshow/);
  assert.match(schemaSource, /enum ProjectMaterialStatus \{/);
  assert.match(schemaSource, /pending/);
  assert.match(schemaSource, /approved/);
  assert.match(schemaSource, /rejected/);
  assert.match(schemaSource, /model ProjectReviewStage \{/);
  assert.match(schemaSource, /model ProjectMaterialSubmission \{/);
  assert.match(schemaSource, /@@index\(\[isOpen, deadline\]\)/);
  assert.match(schemaSource, /@@index\(\[teamGroupId, stageId, status\]\)/);
});

test("project material schema links users and team groups", () => {
  const userModel = schemaSource.match(/model User \{[\s\S]*?\n\}/)?.[0] ?? "";
  const teamGroupModel = schemaSource.match(/model TeamGroup \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(userModel, /projectReviewStages\s+ProjectReviewStage\[\]/);
  assert.match(userModel, /projectMaterialsSubmitted\s+ProjectMaterialSubmission\[\]\s+@relation\("ProjectMaterialSubmitter"\)/);
  assert.match(userModel, /projectMaterialsApproved\s+ProjectMaterialSubmission\[\]\s+@relation\("ProjectMaterialApprover"\)/);
  assert.match(userModel, /projectMaterialsRejected\s+ProjectMaterialSubmission\[\]\s+@relation\("ProjectMaterialRejecter"\)/);
  assert.match(teamGroupModel, /projectReviewStages\s+ProjectReviewStage\[\]/);
  assert.match(teamGroupModel, /projectMaterialSubmissions\s+ProjectMaterialSubmission\[\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: FAIL because `ProjectReviewStageType`, `ProjectMaterialStatus`, `ProjectReviewStage`, and `ProjectMaterialSubmission` do not exist yet.

- [ ] **Step 3: Add Prisma enums and relations**

In `prisma/schema.prisma`, add enums after `ReportEvaluationType`:

```prisma
enum ProjectReviewStageType {
  online_review
  roadshow
}

enum ProjectMaterialStatus {
  pending
  approved
  rejected
}
```

Add these relation fields to `model User`:

```prisma
  projectReviewStages       ProjectReviewStage[]        @relation("ProjectReviewStageCreator")
  projectMaterialsSubmitted ProjectMaterialSubmission[] @relation("ProjectMaterialSubmitter")
  projectMaterialsApproved  ProjectMaterialSubmission[] @relation("ProjectMaterialApprover")
  projectMaterialsRejected  ProjectMaterialSubmission[] @relation("ProjectMaterialRejecter")
```

Add these relation fields to `model TeamGroup`:

```prisma
  projectReviewStages       ProjectReviewStage[]
  projectMaterialSubmissions ProjectMaterialSubmission[]
```

- [ ] **Step 4: Add Prisma models**

Add models before `ExpertReviewPackage`:

```prisma
model ProjectReviewStage {
  id          String                 @id @default(cuid())
  name        String
  type        ProjectReviewStageType
  description String?
  isOpen      Boolean                @default(false)
  startAt     DateTime?
  deadline    DateTime?
  createdById String
  teamGroupId String?
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt
  creator     User                   @relation("ProjectReviewStageCreator", fields: [createdById], references: [id])
  teamGroup   TeamGroup?             @relation(fields: [teamGroupId], references: [id], onDelete: SetNull)
  submissions ProjectMaterialSubmission[]

  @@index([isOpen, deadline])
  @@index([teamGroupId, createdAt])
}

model ProjectMaterialSubmission {
  id           String                @id @default(cuid())
  stageId      String
  teamGroupId  String
  submittedById String
  title        String
  fileName     String
  filePath     String
  fileSize     Int
  mimeType     String
  status       ProjectMaterialStatus @default(pending)
  approvedById String?
  approvedAt   DateTime?
  rejectedById String?
  rejectedAt   DateTime?
  rejectReason String?
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @updatedAt
  stage        ProjectReviewStage    @relation(fields: [stageId], references: [id], onDelete: Cascade)
  teamGroup    TeamGroup             @relation(fields: [teamGroupId], references: [id], onDelete: Cascade)
  submitter    User                  @relation("ProjectMaterialSubmitter", fields: [submittedById], references: [id])
  approver     User?                 @relation("ProjectMaterialApprover", fields: [approvedById], references: [id], onDelete: SetNull)
  rejecter     User?                 @relation("ProjectMaterialRejecter", fields: [rejectedById], references: [id], onDelete: SetNull)

  @@index([stageId, status, createdAt])
  @@index([teamGroupId, stageId, status])
  @@index([submittedById, createdAt])
}
```

- [ ] **Step 5: Run schema tests**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: PASS.

- [ ] **Step 6: Push schema locally and generate Prisma client**

Run:

```bash
npm run prisma:push
npm run build
```

Expected: Prisma db push applies the new tables to the local database, Prisma generation runs through `prebuild`, and Next build completes. If build fails because new relations are misnamed, fix schema relation names before continuing.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma tests/project-materials.test.ts
git commit -m "Add project material schema"
```

---

### Task 2: Add Project Material Domain Helpers

**Files:**

- Create: `src/lib/project-materials.ts`
- Modify: `tests/project-materials.test.ts`

- [ ] **Step 1: Add failing helper tests**

Append to `tests/project-materials.test.ts`:

```ts
import {
  buildProjectMaterialVisibilityWhere,
  canManageProjectReviewStage,
  canReviewProjectMaterial,
  canUploadProjectMaterial,
  getProjectMaterialStatusLabel,
  selectCurrentApprovedProjectMaterials,
  validateProjectMaterialUploadMeta,
} from "@/lib/project-materials";

test("project material permissions follow role and team boundaries", () => {
  assert.equal(canManageProjectReviewStage("admin"), true);
  assert.equal(canManageProjectReviewStage("school_admin"), true);
  assert.equal(canManageProjectReviewStage("teacher"), false);

  assert.equal(canUploadProjectMaterial({ role: "leader", teamGroupId: "g1" }), true);
  assert.equal(canUploadProjectMaterial({ role: "member", teamGroupId: "g1" }), true);
  assert.equal(canUploadProjectMaterial({ role: "member", teamGroupId: null }), false);
  assert.equal(canUploadProjectMaterial({ role: "teacher", teamGroupId: "g1" }), false);

  assert.equal(canReviewProjectMaterial({ role: "teacher", actorTeamGroupId: "g1", materialTeamGroupId: "g1" }), true);
  assert.equal(canReviewProjectMaterial({ role: "teacher", actorTeamGroupId: "g1", materialTeamGroupId: "g2" }), false);
  assert.equal(canReviewProjectMaterial({ role: "admin", actorTeamGroupId: null, materialTeamGroupId: "g2" }), true);
});

test("project material visibility where clauses are scoped", () => {
  assert.deepEqual(buildProjectMaterialVisibilityWhere({ id: "a1", role: "admin", teamGroupId: null }), {});
  assert.deepEqual(buildProjectMaterialVisibilityWhere({ id: "t1", role: "teacher", teamGroupId: "g1" }), { teamGroupId: "g1" });
  assert.deepEqual(buildProjectMaterialVisibilityWhere({ id: "m1", role: "member", teamGroupId: "g1" }), { teamGroupId: "g1" });
  assert.deepEqual(buildProjectMaterialVisibilityWhere({ id: "m2", role: "member", teamGroupId: null }), { submittedById: "m2" });
});

test("project material validation rejects unsafe uploads", () => {
  assert.equal(validateProjectMaterialUploadMeta({ fileName: "deck.pdf", fileSize: 1024 }), null);
  assert.equal(validateProjectMaterialUploadMeta({ fileName: "deck.exe", fileSize: 1024 }), "项目材料不支持该文件格式");
  assert.equal(validateProjectMaterialUploadMeta({ fileName: "deck.pdf", fileSize: 101 * 1024 * 1024 }), "项目材料文件大小不能超过 100MB");
});

test("project material status labels are stable", () => {
  assert.equal(getProjectMaterialStatusLabel("pending"), "待指导教师审批");
  assert.equal(getProjectMaterialStatusLabel("approved"), "已生效");
  assert.equal(getProjectMaterialStatusLabel("rejected"), "已驳回");
});

test("current approved material selection uses latest approval per stage and team", () => {
  const selected = selectCurrentApprovedProjectMaterials([
    { id: "old", stageId: "s1", teamGroupId: "g1", status: "approved", approvedAt: "2026-04-20T10:00:00.000Z", createdAt: "2026-04-20T09:00:00.000Z" },
    { id: "pending", stageId: "s1", teamGroupId: "g1", status: "pending", approvedAt: null, createdAt: "2026-04-22T09:00:00.000Z" },
    { id: "new", stageId: "s1", teamGroupId: "g1", status: "approved", approvedAt: "2026-04-21T10:00:00.000Z", createdAt: "2026-04-21T09:00:00.000Z" },
    { id: "other", stageId: "s1", teamGroupId: "g2", status: "approved", approvedAt: "2026-04-19T10:00:00.000Z", createdAt: "2026-04-19T09:00:00.000Z" },
  ]);

  assert.deepEqual(selected.map((item) => item.id), ["new", "other"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: FAIL because `src/lib/project-materials.ts` does not exist.

- [ ] **Step 3: Create helper implementation**

Create `src/lib/project-materials.ts`:

```ts
import path from "node:path";
import type { ProjectMaterialStatus, Role } from "@prisma/client";
import { hasGlobalAdminPrivileges } from "@/lib/permissions";

export const projectMaterialAllowedExtensions = [
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".mp4",
  ".mov",
] as const;

export const PROJECT_MATERIAL_MAX_SIZE = 100 * 1024 * 1024;

export const canManageProjectReviewStage = (role: Role) => hasGlobalAdminPrivileges(role);

export const canUploadProjectMaterial = ({
  role,
  teamGroupId,
}: {
  role: Role;
  teamGroupId: string | null;
}) => (role === "leader" || role === "member") && Boolean(teamGroupId);

export const canReviewProjectMaterial = ({
  role,
  actorTeamGroupId,
  materialTeamGroupId,
}: {
  role: Role;
  actorTeamGroupId: string | null;
  materialTeamGroupId: string;
}) => hasGlobalAdminPrivileges(role) || (role === "teacher" && actorTeamGroupId === materialTeamGroupId);

export const buildProjectMaterialVisibilityWhere = (actor: {
  id: string;
  role: Role;
  teamGroupId: string | null;
}) => {
  if (hasGlobalAdminPrivileges(actor.role)) {
    return {};
  }

  if (actor.teamGroupId) {
    return { teamGroupId: actor.teamGroupId };
  }

  return { submittedById: actor.id };
};

export const validateProjectMaterialUploadMeta = ({
  fileName,
  fileSize,
}: {
  fileName: string;
  fileSize: number;
}) => {
  const extension = path.extname(fileName).toLowerCase();
  if (!projectMaterialAllowedExtensions.includes(extension as (typeof projectMaterialAllowedExtensions)[number])) {
    return "项目材料不支持该文件格式";
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return "项目材料文件大小无效";
  }

  if (fileSize > PROJECT_MATERIAL_MAX_SIZE) {
    return "项目材料文件大小不能超过 100MB";
  }

  return null;
};

export const projectMaterialStatusLabels: Record<ProjectMaterialStatus, string> = {
  pending: "待指导教师审批",
  approved: "已生效",
  rejected: "已驳回",
};

export const getProjectMaterialStatusLabel = (status: ProjectMaterialStatus) =>
  projectMaterialStatusLabels[status];

type CurrentApprovedCandidate = {
  id: string;
  stageId: string;
  teamGroupId: string;
  status: ProjectMaterialStatus;
  approvedAt: string | Date | null;
  createdAt: string | Date;
};

const toTime = (value: string | Date | null) => {
  if (!value) return 0;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
};

export const selectCurrentApprovedProjectMaterials = <T extends CurrentApprovedCandidate>(materials: T[]) => {
  const latestByStageAndTeam = new Map<string, T>();

  materials
    .filter((material) => material.status === "approved")
    .forEach((material) => {
      const key = `${material.stageId}:${material.teamGroupId}`;
      const current = latestByStageAndTeam.get(key);
      const materialTime = toTime(material.approvedAt) || toTime(material.createdAt);
      const currentTime = current ? toTime(current.approvedAt) || toTime(current.createdAt) : -1;

      if (!current || materialTime > currentTime) {
        latestByStageAndTeam.set(key, material);
      }
    });

  return [...latestByStageAndTeam.values()];
};
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/project-materials.ts tests/project-materials.test.ts
git commit -m "Add project material domain helpers"
```

---

### Task 3: Add Serializers and API Static Tests

**Files:**

- Modify: `src/lib/api-serializers.ts`
- Modify: `tests/project-materials.test.ts`

- [ ] **Step 1: Add failing static tests for serializers and routes**

Append to `tests/project-materials.test.ts`:

```ts
import { existsSync } from "node:fs";

test("project material serializers and api routes exist", () => {
  const serializerSource = readFileSync(path.join(process.cwd(), "src/lib/api-serializers.ts"), "utf8");

  assert.match(serializerSource, /serializeProjectReviewStage/);
  assert.match(serializerSource, /serializeProjectMaterialSubmission/);
  assert.match(serializerSource, /statusLabel: getProjectMaterialStatusLabel/);

  [
    "src/app/api/project-stages/route.ts",
    "src/app/api/project-stages/[stageId]/route.ts",
    "src/app/api/project-materials/route.ts",
    "src/app/api/project-materials/upload-url/route.ts",
    "src/app/api/project-materials/[submissionId]/approve/route.ts",
    "src/app/api/project-materials/[submissionId]/reject/route.ts",
  ].forEach((routePath) => {
    assert.equal(existsSync(path.join(process.cwd(), routePath)), true, `${routePath} should exist`);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: FAIL because serializers and routes do not exist.

- [ ] **Step 3: Add serializer imports**

In `src/lib/api-serializers.ts`, extend Prisma type imports with:

```ts
  ProjectReviewStage,
  ProjectMaterialSubmission,
  TeamGroup,
  User,
```

Add:

```ts
import { getProjectMaterialStatusLabel } from "@/lib/project-materials";
```

- [ ] **Step 4: Add serializer functions**

Add near other serializers:

```ts
export const serializeProjectReviewStage = (
  stage: ProjectReviewStage & {
    creator?: Pick<User, "id" | "name">;
    teamGroup?: Pick<TeamGroup, "id" | "name"> | null;
    _count?: { submissions: number };
  },
) => ({
  id: stage.id,
  name: stage.name,
  type: stage.type,
  typeLabel: stage.type === "online_review" ? "网络评审" : "路演材料",
  description: stage.description ?? "",
  isOpen: stage.isOpen,
  startAt: stage.startAt?.toISOString() ?? null,
  deadline: stage.deadline?.toISOString() ?? null,
  createdAt: stage.createdAt.toISOString(),
  updatedAt: stage.updatedAt.toISOString(),
  creator: stage.creator ? { id: stage.creator.id, name: stage.creator.name } : null,
  teamGroup: stage.teamGroup ? { id: stage.teamGroup.id, name: stage.teamGroup.name } : null,
  submissionCount: stage._count?.submissions ?? 0,
});

export const serializeProjectMaterialSubmission = (
  submission: ProjectMaterialSubmission & {
    stage: Pick<ProjectReviewStage, "id" | "name" | "type" | "isOpen" | "deadline">;
    teamGroup: Pick<TeamGroup, "id" | "name">;
    submitter: Pick<User, "id" | "name" | "avatar">;
    approver?: Pick<User, "id" | "name"> | null;
    rejecter?: Pick<User, "id" | "name"> | null;
  },
) => ({
  id: submission.id,
  stageId: submission.stageId,
  stageName: submission.stage.name,
  stageType: submission.stage.type,
  teamGroupId: submission.teamGroupId,
  teamGroupName: submission.teamGroup.name,
  title: submission.title,
  fileName: submission.fileName,
  filePath: submission.filePath,
  fileSize: submission.fileSize,
  mimeType: submission.mimeType,
  status: submission.status,
  statusLabel: getProjectMaterialStatusLabel(submission.status),
  rejectReason: submission.rejectReason ?? "",
  submittedAt: submission.createdAt.toISOString(),
  updatedAt: submission.updatedAt.toISOString(),
  approvedAt: submission.approvedAt?.toISOString() ?? null,
  rejectedAt: submission.rejectedAt?.toISOString() ?? null,
  submitter: {
    id: submission.submitter.id,
    name: submission.submitter.name,
    avatar: submission.submitter.avatar,
  },
  approver: submission.approver ? { id: submission.approver.id, name: submission.approver.name } : null,
  rejecter: submission.rejecter ? { id: submission.rejecter.id, name: submission.rejecter.name } : null,
});
```

- [ ] **Step 5: Create route placeholder files with real auth guards**

Create the six route files with minimal handlers returning `501` after auth. Example for `src/app/api/project-stages/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  return NextResponse.json({ message: "项目评审环节接口尚未实现" }, { status: 501 });
}
```

Use the same auth guard for the other five files. Later tasks replace `501` with real behavior.

- [ ] **Step 6: Run tests**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: PASS for static existence and serializer tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api-serializers.ts src/app/api/project-stages src/app/api/project-materials tests/project-materials.test.ts
git commit -m "Add project material serializers and routes"
```

---

### Task 4: Implement Project Stage APIs

**Files:**

- Modify: `src/app/api/project-stages/route.ts`
- Modify: `src/app/api/project-stages/[stageId]/route.ts`
- Modify: `tests/project-materials.test.ts`

- [ ] **Step 1: Add failing static route tests**

Append to `tests/project-materials.test.ts`:

```ts
test("project stage routes enforce admin-only writes and serialize stages", () => {
  const listRoute = readFileSync(path.join(process.cwd(), "src/app/api/project-stages/route.ts"), "utf8");
  const itemRoute = readFileSync(path.join(process.cwd(), "src/app/api/project-stages/[stageId]/route.ts"), "utf8");

  assert.match(listRoute, /canManageProjectReviewStage\(user\.role\)/);
  assert.match(listRoute, /prisma\.projectReviewStage\.findMany/);
  assert.match(listRoute, /serializeProjectReviewStage/);
  assert.match(listRoute, /export async function POST/);
  assert.match(listRoute, /name:\s*name/);
  assert.match(listRoute, /type:\s*stageType/);

  assert.match(itemRoute, /export async function PUT/);
  assert.match(itemRoute, /canManageProjectReviewStage\(user\.role\)/);
  assert.match(itemRoute, /prisma\.projectReviewStage\.update/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: FAIL because route files still return `501`.

- [ ] **Step 3: Implement `GET` and `POST /api/project-stages`**

Replace `src/app/api/project-stages/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import type { ProjectReviewStageType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { serializeProjectReviewStage } from "@/lib/api-serializers";
import { canManageProjectReviewStage } from "@/lib/project-materials";
import { assertMainWorkspaceRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const stageTypes = new Set<ProjectReviewStageType>(["online_review", "roadshow"]);

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const stages = await prisma.projectReviewStage.findMany({
    where: hasGlobalAdminPrivileges(user.role)
      ? {}
      : { OR: [{ teamGroupId: null }, ...(user.teamGroupId ? [{ teamGroupId: user.teamGroupId }] : [])] },
    orderBy: [{ createdAt: "desc" }],
    include: {
      creator: { select: { id: true, name: true } },
      teamGroup: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  return NextResponse.json({ stages: stages.map(serializeProjectReviewStage) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (!canManageProjectReviewStage(user.role)) {
    return NextResponse.json({ message: "无权限创建项目评审环节" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        type?: ProjectReviewStageType;
        description?: string;
        isOpen?: boolean;
        startAt?: string | null;
        deadline?: string | null;
        teamGroupId?: string | null;
      }
    | null;

  const name = body?.name?.trim() ?? "";
  const stageType = body?.type;
  const startAt = body?.startAt ? new Date(body.startAt) : null;
  const deadline = body?.deadline ? new Date(body.deadline) : null;

  if (!name || !stageType || !stageTypes.has(stageType)) {
    return NextResponse.json({ message: "环节名称和类型必填" }, { status: 400 });
  }
  if ((startAt && Number.isNaN(startAt.getTime())) || (deadline && Number.isNaN(deadline.getTime()))) {
    return NextResponse.json({ message: "时间格式无效" }, { status: 400 });
  }

  const stage = await prisma.projectReviewStage.create({
    data: {
      name,
      type: stageType,
      description: body?.description?.trim() || null,
      isOpen: Boolean(body?.isOpen),
      startAt,
      deadline,
      createdById: user.id,
      teamGroupId: body?.teamGroupId?.trim() || null,
    },
    include: {
      creator: { select: { id: true, name: true } },
      teamGroup: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  return NextResponse.json({ stage: serializeProjectReviewStage(stage) }, { status: 201 });
}
```

- [ ] **Step 4: Implement `PUT /api/project-stages/[stageId]`**

Replace `src/app/api/project-stages/[stageId]/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import type { ProjectReviewStageType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { serializeProjectReviewStage } from "@/lib/api-serializers";
import { canManageProjectReviewStage } from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";

const stageTypes = new Set<ProjectReviewStageType>(["online_review", "roadshow"]);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ stageId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (!canManageProjectReviewStage(user.role)) {
    return NextResponse.json({ message: "无权限修改项目评审环节" }, { status: 403 });
  }

  const { stageId } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        type?: ProjectReviewStageType;
        description?: string;
        isOpen?: boolean;
        startAt?: string | null;
        deadline?: string | null;
        teamGroupId?: string | null;
      }
    | null;

  const name = body?.name?.trim() ?? "";
  const stageType = body?.type;
  const startAt = body?.startAt ? new Date(body.startAt) : null;
  const deadline = body?.deadline ? new Date(body.deadline) : null;

  if (!name || !stageType || !stageTypes.has(stageType)) {
    return NextResponse.json({ message: "环节名称和类型必填" }, { status: 400 });
  }
  if ((startAt && Number.isNaN(startAt.getTime())) || (deadline && Number.isNaN(deadline.getTime()))) {
    return NextResponse.json({ message: "时间格式无效" }, { status: 400 });
  }

  const stage = await prisma.projectReviewStage.update({
    where: { id: stageId },
    data: {
      name,
      type: stageType,
      description: body?.description?.trim() || null,
      isOpen: Boolean(body?.isOpen),
      startAt,
      deadline,
      teamGroupId: body?.teamGroupId?.trim() || null,
    },
    include: {
      creator: { select: { id: true, name: true } },
      teamGroup: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  return NextResponse.json({ stage: serializeProjectReviewStage(stage) });
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
npm run build
```

Expected: tests pass and build completes.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/project-stages tests/project-materials.test.ts
git commit -m "Implement project review stage APIs"
```

---

### Task 5: Implement Project Material Upload and Listing APIs

**Files:**

- Modify: `src/app/api/project-materials/route.ts`
- Modify: `src/app/api/project-materials/upload-url/route.ts`
- Modify: `tests/project-materials.test.ts`

- [ ] **Step 1: Add failing route tests**

Append to `tests/project-materials.test.ts`:

```ts
test("project material routes enforce stage open state and team scoped uploads", () => {
  const materialRoute = readFileSync(path.join(process.cwd(), "src/app/api/project-materials/route.ts"), "utf8");
  const uploadRoute = readFileSync(path.join(process.cwd(), "src/app/api/project-materials/upload-url/route.ts"), "utf8");

  assert.match(materialRoute, /buildProjectMaterialVisibilityWhere\(user\)/);
  assert.match(materialRoute, /canUploadProjectMaterial\(\{ role: user\.role, teamGroupId: user\.teamGroupId \}\)/);
  assert.match(materialRoute, /stage\.isOpen/);
  assert.match(materialRoute, /stage\.teamGroupId && stage\.teamGroupId !== user\.teamGroupId/);
  assert.match(materialRoute, /createNotifications/);
  assert.match(materialRoute, /roles:\s*\["teacher"\]/);
  assert.match(materialRoute, /targetTab:\s*"project"/);
  assert.match(uploadRoute, /stageId/);
  assert.match(uploadRoute, /stage\.isOpen/);
  assert.match(uploadRoute, /stage\.teamGroupId && stage\.teamGroupId !== user\.teamGroupId/);
  assert.match(uploadRoute, /validateProjectMaterialUploadMeta/);
  assert.match(uploadRoute, /buildStoredObjectKey/);
  assert.match(uploadRoute, /folder:\s*"project-materials"/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: FAIL because material routes are not implemented.

- [ ] **Step 3: Implement signed upload URL route**

Replace `src/app/api/project-materials/upload-url/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSessionUser } from "@/lib/auth";
import { validateProjectMaterialUploadMeta, canUploadProjectMaterial } from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";
import { buildStoredObjectKey } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (!canUploadProjectMaterial({ role: user.role, teamGroupId: user.teamGroupId })) {
    return NextResponse.json({ message: "只有已绑定项目组的学生或项目负责人可以上传项目材料" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { stageId?: string; fileName?: string; fileSize?: number; mimeType?: string }
    | null;

  const stageId = body?.stageId?.trim() || "";
  const fileName = body?.fileName?.trim() || "";
  const fileSize = Number(body?.fileSize ?? 0);
  const mimeType = body?.mimeType?.trim() || "application/octet-stream";
  if (!stageId) {
    return NextResponse.json({ message: "请选择评审环节" }, { status: 400 });
  }
  const validationError = validateProjectMaterialUploadMeta({ fileName, fileSize });
  if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

  const stage = await prisma.projectReviewStage.findUnique({ where: { id: stageId } });
  if (!stage || !stage.isOpen) {
    return NextResponse.json({ message: "该评审环节未开放材料上传" }, { status: 409 });
  }
  if (stage.teamGroupId && stage.teamGroupId !== user.teamGroupId) {
    return NextResponse.json({ message: "该评审环节不属于当前项目组" }, { status: 403 });
  }
  const now = new Date();
  if ((stage.startAt && stage.startAt > now) || (stage.deadline && stage.deadline < now)) {
    return NextResponse.json({ message: "当前不在材料提交时间范围内" }, { status: 409 });
  }

  const { objectKey } = buildStoredObjectKey({ fileName, folder: "project-materials" });
  const uploadUrl = await getSignedUrl(
    r2Client,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: objectKey, ContentType: mimeType }),
    { expiresIn: 60 * 10 },
  );

  return NextResponse.json({ uploadUrl, objectKey, contentType: mimeType });
}
```

- [ ] **Step 4: Implement listing and submission creation**

Replace `src/app/api/project-materials/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serializeProjectMaterialSubmission } from "@/lib/api-serializers";
import { createNotifications, getUserIdsByRoles } from "@/lib/notifications";
import {
  buildProjectMaterialVisibilityWhere,
  canUploadProjectMaterial,
  validateProjectMaterialUploadMeta,
} from "@/lib/project-materials";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { deleteStoredFile } from "@/lib/uploads";
import { prisma } from "@/lib/prisma";

const includeSubmission = {
  stage: { select: { id: true, name: true, type: true, isOpen: true, deadline: true } },
  teamGroup: { select: { id: true, name: true } },
  submitter: { select: { id: true, name: true, avatar: true } },
  approver: { select: { id: true, name: true } },
  rejecter: { select: { id: true, name: true } },
} as const;

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const submissions = await prisma.projectMaterialSubmission.findMany({
    where: buildProjectMaterialVisibilityWhere(user),
    orderBy: [{ createdAt: "desc" }],
    include: includeSubmission,
  });

  return NextResponse.json({ materials: submissions.map(serializeProjectMaterialSubmission) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (!canUploadProjectMaterial({ role: user.role, teamGroupId: user.teamGroupId })) {
    return NextResponse.json({ message: "只有已绑定项目组的学生或项目负责人可以上传项目材料" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        stageId?: string;
        title?: string;
        fileName?: string;
        filePath?: string;
        fileSize?: number;
        mimeType?: string;
      }
    | null;

  const stageId = body?.stageId?.trim() || "";
  const title = body?.title?.trim() || "";
  const fileName = body?.fileName?.trim() || "";
  const filePath = body?.filePath?.trim() || "";
  const fileSize = Number(body?.fileSize ?? 0);
  const mimeType = body?.mimeType?.trim() || "application/octet-stream";

  if (!stageId || !title || !fileName || !filePath || !fileSize) {
    return NextResponse.json({ message: "项目材料信息不完整" }, { status: 400 });
  }

  const validationError = validateProjectMaterialUploadMeta({ fileName, fileSize });
  if (validationError) {
    await deleteStoredFile(filePath).catch(() => null);
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const stage = await prisma.projectReviewStage.findUnique({ where: { id: stageId } });
  if (!stage || !stage.isOpen) {
    await deleteStoredFile(filePath).catch(() => null);
    return NextResponse.json({ message: "该评审环节未开放材料上传" }, { status: 409 });
  }
  if (stage.teamGroupId && stage.teamGroupId !== user.teamGroupId) {
    await deleteStoredFile(filePath).catch(() => null);
    return NextResponse.json({ message: "该评审环节不属于当前项目组" }, { status: 403 });
  }
  const now = new Date();
  if ((stage.startAt && stage.startAt > now) || (stage.deadline && stage.deadline < now)) {
    await deleteStoredFile(filePath).catch(() => null);
    return NextResponse.json({ message: "当前不在材料提交时间范围内" }, { status: 409 });
  }

  const material = await prisma.projectMaterialSubmission.create({
    data: {
      stageId,
      teamGroupId: user.teamGroupId as string,
      submittedById: user.id,
      title,
      fileName,
      filePath,
      fileSize,
      mimeType,
      status: "pending",
    },
    include: includeSubmission,
  });

  const teacherIds = await getUserIdsByRoles({
    roles: ["teacher"],
    excludeUserIds: [user.id],
    teamGroupId: user.teamGroupId,
  });
  await createNotifications({
    userIds: teacherIds,
    senderId: user.id,
    title: "项目材料待审批",
    detail: `${user.name} 上传了《${title}》，请任意一名指导教师审批。`,
    type: "document_review",
    targetTab: "project",
    relatedId: material.id,
    email: { noticeType: "项目材料审批", actionLabel: "进入系统处理" },
    emailTeamGroupId: user.teamGroupId,
  }).catch((error) => console.error("Project material notification failed", error));

  return NextResponse.json({ material: serializeProjectMaterialSubmission(material) }, { status: 201 });
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
npm run build
```

Expected: PASS and build completes. `createNotifications` accepts `targetTab` as a string, so API code can store `"project"` before the workspace tab type is added. Task 7 adds `project` to `TabKey` so notification navigation resolves in the UI.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/project-materials tests/project-materials.test.ts
git commit -m "Implement project material submission APIs"
```

---

### Task 6: Implement Teacher Approval APIs

**Files:**

- Modify: `src/app/api/project-materials/[submissionId]/approve/route.ts`
- Modify: `src/app/api/project-materials/[submissionId]/reject/route.ts`
- Modify: `tests/project-materials.test.ts`

- [ ] **Step 1: Add failing approval route tests**

Append to `tests/project-materials.test.ts`:

```ts
test("project material approval routes allow any bound teacher and admin", () => {
  const approveRoute = readFileSync(path.join(process.cwd(), "src/app/api/project-materials/[submissionId]/approve/route.ts"), "utf8");
  const rejectRoute = readFileSync(path.join(process.cwd(), "src/app/api/project-materials/[submissionId]/reject/route.ts"), "utf8");

  assert.match(approveRoute, /canReviewProjectMaterial/);
  assert.match(approveRoute, /status:\s*"pending"/);
  assert.match(approveRoute, /updateMany/);
  assert.match(approveRoute, /status:\s*"approved"/);
  assert.match(approveRoute, /approvedById:\s*user\.id/);
  assert.match(approveRoute, /approvedAt:\s*new Date\(\)/);
  assert.match(approveRoute, /任意一名指导教师/);

  assert.match(rejectRoute, /canReviewProjectMaterial/);
  assert.match(rejectRoute, /status:\s*"pending"/);
  assert.match(rejectRoute, /updateMany/);
  assert.match(rejectRoute, /status:\s*"rejected"/);
  assert.match(rejectRoute, /rejectedById:\s*user\.id/);
  assert.match(rejectRoute, /rejectReason:\s*reason/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
```

Expected: FAIL because approval routes are placeholders.

- [ ] **Step 3: Implement approve route**

Replace `src/app/api/project-materials/[submissionId]/approve/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serializeProjectMaterialSubmission } from "@/lib/api-serializers";
import { createNotifications } from "@/lib/notifications";
import { canReviewProjectMaterial } from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";

const includeSubmission = {
  stage: { select: { id: true, name: true, type: true, isOpen: true, deadline: true } },
  teamGroup: { select: { id: true, name: true } },
  submitter: { select: { id: true, name: true, avatar: true } },
  approver: { select: { id: true, name: true } },
  rejecter: { select: { id: true, name: true } },
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { submissionId } = await params;

  const existing = await prisma.projectMaterialSubmission.findUnique({
    where: { id: submissionId },
    include: includeSubmission,
  });
  if (!existing) return NextResponse.json({ message: "项目材料不存在" }, { status: 404 });
  if (!canReviewProjectMaterial({ role: user.role, actorTeamGroupId: user.teamGroupId, materialTeamGroupId: existing.teamGroupId })) {
    return NextResponse.json({ message: "只有本组任意一名指导教师或管理员可以审批该材料" }, { status: 403 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ message: "该材料已被处理，请刷新后查看最新状态" }, { status: 409 });
  }

  const updated = await prisma.projectMaterialSubmission.updateMany({
    where: { id: submissionId, status: "pending" },
    data: {
      status: "approved",
      approvedById: user.id,
      approvedAt: new Date(),
      rejectedById: null,
      rejectedAt: null,
      rejectReason: null,
    },
  });
  if (updated.count === 0) {
    return NextResponse.json({ message: "该材料已被其他教师处理，请刷新后查看最新状态" }, { status: 409 });
  }

  const material = await prisma.projectMaterialSubmission.findUniqueOrThrow({
    where: { id: submissionId },
    include: includeSubmission,
  });

  await createNotifications({
    userIds: [material.submittedById],
    senderId: user.id,
    title: "项目材料审批通过",
    detail: `${user.name} 已通过《${material.title}》，该材料已进入项目管理材料库。`,
    type: "document_review_result",
    targetTab: "project",
    relatedId: material.id,
  }).catch((error) => console.error("Project material approval notification failed", error));

  return NextResponse.json({ material: serializeProjectMaterialSubmission(material) });
}
```

- [ ] **Step 4: Implement reject route**

Replace `src/app/api/project-materials/[submissionId]/reject/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serializeProjectMaterialSubmission } from "@/lib/api-serializers";
import { createNotifications } from "@/lib/notifications";
import { canReviewProjectMaterial } from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";

const includeSubmission = {
  stage: { select: { id: true, name: true, type: true, isOpen: true, deadline: true } },
  teamGroup: { select: { id: true, name: true } },
  submitter: { select: { id: true, name: true, avatar: true } },
  approver: { select: { id: true, name: true } },
  rejecter: { select: { id: true, name: true } },
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { submissionId } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim() || "";
  if (!reason) return NextResponse.json({ message: "请填写驳回原因" }, { status: 400 });

  const existing = await prisma.projectMaterialSubmission.findUnique({
    where: { id: submissionId },
    include: includeSubmission,
  });
  if (!existing) return NextResponse.json({ message: "项目材料不存在" }, { status: 404 });
  if (!canReviewProjectMaterial({ role: user.role, actorTeamGroupId: user.teamGroupId, materialTeamGroupId: existing.teamGroupId })) {
    return NextResponse.json({ message: "只有本组任意一名指导教师或管理员可以审批该材料" }, { status: 403 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ message: "该材料已被处理，请刷新后查看最新状态" }, { status: 409 });
  }

  const updated = await prisma.projectMaterialSubmission.updateMany({
    where: { id: submissionId, status: "pending" },
    data: {
      status: "rejected",
      approvedById: null,
      approvedAt: null,
      rejectedById: user.id,
      rejectedAt: new Date(),
      rejectReason: reason,
    },
  });
  if (updated.count === 0) {
    return NextResponse.json({ message: "该材料已被其他教师处理，请刷新后查看最新状态" }, { status: 409 });
  }

  const material = await prisma.projectMaterialSubmission.findUniqueOrThrow({
    where: { id: submissionId },
    include: includeSubmission,
  });

  await createNotifications({
    userIds: [material.submittedById],
    senderId: user.id,
    title: "项目材料被驳回",
    detail: `${user.name} 驳回了《${material.title}》：${reason}`,
    type: "document_review_result",
    targetTab: "project",
    relatedId: material.id,
  }).catch((error) => console.error("Project material rejection notification failed", error));

  return NextResponse.json({ material: serializeProjectMaterialSubmission(material) });
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npx tsx --test tests/project-materials.test.ts
npm run build
```

Expected: PASS and build completes.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/project-materials/[submissionId] tests/project-materials.test.ts
git commit -m "Implement project material approval APIs"
```

---

### Task 7: Add Workspace Types and Resource Loading

**Files:**

- Modify: `src/data/demo-data.ts`
- Modify: `src/components/workspace-context.tsx`
- Modify: `src/components/workspace-dashboard.tsx`
- Test: `tests/workspace-project-management.test.ts`

- [ ] **Step 1: Add failing workspace tests**

Create `tests/workspace-project-management.test.ts`:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const contextSource = readFileSync(path.join(process.cwd(), "src/components/workspace-context.tsx"), "utf8");
const dashboardSource = readFileSync(path.join(process.cwd(), "src/components/workspace-dashboard.tsx"), "utf8");

test("workspace exposes project management tab and resource", () => {
  assert.match(contextSource, /\|\s*"project"/);
  assert.match(contextSource, /key:\s*"project"/);
  assert.match(contextSource, /label:\s*"项目管理"/);
  assert.match(contextSource, /\|\s*"projectStages"/);
  assert.match(contextSource, /\|\s*"projectMaterials"/);
  assert.match(contextSource, /case "project":/);
  assert.match(contextSource, /\/api\/project-stages/);
  assert.match(contextSource, /\/api\/project-materials/);
});

test("project management tab is dynamically loaded", () => {
  assert.equal(existsSync(path.join(process.cwd(), "src/components/tabs/project-management-tab.tsx")), true);
  assert.match(dashboardSource, /const ProjectManagementTab = dynamic/);
  assert.match(dashboardSource, /safeActiveTab === "project"/);
});

test("project tab visibility excludes expert accounts but includes main project roles", () => {
  assert.match(contextSource, /admin:[\s\S]*visibleTabs:[\s\S]*"project"/);
  assert.match(contextSource, /school_admin:[\s\S]*visibleTabs:[\s\S]*"project"/);
  assert.match(contextSource, /teacher:[\s\S]*visibleTabs:[\s\S]*"project"/);
  assert.match(contextSource, /leader:[\s\S]*visibleTabs:[\s\S]*"project"/);
  assert.match(contextSource, /member:[\s\S]*visibleTabs:[\s\S]*"project"/);
  const expertBlock = contextSource.match(/expert:\s*\{[\s\S]*?visibleTabs:\s*\[[\s\S]*?\],[\s\S]*?\n\s*\}/)?.[0] ?? "";
  assert.doesNotMatch(expertBlock, /"project"/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx tsx --test tests/workspace-project-management.test.ts
```

Expected: FAIL because `project` tab and resources do not exist.

- [ ] **Step 3: Add data types**

In `src/data/demo-data.ts`, add:

```ts
export type ProjectReviewStageItem = {
  id: string;
  name: string;
  type: "online_review" | "roadshow";
  typeLabel: string;
  description: string;
  isOpen: boolean;
  startAt: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  submissionCount: number;
  creator: { id: string; name: string } | null;
  teamGroup: { id: string; name: string } | null;
};

export type ProjectMaterialItem = {
  id: string;
  stageId: string;
  stageName: string;
  stageType: "online_review" | "roadshow";
  teamGroupId: string;
  teamGroupName: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  status: "pending" | "approved" | "rejected";
  statusLabel: string;
  rejectReason: string;
  submittedAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  submitter: { id: string; name: string; avatar: string };
  approver: { id: string; name: string } | null;
  rejecter: { id: string; name: string } | null;
};
```

- [ ] **Step 4: Update workspace context types and state**

In `src/components/workspace-context.tsx`:

1. Import the two new types from `@/data/demo-data`.
2. Add `"project"` to `TabKey`.
3. Add `"projectStages"` and `"projectMaterials"` to `WorkspaceResourceKey`.
4. Add tab config to `allTabs`:

```ts
{
  key: "project",
  label: "项目管理",
  icon: FolderOpen,
}
```

5. Add `"project"` to visibleTabs for `admin`, `school_admin`, `teacher`, `leader`, and `member`. Do not add it to expert.
6. Add state:

```ts
const [projectStages, setProjectStages] = useState<ProjectReviewStageItem[]>([]);
const [projectMaterials, setProjectMaterials] = useState<ProjectMaterialItem[]>([]);
```

7. In tab resource map, add:

```ts
case "project":
  return ["team", "projectStages", "projectMaterials"];
```

8. In resource loader, add:

```ts
case "projectStages": {
  const payload = await requestJson<{ stages: ProjectReviewStageItem[] }>("/api/project-stages");
  setProjectStages(payload.stages);
  break;
}
case "projectMaterials": {
  const payload = await requestJson<{ materials: ProjectMaterialItem[] }>("/api/project-materials");
  setProjectMaterials(payload.materials);
  break;
}
```

9. Include `projectStages`, `setProjectStages`, `projectMaterials`, and `setProjectMaterials` in provider value.

- [ ] **Step 5: Add dynamic tab load**

In `src/components/workspace-dashboard.tsx`, add:

```ts
const ProjectManagementTab = dynamic(() => import("@/components/tabs/project-management-tab"), {
  loading: () => <TabSkeleton />,
});
```

Render:

```tsx
{safeActiveTab === "project" && <ProjectManagementTab />}
```

- [ ] **Step 6: Add minimal project tab file**

Create `src/components/tabs/project-management-tab.tsx`:

```tsx
"use client";

import * as Workspace from "@/components/workspace-context";

export default function ProjectManagementTab() {
  const { currentUser, projectStages, projectMaterials } = Workspace.useWorkspaceContext();

  return (
    <div className="space-y-4">
      <Workspace.SectionHeader
        title="项目管理"
        description="按评审环节提交、审批并归档项目材料。"
      />
      <section className={Workspace.surfaceCardClassName}>
        <h3 className="text-base font-semibold text-slate-900">项目材料库</h3>
        <p className="mt-1 text-sm text-slate-500">
          当前账号：{currentUser?.name ?? "未登录"}，可见环节 {projectStages.length} 个，材料 {projectMaterials.length} 份。
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npx tsx --test tests/workspace-project-management.test.ts
npm run build
```

Expected: PASS and build completes.

- [ ] **Step 8: Commit**

```bash
git add src/data/demo-data.ts src/components/workspace-context.tsx src/components/workspace-dashboard.tsx src/components/tabs/project-management-tab.tsx tests/workspace-project-management.test.ts
git commit -m "Add project management workspace tab"
```

---

### Task 8: Implement Project Management UI and Actions

**Files:**

- Modify: `src/components/tabs/project-management-tab.tsx`
- Modify: `src/components/workspace-context.tsx`
- Modify: `tests/workspace-project-management.test.ts`

- [ ] **Step 1: Add failing UI static tests**

Append to `tests/workspace-project-management.test.ts`:

```ts
test("project management tab renders role-specific workflows", () => {
  const tabSource = readFileSync(path.join(process.cwd(), "src/components/tabs/project-management-tab.tsx"), "utf8");

  assert.match(tabSource, /AdminProjectManagementView/);
  assert.match(tabSource, /TeacherProjectManagementView/);
  assert.match(tabSource, /StudentProjectManagementView/);
  assert.match(tabSource, /创建评审环节/);
  assert.match(tabSource, /待审批材料/);
  assert.match(tabSource, /上传项目材料/);
  assert.match(tabSource, /任意一名指导教师审批通过后生效/);
  assert.match(tabSource, /已生效材料库/);
  assert.match(tabSource, /onClick=\{\(\) => \{/);
  assert.match(tabSource, /saveProjectReviewStage/);
  assert.match(tabSource, /submitProjectMaterial/);
});

test("workspace context exposes project material actions", () => {
  assert.match(contextSource, /saveProjectReviewStage/);
  assert.match(contextSource, /submitProjectMaterial/);
  assert.match(contextSource, /approveProjectMaterial/);
  assert.match(contextSource, /rejectProjectMaterial/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx tsx --test tests/workspace-project-management.test.ts
```

Expected: FAIL because UI views and actions are not implemented.

- [ ] **Step 3: Add context action signatures and implementations**

In `src/components/workspace-context.tsx`, add actions:

```ts
const reloadProjectResources = async (resourceKeys: WorkspaceResourceKey[] = ["projectStages", "projectMaterials"]) => {
  if (!currentUser) return;
  resourceKeys.forEach((resourceKey) => loadedWorkspaceResourcesRef.current.delete(resourceKey));
  await loadWorkspaceResources(resourceKeys, currentUser.role);
};

const saveProjectReviewStage = async (draft: {
  id?: string;
  name: string;
  type: "online_review" | "roadshow";
  description: string;
  isOpen: boolean;
  startAt: string;
  deadline: string;
}) => {
  const method = draft.id ? "PUT" : "POST";
  const url = draft.id ? `/api/project-stages/${draft.id}` : "/api/project-stages";
  await requestJson(url, {
    method,
    body: JSON.stringify({
      name: draft.name,
      type: draft.type,
      description: draft.description,
      isOpen: draft.isOpen,
      startAt: draft.startAt ? new Date(draft.startAt).toISOString() : null,
      deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null,
    }),
  });
  await reloadProjectResources(["projectStages", "projectMaterials"]);
  showSuccessToast("项目评审环节已保存");
};

const submitProjectMaterial = async (draft: {
  stageId: string;
  title: string;
  file: File;
}) => {
  const uploadPayload = await requestJson<{ uploadUrl: string; objectKey: string; contentType: string }>("/api/project-materials/upload-url", {
    method: "POST",
    body: JSON.stringify({
      stageId: draft.stageId,
      fileName: draft.file.name,
      fileSize: draft.file.size,
      mimeType: draft.file.type,
    }),
  });
  await uploadFileDirectly({
    url: uploadPayload.uploadUrl,
    file: draft.file,
    contentType: uploadPayload.contentType,
    onProgress: () => undefined,
  });
  await requestJson("/api/project-materials", {
    method: "POST",
    body: JSON.stringify({
      stageId: draft.stageId,
      title: draft.title,
      fileName: draft.file.name,
      filePath: uploadPayload.objectKey,
      fileSize: draft.file.size,
      mimeType: draft.file.type,
    }),
  });
  await reloadProjectResources(["projectMaterials"]);
  showSuccessToast("项目材料已提交，等待指导教师审批");
};

const approveProjectMaterial = async (submissionId: string) => {
  await requestJson(`/api/project-materials/${submissionId}/approve`, { method: "POST" });
  await reloadProjectResources(["projectMaterials"]);
  showSuccessToast("项目材料已审批通过");
};

const rejectProjectMaterial = async (submissionId: string, reason: string) => {
  await requestJson(`/api/project-materials/${submissionId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  await reloadProjectResources(["projectMaterials"]);
  showSuccessToast("项目材料已驳回");
};
```

Add these functions to provider value.

- [ ] **Step 4: Replace project management tab UI**

Replace `src/components/tabs/project-management-tab.tsx` with role-specific views:

```tsx
"use client";

import { useState } from "react";
import * as Workspace from "@/components/workspace-context";
import type { ProjectMaterialItem } from "@/data/demo-data";

const statusClassName = {
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-100",
  rejected: "bg-rose-50 text-rose-700 border-rose-100",
} as const;

function MaterialCard({ material }: { material: ProjectMaterialItem }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{material.title}</h4>
          <p className="mt-1 text-xs text-slate-500">
            {material.stageName} · {material.teamGroupName} · {material.fileName}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClassName[material.status]}`}>
          {material.statusLabel}
        </span>
      </div>
      {material.rejectReason ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">驳回原因：{material.rejectReason}</p> : null}
    </article>
  );
}

function AdminProjectManagementView() {
  const { projectStages, projectMaterials, saveProjectReviewStage } = Workspace.useWorkspaceContext();
  const [stageName, setStageName] = useState("");
  const [stageType, setStageType] = useState<"online_review" | "roadshow">("online_review");
  const approvedMaterials = projectMaterials.filter((item) => item.status === "approved");
  return (
    <div className="space-y-4">
      <section className={Workspace.surfaceCardClassName}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">评审环节配置</h3>
            <p className="mt-1 text-sm text-slate-500">未开放环节时，学生端不会出现上传入口。</p>
          </div>
          <button
            className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
            disabled={!stageName.trim()}
            onClick={() => {
              void saveProjectReviewStage({
                name: stageName.trim(),
                type: stageType,
                description: "",
                isOpen: true,
                startAt: "",
                deadline: "",
              }).then(() => setStageName(""));
            }}
            type="button"
          >
            创建评审环节
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
            onChange={(event) => setStageName(event.target.value)}
            placeholder="输入环节名称，例如第一轮网络评审"
            value={stageName}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
            onChange={(event) => setStageType(event.target.value as "online_review" | "roadshow")}
            value={stageType}
          >
            <option value="online_review">网络评审</option>
            <option value="roadshow">路演材料</option>
          </select>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {projectStages.map((stage) => (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" key={stage.id}>
              <p className="text-sm font-semibold text-slate-900">{stage.name}</p>
              <p className="mt-1 text-xs text-slate-500">{stage.typeLabel} · {stage.isOpen ? "已开放上传" : "未开放上传"}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={Workspace.surfaceCardClassName}>
        <h3 className="text-base font-semibold text-slate-900">已生效材料库</h3>
        <p className="mt-1 text-sm text-slate-500">管理员后续从这里选择材料进入网评轮次。</p>
        <div className="mt-4 grid gap-3">
          {approvedMaterials.map((material) => <MaterialCard key={material.id} material={material} />)}
          {approvedMaterials.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">暂无已生效材料</p> : null}
        </div>
      </section>
    </div>
  );
}

function TeacherProjectManagementView() {
  const { projectMaterials, approveProjectMaterial, rejectProjectMaterial } = Workspace.useWorkspaceContext();
  const pendingMaterials = projectMaterials.filter((item) => item.status === "pending");
  return (
    <section className={Workspace.surfaceCardClassName}>
      <h3 className="text-base font-semibold text-slate-900">待审批材料</h3>
      <p className="mt-1 text-sm text-slate-500">任意一名指导教师审批通过后生效。</p>
      <div className="mt-4 grid gap-3">
        {pendingMaterials.map((material) => (
          <div className="rounded-xl border border-slate-200 bg-white p-4" key={material.id}>
            <MaterialCard material={material} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white" onClick={() => void approveProjectMaterial(material.id)} type="button">审批通过</button>
              <button className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700" onClick={() => void rejectProjectMaterial(material.id, "请按要求补充或替换材料后重新提交")} type="button">驳回</button>
            </div>
          </div>
        ))}
        {pendingMaterials.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">暂无待审批材料</p> : null}
      </div>
    </section>
  );
}

function StudentProjectManagementView() {
  const { projectStages, projectMaterials, submitProjectMaterial } = Workspace.useWorkspaceContext();
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const openStages = projectStages.filter((stage) => stage.isOpen);
  return (
    <div className="space-y-4">
      <section className={Workspace.surfaceCardClassName}>
        <h3 className="text-base font-semibold text-slate-900">上传项目材料</h3>
        <p className="mt-1 text-sm text-slate-500">只显示管理员已开放的环节。提交后等待本组任意一名指导教师审批。</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {openStages.map((stage) => (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4" key={stage.id}>
              <p className="text-sm font-semibold text-slate-900">{stage.name}</p>
              <p className="mt-1 text-xs text-slate-500">{stage.typeLabel}</p>
              <input
                className="mt-3 block w-full text-xs text-slate-500"
                onChange={(event) => setSelectedFiles((current) => ({ ...current, [stage.id]: event.target.files?.[0] ?? null }))}
                type="file"
              />
              <button
                className="mt-3 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                disabled={!selectedFiles[stage.id]}
                onClick={() => {
                  const file = selectedFiles[stage.id];
                  if (!file) return;
                  void submitProjectMaterial({ stageId: stage.id, title: file.name, file });
                }}
                type="button"
              >
                上传材料
              </button>
            </div>
          ))}
          {openStages.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">当前暂无开放的材料提交环节</p> : null}
        </div>
      </section>

      <section className={Workspace.surfaceCardClassName}>
        <h3 className="text-base font-semibold text-slate-900">我的项目材料</h3>
        <div className="mt-4 grid gap-3">
          {projectMaterials.map((material) => <MaterialCard key={material.id} material={material} />)}
        </div>
      </section>
    </div>
  );
}

export default function ProjectManagementTab() {
  const { currentUser } = Workspace.useWorkspaceContext();
  const role = currentUser?.role;
  return (
    <div className="space-y-4">
      <Workspace.SectionHeader title="项目管理" description="按评审环节提交、审批并归档项目材料。" />
      {role === "admin" || role === "school_admin" ? <AdminProjectManagementView /> : null}
      {role === "teacher" ? <TeacherProjectManagementView /> : null}
      {role === "leader" || role === "member" ? <StudentProjectManagementView /> : null}
    </div>
  );
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npx tsx --test tests/workspace-project-management.test.ts tests/project-materials.test.ts
npm run build
```

Expected: PASS and build completes.

- [ ] **Step 6: Commit**

```bash
git add src/components/tabs/project-management-tab.tsx src/components/workspace-context.tsx tests/workspace-project-management.test.ts
git commit -m "Build project management role views"
```

---

### Task 9: Final Verification

**Files:**

- All files changed in previous tasks.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npx tsx --test tests/*.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: build completes and lists `/workspace`.

- [ ] **Step 4: Confirm local database schema**

Run:

```bash
npm run prisma:push
```

Expected: Prisma reports the database is in sync with the schema. This step is required because `npm run build` generates Prisma Client but does not create database tables.

- [ ] **Step 5: Manual browser check**

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/workspace?tab=project
```

Check:

- Admin sees “评审环节配置” and “已生效材料库”.
- Teacher sees “待审批材料”.
- Student/leader sees “上传项目材料” and no upload entry when no stage is open.
- Expert does not see the project tab in sidebar.

- [ ] **Step 6: Commit final fixes if any**

If Step 4 required UI fixes:

```bash
git add src/components/tabs/project-management-tab.tsx src/components/workspace-context.tsx
git commit -m "Polish project management workspace"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Admin-created project review stages: Task 1, Task 4, Task 8.
- Student upload only for own group and only open stages: Task 2, Task 5, Task 8.
- Any bound teacher approval: Task 2, Task 6, Task 8.
- Material library for approved submissions: Task 3, Task 5, Task 8.
- Notifications to teachers and submitters: Task 5 and Task 6.
- Expert review rounds, score submission, immutable score locking, and projection screen: explicitly deferred in Scope and preserved by the data model choices.

Placeholder scan:

- This plan intentionally contains no placeholder markers.
- Every implementation task has exact paths, expected tests, commands, and concrete code.

Type consistency:

- `ProjectReviewStageItem` and `ProjectMaterialItem` match serializer output.
- API routes return `stages` and `materials`, matching workspace context resource loading.
- Tab key is consistently `project`.
