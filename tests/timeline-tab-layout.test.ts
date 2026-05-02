import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const timelineSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/timeline-tab.tsx"),
  "utf8",
);
const workspaceContextSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-context.tsx"),
  "utf8",
);

const roleBlock = (role: string, nextRole: string) => {
  const match = workspaceContextSource.match(new RegExp(`${role}:\\s*\\{[\\s\\S]*?\\n  ${nextRole}:`));
  assert.ok(match, `missing ${role} permission block`);
  return match[0];
};

test("timeline tab separates completed and active nodes", () => {
  assert.match(timelineSource, /completedEvents/);
  assert.match(timelineSource, /activeEvents/);
  assert.match(timelineSource, /已完成/);
  assert.match(timelineSource, /ChevronDown/);
  assert.match(timelineSource, /ChevronRight/);
});

test("timeline visualization uses ordered spacing instead of proportional timestamps", () => {
  assert.match(timelineSource, /timeline-scroll-track/);
  assert.match(timelineSource, /timeline-step/);
  assert.doesNotMatch(timelineSource, /getTimelinePointStyle/);
});

test("timeline cards use a consistent responsive grid", () => {
  assert.match(timelineSource, /grid-cols-1 md:grid-cols-2 xl:grid-cols-3/);
  assert.match(timelineSource, /min-h-\[160px\]/);
  assert.match(timelineSource, /flex flex-wrap gap-1\.5/);
});

test("timeline editing is reserved to system and school administrators", () => {
  const eventsRouteSource = readFileSync(path.join(process.cwd(), "src/app/api/events/route.ts"), "utf8");
  const eventItemRouteSource = readFileSync(path.join(process.cwd(), "src/app/api/events/[id]/route.ts"), "utf8");

  assert.match(roleBlock("admin", "school_admin"), /canEditTimeline:\s*true/);
  assert.match(roleBlock("school_admin", "teacher"), /canEditTimeline:\s*true/);
  assert.match(roleBlock("teacher", "leader"), /canEditTimeline:\s*false/);
  assert.match(roleBlock("leader", "member"), /canEditTimeline:\s*false/);
  assert.match(eventsRouteSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(eventItemRouteSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.doesNotMatch(eventsRouteSource, /assertRole\(user\.role,\s*\[[^\]]*"teacher"[^\]]*\]\)/);
  assert.doesNotMatch(eventItemRouteSource, /user\.role !== "teacher"/);
});
