import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const contextSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-context.tsx"),
  "utf8",
);
const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-dashboard.tsx"),
  "utf8",
);

test("workspace bootstrap only preloads auth and notifications", () => {
  const bootstrapEffectStart = contextSource.indexOf("const loadWorkspaceData = async () => {");
  const bootstrapEffectEnd = contextSource.indexOf("const loadReports = async () => {");
  const bootstrapBlock = contextSource.slice(bootstrapEffectStart, bootstrapEffectEnd);

  assert.match(bootstrapBlock, /requestJson<\{ user: CurrentUser \}>\("\/api\/auth\/me"\)/);
  assert.match(bootstrapBlock, /requestJson<\{ notifications: NotificationItem\[\] \}>\("\/api\/notifications"\)/);
  assert.doesNotMatch(bootstrapBlock, /requestJson<\{ tasks: BoardTask\[\] \}>\("\/api\/tasks"\)/);
  assert.doesNotMatch(bootstrapBlock, /requestJson<\{ announcements: Announcement\[\] \}>\("\/api\/announcements"\)/);
  assert.doesNotMatch(bootstrapBlock, /requestJson<\{ members: TeamMember\[\]; pendingMembers: TeamMember\[\]; groups\?: TeamGroupItem\[\] \}>\("\/api\/team"\)/);
});

test("workspace defines tab-scoped resource loading", () => {
  assert.match(contextSource, /const getWorkspaceTabResourceKeys = useCallback/);
  assert.match(
    contextSource,
    /case "overview":[\s\S]*?"announcements"[\s\S]*?"events"[\s\S]*?"tasks"[\s\S]*?"documents"[\s\S]*?"projectMaterials"[\s\S]*?"team"[\s\S]*?"reviewAssignments"[\s\S]*?"reports"/,
  );
  assert.match(
    contextSource,
    /case "training":[\s\S]*?"trainingQuestions"[\s\S]*?"trainingSessions"/,
  );
  assert.match(
    contextSource,
    /case "team":[\s\S]*?"team"/,
  );
  assert.match(contextSource, /if \(!currentUserRole\) \{\s+return;\s+\}/);
  assert.match(contextSource, /getWorkspaceTabResourceKeys\(safeActiveTab, currentUserRole\)/);
});

test("workspace keeps tab switches smooth with resource skeletons and idle preloads", () => {
  assert.match(
    contextSource,
    /const \[activeTabResourceLoading, setActiveTabResourceLoading\] = useState\(false\)/,
  );
  assert.match(contextSource, /setActiveTabResourceLoading\(pendingResourceKeys\.length > 0\)/);
  assert.match(contextSource, /isActiveTabResourceLoading: activeTabResourceLoading && !isBooting/);

  assert.match(dashboardSource, /const \{ safeActiveTab, isActiveTabResourceLoading \} = useWorkspaceContext\(\)/);
  assert.match(dashboardSource, /isActiveTabResourceLoading \? <TabSkeleton variant="workspace" \/> : tabContent/);
  assert.match(dashboardSource, /const preloadWorkspaceTabComponents/);
  assert.match(dashboardSource, /requestIdleCallback/);
});
