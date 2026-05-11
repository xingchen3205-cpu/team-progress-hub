import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  getExpertReviewMode,
  getExpertReviewWindowState,
  validateExpertReviewMaterial,
} from "@/lib/expert-review";

const readSource = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

describe("expert review v2 constraints", () => {
  it("removes expert self registration from login and registration API", () => {
    const loginSource = readSource("src/components/login-screen.tsx");
    const registerSource = readSource("src/app/api/auth/register/route.ts");
    const permissionSource = readSource("src/lib/permissions.ts");

    assert.doesNotMatch(loginSource, /registerRoleOptions[^\n]+评审专家/);
    assert.doesNotMatch(registerSource, /评审专家:\s*"expert"/);
    assert.match(permissionSource, /selfRegisterableRoles:\s*Role\[\]\s*=\s*\["teacher",\s*"leader",\s*"member"\]/);
    assert.doesNotMatch(permissionSource, /case "expert":\s*return \["teacher",\s*"school_admin",\s*"admin"\]/);
  });

  it("limits expert review assignment creation to administrators", () => {
    const routeSource = readSource("src/app/api/expert-reviews/assignments/route.ts");

    assert.match(routeSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
    assert.doesNotMatch(routeSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin",\s*"teacher",\s*"leader"\]\)/);
  });

  it("supports roadshow score submission with exactly two-decimal precision storage", () => {
    const routeSource = readSource("src/app/api/expert-reviews/scores/route.ts");

    assert.match(routeSource, /roadshowScore/);
    assert.match(routeSource, /Math\.round\(roadshowScore \* 100\)/);
    assert.match(routeSource, /Number\.isInteger\(roadshowScore \* 100\)/);
  });

  it("rejects expert review uploads when mime type conflicts with extension", () => {
    assert.equal(
      validateExpertReviewMaterial({
        kind: "plan",
        fileName: "计划书.pdf",
        fileSize: 1024,
        mimeType: "image/png",
      }),
      "计划书文件类型与扩展名不匹配",
    );
  });

  it("blocks roadshow score submission until the administrator starts the screen session", () => {
    const routeSource = readSource("src/app/api/expert-reviews/scores/route.ts");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
    const serializerSource = readSource("src/lib/expert-review.ts");

    assert.match(routeSource, /reviewDisplaySeat\.findFirst/);
    assert.match(routeSource, /status:\s*"scoring"/);
    assert.match(routeSource, /现场评分尚未开始/);
    assert.match(serializerSource, /roadshowScreenStarted/);
    assert.match(serializerSource, /roadshowScreenActive/);
    assert.match(serializerSource, /roadshowScreenPhaseLabel/);
    assert.match(serializerSource, /ReviewDisplaySeat/);
    assert.match(tabSource, /roadshowScreenStarted/);
    assert.match(tabSource, /roadshowScreenActive/);
    assert.match(tabSource, /请等待管理员在大屏控制端点击开始评分/);
  });

  it("does not force administrator-created expert accounts to complete email before review", () => {
    const contextSource = readSource("src/components/workspace-context.tsx");
    const profileRouteSource = readSource("src/app/api/profile/route.ts");
    const profileTabSource = readSource("src/components/tabs/profile-tab.tsx");

    assert.match(contextSource, /currentRole !== "expert"[\s\S]*validateRequiredEmail\(currentUser\.email\)/);
    assert.match(contextSource, /currentRole !== "expert"[\s\S]*validateRequiredEmail\(profileDraft\.email\)/);
    assert.match(profileRouteSource, /user\.role !== "expert"[\s\S]*validateRequiredEmail\(email\)/);
    assert.match(profileRouteSource, /email \? email : null/);
    assert.match(profileTabSource, /const isExpertAccount = currentRole === "expert"/);
    assert.doesNotMatch(profileTabSource, /专家账号[\s\S]*必填，用于接收任务和日程提醒/);
  });

  it("derives review mode from linked project stage type instead of label text", () => {
    const assignment = {
      targetName: "智在必行",
      roundLabel: "第一轮测试",
      overview: "来源于项目管理「第一轮测试」已生效材料。",
      projectReviewStage: { type: "roadshow" },
    } as Parameters<typeof getExpertReviewMode>[0] & {
      projectReviewStage: { type: "roadshow" };
    };

    assert.equal(getExpertReviewMode(assignment), "roadshow");
  });

  it("locks expert scores after first submission and stores all scores as cents", () => {
    const routeSource = readSource("src/app/api/expert-reviews/scores/route.ts");

    assert.match(routeSource, /assignment\.score/);
    assert.match(routeSource, /评分已提交，不能修改/);
    assert.doesNotMatch(routeSource, /expertReviewScore\.upsert/);
    assert.match(routeSource, /Math\.round\(simpleTotalScore \* 100\)/);
    assert.match(routeSource, /Number\.isInteger\(simpleTotalScore \* 100\)/);
    assert.match(routeSource, /lockedAt:\s*submittedAt/);
  });

  it("keeps expert assignments visible after deadline while keeping material preview locked", () => {
    const scopeSource = readSource("src/lib/team-scope.ts");
    const materialSource = readSource("src/app/api/expert-reviews/assignments/[id]/materials/[kind]/route.ts");

    assert.match(scopeSource, /expertUserId:\s*actor\.id/);
    assert.match(scopeSource, /reviewPackage:\s*\{\s*status:\s*\{\s*not:\s*"cancelled"/);
    assert.doesNotMatch(scopeSource, /deadline:\s*\{\s*gt:\s*now\s*\}/);
    assert.match(materialSource, /评审已截止/);
    assert.match(materialSource, /getExpertReviewLockState/);
  });

  it("streams expert review material previews with byte range support for mobile video playback", () => {
    const materialSource = readSource("src/app/api/expert-reviews/assignments/[id]/materials/[kind]/route.ts");

    assert.match(materialSource, /parseHttpRange/);
    assert.match(materialSource, /request\.headers\.get\("range"\)/);
    assert.match(materialSource, /readStoredFileRange/);
    assert.match(materialSource, /"Content-Range"/);
    assert.match(materialSource, /"Accept-Ranges":\s*"bytes"/);
    assert.match(materialSource, /status:\s*206/);
    assert.match(materialSource, /status:\s*416/);
  });

  it("rate limits expert scoring and review material maintenance endpoints", () => {
    const securitySource = readSource("src/lib/security.ts");
    const scoreRouteSource = readSource("src/app/api/expert-reviews/scores/route.ts");
    const materialUploadRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/materials/route.ts");

    assert.match(securitySource, /expertActionRateLimits/);
    assert.match(scoreRouteSource, /checkRateLimit\(request,\s*expertActionRateLimits\.scoreSubmit/);
    assert.match(scoreRouteSource, /rateLimitExceededResponse\(rateLimit,\s*"评分提交过于频繁/);
    assert.match(materialUploadRouteSource, /checkRateLimit\(request,\s*expertActionRateLimits\.materialMaintenance/);
    assert.match(materialUploadRouteSource, /rateLimitExceededResponse\(rateLimit,\s*"评审材料维护过于频繁/);
  });

  it("replaces the old four-category expert scoring UI with v2 expert review panels", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tabSource, /项目网络评审/);
    assert.match(tabSource, /项目路演评审/);
    assert.match(tabSource, /确认提交/);
    assert.match(tabSource, /评审管理/);
    assert.match(tabSource, /导出评分明细/);
    assert.match(tabSource, /downloadReviewScoreDetails/);
    assert.match(tabSource, /提交评分/);
    assert.match(tabSource, /toFixed\(2\)/);
    assert.match(tabSource, /reviewDeadlineText/);
    assert.match(tabSource, /提交后不可修改/);

    assert.doesNotMatch(tabSource, /评审规则设置/);
    assert.doesNotMatch(tabSource, /专家评审与大屏投屏/);
    assert.doesNotMatch(tabSource, /投屏模式/);
    assert.doesNotMatch(tabSource, /实时分数段/);
    assert.doesNotMatch(tabSource, /路演投屏与评分规则/);
    assert.doesNotMatch(tabSource, /个人成长/);
    assert.doesNotMatch(tabSource, /项目创新/);
    assert.doesNotMatch(tabSource, /产业价值/);
    assert.doesNotMatch(tabSource, /团队协作/);
    assert.doesNotMatch(tabSource, /systemDateRange/);
    assert.doesNotMatch(tabSource, /2026-04-27 11:00/);
    assert.doesNotMatch(tabSource, /确认更新评分/);
    assert.doesNotMatch(tabSource, /重新提交覆盖/);
    assert.doesNotMatch(tabSource, /现场记录/);
    assert.doesNotMatch(tabSource, /roadshowCommentDraft/);
  });

  it("keeps expert-facing review copy clean and uses a centered completion modal", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
    const shellSource = readSource("src/components/workspace-shell.tsx");

    assert.match(tabSource, /ExpertScoreSuccessModal/);
    assert.match(tabSource, /评分提交成功/);
    assert.match(tabSource, /fixed inset-0 z-50 flex items-center justify-center/);
    assert.doesNotMatch(tabSource, /专家端 · 独立评审/);
    assert.doesNotMatch(tabSource, /系统会实时更新管理端和投屏数据/);
    assert.doesNotMatch(tabSource, /管理端和投屏数据已同步刷新/);
    assert.match(shellSource, /currentRole === "expert"/);
    assert.match(shellSource, /南京铁道职业技术学院大赛评审系统/);
    assert.doesNotMatch(shellSource, /EXPERT REVIEW PORTAL/);
  });

  it("renders expert accounts in a standalone review portal shell", () => {
    const shellSource = readSource("src/components/workspace-shell.tsx");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
    const layoutSource = readSource("src/app/layout.tsx");

    assert.match(shellSource, /currentRole === "expert"/);
    assert.match(shellSource, /南京铁道职业技术学院大赛评审系统/);
    assert.match(shellSource, /text-center/);
    assert.match(shellSource, /md:text-left/);
    assert.match(shellSource, /\/brand\/njrts-logo\.png/);
    assert.match(layoutSource, /title:\s*"南京铁道职业技术学院大赛评审系统"/);
    assert.doesNotMatch(shellSource, /EXPERT REVIEW PORTAL|大学生创新大赛评审系统/);
    assert.doesNotMatch(
      shellSource.match(/if \(currentRole === "expert"\)[\s\S]*?return \(/)?.[0] ?? "",
      /sidebar-nav-item|发布公告|搜索任务、文档、成员/,
    );
    assert.match(tabSource, /请选择本轮评审任务/);
    assert.match(tabSource, /系统仅展示管理员已分配给您的评审任务/);
    assert.match(tabSource, /expert-mobile-shell/);
  });

  it("uses the polished expert review flow layout for task entry, list, and scoring", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tabSource, /expert-status-bar/);
    assert.match(tabSource, /expert-task-card/);
    assert.match(tabSource, /返回任务选择/);
    assert.match(tabSource, /返回网络评审列表/);
    assert.match(tabSource, /detail-layout/);
    assert.match(tabSource, /material-item/);
    assert.match(tabSource, /score-range/);
    assert.match(tabSource, /审阅计划书、PPT、PDF 和视频材料/);
    assert.match(tabSource, /评分范围为 0\.00-100\.00/);
  });

  it("optimizes the expert mobile web review flow for clear touch scoring", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tabSource, /expert-mobile-shell/);
    assert.match(tabSource, /expert-mobile-score-panel/);
    assert.match(tabSource, /expert-score-submit-bar/);
    assert.match(tabSource, /touch-manipulation/);
    assert.match(tabSource, /aria-live="polite"/);
    assert.match(tabSource, /submittingAssignmentId === activeRoadshowAssignment\.id/);
    assert.doesNotMatch(tabSource, /hover:-translate-y-1/);
    assert.doesNotMatch(tabSource, /hover:shadow-\[/);
  });

  it("keeps expert review navigation limited to admins and expert accounts", () => {
    const workspaceSource = readSource("src/components/workspace-context.tsx");
    const roleBlock = (role: string) => {
      const match = workspaceSource.match(new RegExp(`${role}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`));
      assert.ok(match, `missing ${role} permissions block`);
      return match[1];
    };

    assert.match(roleBlock("admin"), /visibleTabs:\s*\[[\s\S]*?"review"[\s\S]*?\]/);
    assert.match(roleBlock("school_admin"), /visibleTabs:\s*\[[\s\S]*?"review"[\s\S]*?\]/);
    assert.match(roleBlock("expert"), /visibleTabs:\s*\["review",\s*"profile"\]/);
    assert.doesNotMatch(roleBlock("teacher"), /visibleTabs:\s*\[[^\]]*"review"/);
    assert.doesNotMatch(roleBlock("leader"), /visibleTabs:\s*\[[^\]]*"review"/);
    assert.doesNotMatch(roleBlock("member"), /visibleTabs:\s*\[[^\]]*"review"/);
  });

  it("allows expert accounts to load their own notification inbox during workspace bootstrap", () => {
    const notificationsRouteSource = readSource("src/app/api/notifications/route.ts");
    const getBlockMatch = notificationsRouteSource.match(/export async function GET[\s\S]*?\n}\n\nexport async function POST/);

    assert.ok(getBlockMatch, "missing notifications GET handler");
    assert.match(getBlockMatch[0], /assertRole\(user\.role,\s*\["admin",\s*"school_admin",\s*"teacher",\s*"leader",\s*"member",\s*"expert"\]\)/);
    assert.doesNotMatch(getBlockMatch[0], /assertMainWorkspaceRole\(user\.role\)/);
  });

  it("keeps project management next to expert review and uses project stages as review rounds", () => {
    const workspaceSource = readSource("src/components/workspace-context.tsx");
    const shellSource = readSource("src/components/workspace-shell.tsx");
    const routeSource = readSource("src/app/api/expert-reviews/assignments/route.ts");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(workspaceSource, /key:\s*"project"[\s\S]*?key:\s*"review"/);
    assert.match(routeSource, /stageId/);
    assert.match(routeSource, /projectReviewStage/);
    assert.match(routeSource, /projectMaterialSubmission/);
    assert.match(routeSource, /status:\s*"approved"/);
    assert.match(routeSource, /expertUserIds/);
    assert.match(routeSource, /createMany/);
    assert.match(routeSource, /expertReviewMaterial/);
    assert.match(shellSource, /选择项目管理轮次/);
    assert.match(shellSource, /选择已生效项目材料/);
    assert.match(shellSource, /批量选择专家/);
    assert.match(tabSource, /可分配评审阶段/);
    assert.match(tabSource, /分配专家并设置评审时间/);
    assert.doesNotMatch(shellSource, /评审对象 \/ 项目名称/);
    assert.doesNotMatch(shellSource, /和主文档中心完全分离/);
    assert.match(tabSource, /项目管理已生效材料/);
  });

  it("allows administrators to create standalone expert review projects without project management records", () => {
    const shellSource = readSource("src/components/workspace-shell.tsx");
    const contextSource = readSource("src/components/workspace-context.tsx");
    const routeSource = readSource("src/app/api/expert-reviews/assignments/route.ts");

    assert.match(shellSource, /自定义项目名称/);
    assert.match(shellSource, /不绑定项目管理/);
    assert.match(contextSource, /请填写自定义项目名称/);
    assert.match(contextSource, /targetName:\s*reviewAssignmentDraft\.targetName\.trim\(\)/);
    assert.match(routeSource, /const customExpertUserIds/);
    assert.match(routeSource, /targetName,\s*roundLabel,\s*overview/);
    assert.match(routeSource, /expertReviewAssignment\.createMany/);
    assert.doesNotMatch(contextSource, /if \(!reviewAssignmentDraft\.stageId\)[\s\S]{0,120}请先选择项目管理轮次/);
  });

  it("allows selected roadshow groups plus multiple custom project names in one review round", () => {
    const shellSource = readSource("src/components/workspace-shell.tsx");
    const contextSource = readSource("src/components/workspace-context.tsx");
    const routeSource = readSource("src/app/api/expert-reviews/assignments/route.ts");

    assert.match(shellSource, /新增自定义路演项目/);
    assert.match(shellSource, /customTargetNames/);
    assert.match(shellSource, /一行一个项目名称/);
    assert.match(shellSource, /max-w-\[min\(96vw,920px\)\]/);
    assert.match(shellSource, /复制断行时会自动合并明显续行/);
    assert.match(contextSource, /customTargetNames:\s*\[\]/);
    assert.match(contextSource, /parseCustomReviewTargetNames\(reviewAssignmentDraft\.customTargetNames\)/);
    assert.match(contextSource, /请至少选择一个路演项目组或填写一个自定义项目/);
    assert.match(routeSource, /customTargetNames\?:\s*string\[\]/);
    assert.match(routeSource, /parseCustomReviewTargetNames\(body\.customTargetNames\)/);
    assert.match(routeSource, /teamGroupId:\s*null/);
    assert.doesNotMatch(routeSource, /teamGroupId:\s*\{\s*in:\s*packageTargets\.map/);
  });

  it("uses an independent expert review window instead of the project material upload window", () => {
    const contextSource = readSource("src/components/workspace-context.tsx");
    const shellSource = readSource("src/components/workspace-shell.tsx");
    const routeSource = readSource("src/app/api/expert-reviews/assignments/route.ts");

    assert.doesNotMatch(contextSource, /2026-04-10T18:00/);
    assert.match(contextSource, /getDefaultReviewAssignmentStartAt/);
    assert.match(contextSource, /getDefaultReviewAssignmentDeadline/);
    assert.match(contextSource, /formatBeijingDateTimeInput/);
    assert.match(shellSource, /评审开始时间/);
    assert.match(shellSource, /评审截止时间/);
    assert.match(shellSource, /与学生上传时间分开/);
    assert.match(routeSource, /startAt\?:\s*string/);
    assert.match(routeSource, /const startAt = body\?\.startAt \? new Date\(body\.startAt\) : null/);
    assert.match(routeSource, /const effectiveStartAt = startAt/);
    assert.match(routeSource, /startAt:\s*effectiveStartAt/);
    assert.doesNotMatch(routeSource, /startAt:\s*projectReviewStage\.startAt/);
    assert.doesNotMatch(routeSource, /const effectiveDeadline = deadline \?\? projectReviewStage\.deadline/);
    assert.doesNotMatch(shellSource, /deadline:\s*selectedStage\?\.deadline\s*\?/);
  });

  it("blocks expert entry and scoring outside the configured review window", () => {
    const scoreRouteSource = readSource("src/app/api/expert-reviews/scores/route.ts");
    const materialRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/materials/[kind]/route.ts");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.equal(
      getExpertReviewWindowState({
        startAt: "2026-04-30T09:00:00.000Z",
        deadline: "2026-05-01T09:00:00.000Z",
        now: new Date("2026-04-29T09:00:00.000Z"),
      }).key,
      "not_started",
    );
    assert.equal(
      getExpertReviewWindowState({
        startAt: "2026-04-30T09:00:00.000Z",
        deadline: "2026-05-01T09:00:00.000Z",
        now: new Date("2026-04-30T10:00:00.000Z"),
      }).key,
      "open",
    );
    assert.equal(
      getExpertReviewWindowState({
        startAt: "2026-04-30T09:00:00.000Z",
        deadline: "2026-05-01T09:00:00.000Z",
        now: new Date("2026-05-01T09:00:00.000Z"),
      }).key,
      "ended",
    );
    assert.match(scoreRouteSource, /getExpertReviewWindowState/);
    assert.match(scoreRouteSource, /评审尚未开始/);
    assert.match(materialRouteSource, /getExpertReviewWindowState/);
    assert.match(materialRouteSource, /评审尚未开始/);
    assert.match(tabSource, /getReviewWindowBlockMessage/);
    assert.match(tabSource, /当前不在评审时间段内/);
  });

  it("lets live roadshow scoring follow the screen session instead of an old deadline", () => {
    const serializerSource = readSource("src/lib/expert-review.ts");
    const scoreRouteSource = readSource("src/app/api/expert-reviews/scores/route.ts");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(serializerSource, /reviewMode === "roadshow"\s*\?/);
    assert.match(serializerSource, /roadshowScreenStarted === true/);
    assert.match(scoreRouteSource, /if \(!isRoadshowAssignment\)/);
    assert.match(scoreRouteSource, /getExpertReviewWindowState/);
    assert.match(scoreRouteSource, /getExpertReviewLockState/);
    assert.match(tabSource, /assignment\.canEdit/);
    assert.match(tabSource, /setExpertMode\("roadshow-score"\)/);
    assert.match(tabSource, /当前大屏项目/);
    assert.match(tabSource, /本轮共 \{roadshowAssignments\.length\} 个项目/);
    assert.match(tabSource, /live-roadshow-status-card/);
    assert.match(tabSource, /roadshow-phase-pill/);
    assert.match(tabSource, /roadshow-score-input-shell/);
    assert.match(tabSource, /实时同步中/);
    assert.match(tabSource, /进入评分阶段后，本页会自动切换到打分界面/);
    assert.match(tabSource, /系统会再次弹窗确认/);
  });

  it("keeps expert mobile assignments in sync without requiring manual refresh", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tabSource, /const refreshExpertAssignments/);
    assert.match(tabSource, /refreshExpertAssignmentsNow/);
    assert.match(tabSource, /刷新现场状态/);
    assert.match(tabSource, /正在刷新/);
    assert.match(tabSource, /document\.visibilityState !== "visible"/);
    assert.match(tabSource, /window\.setInterval\(refreshExpertAssignments,\s*3000\)/);
    assert.doesNotMatch(tabSource, /roadshowAssignments\.some\(\s*\(assignment\) => assignment\.statusKey === "pending" && assignment\.roadshowScreenStarted === false/);
    assert.doesNotMatch(tabSource, /无需手动刷新/);
  });

  it("allows administrators to edit review packages without deleting submitted expert scores", () => {
    const routeSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const contextSource = readSource("src/components/workspace-context.tsx");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(routeSource, /export async function PATCH/);
    assert.match(routeSource, /已有评分的专家不能从本轮移除/);
    assert.match(routeSource, /createMany/);
    assert.match(contextSource, /reviewAssignmentEditAssignmentId/);
    assert.match(contextSource, /method:\s*"PATCH"/);
    assert.match(tabSource, /编辑当前评审包/);
  });

  it("treats project stages as the source and cancelled expert review packages as reconfigurable children", () => {
    const schemaSource = readSource("prisma/schema.prisma");
    const assignmentRouteSource = readSource("src/app/api/expert-reviews/assignments/route.ts");
    const assignmentItemRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const teamScopeSource = readSource("src/lib/team-scope.ts");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(schemaSource, /enum ExpertReviewPackageStatus/);
    assert.match(schemaSource, /configured/);
    assert.match(schemaSource, /cancelled/);
    assert.match(schemaSource, /status\s+ExpertReviewPackageStatus\s+@default\(configured\)/);
    assert.match(assignmentRouteSource, /existingReviewPackages/);
    assert.match(assignmentRouteSource, /status:\s*"configured"/);
    assert.match(assignmentRouteSource, /status\s*===\s*"cancelled"/);
    assert.match(assignmentRouteSource, /该阶段已存在评审配置，请编辑当前评审包/);
    assert.match(assignmentItemRouteSource, /status:\s*"cancelled"/);
    assert.match(assignmentItemRouteSource, /reviewDisplaySession\.deleteMany/);
    assert.match(assignmentItemRouteSource, /expertReviewAssignment\.deleteMany/);
    assert.match(assignmentItemRouteSource, /confirm\s*!==\s*"permanent"/);
    assert.match(assignmentItemRouteSource, /已有评分记录，请先完成二次确认后重置评审包/);
    assert.match(assignmentItemRouteSource, /expertReviewPackage\.deleteMany/);
    assert.match(teamScopeSource, /status:\s*\{\s*not:\s*"cancelled"(?:\s+as const)?\s*\}/);
    assert.match(tabSource, /重置本轮配置/);
    assert.match(tabSource, /重置并重新配置本阶段/);
    assert.match(tabSource, /已配置/);
    assert.match(tabSource, /未配置/);
  });

  it("lets administrators reconfigure a reset roadshow team group without returning to project management", () => {
    const assignmentRouteSource = readSource("src/app/api/expert-reviews/assignments/route.ts");
    const assignmentItemRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const serializerSource = readSource("src/lib/expert-review.ts");
    const contextSource = readSource("src/components/workspace-context.tsx");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(assignmentRouteSource, /reviewPackage:\s*\{[\s\S]*?select:\s*\{[\s\S]*?teamGroupId:\s*true/);
    assert.match(assignmentItemRouteSource, /reviewPackage:\s*\{[\s\S]*?select:\s*\{[\s\S]*?teamGroupId:\s*true/);
    assert.match(serializerSource, /teamGroupId:\s*assignment\.reviewPackage\.teamGroupId/);
    assert.match(contextSource, /initialTeamGroupIds/);
    assert.match(contextSource, /refreshWorkspace\(\["reviewAssignments",\s*"projectStages"\]\)/);
    assert.match(tabSource, /reconfigurableProjectStages/);
    assert.doesNotMatch(tabSource, /projectStages\.length > 0 && groupedAssignments\.length === 0/);
    assert.match(tabSource, /resettableRoadshowGroups/);
    assert.match(tabSource, /重新配置项目组/);
    assert.match(tabSource, /openReviewAssignmentModal\(undefined,\s*activeProjectStage\.id/);
  });

  it("keeps roadshow configuration guidance unambiguous and resets local locked screen state", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");
    const contextSource = readSource("src/components/workspace-context.tsx");

    assert.match(tabSource, /screenSession\s*\?\s*\{\s*label:\s*"查看配置"/);
    assert.doesNotMatch(tabSource, /label:\s*guideStepKey === "config" \? "配置本轮" : "查看配置"/);
    assert.match(tabSource, /重置本轮配置/);
    assert.match(tabSource, /resetRoadshowStageLocalState/);
    assert.match(tabSource, /closeReviewScreenSession/);
    assert.match(tabSource, /关闭当前大屏链接/);
    assert.match(tabSource, /phase:\s*"finished"/);
    assert.match(tabSource, /force:\s*true/);
    assert.match(tabSource, /setReviewScreenSessions/);
    assert.match(tabSource, /setScreenLiveData/);
    assert.match(tabSource, /onSuccess:\s*\(\)\s*=>\s*resetRoadshowStageLocalState\(group\)/);
    assert.match(contextSource, /onSuccess\?:\s*\(\) => void/);
    assert.match(contextSource, /options\?\.onSuccess\?\.\(\)/);
  });

  it("ignores stale projection project orders that do not match the current roadshow stage", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tabSource, /isProjectOrderAlignedWithGroup/);
    assert.match(tabSource, /liveOrder\?\.length && isProjectOrderAlignedWithGroup\(group,\s*liveOrder\)/);
    assert.match(tabSource, /const rawLiveData = screenLiveData\[group\.key\]/);
    assert.match(tabSource, /rawLiveData && isProjectOrderAlignedWithGroup\(group,\s*rawLiveData\.projectOrder\)/);
    assert.match(tabSource, /投屏项目数与当前本轮项目不一致/);
  });

  it("shows roadshow project cards as status cards rather than project switching controls", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tabSource, /项目卡片只展示顺序、提交和分数/);
    assert.doesNotMatch(tabSource, /onClick=\{\(\) => setActiveGroupKey\(group\.key\)\}/);
    assert.doesNotMatch(tabSource, /切换到该项目/);
  });

  it("deletes review configuration by project stage instead of only the active roadshow group", () => {
    const assignmentItemRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const contextSource = readSource("src/components/workspace-context.tsx");
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(assignmentItemRouteSource, /const deleteScope = request\.nextUrl\.searchParams\.get\("scope"\)/);
    assert.match(assignmentItemRouteSource, /deleteScope === "stage"/);
    assert.match(assignmentItemRouteSource, /packagesToDelete/);
    assert.match(assignmentItemRouteSource, /projectReviewStageId:\s*assignment\.reviewPackage\.projectReviewStageId/);
    assert.match(contextSource, /searchParams\.set\("scope",\s*"stage"\)/);
    assert.match(contextSource, /删除本阶段全部评审配置/);
    assert.match(tabSource, /deleteReviewStageAssignments/);
    assert.match(tabSource, /activeStageHasLockedScore/);
    assert.doesNotMatch(tabSource, /取消本阶段评审配置[\s\S]{0,600}deleteReviewAssignment\(activeGroup\.items\[0\]\.id/);
  });

  it("collapses finished roadshow projects so other simultaneous projects remain visible", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tabSource, /roadshowGroupCards/);
    assert.match(tabSource, /activeRoadshowConsoleFinished/);
    assert.match(tabSource, /本轮已结束，已收起现场控制台/);
    assert.match(tabSource, /当前控制中/);
    assert.match(tabSource, /等待按顺序推进/);
    assert.match(tabSource, /renderRoadshowGroupCards/);
    assert.doesNotMatch(tabSource, /activeGroupIsRoadshow && activeGroup \? \(\s*<main className="space-y-5">\s*\{renderReviewScreenConsole\(activeGroup\)\}/);
  });

  it("requires two confirmations before deleting scored review packages and linked project stages", () => {
    const assignmentItemRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const stageDeleteRouteSource = readSource("src/app/api/project-stages/[stageId]/route.ts");
    const contextSource = readSource("src/components/workspace-context.tsx");
    const projectTabSource = readSource("src/components/tabs/project-tab.tsx");
    const expertReviewTabSource = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(assignmentItemRouteSource, /const confirm = request\.nextUrl\.searchParams\.get\("confirm"\)/);
    assert.match(assignmentItemRouteSource, /confirm\s*!==\s*"permanent"/);
    assert.match(assignmentItemRouteSource, /评审包已重置，可重新配置/);
    assert.match(stageDeleteRouteSource, /const confirm = request\.nextUrl\.searchParams\.get\("confirm"\)/);
    assert.match(stageDeleteRouteSource, /confirm\s*!==\s*"permanent"/);
    assert.match(stageDeleteRouteSource, /已有正式评分，请先完成二次确认后永久删除/);
    assert.match(contextSource, /openSecondConfirmDialog/);
    assert.match(contextSource, /二次确认重置/);
    assert.match(contextSource, /确认重置/);
    assert.match(projectTabSource, /permanent:\s*stage\.reviewConfig\?\.status === "archived"/);
    assert.match(projectTabSource, /永久删除已归档阶段/);
    assert.match(expertReviewTabSource, /重置并重新配置本阶段/);
  });

  it("keeps upload windows and expert review windows separate with backend enforcement", () => {
    const assignmentRouteSource = readSource("src/app/api/expert-reviews/assignments/route.ts");
    const assignmentItemRouteSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const stageDeleteRouteSource = readSource("src/app/api/project-stages/[stageId]/route.ts");
    const contextSource = readSource("src/components/workspace-context.tsx");

    assert.match(assignmentRouteSource, /projectReviewStage\.deadline/);
    assert.match(assignmentRouteSource, /isOpen:\s*true/);
    assert.match(assignmentRouteSource, /projectReviewStage\.isOpen\s*!==\s*false/);
    assert.match(assignmentRouteSource, /如需提前评审，请先在项目管理中关闭学生上传/);
    assert.match(assignmentItemRouteSource, /const projectReviewStage = assignment\.reviewPackage\.projectReviewStage/);
    assert.match(assignmentItemRouteSource, /isOpen:\s*true/);
    assert.match(assignmentItemRouteSource, /projectReviewStage\?\.isOpen\s*!==\s*false/);
    assert.match(assignmentItemRouteSource, /如需提前评审，请先在项目管理中关闭学生上传/);
    assert.match(contextSource, /selectedStage\?\.isOpen\s*!==\s*false[\s\S]*selectedStage\?\.deadline/);
    assert.match(contextSource, /如需提前评审，请先在项目管理中关闭学生上传/);
    assert.match(stageDeleteRouteSource, /expertReviewScore\.findFirst/);
    assert.match(stageDeleteRouteSource, /已有正式评分，请先完成二次确认后永久删除/);
    assert.match(stageDeleteRouteSource, /prisma\.\$transaction/);
    assert.match(stageDeleteRouteSource, /expertReviewPackage\.deleteMany/);
    assert.match(stageDeleteRouteSource, /projectReviewStage\.delete/);
  });
});
