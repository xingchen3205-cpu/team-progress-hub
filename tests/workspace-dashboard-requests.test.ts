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

test("workspace visibility refresh no longer re-enters the boot loading shell", () => {
  assert.match(contextSource, /const refreshWorkspaceSilently = async \(\) =>/);
  assert.match(contextSource, /if \(reloadToken === 0 \|\| !currentUserRole\) \{\s+return;\s+\}/);
  assert.match(
    contextSource,
    /useEffect\(\(\) => \{\s+let isMounted = true;[\s\S]*?const loadWorkspaceData = async \(\) => \{[\s\S]*?setIsBooting\(true\);[\s\S]*?\n\s*\}, \[clearNonExpertWorkspaceData\]\);/,
  );
  assert.match(
    contextSource,
    /useEffect\(\(\) => \{[\s\S]*?const refreshWorkspaceSilently = async \(\) => \{[\s\S]*?requestJson<\{ user: CurrentUser \}>\("\/api\/auth\/me"\),[\s\S]*?requestJson<\{ notifications: NotificationItem\[\] \}>\("\/api\/notifications"\),/,
  );
  assert.doesNotMatch(
    contextSource,
    /const refreshWorkspaceSilently = async \(\) => \{[\s\S]*?setIsBooting\(true\);/,
  );
});
