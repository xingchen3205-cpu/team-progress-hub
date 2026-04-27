import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (filePath: string) => readFileSync(path.join(process.cwd(), filePath), "utf8");

test("workspace registers project management as a first-class tab", () => {
  const contextSource = read("src/components/workspace-context.tsx");
  const dashboardSource = read("src/components/workspace-dashboard.tsx");
  const workspacePageSource = read("src/app/workspace/page.tsx");

  assert.match(contextSource, /\|\s*"project"/);
  assert.match(contextSource, /key:\s*"project"[\s\S]*?label:\s*"项目管理"/);
  assert.match(contextSource, /visibleTabs:\s*\[[\s\S]*?"project"[\s\S]*?\]\s*as TabKey\[\]/);
  assert.doesNotMatch(contextSource, /expert:\s*\{[\s\S]*?visibleTabs:\s*\[[^\]]*"project"/);

  assert.match(dashboardSource, /ProjectTab/);
  assert.match(dashboardSource, /safeActiveTab === "project"/);
  assert.match(workspacePageSource, /validTabs\s*=\s*\[[\s\S]*?"project"/);
});

test("project management is visible to main workspace roles except experts", () => {
  const contextSource = read("src/components/workspace-context.tsx");

  for (const role of ["admin", "school_admin", "teacher", "leader", "member"]) {
    assert.match(
      contextSource,
      new RegExp(`${role}:\\s*\\{[\\s\\S]*?visibleTabs:\\s*\\[[\\s\\S]*?"project"[\\s\\S]*?\\]\\s*as TabKey\\[\\]`),
      `${role} should see project management`,
    );
  }

  assert.doesNotMatch(
    contextSource,
    /expert:\s*\{[\s\S]*?visibleTabs:\s*\[[^\]]*"project"/,
    "experts should not see project management",
  );
});

test("project management tab exists and talks to project material APIs", () => {
  const tabPath = "src/components/tabs/project-tab.tsx";
  assert.equal(existsSync(path.join(process.cwd(), tabPath)), true);

  const tabSource = read(tabPath);
  assert.match(tabSource, /项目管理/);
  assert.match(tabSource, /api\/project-stages/);
  assert.match(tabSource, /api\/project-materials/);
  assert.match(tabSource, /upload-url/);
  assert.match(tabSource, /approve/);
  assert.match(tabSource, /reject/);
  assert.match(tabSource, /currentRole === "leader"/);
  assert.doesNotMatch(tabSource, /currentRole === "member"[\s\S]*?canUploadMaterials/);
});

test("project management data is loaded when project tab is active", () => {
  const contextSource = read("src/components/workspace-context.tsx");

  assert.match(contextSource, /\|\s*"projectStages"/);
  assert.match(contextSource, /\|\s*"projectMaterials"/);
  assert.match(contextSource, /case "project":[\s\S]*?return \["projectStages", "projectMaterials"/);
  assert.match(contextSource, /case "projectStages":[\s\S]*?\/api\/project-stages/);
  assert.match(contextSource, /case "projectMaterials":[\s\S]*?\/api\/project-materials/);
});

test("project management tab uses the polished stage and material dashboard layout", () => {
  const tabSource = read("src/components/tabs/project-tab.tsx");

  assert.match(tabSource, /project-page-head/);
  assert.match(tabSource, /stat-strip/);
  assert.match(tabSource, /stat-item/);
  assert.match(tabSource, /section-title/);
  assert.match(tabSource, /form-grid/);
  assert.match(tabSource, /group-pickers/);
  assert.match(tabSource, /chip all-toggle/);
  assert.match(tabSource, /material-tags/);
  assert.match(tabSource, /mat-tag/);
  assert.match(tabSource, /date-row/);
  assert.match(tabSource, /form-actions/);
  assert.match(tabSource, /bottom-grid/);
  assert.match(tabSource, /empty-card/);
  assert.match(tabSource, /project-stage-index/);
  assert.match(tabSource, /project-material-card/);
  assert.match(tabSource, /创建评审阶段/);
  assert.match(tabSource, /要求上传内容/);
  assert.match(tabSource, /PPT PDF/);
  assert.match(tabSource, /计划书 PDF/);
  assert.match(tabSource, /视频/);
  assert.match(tabSource, /项目阶段/);
  assert.match(tabSource, /项目材料/);
  assert.match(tabSource, /全部项目组可提交/);
  assert.match(tabSource, /网络评审/);
  assert.match(tabSource, /项目路演/);
  assert.doesNotMatch(tabSource, /网络评审材料/);
  assert.doesNotMatch(tabSource, /路演材料/);
});

test("project stage editing opens a modal instead of reusing the create form", () => {
  const tabSource = read("src/components/tabs/project-tab.tsx");

  assert.match(tabSource, /stageEditorOpen/);
  assert.match(tabSource, /setStageEditorOpen\(true\)/);
  assert.match(tabSource, /编辑项目阶段/);
  assert.match(tabSource, /fixed inset-0 z-50/);
  assert.doesNotMatch(tabSource, /editingStageId \? "编辑评审阶段" : "创建评审阶段"/);
  assert.doesNotMatch(tabSource, /editingStageId \? "保存阶段" : "创建阶段"/);
});
