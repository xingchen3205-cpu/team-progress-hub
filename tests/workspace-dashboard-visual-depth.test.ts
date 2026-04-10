import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-dashboard.tsx"),
  "utf8",
);

test("workspace shell uses layered-depth sidebar styling", () => {
  assert.match(dashboardSource, /depth-sidebar/);
  assert.doesNotMatch(dashboardSource, /bg-\[#0B3B8A\]/);
  assert.doesNotMatch(dashboardSource, /bg-blue-800 text-white shadow-sm/);
});

test("dashboard removes multicolor badge palettes from board status chips", () => {
  assert.doesNotMatch(dashboardSource, /border-amber-200 bg-amber-50 text-amber-700/);
  assert.doesNotMatch(dashboardSource, /border-orange-200 bg-orange-50 text-orange-700/);
  assert.doesNotMatch(dashboardSource, /border-emerald-200 bg-emerald-50 text-emerald-700/);
});
