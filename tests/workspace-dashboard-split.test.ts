import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");
const lineCount = (relativePath: string) => read(relativePath).split("\n").length;

test("workspace dashboard uses dynamic tab imports and stays small", () => {
  const source = read("src/components/workspace-dashboard.tsx");

  assert.match(source, /import dynamic from "next\/dynamic";/);
  assert.match(source, /WorkspaceProvider/);
  assert.match(source, /const OverviewTab = dynamic/);
  assert.match(source, /const TimelineTab = dynamic/);
  assert.match(source, /const TasksTab = dynamic/);
  assert.match(source, /const TrainingTab = dynamic/);
  assert.match(source, /const ScheduleTab = dynamic/);
  assert.match(source, /const ExpertOpinionTab = dynamic/);
  assert.match(source, /const ExpertReviewTab = dynamic/);
  assert.match(source, /const DocumentsTab = dynamic/);
  assert.match(source, /const TeamTab = dynamic/);
  assert.match(source, /const AssistantTab = dynamic/);
  assert.ok(lineCount("src/components/workspace-dashboard.tsx") <= 500);
});

test("workspace tabs are split into dedicated files under 1500 lines", () => {
  const tabFiles = [
    "src/components/tabs/overview-tab.tsx",
    "src/components/tabs/timeline-tab.tsx",
    "src/components/tabs/tasks-tab.tsx",
    "src/components/tabs/training-tab.tsx",
    "src/components/tabs/schedule-tab.tsx",
    "src/components/tabs/expert-opinion-tab.tsx",
    "src/components/tabs/expert-review-tab.tsx",
    "src/components/tabs/documents-tab.tsx",
    "src/components/tabs/team-tab.tsx",
    "src/components/tabs/assistant-tab.tsx",
  ];

  for (const relativePath of tabFiles) {
    assert.ok(existsSync(path.join(root, relativePath)), `${relativePath} should exist`);
    assert.ok(lineCount(relativePath) <= 1500, `${relativePath} should stay under 1500 lines`);
  }
});

test("workspace shared context and skeleton exist", () => {
  assert.ok(existsSync(path.join(root, "src/components/workspace-context.tsx")));
  assert.ok(existsSync(path.join(root, "src/components/tab-skeleton.tsx")));
});
