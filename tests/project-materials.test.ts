import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildProjectMaterialVisibilityWhere,
  canManageProjectReviewStage,
  canReviewProjectMaterial,
  canUploadProjectMaterial,
  getProjectMaterialStatusLabel,
  selectCurrentApprovedProjectMaterials,
  validateProjectMaterialUploadMeta,
} from "@/lib/project-materials";

const schemaSource = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");

test("project material schema contains stages and submissions", () => {
  const stageTypeEnum = schemaSource.match(/enum ProjectReviewStageType \{[\s\S]*?\n\}/)?.[0] ?? "";
  const materialStatusEnum = schemaSource.match(/enum ProjectMaterialStatus \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(stageTypeEnum, /online_review/);
  assert.match(stageTypeEnum, /roadshow/);
  assert.match(materialStatusEnum, /pending/);
  assert.match(materialStatusEnum, /approved/);
  assert.match(materialStatusEnum, /rejected/);
  assert.match(schemaSource, /model ProjectReviewStage \{/);
  assert.match(schemaSource, /model ProjectMaterialSubmission \{/);
  assert.match(schemaSource, /@@index\(\[isOpen, deadline\]\)/);
  assert.match(schemaSource, /@@index\(\[teamGroupId, stageId, status\]\)/);
});

test("project material schema links users and team groups", () => {
  const userModel = schemaSource.match(/model User \{[\s\S]*?\n\}/)?.[0] ?? "";
  const teamGroupModel = schemaSource.match(/model TeamGroup \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(userModel, /projectReviewStages\s+ProjectReviewStage\[\]/);
  assert.match(
    userModel,
    /projectMaterialsSubmitted\s+ProjectMaterialSubmission\[\]\s+@relation\("ProjectMaterialSubmitter"\)/,
  );
  assert.match(
    userModel,
    /projectMaterialsApproved\s+ProjectMaterialSubmission\[\]\s+@relation\("ProjectMaterialApprover"\)/,
  );
  assert.match(
    userModel,
    /projectMaterialsRejected\s+ProjectMaterialSubmission\[\]\s+@relation\("ProjectMaterialRejecter"\)/,
  );
  assert.match(teamGroupModel, /projectReviewStages\s+ProjectReviewStage\[\]/);
  assert.match(teamGroupModel, /projectMaterialSubmissions\s+ProjectMaterialSubmission\[\]/);
});

test("project material permissions follow role and team boundaries", () => {
  assert.equal(canManageProjectReviewStage("admin"), true);
  assert.equal(canManageProjectReviewStage("school_admin"), true);
  assert.equal(canManageProjectReviewStage("teacher"), false);

  assert.equal(canUploadProjectMaterial({ role: "leader", teamGroupId: "g1" }), true);
  assert.equal(canUploadProjectMaterial({ role: "member", teamGroupId: "g1" }), true);
  assert.equal(canUploadProjectMaterial({ role: "member", teamGroupId: null }), false);
  assert.equal(canUploadProjectMaterial({ role: "teacher", teamGroupId: "g1" }), false);

  assert.equal(
    canReviewProjectMaterial({
      role: "teacher",
      actorTeamGroupId: "g1",
      materialTeamGroupId: "g1",
    }),
    true,
  );
  assert.equal(
    canReviewProjectMaterial({
      role: "teacher",
      actorTeamGroupId: "g1",
      materialTeamGroupId: "g2",
    }),
    false,
  );
  assert.equal(
    canReviewProjectMaterial({
      role: "admin",
      actorTeamGroupId: null,
      materialTeamGroupId: "g2",
    }),
    true,
  );
});

test("project material visibility where clauses are scoped", () => {
  assert.deepEqual(
    buildProjectMaterialVisibilityWhere({ id: "a1", role: "admin", teamGroupId: null }),
    {},
  );
  assert.deepEqual(
    buildProjectMaterialVisibilityWhere({ id: "t1", role: "teacher", teamGroupId: "g1" }),
    { teamGroupId: "g1" },
  );
  assert.deepEqual(
    buildProjectMaterialVisibilityWhere({ id: "m1", role: "member", teamGroupId: "g1" }),
    { teamGroupId: "g1" },
  );
  assert.deepEqual(
    buildProjectMaterialVisibilityWhere({ id: "m2", role: "member", teamGroupId: null }),
    { submittedById: "m2" },
  );
});

test("project material validation rejects unsafe uploads", () => {
  assert.equal(validateProjectMaterialUploadMeta({ fileName: "deck.pdf", fileSize: 1024 }), null);
  assert.equal(
    validateProjectMaterialUploadMeta({ fileName: "deck.exe", fileSize: 1024 }),
    "项目材料不支持该文件格式",
  );
  assert.equal(
    validateProjectMaterialUploadMeta({
      fileName: "deck.pdf",
      fileSize: 101 * 1024 * 1024,
    }),
    "项目材料文件大小不能超过 100MB",
  );
});

test("project material status labels are stable", () => {
  assert.equal(getProjectMaterialStatusLabel("pending"), "待指导教师审批");
  assert.equal(getProjectMaterialStatusLabel("approved"), "已生效");
  assert.equal(getProjectMaterialStatusLabel("rejected"), "已驳回");
});

test("current approved material selection uses latest approval per stage and team", () => {
  const selected = selectCurrentApprovedProjectMaterials([
    {
      id: "old",
      stageId: "s1",
      teamGroupId: "g1",
      status: "approved",
      approvedAt: "2026-04-20T10:00:00.000Z",
      createdAt: "2026-04-20T09:00:00.000Z",
    },
    {
      id: "pending",
      stageId: "s1",
      teamGroupId: "g1",
      status: "pending",
      approvedAt: null,
      createdAt: "2026-04-22T09:00:00.000Z",
    },
    {
      id: "new",
      stageId: "s1",
      teamGroupId: "g1",
      status: "approved",
      approvedAt: "2026-04-21T10:00:00.000Z",
      createdAt: "2026-04-21T09:00:00.000Z",
    },
    {
      id: "other",
      stageId: "s1",
      teamGroupId: "g2",
      status: "approved",
      approvedAt: "2026-04-19T10:00:00.000Z",
      createdAt: "2026-04-19T09:00:00.000Z",
    },
  ]);

  assert.deepEqual(
    selected.map((item) => item.id),
    ["new", "other"],
  );
});

test("current approved material selection breaks approval ties by creation time", () => {
  const selected = selectCurrentApprovedProjectMaterials([
    {
      id: "older-created",
      stageId: "s1",
      teamGroupId: "g1",
      status: "approved",
      approvedAt: "2026-04-21T10:00:00.000Z",
      createdAt: "2026-04-21T09:00:00.000Z",
    },
    {
      id: "newer-created",
      stageId: "s1",
      teamGroupId: "g1",
      status: "approved",
      approvedAt: "2026-04-21T10:00:00.000Z",
      createdAt: "2026-04-21T09:30:00.000Z",
    },
  ]);

  assert.deepEqual(
    selected.map((item) => item.id),
    ["newer-created"],
  );
});

test("current approved material selection falls back to creation time when approval is missing", () => {
  const selected = selectCurrentApprovedProjectMaterials([
    {
      id: "older-fallback",
      stageId: "s1",
      teamGroupId: "g1",
      status: "approved",
      approvedAt: null,
      createdAt: "2026-04-21T09:00:00.000Z",
    },
    {
      id: "newer-fallback",
      stageId: "s1",
      teamGroupId: "g1",
      status: "approved",
      approvedAt: null,
      createdAt: "2026-04-21T09:30:00.000Z",
    },
  ]);

  assert.deepEqual(
    selected.map((item) => item.id),
    ["newer-fallback"],
  );
});

test("current approved material selection ignores invalid dates when newer valid material exists", () => {
  const selected = selectCurrentApprovedProjectMaterials([
    {
      id: "invalid-date",
      stageId: "s1",
      teamGroupId: "g1",
      status: "approved",
      approvedAt: "not-a-date",
      createdAt: "also-not-a-date",
    },
    {
      id: "valid-date",
      stageId: "s1",
      teamGroupId: "g1",
      status: "approved",
      approvedAt: "2026-04-21T10:00:00.000Z",
      createdAt: "2026-04-21T09:00:00.000Z",
    },
  ]);

  assert.deepEqual(
    selected.map((item) => item.id),
    ["valid-date"],
  );
});
