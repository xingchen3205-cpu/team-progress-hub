import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  serializeProjectMaterialSubmission,
  serializeProjectReviewStage,
} from "@/lib/api-serializers";
import {
  createProjectMaterialUploadToken,
  verifyProjectMaterialUploadToken,
} from "@/lib/project-material-upload-token";
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
const apiSerializersSource = readFileSync(
  path.join(process.cwd(), "src/lib/api-serializers.ts"),
  "utf8",
);

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

test("project material upload tokens bind file paths to user team stage and metadata", () => {
  const payload = {
    userId: "u1",
    teamGroupId: "g1",
    stageId: "s1",
    filePath: "project-materials/g1/s1/random.pdf",
    fileName: "random.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
  };

  const token = createProjectMaterialUploadToken(payload, {
    now: 1_000,
    expiresInSeconds: 60,
    secret: "test-secret",
  });

  assert.deepEqual(
    verifyProjectMaterialUploadToken(token, { now: 30_000, secret: "test-secret" }),
    {
      ...payload,
      expiresAt: 61_000,
    },
  );
  assert.equal(
    verifyProjectMaterialUploadToken(token, { now: 30_000, secret: "wrong-secret" }),
    null,
  );
  assert.equal(
    verifyProjectMaterialUploadToken(`${token.slice(0, -1)}x`, {
      now: 30_000,
      secret: "test-secret",
    }),
    null,
  );
  assert.equal(
    verifyProjectMaterialUploadToken(token, { now: 62_000, secret: "test-secret" }),
    null,
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

test("project material serializers are exported and use stable status labels", () => {
  assert.match(apiSerializersSource, /serializeProjectReviewStage/);
  assert.match(apiSerializersSource, /serializeProjectMaterialSubmission/);
  assert.match(apiSerializersSource, /statusLabel:\s*getProjectMaterialStatusLabel/);
});

test("project material serializers emit stable api payloads", () => {
  const createdAt = new Date("2026-04-21T09:00:00.000Z");
  const updatedAt = new Date("2026-04-21T10:00:00.000Z");
  const deadline = new Date("2026-04-30T15:00:00.000Z");

  assert.deepEqual(
    serializeProjectReviewStage({
      id: "stage-1",
      name: "第一轮网评",
      type: "online_review",
      description: null,
      isOpen: true,
      startAt: null,
      deadline,
      createdAt,
      updatedAt,
      creator: { id: "admin-1", name: "系统管理员", avatar: "系", role: "admin" },
      teamGroup: { id: "group-1", name: "智在必行" },
      _count: { submissions: 2 },
    } as Parameters<typeof serializeProjectReviewStage>[0]),
    {
      id: "stage-1",
      name: "第一轮网评",
      type: "online_review",
      typeLabel: "网络评审",
      description: "",
      isOpen: true,
      startAt: null,
      deadline: "2026-04-30T15:00:00.000Z",
      createdAt: "2026-04-21T09:00:00.000Z",
      updatedAt: "2026-04-21T10:00:00.000Z",
      creator: {
        id: "admin-1",
        name: "系统管理员",
        avatar: "系",
        roleLabel: "系统管理员",
      },
      teamGroup: { id: "group-1", name: "智在必行" },
      submissionCount: 2,
    },
  );

  assert.deepEqual(
    serializeProjectMaterialSubmission({
      id: "submission-1",
      stageId: "stage-1",
      teamGroupId: "group-1",
      submittedById: "member-1",
      title: "网评材料",
      fileName: "deck.pdf",
      filePath: "project-materials/deck.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      status: "approved",
      rejectReason: null,
      approvedAt: updatedAt,
      rejectedAt: null,
      approvedById: "teacher-1",
      rejectedById: null,
      createdAt,
      updatedAt,
      stage: {
        id: "stage-1",
        name: "第一轮网评",
        type: "online_review",
        isOpen: true,
        deadline,
      },
      teamGroup: { id: "group-1", name: "智在必行" },
      submitter: { id: "member-1", name: "学生甲", avatar: "甲", role: "member" },
      approver: { id: "teacher-1", name: "贾老师", avatar: "贾", role: "teacher" },
      rejecter: null,
    } as Parameters<typeof serializeProjectMaterialSubmission>[0]),
    {
      id: "submission-1",
      stageId: "stage-1",
      stageName: "第一轮网评",
      stageType: "online_review",
      teamGroupId: "group-1",
      teamGroupName: "智在必行",
      title: "网评材料",
      fileName: "deck.pdf",
      filePath: "project-materials/deck.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      status: "approved",
      statusLabel: "已生效",
      rejectReason: "",
      submittedAt: "2026-04-21T09:00:00.000Z",
      updatedAt: "2026-04-21T10:00:00.000Z",
      approvedAt: "2026-04-21T10:00:00.000Z",
      rejectedAt: null,
      submitter: { id: "member-1", name: "学生甲", avatar: "甲", roleLabel: "团队成员" },
      approver: { id: "teacher-1", name: "贾老师", avatar: "贾", roleLabel: "指导教师" },
      rejecter: null,
    },
  );
});

test("project material api route placeholders exist", () => {
  const routePaths = [
    "src/app/api/project-stages/route.ts",
    "src/app/api/project-stages/[stageId]/route.ts",
    "src/app/api/project-materials/route.ts",
    "src/app/api/project-materials/upload-url/route.ts",
    "src/app/api/project-materials/[submissionId]/approve/route.ts",
    "src/app/api/project-materials/[submissionId]/reject/route.ts",
  ];

  for (const routePath of routePaths) {
    assert.equal(existsSync(path.join(process.cwd(), routePath)), true, `${routePath} exists`);
  }
});

test("project material approval routes preserve action-specific auth boundaries", () => {
  const stageItemRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/project-stages/[stageId]/route.ts"),
    "utf8",
  );
  const uploadRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/project-materials/upload-url/route.ts"),
    "utf8",
  );
  const approveRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/project-materials/[submissionId]/approve/route.ts"),
    "utf8",
  );
  const rejectRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/project-materials/[submissionId]/reject/route.ts"),
    "utf8",
  );

  assert.match(stageItemRoute, /canManageProjectReviewStage\(user\.role\)/);
  assert.match(uploadRoute, /canUploadProjectMaterial\(\{ role: user\.role, teamGroupId: user\.teamGroupId \}\)/);
  assert.match(approveRoute, /canReviewProjectMaterial\(/);
  assert.match(rejectRoute, /canReviewProjectMaterial\(/);
  assert.doesNotMatch(approveRoute, /接口待实现/);
  assert.doesNotMatch(rejectRoute, /接口待实现/);
  assert.doesNotMatch(approveRoute, /status:\s*501/);
  assert.doesNotMatch(rejectRoute, /status:\s*501/);
  assert.match(approveRoute, /status:\s*"approved"/);
  assert.match(rejectRoute, /status:\s*"rejected"/);
  assert.match(approveRoute, /approvedById:\s*user\.id/);
  assert.match(rejectRoute, /rejectedById:\s*user\.id/);
  assert.match(approveRoute, /createNotifications\(/);
  assert.match(rejectRoute, /createNotifications\(/);
  assert.match(approveRoute, /targetTab:\s*"project"/);
  assert.match(rejectRoute, /targetTab:\s*"project"/);
});

test("project material listing and submission route enforces visibility upload and notification rules", () => {
  const materialRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/project-materials/route.ts"),
    "utf8",
  );

  assert.match(materialRoute, /buildProjectMaterialVisibilityWhere\(user\)/);
  assert.match(
    materialRoute,
    /canUploadProjectMaterial\(\{ role: user\.role, teamGroupId: user\.teamGroupId \}\)/,
  );
  assert.match(materialRoute, /stage\.isOpen/);
  assert.match(materialRoute, /stage\.teamGroupId && stage\.teamGroupId !== user\.teamGroupId/);
  assert.match(materialRoute, /isScopedProjectMaterialFilePath/);
  assert.match(materialRoute, /cleanupScopedProjectMaterialFile/);
  assert.match(materialRoute, /projectMaterialSubmission\s*\.\s*count/);
  assert.match(materialRoute, /referencedSubmissionCount === 0/);
  assert.match(materialRoute, /mapProjectMaterialSubmissionError\(error, cleanupUploadedFile\)/);
  assert.match(materialRoute, /createNotifications\(/);
  assert.match(materialRoute, /await createNotifications\(/);
  assert.match(materialRoute, /roles:\s*\["teacher"\]/);
  assert.match(materialRoute, /targetTab:\s*"project"/);
});

test("project material upload-url route validates stage and builds project material object keys", () => {
  const uploadRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/project-materials/upload-url/route.ts"),
    "utf8",
  );

  assert.match(uploadRoute, /stageId/);
  assert.match(uploadRoute, /stage\.isOpen/);
  assert.match(uploadRoute, /stage\.teamGroupId && stage\.teamGroupId !== user\.teamGroupId/);
  assert.match(uploadRoute, /validateProjectMaterialUploadMeta/);
  assert.match(uploadRoute, /buildStoredObjectKey/);
  assert.match(uploadRoute, /project-materials\/\$\{teamGroupId\}\/\$\{stageId\}/);
  assert.match(uploadRoute, /folder:\s*buildProjectMaterialUploadFolder/);
});

test("project stage api routes expose management actions", () => {
  const stageRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/project-stages/route.ts"),
    "utf8",
  );
  const stageItemRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/project-stages/[stageId]/route.ts"),
    "utf8",
  );

  assert.match(stageRoute, /canManageProjectReviewStage\(user\.role\)/);
  assert.match(stageRoute, /prisma\.projectReviewStage\.findMany/);
  assert.match(stageRoute, /OR:\s*\[\{ teamGroupId: null \}, \{ teamGroupId: user\.teamGroupId \}\]/);
  assert.match(stageRoute, /serializeProjectReviewStage/);
  assert.match(stageRoute, /export async function POST/);
  assert.match(stageRoute, /name:\s*name/);
  assert.match(stageRoute, /type:\s*stageType/);
  assert.match(stageRoute, /typeof body\?\.name !== "string"/);
  assert.match(stageRoute, /typeof body\?\.type !== "string"/);
  assert.match(stageRoute, /typeof body\.teamGroupId !== "string"/);
  assert.match(stageRoute, /typeof body\.isOpen !== "boolean"/);
  assert.match(stageRoute, /Prisma\.PrismaClientKnownRequestError/);
  assert.match(stageRoute, /error\.code === "P2003"/);
  assert.match(stageRoute, /message: "项目组不存在" \}, \{ status: 400 \}/);
  assert.match(stageItemRoute, /export async function PUT/);
  assert.match(stageItemRoute, /export async function GET/);
  assert.match(stageItemRoute, /export async function DELETE/);
  assert.match(stageItemRoute, /canManageProjectReviewStage\(user\.role\)/);
  assert.match(stageItemRoute, /prisma\.projectReviewStage\s*\.\s*update/);
  assert.match(stageItemRoute, /prisma\.projectReviewStage\s*\.\s*findFirst/);
  assert.match(stageItemRoute, /prisma\.projectReviewStage\s*\.\s*delete/);
  assert.doesNotMatch(stageItemRoute, /接口待实现/);
  assert.doesNotMatch(stageItemRoute, /status:\s*501/);
  assert.match(stageItemRoute, /typeof body\?\.name !== "string"/);
  assert.match(stageItemRoute, /typeof body\?\.type !== "string"/);
  assert.match(stageItemRoute, /typeof body\.teamGroupId !== "string"/);
  assert.match(stageItemRoute, /typeof body\.isOpen !== "boolean"/);
  assert.match(stageItemRoute, /error\.code === "P2025"/);
  assert.match(stageItemRoute, /error\.code === "P2003"/);
});
