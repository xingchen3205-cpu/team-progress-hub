import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-dashboard.tsx"),
  "utf8",
);

test("workspace bootstrap requests no longer bind the full dashboard reload to report filters", () => {
  assert.match(dashboardSource, /const buildReportsRequestUrl = useCallback/);
  assert.match(dashboardSource, /const getWorkspaceTabResourceKeys = useCallback/);
  assert.match(dashboardSource, /const loadActiveTabResources = async \(\) =>/);

  const bootstrapEffectStart = dashboardSource.indexOf("const loadWorkspaceData = async () => {");
  const bootstrapEffectEnd = dashboardSource.indexOf("const loadActiveTabResources = async () => {");
  const bootstrapBlock = dashboardSource.slice(bootstrapEffectStart, bootstrapEffectEnd);

  assert.match(bootstrapBlock, /requestJson<\{ user: CurrentUser \}>\("\/api\/auth\/me"\)/);
  assert.match(bootstrapBlock, /requestJson<\{ notifications: NotificationItem\[\] \}>\("\/api\/notifications"\)/);
  assert.doesNotMatch(bootstrapBlock, /requestJson<\{ tasks: BoardTask\[\] \}>\("\/api\/tasks"\)/);
  assert.doesNotMatch(bootstrapBlock, /requestJson<\{ dates: string\[\]; reports: ReportEntryWithDate\[\] \}>\(/);
  assert.match(dashboardSource, /getWorkspaceTabResourceKeys\(safeActiveTab, currentUserRole\)/);
});
