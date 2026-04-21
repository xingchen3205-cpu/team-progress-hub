import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const contextSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-context.tsx"),
  "utf8",
);
const shellSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-shell.tsx"),
  "utf8",
);
const overviewSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
  "utf8",
);
const timelineSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/timeline-tab.tsx"),
  "utf8",
);
const scheduleSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
  "utf8",
);
const expertsSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/expert-opinion-tab.tsx"),
  "utf8",
);
const reviewSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/expert-review-tab.tsx"),
  "utf8",
);
const documentsSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/documents-tab.tsx"),
  "utf8",
);
const teamSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/team-tab.tsx"),
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
  assert.match(shellSource, /depth-sidebar/);
  assert.match(shellSource, /xl:w-\[220px\]/);
  assert.doesNotMatch(shellSource, /bg-\[#0B3B8A\]/);
  assert.doesNotMatch(shellSource, /bg-blue-800 text-white shadow-sm/);
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
  assert.match(globalsSource, /\.depth-card\s*\{[\s\S]*border:\s*0\.5px solid var\(--color-border-tertiary\)/);
  assert.match(globalsSource, /\.depth-card\s*\{[\s\S]*box-shadow:\s*0 2px 8px rgba\(30,\s*60,\s*120,\s*0\.06\)/);
  assert.doesNotMatch(depthCardBlock, /\binset 0 1px 0/);
  assert.match(globalsSource, /\.depth-emphasis\s*\{[\s\S]*background:\s*#ffffff/);
  assert.match(globalsSource, /--color-text-secondary:/);
  assert.match(globalsSource, /--color-text-tertiary:/);
  assert.match(globalsSource, /--color-background-secondary:/);
  assert.match(globalsSource, /--color-border-tertiary:/);
  assert.match(globalsSource, /--border-radius-lg:/);
});

test("sidebar styling uses dark midground glass and white active rails", () => {
  assert.match(globalsSource, /\.depth-sidebar\s*\{[\s\S]*background:\s*linear-gradient\(/);
  assert.match(globalsSource, /\.depth-sidebar\s*\{[\s\S]*backdrop-filter:\s*blur\(8px\)/);
  assert.match(globalsSource, /\.depth-sidebar::after\s*\{/);
  assert.match(globalsSource, /\.depth-sidebar::after\s*\{[\s\S]*linear-gradient\(\s*to right,\s*rgba\(20,\s*50,\s*120,\s*0\.06\),\s*transparent/);
  assert.match(globalsSource, /\.sidebar-item\s*\{[\s\S]*color:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/);
  assert.match(globalsSource, /\.sidebar-item:hover\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\)/);
  assert.match(globalsSource, /\.sidebar-item-active\s*\{[\s\S]*color:\s*#ffffff/);
  assert.match(globalsSource, /\.sidebar-item-active\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\)/);
  assert.match(globalsSource, /\.sidebar-item-active\s*\{[\s\S]*font-weight:\s*500/);
  assert.match(globalsSource, /\.sidebar-item-active::before\s*\{[\s\S]*background:\s*#1a6fd4/);
});

test("workspace chrome consumes depth utility classes instead of flat white panels", () => {
  assert.match(shellSource, /<header className="depth-mid/);
  assert.match(contextSource, /const surfaceCardClassName = "depth-card/);
  assert.match(shellSource, /sidebar-user-area/);
  assert.match(shellSource, /sidebar-user-name/);
  assert.match(shellSource, /sidebar-user-role/);
  assert.match(overviewSource, /buildOverviewMetricCards/);
  assert.match(overviewSource, /buildProgressPanels/);
  assert.match(overviewSource, /buildUrgentItems/);
  assert.match(overviewSource, /OverviewMetricCard/);
  assert.match(overviewSource, /ProgressRing/);
  assert.match(shellSource, /sidebar-header/);
  assert.match(shellSource, /sidebar-logo-wrapper/);
  assert.match(shellSource, /sidebar-logo/);
  assert.match(shellSource, /school-name/);
  assert.match(shellSource, /school-sub/);
  assert.match(shellSource, /topbar/);
  assert.match(shellSource, /header-sync-indicator/);
  assert.match(shellSource, /header-profile-menu/);
});

test("workspace stops boot blocking immediately after current user resolves", () => {
  const currentUserIndex = contextSource.indexOf("setCurrentUser(mePayload.user);");
  const activeTabEffectIndex = contextSource.indexOf("const loadActiveTabResources = async () => {", currentUserIndex);
  const bootReleaseIndex = contextSource.indexOf("setIsBooting(false);", activeTabEffectIndex);

  assert.ok(currentUserIndex >= 0, "should set current user after /api/auth/me");
  assert.ok(activeTabEffectIndex > currentUserIndex, "should hand off loading to the active-tab resource effect after current user loads");
  assert.ok(bootReleaseIndex > activeTabEffectIndex, "should release boot state after active-tab resources finish");
});

test("dashboard removes multicolor badge palettes from board status chips", () => {
  assert.doesNotMatch(contextSource, /border-amber-200 bg-amber-50 text-amber-700/);
  assert.doesNotMatch(contextSource, /border-orange-200 bg-orange-50 text-orange-700/);
  assert.doesNotMatch(contextSource, /border-emerald-200 bg-emerald-50 text-emerald-700/);
});

test("sidebar logo area uses transparent shell and white-treated logo", () => {
  assert.match(globalsSource, /\.sidebar-header\s*\{/);
  assert.match(globalsSource, /\.sidebar-header\s*\{[\s\S]*background:\s*transparent !important/);
  assert.match(globalsSource, /\.sidebar-logo img\s*\{[\s\S]*filter:\s*brightness\(0\)\s*invert\(1\)/);
  assert.match(globalsSource, /\.sidebar-logo img\s*\{[\s\S]*opacity:\s*0\.90/);
  assert.match(globalsSource, /\.school-name\s*\{[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.92\)/);
  assert.match(globalsSource, /\.school-sub\s*\{[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.52\)/);
  assert.match(globalsSource, /\.school-sub\s*\{[\s\S]*font-size:\s*12px/);
});

test("overview uses tailwind-first structure for the redesigned dashboard shell", () => {
  assert.match(globalsSource, /\.sidebar-user-area\s*\{[\s\S]*background:\s*transparent/);
  assert.match(overviewSource, /grid gap-3 lg:grid-cols-4/);
  assert.match(overviewSource, /grid gap-4 xl:grid-cols-2/);
  assert.match(overviewSource, /rounded-xl border border-gray-200 bg-white/);
  assert.match(overviewSource, /bg-gray-50/);
  assert.match(globalsSource, /\.topbar\s*\{[\s\S]*border-bottom:\s*1px solid rgba\(200,\s*215,\s*235,\s*0\.50\)/);
  assert.match(globalsSource, /\.header-sync-tooltip\s*\{/);
  assert.match(globalsSource, /\.header-profile-menu-panel\s*\{/);
});

test("overview layout uses the new welcome rail, metric strip, and split content columns", () => {
  assert.match(overviewSource, /欢迎回来，/);
  assert.match(overviewSource, /待办中心/);
  assert.match(overviewSource, /业务进度/);
  assert.match(overviewSource, /紧急事项/);
  assert.match(overviewSource, /今日汇报/);
  assert.match(overviewSource, /赛事日程/);
  assert.match(overviewSource, /通知公告/);
  assert.match(overviewSource, /lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(0,0\.95fr\)\]/);
  assert.doesNotMatch(overviewSource, /快捷办理提示/);
  assert.doesNotMatch(overviewSource, /今日工作提示/);
  assert.doesNotMatch(overviewSource, /优先关注/);
  assert.doesNotMatch(overviewSource, /业务办理/);
  assert.doesNotMatch(overviewSource, /今日任务摘要/);
});

test("overview renders svg progress rings, urgent deadline pills, event countdown, and report pills", () => {
  assert.match(contextSource, /const getOverviewDeadlineMeta =/);
  assert.match(overviewSource, /const RING_CIRCUMFERENCE = 125\.66/);
  assert.match(overviewSource, /strokeDasharray={RING_CIRCUMFERENCE}/);
  assert.match(overviewSource, /strokeDashoffset={/);
  assert.match(overviewSource, /超期/);
  assert.match(overviewSource, /剩余/);
  assert.match(overviewSource, /最近截止/);
  assert.match(overviewSource, /report-pill/);
  assert.match(overviewSource, /event-day-card/);
  assert.match(overviewSource, /announcement-link-button/);
});

test("timeline view uses proportional positioning, inline add button, and refined node cards", () => {
  assert.match(contextSource, /const getTimelinePointStyle =/);
  assert.match(timelineSource, /timeline-axis/);
  assert.match(timelineSource, /timeline-segment/);
  assert.match(timelineSource, /segmentTone =/);
  assert.match(timelineSource, /timeline-node/);
  assert.match(timelineSource, /timeline-add-button/);
  assert.match(timelineSource, /Pencil/);
  assert.match(timelineSource, /暂无描述，点击编辑补充/);
  assert.doesNotMatch(timelineSource, /当前数据已保存到云端数据库，可跨设备同步/);
  assert.match(globalsSource, /\.timeline-segment\.dashed\s*\{/);
  assert.match(globalsSource, /\.timeline-node\.future\s*\{/);
  assert.match(globalsSource, /\.timeline-tag\s*\{/);
  assert.match(globalsSource, /\.timeline-edit-button\s*\{/);
  assert.match(globalsSource, /\.timeline-add-button\s*\{/);
});

test("documents view uses compact category cards, pulsing current node, menu-based view action, and no persistent sync hint", () => {
  assert.match(documentsSource, /document-category-card/);
  assert.match(documentsSource, /count} 份/);
  assert.doesNotMatch(documentsSource, /点击筛选该分类文档/);
  assert.match(documentsSource, /document-status-badge/);
  assert.match(documentsSource, /document-step-compact/);
  assert.match(documentsSource, /document-step-item/);
  assert.match(documentsSource, /document-step-marker/);
  assert.match(documentsSource, /Check className="h-3.5 w-3.5"/);
  assert.match(documentsSource, /documentStepLabels\.map/);
  assert.match(documentsSource, /getDocumentStepCaption\(stepState\)/);
  assert.match(documentsSource, /document-meta-grid/);
  assert.match(documentsSource, /document-meta-item/);
  assert.match(documentsSource, /document-comment-panel/);
  assert.match(documentsSource, /getDocumentReminderLabel/);
  assert.doesNotMatch(documentsSource, /展开历史版本/);
  assert.match(documentsSource, /document-card-delete-button/);
  assert.match(documentsSource, /查看</);
  assert.match(documentsSource, /在线预览/);
  assert.match(documentsSource, /下载/);
  assert.match(documentsSource, /历史版本/);
  assert.doesNotMatch(documentsSource, /<DemoResetNote \/>/);
  assert.match(globalsSource, /\.document-category-card\.empty\s*\{/);
  assert.match(globalsSource, /\.document-status-badge\.warning\s*\{/);
  assert.match(globalsSource, /\.document-status-badge\.success\s*\{/);
  assert.match(globalsSource, /\.document-status-badge\.danger\s*\{/);
  assert.match(globalsSource, /\.document-step-marker\.current\s*\{[\s\S]*animation:\s*document-node-pulse/);
  assert.match(globalsSource, /\.document-step-marker\.complete\s*\{/);
  assert.match(globalsSource, /\.document-step-marker\.pending\s*\{/);
  assert.match(globalsSource, /\.document-step-segment\.complete\s*\{/);
  assert.match(globalsSource, /\.document-step-segment\.pending\s*\{/);
  assert.match(globalsSource, /\.document-step-compact\s*\{/);
  assert.match(globalsSource, /\.document-meta-grid\s*\{/);
  assert.match(globalsSource, /\.document-comment-panel\s*\{/);
  assert.match(globalsSource, /\.document-card-delete-button\s*\{/);
  assert.match(globalsSource, /\.document-view-menu\s*\{/);
});

test("reports view uses dot-based date chips, colored stats, isolated admin cleanup, reminder action, and compact footer hint", () => {
  assert.doesNotMatch(scheduleSource, /<DemoResetNote \/>/);
  assert.match(scheduleSource, /report-date-chip/);
  assert.match(scheduleSource, /report-date-dot/);
  assert.match(scheduleSource, /report-stat-card/);
  assert.match(scheduleSource, /report-stats-divider/);
  assert.match(scheduleSource, /report-admin-danger-zone/);
  assert.match(scheduleSource, /report-filter-column/);
  assert.match(scheduleSource, /report-record-legend/);
  assert.match(scheduleSource, /removeTeamReports/);
  assert.match(scheduleSource, /发送提醒/);
  assert.match(scheduleSource, /提交人：/);
  assert.doesNotMatch(scheduleSource, /汇报记录 · 提交人/);
  assert.match(scheduleSource, /report-empty-hint/);

  assert.match(globalsSource, /\.report-date-chip\s*\{/);
  assert.match(globalsSource, /\.report-date-chip\.muted\s*\{/);
  assert.match(globalsSource, /\.report-date-dot\s*\{/);
  assert.match(globalsSource, /\.report-stat-card\.submitted\s*\{/);
  assert.match(globalsSource, /\.report-stat-card\.missing\s*\{/);
  assert.match(globalsSource, /\.report-stats-divider\s*\{/);
  assert.match(globalsSource, /\.report-admin-danger-zone\s*\{/);
  assert.match(globalsSource, /\.report-record-legend\s*\{/);
  assert.match(globalsSource, /\.report-remind-button\s*\{/);
  assert.match(globalsSource, /\.report-empty-hint\s*\{/);
});

test("team management view uses muted toolbar actions, inline edit mode, and unified account actions", () => {
  assert.doesNotMatch(teamSource, /<DemoResetNote \/>/);
  assert.match(teamSource, /team-toolbar-secondary/);
  assert.match(teamSource, /team-group-chip/);
  assert.match(teamSource, /team-group-count-badge/);
  assert.match(teamSource, /team-icon-button/);
  assert.match(teamSource, /editingTeamRowId === member\.id/);
  assert.match(teamSource, /team-inline-value/);
  assert.match(teamSource, /发送提醒/);
  assert.match(teamSource, /重置密码/);
  assert.match(teamSource, /删除账号/);
  assert.match(teamSource, /team-delete-button/);
  assert.match(teamSource, /system-account-tag/);
  assert.match(teamSource, /system-status-tag/);
  assert.match(teamSource, /team-tab-count/);
  assert.match(globalsSource, /\.team-toolbar-secondary\s*\{/);
  assert.match(globalsSource, /\.team-group-chip\s*\{/);
  assert.match(globalsSource, /\.team-icon-button\s*\{/);
  assert.match(globalsSource, /\.team-inline-value\s*\{/);
  assert.match(globalsSource, /\.team-delete-button\s*\{/);
  assert.match(globalsSource, /\.team-delete-button:hover\s*\{/);
});

test("experts view uses attachment entry, hover delete affordance, and upload-more guide area", () => {
  assert.doesNotMatch(expertsSource, /<DemoResetNote \/>/);
  assert.match(expertsSource, /openExpertAttachmentMenuId/);
  assert.match(expertsSource, /查看附件/);
  assert.match(expertsSource, /expert-delete-button/);
  assert.match(expertsSource, /expert-detail-row/);
  assert.match(expertsSource, /上传更多专家意见/);
  assert.match(globalsSource, /\.expert-attachment-trigger\s*\{/);
  assert.match(globalsSource, /\.expert-delete-button\s*\{/);
  assert.match(globalsSource, /\.expert-detail-row\s*\{/);
  assert.match(globalsSource, /\.expert-upload-guide\s*\{/);
});

test("mobile layout uses stacked timeline, responsive forms, and non-cramped modal actions", () => {
  const todoModalBlock = shellSource.slice(
    shellSource.indexOf('{notificationsOpen ? ('),
    shellSource.indexOf('{reminderModalOpen ? ('),
  );

  assert.match(timelineSource, /md:hidden/);
  assert.match(timelineSource, /hidden md:block/);
  assert.match(timelineSource, /md:min-w-\[860px\]/);
  assert.doesNotMatch(timelineSource, /className="min-w-\[860px\]"/);
  assert.match(globalsSource, /\.timeline-mobile-list\s*\{/);
  assert.match(globalsSource, /\.timeline-mobile-card\s*\{/);
  assert.match(globalsSource, /\.timeline-mobile-node\s*\{/);

  assert.match(scheduleSource, /w-full md:min-w-56/);
  assert.match(teamSource, /w-full sm:min-w-\[240px\]/);
  assert.match(teamSource, /w-full sm:min-w-\[160px\]/);
  assert.match(teamSource, /w-full sm:min-w-\[180px\]/);

  assert.match(reviewSource, /grid-cols-2 sm:grid-cols-3 lg:grid-cols-5/);
  assert.match(reviewSource, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(reviewSource, /grid-cols-1 sm:grid-cols-2 md:grid-cols-3/);

  assert.match(todoModalBlock, /max-h-\[min\(92vh,860px\)\] max-w-\[min\(94vw,860px\)\] sm:max-w-\[min\(92vw,860px\)\]/);
  assert.match(todoModalBlock, /grid-cols-1 sm:grid-cols-\[minmax\(0,1fr\)_136px\]/);
  assert.match(todoModalBlock, /grid-cols-1 sm:grid-cols-\[minmax\(0,1fr\)_120px\]/);
});

test("review view uses unified review cards, collapsed scoring, contextual material actions, and warning chips", () => {
  assert.doesNotMatch(reviewSource, /<DemoResetNote \/>/);
  assert.match(reviewSource, /const reviewPendingCount =/);
  assert.match(reviewSource, /review-header-toolbar/);
  assert.match(reviewSource, /review-todo-pill/);
  assert.match(reviewSource, /expandedReviewPackageKeys/);
  assert.match(reviewSource, /toggleReviewPackageExpanded/);
  assert.match(reviewSource, /review-package-card/);
  assert.match(reviewSource, /review-material-card/);
  assert.match(reviewSource, /review-status-chip/);
  assert.match(reviewSource, /review-deadline-chip/);
  assert.match(reviewSource, /review-material-actions/);
  assert.match(reviewSource, /review-delete-icon/);
  assert.match(reviewSource, /review-score-toggle/);
  assert.match(reviewSource, /暂无描述，点击编辑补充/);
  assert.match(reviewSource, /支持 PDF 在线预览/);
  assert.match(reviewSource, /删除整包评审数据/);

  assert.match(globalsSource, /\.review-header-toolbar\s*\{/);
  assert.match(globalsSource, /\.review-todo-pill\s*\{/);
  assert.match(globalsSource, /\.review-package-card\s*\{/);
  assert.match(globalsSource, /\.review-material-card\s*\{/);
  assert.match(globalsSource, /\.review-status-chip\s*\{/);
  assert.match(globalsSource, /\.review-deadline-chip\.expired\s*\{/);
  assert.match(globalsSource, /\.review-delete-icon\s*\{/);
  assert.match(globalsSource, /\.review-score-toggle\s*\{/);
});

test("todo modal keeps a single dialog with stronger sectioning and unified read action", () => {
  const todoModalBlock = shellSource.slice(
    shellSource.indexOf('{notificationsOpen ? ('),
    shellSource.indexOf('{reminderModalOpen ? ('),
  );

  assert.match(todoModalBlock, /todo-modal-summary-card/);
  assert.match(todoModalBlock, /待办事项/);
  assert.match(todoModalBlock, /未读提醒/);
  assert.match(todoModalBlock, /全部标记已读/);
  assert.match(todoModalBlock, /todo-modal-count-chip/);
  assert.match(todoModalBlock, /todo-modal-section-header/);
  assert.match(todoModalBlock, /todo-modal-role-card/);
  assert.match(todoModalBlock, /todo-modal-notice-list/);
  assert.match(todoModalBlock, /todo-modal-notice-card/);
  assert.match(todoModalBlock, /todo-modal-action/);
  assert.match(todoModalBlock, /todo-modal-dismiss/);
  assert.doesNotMatch(todoModalBlock, /今天先把最关键的几件事推进掉/);
  assert.doesNotMatch(todoModalBlock, /一键已读/);
  assert.doesNotMatch(todoModalBlock, /全部已读/);

  assert.match(globalsSource, /\.todo-modal-summary-card\s*\{/);
  assert.match(globalsSource, /\.todo-modal-count-chip\s*\{/);
  assert.match(globalsSource, /\.todo-modal-section-header\s*\{/);
  assert.match(globalsSource, /\.todo-modal-role-card\s*\{/);
  assert.match(globalsSource, /\.todo-modal-notice-list\s*\{/);
  assert.match(globalsSource, /\.todo-modal-notice-card\s*\{/);
  assert.match(globalsSource, /\.todo-modal-action\s*\{/);
  assert.match(globalsSource, /\.todo-modal-dismiss\s*\{/);
});

test("boot loading shell uses a minimal loading card and workspace fade-in", () => {
  assert.match(shellSource, /loading-spinner/);
  assert.match(shellSource, /loading-title/);
  assert.match(shellSource, /loading-sub/);
  assert.match(shellSource, /loading-status/);
  assert.doesNotMatch(shellSource, /skeleton-card/);
  assert.doesNotMatch(shellSource, /概览数据/);
  assert.doesNotMatch(shellSource, /待办列表/);
  assert.doesNotMatch(shellSource, /快捷入口/);
  assert.match(shellSource, /workspace-shell-fade-in/);
  assert.match(globalsSource, /\.workspace-shell-fade-in\s*\{/);
  assert.match(globalsSource, /\.workspace-shell-fade-in\s*\{[\s\S]*animation:\s*workspace-fade-in 320ms ease-out/);
  assert.match(globalsSource, /@keyframes workspace-fade-in/);
  assert.match(globalsSource, /\.loading-spinner\s*\{[\s\S]*border-top-color:\s*#1a6fd4/);
  assert.match(globalsSource, /\.loading-status::before\s*\{[\s\S]*animation:\s*loading-pulse 1\.2s ease-in-out infinite/);
});

test("reports and timeline tabs use content-driven shell height instead of forcing min-h-screen", () => {
  assert.match(shellSource, /safeActiveTab === "timeline" \|\| safeActiveTab === "reports" \? "h-auto pb-8" : "min-h-screen"/);
});
