import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

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
