import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("workspace form defaults use current Beijing dates instead of fixed old dates", () => {
  const contextSource = readSource("src/components/workspace-context.tsx");

  assert.match(contextSource, /getDefaultTaskDueDate/);
  assert.match(contextSource, /dueDate:\s*getDefaultTaskDueDate\(\)/);
  assert.match(contextSource, /export const defaultEventDraft = \(\): EventDraft/);
  assert.match(contextSource, /dateTime:\s*getDefaultEventDateTime\(\)/);
  assert.match(contextSource, /date:\s*getDefaultExpertDate\(\)/);
  assert.doesNotMatch(contextSource, /2026-04-08T18:00/);
  assert.doesNotMatch(contextSource, /2026-04-15T18:00/);
  assert.doesNotMatch(contextSource, /2026-04-05/);
});

test("date and datetime inputs prevent creating new records before today", () => {
  const shellSource = readSource("src/components/workspace-shell.tsx");
  const projectSource = readSource("src/components/tabs/project-tab.tsx");

  assert.match(shellSource, /min=\{getBeijingDateTimeInputMin\(\)\}/);
  assert.match(shellSource, /min=\{getBeijingDateInputMin\(\)\}/);
  assert.match(projectSource, /min=\{Workspace\.getBeijingDateTimeInputMin\(\)\}/);
});

test("task work orders no longer expose high medium low priority controls", () => {
  const shellSource = readSource("src/components/workspace-shell.tsx");
  const tasksTabSource = readSource("src/components/tabs/tasks-tab.tsx");
  const taskRouteSource = readSource("src/app/api/tasks/route.ts");
  const taskItemRouteSource = readSource("src/app/api/tasks/[id]/route.ts");

  const taskModalBlock = shellSource.slice(
    shellSource.indexOf('{taskModalOpen ? ('),
    shellSource.indexOf('{taskCompletionModalOpen', shellSource.indexOf('{taskModalOpen ? (')),
  );

  assert.doesNotMatch(taskModalBlock, /优先级|高优先级|中优先级|低优先级/);
  assert.doesNotMatch(tasksTabSource, /taskPriorityStyles|task\.priority/);
  assert.match(taskRouteSource, /priority:\s*"medium"/);
  assert.doesNotMatch(taskRouteSource, /taskPriorityValueToDb/);
  assert.doesNotMatch(taskItemRouteSource, /taskPriorityValueToDb/);
});
