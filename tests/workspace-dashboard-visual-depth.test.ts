import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-dashboard.tsx"),
  "utf8",
);
const globalsSource = readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

const readCssBlock = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  assert.ok(match, `missing css block for ${selector}`);
  return match[1];
};

test("workspace shell uses layered-depth sidebar styling", () => {
  assert.match(dashboardSource, /depth-sidebar/);
  assert.doesNotMatch(dashboardSource, /bg-\[#0B3B8A\]/);
  assert.doesNotMatch(dashboardSource, /bg-blue-800 text-white shadow-sm/);
});

test("body and shared depth classes use the cleaned blue-white depth palette", () => {
  const depthCardBlock = readCssBlock(globalsSource, ".depth-card");

  assert.match(globalsSource, /body\s*\{[\s\S]*#f4f7fc/);
  assert.match(globalsSource, /body\s*\{[\s\S]*rgba\(180,\s*210,\s*255,\s*0\.35\)/);
  assert.match(globalsSource, /body\s*\{[\s\S]*rgba\(160,\s*200,\s*245,\s*0\.25\)/);
  assert.doesNotMatch(globalsSource, /rgba\(139,\s*92,\s*246/);
  assert.match(globalsSource, /\.depth-mid\s*\{[\s\S]*border:\s*0\.5px solid/);
  assert.match(globalsSource, /\.depth-mid\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.75\)/);
  assert.match(globalsSource, /\.depth-mid\s*\{[\s\S]*backdrop-filter:\s*blur\(8px\)/);
  assert.match(globalsSource, /\.depth-card\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.82\)/);
  assert.match(globalsSource, /\.depth-card\s*\{[\s\S]*border:\s*1px solid rgba\(200,\s*215,\s*235,\s*0\.80\)/);
  assert.match(globalsSource, /\.depth-card\s*\{[\s\S]*box-shadow:\s*0 2px 8px rgba\(30,\s*60,\s*120,\s*0\.06\),\s*0 1px 2px rgba\(30,\s*60,\s*120,\s*0\.04\)/);
  assert.doesNotMatch(depthCardBlock, /\binset 0 1px 0/);
  assert.match(globalsSource, /\.depth-emphasis\s*\{[\s\S]*background:\s*#ffffff/);
});

test("sidebar styling uses dark midground glass and white active rails", () => {
  assert.match(globalsSource, /\.depth-sidebar\s*\{[\s\S]*background:\s*linear-gradient\(/);
  assert.match(globalsSource, /\.depth-sidebar\s*\{[\s\S]*backdrop-filter:\s*blur\(8px\)/);
  assert.match(globalsSource, /\.depth-sidebar::after\s*\{/);
  assert.match(globalsSource, /\.depth-sidebar::after\s*\{[\s\S]*linear-gradient\(\s*to right,\s*rgba\(20,\s*50,\s*120,\s*0\.06\),\s*transparent/);
  assert.match(globalsSource, /\.sidebar-item\s*\{[\s\S]*color:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/);
  assert.match(globalsSource, /\.sidebar-item:hover\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.18\)/);
  assert.match(globalsSource, /\.sidebar-item-active\s*\{[\s\S]*color:\s*#ffffff/);
  assert.match(globalsSource, /\.sidebar-item-active\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\)/);
  assert.match(globalsSource, /\.sidebar-item-active::before\s*\{[\s\S]*background:\s*#ffffff/);
});

test("workspace chrome consumes depth utility classes instead of flat white panels", () => {
  assert.match(dashboardSource, /<header className="depth-mid/);
  assert.match(dashboardSource, /const surfaceCardClassName = "depth-card/);
  assert.match(dashboardSource, /sidebar-user-area/);
  assert.match(dashboardSource, /sidebar-user-name/);
  assert.match(dashboardSource, /sidebar-user-role/);
  assert.match(dashboardSource, /stat-card/);
  assert.match(dashboardSource, /label-top/);
  assert.match(dashboardSource, /label-bottom/);
  assert.match(dashboardSource, /sidebar-header/);
  assert.match(dashboardSource, /sidebar-logo-wrapper/);
  assert.match(dashboardSource, /sidebar-logo/);
  assert.match(dashboardSource, /school-name/);
  assert.match(dashboardSource, /school-sub/);
  assert.match(dashboardSource, /work-tip-item/);
  assert.match(dashboardSource, /work-tip-index/);
  assert.match(dashboardSource, /work-tip-text/);
  assert.match(dashboardSource, /tab-item/);
  assert.match(dashboardSource, /topbar/);
});

test("workspace stops boot blocking immediately after current user resolves", () => {
  const currentUserIndex = dashboardSource.indexOf("setCurrentUser(mePayload.user);");
  const bootReleaseIndex = dashboardSource.indexOf("setIsBooting(false);", currentUserIndex);
  const requestsIndex = dashboardSource.indexOf("const requests: Array<Promise<unknown>> =", currentUserIndex);

  assert.ok(currentUserIndex >= 0, "should set current user after /api/auth/me");
  assert.ok(bootReleaseIndex > currentUserIndex, "should release boot state after current user loads");
  assert.ok(requestsIndex > bootReleaseIndex, "should start bulk workspace requests after boot state releases");
});

test("dashboard removes multicolor badge palettes from board status chips", () => {
  assert.doesNotMatch(dashboardSource, /border-amber-200 bg-amber-50 text-amber-700/);
  assert.doesNotMatch(dashboardSource, /border-orange-200 bg-orange-50 text-orange-700/);
  assert.doesNotMatch(dashboardSource, /border-emerald-200 bg-emerald-50 text-emerald-700/);
});

test("sidebar logo area uses transparent shell and white-treated logo", () => {
  assert.match(globalsSource, /\.sidebar-header\s*\{/);
  assert.match(globalsSource, /\.sidebar-header\s*\{[\s\S]*background:\s*transparent !important/);
  assert.match(globalsSource, /\.sidebar-logo img\s*\{[\s\S]*filter:\s*brightness\(0\)\s*invert\(1\)/);
  assert.match(globalsSource, /\.sidebar-logo img\s*\{[\s\S]*opacity:\s*0\.90/);
  assert.match(globalsSource, /\.school-name\s*\{[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.92\)/);
  assert.match(globalsSource, /\.school-sub\s*\{[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.45\)/);
});

test("overview detail classes tighten the stat and work-tip styling", () => {
  assert.match(globalsSource, /\.sidebar-user-area\s*\{[\s\S]*background:\s*transparent/);
  assert.match(globalsSource, /\.stat-card\s*\{[\s\S]*padding:\s*20px 20px 16px/);
  assert.match(globalsSource, /\.stat-card \.label-top\s*\{[\s\S]*margin-bottom:\s*10px/);
  assert.match(globalsSource, /\.stat-card \.label-bottom\s*\{[\s\S]*rgba\(0,\s*0,\s*0,\s*0\.35\)/);
  assert.match(globalsSource, /\.work-tip-item\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.70\)/);
  assert.match(globalsSource, /\.work-tip-index\s*\{[\s\S]*color:\s*#1a6fd4/);
  assert.match(globalsSource, /\.tab-item\.active\s*\{[\s\S]*border-bottom:\s*2px solid #1a6fd4/);
  assert.match(globalsSource, /\.topbar\s*\{[\s\S]*border-bottom:\s*1px solid rgba\(200,\s*215,\s*235,\s*0\.50\)/);
});

test("boot loading shell uses shimmer skeletons and dedicated loading chrome", () => {
  assert.match(dashboardSource, /loading-spinner/);
  assert.match(dashboardSource, /loading-title/);
  assert.match(dashboardSource, /loading-sub/);
  assert.match(dashboardSource, /loading-status/);
  assert.match(dashboardSource, /skeleton-card/);
  assert.match(dashboardSource, /概览数据/);
  assert.match(dashboardSource, /待办列表/);
  assert.match(dashboardSource, /快捷入口/);
  assert.match(dashboardSource, /skeleton-caption/);
  assert.match(dashboardSource, /skeleton-line/);
  assert.match(dashboardSource, /skeleton-icon/);
  assert.match(globalsSource, /\.skeleton-line\s*\{[\s\S]*animation:\s*shimmer 1\.5s infinite/);
  assert.match(globalsSource, /\.skeleton-caption\s*\{/);
  assert.match(globalsSource, /@keyframes shimmer/);
  assert.match(globalsSource, /\.loading-spinner\s*\{[\s\S]*border-top-color:\s*#1a6fd4/);
  assert.match(globalsSource, /\.loading-status::before\s*\{[\s\S]*animation:\s*loading-pulse 1\.2s ease-in-out infinite/);
});
