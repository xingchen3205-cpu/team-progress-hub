import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

test("registration schema stores verified email and applicant identity fields", () => {
  const schema = readSource("prisma/schema.prisma");

  assert.match(schema, /model EmailVerificationCode/);
  assert.match(schema, /emailVerifiedAt\s+DateTime\?/);
  assert.match(schema, /college\s+String\?/);
  assert.match(schema, /className\s+String\?/);
  assert.match(schema, /studentId\s+String\?/);
  assert.match(schema, /employeeId\s+String\?/);
});

test("registration exposes a dedicated email verification code endpoint", () => {
  const routePath = "src/app/api/auth/register/email-code/route.ts";

  assert.equal(existsSync(path.join(process.cwd(), routePath)), true);

  const route = readSource(routePath);
  assert.match(route, /export async function POST/);
  assert.match(route, /generateEmailVerificationCode/);
  assert.match(route, /hashEmailVerificationCode/);
  assert.match(route, /sendEmail/);
  assert.match(route, /isEmailConfigured/);
  assert.match(route, /authRateLimits\.registerEmailCodeIp/);
  assert.match(route, /注册邮箱验证码/);
});

test("self registration requires verified email code and applicant identity metadata", () => {
  const route = readSource("src/app/api/auth/register/route.ts");

  assert.match(route, /emailCode/);
  assert.match(route, /verifyEmailVerificationCode/);
  assert.match(route, /emailVerifiedAt:\s*new Date\(\)/);
  assert.match(route, /college/);
  assert.match(route, /className/);
  assert.match(route, /studentId/);
  assert.doesNotMatch(route, /employeeId/);
  assert.match(route, /项目负责人.*团队成员|团队成员.*项目负责人/s);
});

test("registration screen collects email code and role-specific identity fields", () => {
  const screen = readSource("src/components/login-screen.tsx");

  assert.match(screen, /获取验证码/);
  assert.match(screen, /emailCode/);
  assert.match(screen, /学院|院系|部门/);
  assert.match(screen, /专业班级/);
  assert.match(screen, /学号/);
  assert.doesNotMatch(screen, /工号/);
});

test("admin approval of pending accounts must assign a project group", () => {
  const route = readSource("src/app/api/team/[id]/route.ts");
  const tab = readSource("src/components/tabs/team-tab.tsx");
  const context = readSource("src/components/workspace-context.tsx");

  assert.match(route, /body\?\.action === "approve"/);
  assert.match(route, /teamGroupId/);
  assert.match(route, /审核通过前请选择项目组/);
  assert.match(route, /approvalStatus:\s*"approved"[\s\S]*teamGroupId/);
  assert.match(route, /sendEmail/);
  assert.match(route, /renderSystemEmail/);
  assert.match(route, /buildAppUrl\("\/login"\)/);
  assert.match(route, /账号审核已通过/);
  assert.match(route, /立即登录/);
  assert.match(route, /Registration approval email failed/);
  assert.match(tab, /审核分组/);
  assert.match(tab, /approvalGroupDrafts/);
  assert.match(context, /approveMemberRegistrationRequest = async \(memberId: string,\s*teamGroupId: string\)/);
});
