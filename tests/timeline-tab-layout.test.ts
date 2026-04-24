import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const timelineSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/timeline-tab.tsx"),
  "utf8",
);

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
