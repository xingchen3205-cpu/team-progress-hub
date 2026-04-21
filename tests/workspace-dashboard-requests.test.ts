import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const contextSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-context.tsx"),
  "utf8",
);

test("workspace bootstrap requests no longer bind the full dashboard reload to report filters", () => {
  assert.match(contextSource, /const buildReportsRequestUrl = useCallback/);
  assert.match(contextSource, /const getWorkspaceTabResourceKeys = useCallback/);
  assert.match(contextSource, /const loadActiveTabResources = async \(\) =>/);

  const bootstrapEffectStart = contextSource.indexOf("const loadWorkspaceData = async () => {");
  const bootstrapEffectEnd = contextSource.indexOf("const loadActiveTabResources = async () => {");
  const bootstrapBlock = contextSource.slice(bootstrapEffectStart, bootstrapEffectEnd);

  assert.match(bootstrapBlock, /requestJson<\{ user: CurrentUser \}>\("\/api\/auth\/me"\)/);
  assert.match(bootstrapBlock, /requestJson<\{ notifications: NotificationItem\[\] \}>\("\/api\/notifications"\)/);
  assert.doesNotMatch(bootstrapBlock, /requestJson<\{ tasks: BoardTask\[\] \}>\("\/api\/tasks"\)/);
  assert.doesNotMatch(bootstrapBlock, /requestJson<\{ dates: string\[\]; reports: ReportEntryWithDate\[\] \}>\(/);
  assert.match(contextSource, /getWorkspaceTabResourceKeys\(safeActiveTab, currentUserRole\)/);
});
