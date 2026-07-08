import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("self registration and register email code endpoints are closed", () => {
  const route = readSource("src/app/api/auth/register/route.ts");
  const emailCodeRoute = readSource("src/app/api/auth/register/email-code/route.ts");

  assert.match(route, /暂不开放自助注册/);
  assert.match(route, /status:\s*403/);
  assert.match(emailCodeRoute, /暂不开放自助注册/);
  assert.match(emailCodeRoute, /status:\s*403/);
  assert.doesNotMatch(route, /verifyEmailVerificationCode/);
  assert.doesNotMatch(emailCodeRoute, /generateEmailVerificationCode/);
  assert.doesNotMatch(route, /employeeId/);
});

test("registration screen keeps the form dormant and hides self registration entry", () => {
  const screen = readSource("src/components/login-screen.tsx");

  assert.match(screen, /selfRegistrationEnabled\s*=\s*false/);
  assert.doesNotMatch(screen, /账号由系统管理员或校级管理员统一开通/);
  assert.doesNotMatch(screen, /请使用管理员分配的账号登录/);
  assert.match(screen, /emailCode/);
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
