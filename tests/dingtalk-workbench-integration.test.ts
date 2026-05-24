import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (filePath: string) => readFileSync(path.join(process.cwd(), filePath), "utf8");

test("schema stores DingTalk binding identifiers without replacing normal login", () => {
  const schema = readSource("prisma/schema.prisma");

  assert.match(schema, /model DingTalkAccount/);
  assert.match(schema, /corpId\s+String/);
  assert.match(schema, /userIdInCorp\s+String/);
  assert.match(schema, /unionId\s+String\?/);
  assert.match(schema, /boundAt\s+DateTime/);
  assert.match(schema, /@@unique\(\[corpId,\s*userIdInCorp\]\)/);
});

test("DingTalk client reads credentials from env and exchanges authCode server-side", () => {
  const source = readSource("src/lib/dingtalk.ts");

  assert.match(source, /DINGTALK_CORP_ID/);
  assert.match(source, /DINGTALK_AGENT_ID/);
  assert.match(source, /DINGTALK_APP_KEY/);
  assert.match(source, /DINGTALK_APP_SECRET/);
  assert.match(source, /\/v1\.0\/oauth2\/accessToken/);
  assert.match(source, /topapi\/v2\/user\/getuserinfo/);
  assert.doesNotMatch(source, /DINGTALK_APP_SECRET\s*[:=]\s*["']/);
});

test("DingTalk workbench entry page requests auth code and explains unbound accounts", () => {
  const page = readSource("src/app/dingtalk/page.tsx");
  const component = readSource("src/components/dingtalk-entry.tsx");

  assert.match(page, /getDingTalkPublicConfig/);
  assert.match(component, /requestAuthCode/);
  assert.match(component, /\/api\/dingtalk\/auth/);
  assert.match(component, /\/api\/dingtalk\/bind/);
  assert.match(component, /当前钉钉账号尚未绑定/);
  assert.match(component, /南京铁道职业技术学院[\s\S]*大赛管理平台/);
});

test("DingTalk auth routes set the platform session cookie after bound login or password binding", () => {
  const authRoute = readSource("src/app/api/dingtalk/auth/route.ts");
  const bindRoute = readSource("src/app/api/dingtalk/bind/route.ts");

  assert.match(authRoute, /getDingTalkUserByAuthCode/);
  assert.match(authRoute, /dingTalkAccount/);
  assert.match(authRoute, /signAuthToken/);
  assert.match(authRoute, /setAuthCookie/);
  assert.match(bindRoute, /bcrypt\.compare/);
  assert.match(bindRoute, /boundAt/);
  assert.match(bindRoute, /setAuthCookie/);
});
