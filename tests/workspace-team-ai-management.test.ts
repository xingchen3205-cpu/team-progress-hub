import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const teamSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/team-tab.tsx"),
  "utf8",
);

test("team tab merges AI permission controls into the team account table", () => {
  assert.match(teamSource, /全部 AI 状态/);
  assert.match(teamSource, /总成员数/);
  assert.match(teamSource, /已开启 AI/);
  assert.match(teamSource, /累计已用/);
  assert.match(teamSource, /权限开关/);
  assert.match(teamSource, /次数配额/);
  assert.match(teamSource, /已用 \/ 配额/);
  assert.match(teamSource, /留空表示不限次数/);
  assert.match(teamSource, /批量开启权限/);
  assert.match(teamSource, /批量关闭权限/);
  assert.match(teamSource, /批量设置次数/);
  assert.match(teamSource, /批量重置次数/);
});

test("team tab keeps AI controls inside the team account section instead of a standalone card", () => {
  assert.match(teamSource, /团队账号/);
  assert.doesNotMatch(teamSource, /<h3 className=\"text-base font-semibold text-slate-900\">AI 权限管理<\/h3>/);
});

test("team tab keeps expert accounts outside group and AI permission controls", () => {
  assert.match(teamSource, /const isExpertAccountView = teamAccountView === "experts"/);
  assert.match(teamSource, /专家账号不参与项目组分组，也不开放 AI 助手权限/);
  assert.match(teamSource, /member\.systemRole === "评审专家"\s*\?\s*"专家账号"/);
  assert.match(teamSource, /!isExpertAccountView && hasGlobalAdminRole/);
  assert.match(teamSource, /!isExpertAccountView && canUseTeamGroups/);
  assert.match(teamSource, /!isExpertAccountView \? "权限开关" : "账号状态"/);
});

test("team account action buttons use visible semantic button styles", () => {
  assert.match(teamSource, /className="team-icon-button primary"/);
  assert.match(teamSource, /className="team-icon-button warning"/);
  assert.match(teamSource, /className="team-icon-button muted"/);
  assert.match(teamSource, /className="team-icon-button danger"/);
});

test("team account delete controls are hidden unless the current role can delete accounts", () => {
  const contextSource = readFileSync(
    path.join(process.cwd(), "src/components/workspace-context.tsx"),
    "utf8",
  );
  const apiSource = readFileSync(
    path.join(process.cwd(), "src/app/api/team/[id]/route.ts"),
    "utf8",
  );

  assert.match(contextSource, /canDeleteMemberAccount/);
  assert.match(teamSource, /canDeleteMemberAccount\(member\)\s*\?/);
  assert.doesNotMatch(teamSource, /permissions\.canManageTeam\s*\?\s*\(\s*<button[\s\S]*title="删除账号"/);
  assert.match(apiSource, /canDeleteUser\(user\.role,\s*target\.role\)/);
  assert.doesNotMatch(apiSource, /if \(!canManageUser\(user\.role,\s*target\.role\)\)[\s\S]*export async function DELETE/);
});

test("team account password reset controls are reserved to administrator roles", () => {
  const contextSource = readFileSync(
    path.join(process.cwd(), "src/components/workspace-context.tsx"),
    "utf8",
  );
  const apiSource = readFileSync(
    path.join(process.cwd(), "src/app/api/team/[id]/route.ts"),
    "utf8",
  );

  const teacherBlock = contextSource.match(/teacher:\s*\{[\s\S]*?\n  leader:/)?.[0] ?? "";
  const leaderBlock = contextSource.match(/leader:\s*\{[\s\S]*?\n  member:/)?.[0] ?? "";
  const resetPasswordBlock =
    contextSource.match(/const canResetMemberPassword = \(member: TeamMember\) => \{[\s\S]*?\n  \};\n\n  const canApprovePendingMember/)?.[0] ?? "";

  assert.match(teacherBlock, /canResetPassword:\s*false/);
  assert.match(leaderBlock, /canResetPassword:\s*false/);
  assert.match(resetPasswordBlock, /isSystemAdmin/);
  assert.match(resetPasswordBlock, /isSchoolAdmin/);
  assert.match(resetPasswordBlock, /return false/);
  assert.match(teamSource, /canResetMemberPassword\(member\)\s*\?/);
  assert.doesNotMatch(teamSource, /permissions\.canResetPassword\s*\?/);
  assert.match(apiSource, /canResetUserPassword\(user\.role,\s*target\.role\)/);
  assert.match(apiSource, /仅管理员可以重置账号密码/);
});

test("team management adopts the refined card and table visual system", () => {
  assert.match(teamSource, /team-page-shell/);
  assert.match(teamSource, /team-management-card/);
  assert.match(teamSource, /team-section-title/);
  assert.match(teamSource, /team-filter-bar/);
  assert.match(teamSource, /team-stat-grid/);
  assert.match(teamSource, /team-account-table/);
});

test("expert account view is visually separate and omits group or AI controls", () => {
  assert.match(teamSource, /team-expert-summary-card/);
  assert.match(teamSource, /仅开放专家评审，不参与分组和 AI 助手/);
  assert.match(teamSource, /专家账号不参与项目组分组，也不开放 AI 助手权限/);
  assert.match(teamSource, /!isExpertAccountView && hasGlobalAdminRole/);
  assert.match(teamSource, /!isExpertAccountView && canUseTeamGroups/);
});

test("team management removes local text search and clears stale team filters", () => {
  assert.doesNotMatch(teamSource, /搜索姓名或账号/);
  assert.doesNotMatch(teamSource, /value=\{teamSearch\}/);
  assert.match(teamSource, /setTeamSearch\(""\)/);
});

test("team account list excludes system admins and experts from project groups", () => {
  const contextSource = readFileSync(
    path.join(process.cwd(), "src/components/workspace-context.tsx"),
    "utf8",
  );
  const shellSource = readFileSync(
    path.join(process.cwd(), "src/components/workspace-shell.tsx"),
    "utf8",
  );

  assert.match(contextSource, /teamAccountRoleLabels/);
  assert.match(contextSource, /visibleCoreTeamMembers = visibleTeamMembers\.filter/);
  assert.match(contextSource, /teamAccountRoleLabels\.has\(member\.systemRole\)/);
  assert.match(shellSource, /getSidebarUserMeta/);
  assert.doesNotMatch(shellSource, />智在必行</);
});
