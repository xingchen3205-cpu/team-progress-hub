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
