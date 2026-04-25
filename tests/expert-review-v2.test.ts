import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

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

  it("locks expert scores after first submission and stores all scores as cents", () => {
    const routeSource = readSource("src/app/api/expert-reviews/scores/route.ts");

    assert.match(routeSource, /assignment\.score/);
    assert.match(routeSource, /评分已提交，不能修改/);
    assert.doesNotMatch(routeSource, /expertReviewScore\.upsert/);
    assert.match(routeSource, /Math\.round\(simpleTotalScore \* 100\)/);
    assert.match(routeSource, /Number\.isInteger\(simpleTotalScore \* 100\)/);
    assert.match(routeSource, /lockedAt:\s*submittedAt/);
  });

  it("filters expired expert assignments and material previews for expert accounts", () => {
    const scopeSource = readSource("src/lib/team-scope.ts");
    const materialSource = readSource("src/app/api/expert-reviews/assignments/[id]/materials/[kind]/route.ts");

    assert.match(scopeSource, /reviewPackage:\s*\{\s*OR:\s*\[/);
    assert.match(scopeSource, /deadline:\s*\{\s*gt:\s*now\s*\}/);
    assert.match(materialSource, /评审已截止/);
    assert.match(materialSource, /getExpertReviewLockState/);
  });

  it("replaces the old four-category expert scoring UI with v2 expert review panels", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab.tsx");

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
    const tabSource = readSource("src/components/tabs/expert-review-tab.tsx");
    const shellSource = readSource("src/components/workspace-shell.tsx");

    assert.match(tabSource, /ExpertScoreSuccessModal/);
    assert.match(tabSource, /评分提交成功/);
    assert.match(tabSource, /fixed inset-0 z-50 flex items-center justify-center/);
    assert.doesNotMatch(tabSource, /专家端 · 独立评审/);
    assert.doesNotMatch(tabSource, /系统会实时更新管理端和投屏数据/);
    assert.doesNotMatch(tabSource, /管理端和投屏数据已同步刷新/);
    assert.match(shellSource, /currentRole === "expert"/);
    assert.match(shellSource, /EXPERT REVIEW PORTAL/);
  });

  it("renders expert accounts in a standalone review portal shell", () => {
    const shellSource = readSource("src/components/workspace-shell.tsx");
    const tabSource = readSource("src/components/tabs/expert-review-tab.tsx");

    assert.match(shellSource, /currentRole === "expert"/);
    assert.match(shellSource, /EXPERT REVIEW PORTAL/);
    assert.match(shellSource, /大学生创新大赛评审系统/);
    assert.doesNotMatch(
      shellSource.match(/if \(currentRole === "expert"\)[\s\S]*?return \(/)?.[0] ?? "",
      /sidebar-nav-item|发布公告|搜索任务、文档、成员/,
    );
    assert.match(tabSource, /请选择本轮评审任务/);
    assert.match(tabSource, /系统仅展示管理员已分配给您的评审任务/);
    assert.match(tabSource, /bg-gradient-to-br from-white to-blue-50\/55/);
  });

  it("uses the polished expert review flow layout for task entry, list, and scoring", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab.tsx");

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
    const tabSource = readSource("src/components/tabs/expert-review-tab.tsx");

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
    assert.doesNotMatch(shellSource, /评审对象 \/ 项目名称/);
    assert.doesNotMatch(shellSource, /和主文档中心完全分离/);
    assert.match(tabSource, /项目管理已生效材料/);
  });

  it("uses current Beijing date or selected project stage deadline instead of stale hardcoded review deadline", () => {
    const contextSource = readSource("src/components/workspace-context.tsx");
    const shellSource = readSource("src/components/workspace-shell.tsx");

    assert.doesNotMatch(contextSource, /2026-04-10T18:00/);
    assert.match(contextSource, /getDefaultReviewAssignmentDeadline/);
    assert.match(contextSource, /formatBeijingDateTimeInput/);
    assert.match(shellSource, /selectedStage\?\.deadline/);
    assert.match(shellSource, /deadline:\s*selectedStage\?\.deadline\s*\?/);
  });

  it("allows administrators to edit review packages without deleting submitted expert scores", () => {
    const routeSource = readSource("src/app/api/expert-reviews/assignments/[id]/route.ts");
    const contextSource = readSource("src/components/workspace-context.tsx");
    const tabSource = readSource("src/components/tabs/expert-review-tab.tsx");

    assert.match(routeSource, /export async function PATCH/);
    assert.match(routeSource, /已有评分的专家不能从本轮移除/);
    assert.match(routeSource, /createMany/);
    assert.match(contextSource, /reviewAssignmentEditAssignmentId/);
    assert.match(contextSource, /method:\s*"PATCH"/);
    assert.match(tabSource, /编辑当前评审包/);
  });
});
