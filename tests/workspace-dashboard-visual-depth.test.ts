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

test("workspace and login expose user and support organization footer", () => {
  const shellSource = readFileSync(
    path.join(process.cwd(), "src/components/workspace-shell.tsx"),
    "utf8",
  );
  const loginSource = readFileSync(
    path.join(process.cwd(), "src/components/login-screen.tsx"),
    "utf8",
  );

  for (const source of [shellSource, loginSource]) {
    assert.match(source, /用户单位：南京铁道职业技术学院/);
    assert.match(source, /支持单位：南京君如玉科技有限公司/);
  }
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

test("admin overview metric cards use governance status instead of old personal counters", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  const adminMetricsBlock = source.match(/if \(hasGlobalAdminRole\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(adminMetricsBlock, /label:\s*"项目组进度"/);
  assert.match(adminMetricsBlock, /label:\s*"材料待处理"/);
  assert.match(adminMetricsBlock, /label:\s*"专家评审"/);
  assert.match(adminMetricsBlock, /label:\s*"系统待处理"/);
  assert.match(adminMetricsBlock, /pendingProjectMaterialCount \+ pendingDocumentCount/);
  assert.match(adminMetricsBlock, /bugFeedbackCount \+ pendingApprovalCount/);
  assert.doesNotMatch(adminMetricsBlock, /label:\s*"待审核账号"/);
  assert.doesNotMatch(adminMetricsBlock, /label:\s*"进行中工单"/);
  assert.doesNotMatch(adminMetricsBlock, /label:\s*"未读消息"/);
  assert.doesNotMatch(adminMetricsBlock, /label:\s*"文档待审批"/);
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

test("workspace errors render as fixed popup instead of inline page banner", () => {
  const contextSource = readFileSync(
    path.join(process.cwd(), "src/components/workspace-context.tsx"),
    "utf8",
  );
  const shellSource = readFileSync(
    path.join(process.cwd(), "src/components/workspace-shell.tsx"),
    "utf8",
  );

  assert.match(contextSource, /export function ErrorToast/);
  assert.match(contextSource, /role="alert"/);
  assert.match(contextSource, /fixed inset-0 z-\[90\] flex items-center justify-center/);
  assert.match(contextSource, /animate-\[toast-pop/);
  assert.match(contextSource, /window\.setTimeout\(\(\) => \{\s*setLoadError\(null\);\s*\}, 2200\)/);
  assert.match(contextSource, /export function SuccessToast/);
  assert.match(contextSource, /fixed inset-0 z-\[80\] flex items-center justify-center/);
  assert.match(shellSource, /<ErrorToast message=\{loadError\}/);
  assert.doesNotMatch(shellSource, /loadError \? \(\s*<div className="[^"]*border-red-200 bg-red-50/);
  assert.doesNotMatch(contextSource, /fixed top-5 right-5/);
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

test("workspace topbar matches the requested home layout with live weather", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/workspace-shell.tsx"),
    "utf8",
  );

  const topbarStart = source.indexOf('<header className="topbar-enhanced relative z-50 mx-auto max-w-[1200px]');
  const contentStart = source.indexOf('<div className="mx-auto mt-4 flex max-w-[1200px] flex-col gap-4">', topbarStart);
  const topbarBlock = source.slice(topbarStart, contentStart);
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const pageStackCss = css.slice(
    css.indexOf(".topbar-page-stack"),
    css.indexOf(".topbar-divider"),
  );

  assert.match(topbarBlock, /topbar-left/);
  assert.match(topbarBlock, /topbar-page-title/);
  assert.match(source, /safeActiveTab === "overview" \? "首页概览" : activeTopbarLabel/);
  assert.doesNotMatch(topbarBlock, /topbar-page-sub/);
  assert.match(pageStackCss, /flex-direction:\s*row/);
  assert.doesNotMatch(pageStackCss, /flex-direction:\s*column/);
  assert.match(topbarBlock, /topbar-date-pill/);
  assert.match(topbarBlock, /topbar-weather-pill/);
  assert.match(topbarBlock, /formatFriendlyDate\(currentDateTime\)/);
  assert.match(topbarBlock, /workspaceWeather/);
  assert.match(topbarBlock, /\/api\/weather\/nanjing/);
  assert.match(topbarBlock, /setNotificationsOpen\(true\)/);
  assert.match(topbarBlock, /setAnnouncementModalOpen\(true\)/);
  assert.match(topbarBlock, /ClipboardCheck/);
  assert.doesNotMatch(topbarBlock, /title="消息通知"/);
  assert.match(topbarBlock, /setTopbarHelpOpen\(true\)/);
  assert.match(topbarBlock, /topbar-right/);
  assert.match(topbarBlock, /header-profile-menu relative shrink-0/);
  assert.match(topbarBlock, /className="topbar-action-primary"/);
  assert.doesNotMatch(topbarBlock, /18°C/);
});

test("topbar help icon opens a real help and feedback panel", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/workspace-shell.tsx"),
    "utf8",
  );

  assert.match(source, /topbarHelpOpen/);
  assert.match(source, /setTopbarHelpOpen\(true\)/);
  assert.match(source, /Modal[\s\S]*title="帮助与反馈"/);
  assert.match(source, /submitBugFeedback/);
  assert.match(source, /\/api\/bug-feedback/);
});
