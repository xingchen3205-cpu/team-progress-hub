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

test("overview summary and priority panels use rails, tags, banner, and footer link", () => {
  assert.match(dashboardSource, /const getOverviewDeadlineMeta =/);
  assert.match(dashboardSource, /const priorityFocusTagMeta/);
  assert.match(dashboardSource, /task-priority-rail/);
  assert.match(dashboardSource, /priority-focus-tag/);
  assert.match(dashboardSource, /node-tip-banner/);
  assert.match(dashboardSource, /查看全部通知/);
  assert.doesNotMatch(dashboardSource, /task-index/);
  assert.doesNotMatch(dashboardSource, /priority-dot/);
  assert.match(globalsSource, /\.task-priority-rail\.danger\s*\{/);
  assert.match(globalsSource, /\.task-priority-rail\.warning\s*\{/);
  assert.match(globalsSource, /\.task-priority-rail\.normal\s*\{/);
  assert.match(globalsSource, /\.priority-focus-tag\s*\{/);
  assert.match(globalsSource, /\.priority-focus-tag\.pending-approval\s*\{/);
  assert.match(globalsSource, /\.priority-focus-tag\.pending-review\s*\{/);
  assert.match(globalsSource, /\.priority-focus-tag\.pending-view\s*\{/);
  assert.match(globalsSource, /\.priority-focus-tag\.clear\s*\{/);
  assert.match(globalsSource, /\.node-tip-banner\s*\{/);
  assert.match(globalsSource, /\.task-summary-link\s*\{/);
  assert.match(globalsSource, /\.task-assignee-meta\s*\{/);
  assert.match(globalsSource, /\.task-summary-footer-link\s*\{/);
});

test("timeline view uses proportional positioning, inline add button, and refined node cards", () => {
  assert.match(dashboardSource, /const getTimelinePointStyle =/);
  assert.match(dashboardSource, /timeline-axis/);
  assert.match(dashboardSource, /timeline-segment/);
  assert.match(dashboardSource, /segmentTone =/);
  assert.match(dashboardSource, /timeline-node/);
  assert.match(dashboardSource, /timeline-add-button/);
  assert.match(dashboardSource, /Pencil/);
  assert.match(dashboardSource, /暂无描述，点击编辑补充/);
  assert.match(dashboardSource, /查看时间进度/);
  const timelineBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderTimeline = () => ("),
    dashboardSource.indexOf("const renderBoard = () => {"),
  );
  assert.doesNotMatch(timelineBlock, /当前数据已保存到云端数据库，可跨设备同步/);
  assert.match(globalsSource, /\.timeline-segment\.dashed\s*\{/);
  assert.match(globalsSource, /\.timeline-node\.future\s*\{/);
  assert.match(globalsSource, /\.timeline-tag\s*\{/);
  assert.match(globalsSource, /\.timeline-edit-button\s*\{/);
  assert.match(globalsSource, /\.timeline-add-button\s*\{/);
});

test("documents view uses compact category cards, pulsing current node, menu-based view action, and no persistent sync hint", () => {
  const documentsBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderDocuments = () => ("),
    dashboardSource.indexOf("const renderTeam = () => ("),
  );

  assert.match(documentsBlock, /document-category-card/);
  assert.match(documentsBlock, /count} 份/);
  assert.doesNotMatch(documentsBlock, /点击筛选该分类文档/);
  assert.match(documentsBlock, /document-status-badge/);
  assert.match(documentsBlock, /document-step-compact/);
  assert.match(documentsBlock, /document-step-item/);
  assert.match(documentsBlock, /document-step-marker/);
  assert.match(documentsBlock, /Check className="h-3.5 w-3.5"/);
  assert.match(documentsBlock, /documentStepLabels\.map/);
  assert.match(documentsBlock, /getDocumentStepCaption\(stepState\)/);
  assert.match(documentsBlock, /document-meta-grid/);
  assert.match(documentsBlock, /document-meta-item/);
  assert.match(documentsBlock, /document-comment-panel/);
  assert.doesNotMatch(documentsBlock, /展开历史版本/);
  assert.match(documentsBlock, /document-card-delete-button/);
  assert.match(documentsBlock, /查看</);
  assert.match(documentsBlock, /在线预览/);
  assert.match(documentsBlock, /下载/);
  assert.match(documentsBlock, /历史版本/);
  assert.doesNotMatch(documentsBlock, /<DemoResetNote \/>/);
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
  const reportsBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderReports = () => ("),
    dashboardSource.indexOf("const renderExperts = () => ("),
  );

  assert.doesNotMatch(reportsBlock, /<DemoResetNote \/>/);
  assert.match(reportsBlock, /report-date-chip/);
  assert.match(reportsBlock, /report-date-dot/);
  assert.match(reportsBlock, /report-stat-card/);
  assert.match(reportsBlock, /report-stats-divider/);
  assert.match(reportsBlock, /report-admin-danger-zone/);
  assert.match(reportsBlock, /report-filter-column/);
  assert.match(reportsBlock, /report-record-legend/);
  assert.match(reportsBlock, /removeTeamReports/);
  assert.match(reportsBlock, /发送提醒/);
  assert.match(reportsBlock, /提交人：/);
  assert.doesNotMatch(reportsBlock, /汇报记录 · 提交人/);
  assert.match(reportsBlock, /report-empty-hint/);

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
  const teamBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderTeam = () => ("),
    dashboardSource.indexOf("const renderProfile = () => {"),
  );

  assert.doesNotMatch(teamBlock, /<DemoResetNote \/>/);
  assert.match(teamBlock, /team-toolbar-secondary/);
  assert.match(teamBlock, /team-group-chip/);
  assert.match(teamBlock, /team-group-count-badge/);
  assert.match(teamBlock, /team-icon-button/);
  assert.match(teamBlock, /editingTeamRowId === member\.id/);
  assert.match(teamBlock, /team-inline-value/);
  assert.match(teamBlock, /发送提醒/);
  assert.match(teamBlock, /重置密码/);
  assert.match(teamBlock, /删除账号/);
  assert.match(teamBlock, /team-delete-button/);
  assert.match(teamBlock, /system-account-tag/);
  assert.match(teamBlock, /system-status-tag/);
  assert.match(teamBlock, /team-tab-count/);
  assert.match(globalsSource, /\.team-toolbar-secondary\s*\{/);
  assert.match(globalsSource, /\.team-group-chip\s*\{/);
  assert.match(globalsSource, /\.team-icon-button\s*\{/);
  assert.match(globalsSource, /\.team-inline-value\s*\{/);
  assert.match(globalsSource, /\.team-delete-button\s*\{/);
  assert.match(globalsSource, /\.team-delete-button:hover\s*\{/);
});

test("experts view uses attachment entry, hover delete affordance, and upload-more guide area", () => {
  const expertsBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderExperts = () => ("),
    dashboardSource.indexOf("const renderReview = () => {"),
  );

  assert.doesNotMatch(expertsBlock, /<DemoResetNote \/>/);
  assert.match(expertsBlock, /openExpertAttachmentMenuId/);
  assert.match(expertsBlock, /查看附件/);
  assert.match(expertsBlock, /expert-delete-button/);
  assert.match(expertsBlock, /expert-detail-row/);
  assert.match(expertsBlock, /上传更多专家意见/);
  assert.match(globalsSource, /\.expert-attachment-trigger\s*\{/);
  assert.match(globalsSource, /\.expert-delete-button\s*\{/);
  assert.match(globalsSource, /\.expert-detail-row\s*\{/);
  assert.match(globalsSource, /\.expert-upload-guide\s*\{/);
});

test("mobile layout uses stacked timeline, responsive forms, and non-cramped modal actions", () => {
  const timelineBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderTimeline = () => ("),
    dashboardSource.indexOf("const renderBoard = () => {"),
  );
  const reportsBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderReports = () => ("),
    dashboardSource.indexOf("const renderExperts = () => ("),
  );
  const reviewBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderReview = () => {"),
    dashboardSource.indexOf("const renderDocuments = () => ("),
  );
  const teamBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderTeam = () => ("),
    dashboardSource.indexOf("const renderProfile = () => {"),
  );
  const todoModalBlock = dashboardSource.slice(
    dashboardSource.indexOf('{notificationsOpen ? ('),
    dashboardSource.indexOf('{reminderModalOpen ? ('),
  );

  assert.match(timelineBlock, /md:hidden/);
  assert.match(timelineBlock, /hidden md:block/);
  assert.match(timelineBlock, /md:min-w-\[860px\]/);
  assert.doesNotMatch(timelineBlock, /className="min-w-\[860px\]"/);
  assert.match(globalsSource, /\.timeline-mobile-list\s*\{/);
  assert.match(globalsSource, /\.timeline-mobile-card\s*\{/);
  assert.match(globalsSource, /\.timeline-mobile-node\s*\{/);

  assert.match(reportsBlock, /w-full md:min-w-56/);
  assert.match(teamBlock, /w-full sm:min-w-\[240px\]/);
  assert.match(teamBlock, /w-full sm:min-w-\[160px\]/);
  assert.match(teamBlock, /w-full sm:min-w-\[180px\]/);

  assert.match(reviewBlock, /grid-cols-2 sm:grid-cols-3 lg:grid-cols-5/);
  assert.match(reviewBlock, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(reviewBlock, /grid-cols-1 sm:grid-cols-2 md:grid-cols-3/);

  assert.match(todoModalBlock, /max-h-\[min\(92vh,860px\)\] max-w-\[min\(94vw,860px\)\] sm:max-w-\[min\(92vw,860px\)\]/);
  assert.match(todoModalBlock, /grid-cols-1 sm:grid-cols-\[minmax\(0,1fr\)_136px\]/);
  assert.match(todoModalBlock, /grid-cols-1 sm:grid-cols-\[minmax\(0,1fr\)_120px\]/);
});

test("review view uses unified review cards, collapsed scoring, contextual material actions, and warning chips", () => {
  const reviewBlock = dashboardSource.slice(
    dashboardSource.indexOf("const renderReview = () => {"),
    dashboardSource.indexOf("const renderDocuments = () => ("),
  );

  assert.doesNotMatch(reviewBlock, /<DemoResetNote \/>/);
  assert.match(reviewBlock, /const reviewPendingCount =/);
  assert.match(reviewBlock, /review-header-toolbar/);
  assert.match(reviewBlock, /review-todo-pill/);
  assert.match(reviewBlock, /expandedReviewPackageKeys/);
  assert.match(reviewBlock, /toggleReviewPackageExpanded/);
  assert.match(reviewBlock, /review-package-card/);
  assert.match(reviewBlock, /review-material-card/);
  assert.match(reviewBlock, /review-status-chip/);
  assert.match(reviewBlock, /review-deadline-chip/);
  assert.match(reviewBlock, /review-material-actions/);
  assert.match(reviewBlock, /review-delete-icon/);
  assert.match(reviewBlock, /review-score-toggle/);
  assert.match(reviewBlock, /暂无描述，点击编辑补充/);
  assert.match(reviewBlock, /支持 PDF 在线预览/);
  assert.match(reviewBlock, /删除整包评审数据/);

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
  const todoModalBlock = dashboardSource.slice(
    dashboardSource.indexOf('{notificationsOpen ? ('),
    dashboardSource.indexOf('{reminderModalOpen ? ('),
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
  assert.match(dashboardSource, /loading-spinner/);
  assert.match(dashboardSource, /loading-title/);
  assert.match(dashboardSource, /loading-sub/);
  assert.match(dashboardSource, /loading-status/);
  assert.doesNotMatch(dashboardSource, /skeleton-card/);
  assert.doesNotMatch(dashboardSource, /概览数据/);
  assert.doesNotMatch(dashboardSource, /待办列表/);
  assert.doesNotMatch(dashboardSource, /快捷入口/);
  assert.match(dashboardSource, /workspace-shell-fade-in/);
  assert.match(globalsSource, /\.workspace-shell-fade-in\s*\{/);
  assert.match(globalsSource, /\.workspace-shell-fade-in\s*\{[\s\S]*animation:\s*workspace-fade-in 320ms ease-out/);
  assert.match(globalsSource, /@keyframes workspace-fade-in/);
  assert.match(globalsSource, /\.loading-spinner\s*\{[\s\S]*border-top-color:\s*#1a6fd4/);
  assert.match(globalsSource, /\.loading-status::before\s*\{[\s\S]*animation:\s*loading-pulse 1\.2s ease-in-out infinite/);
});

test("reports and timeline tabs use content-driven shell height instead of forcing min-h-screen", () => {
  assert.match(dashboardSource, /safeActiveTab === "timeline" \|\| safeActiveTab === "reports" \? "h-auto pb-8" : "min-h-screen"/);
});
