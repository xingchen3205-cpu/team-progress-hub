import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("overview-tab uses campus-welcome-banner class", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.match(source, /campus-welcome-banner/);
});

test("overview-tab references login-campus.jpg", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.match(source, /\/login-campus\.jpg/);
});

test("overview-tab contains system full name", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.match(source, /中国国际大学生创新大赛管理系统/);
});

test("overview-tab keeps all required module titles", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.match(source, /业务进度/);
  assert.match(source, /赛事日程/);
  assert.match(source, /紧急事项/);
  assert.match(source, /今日汇报/);
  assert.match(source, /通知公告/);
});

test("overview-tab removes old module labels", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /快捷办理提示/);
  assert.doesNotMatch(source, /今日工作提示/);
  assert.doesNotMatch(source, /优先关注/);
  assert.doesNotMatch(source, /业务办理/);
});

test("workspace-shell brand area contains full system name and school", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/workspace-shell.tsx"),
    "utf8",
  );
  assert.match(source, /中国国际大学生创新大赛管理系统/);
  assert.match(source, /南京铁道职业技术学院/);
  assert.match(source, /getSidebarUserMeta/);
  assert.match(source, /全校管理/);
  assert.match(source, /currentUser\?\.teamGroupName \?\? "未绑定项目组"/);
  assert.doesNotMatch(source, /<p className="text-xs text-white\/55">智在必行<\/p>/);
});

test("overview-tab supports admin-wide report group summary", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );

  assert.match(source, /全校今日汇报/);
  assert.match(source, /组已全员提交/);
  assert.match(source, /expandedReportGroupId/);
  assert.match(source, /一键展开查看成员/);
  assert.match(source, /查看详情 →/);
});

test("workspace desktop sidebar keeps a full-height shell on wide screens", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/workspace-shell.tsx"),
    "utf8",
  );

  const desktopSidebarStart = source.indexOf('<aside className="hidden xl:sticky xl:top-4');
  const mobileSidebarStart = source.indexOf('className={`depth-sidebar depth-sidebar-enhanced', desktopSidebarStart);
  const desktopSidebarBlock = source.slice(desktopSidebarStart, mobileSidebarStart);

  assert.match(desktopSidebarBlock, /xl:h-\[calc\(100svh-2rem\)\]/);
  assert.match(desktopSidebarBlock, /flex h-full flex-col/);
  assert.match(desktopSidebarBlock, /flex-1 overflow-y-auto/);
});

test("overview main grid stretches columns and lets the notice card fill remaining height", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );

  assert.match(source, /xl:items-stretch/);
  assert.match(source, /<div className="flex h-full flex-col gap-5">/);
  assert.match(source, /<article className="overview-card flex flex-1 flex-col p-5">/);
  assert.match(source, /<div className="mt-4 flex-1 space-y-3">/);
});

test("overview report card fills the left column bottom instead of ending early", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );

  assert.match(source, /\{\/\* 今日汇报 \*\/\}\s*<article className="overview-card flex flex-1 flex-col p-5">/);
});
