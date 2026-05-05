import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { generateTemporaryPassword } from "../src/lib/passwords";

const readSource = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

test("cron reminder endpoint requires CRON_SECRET in production", () => {
  const route = readSource("src/app/api/cron/daily-report-reminders/route.ts");

  assert.match(route, /process\.env\.NODE_ENV === "production"/);
  assert.match(route, /CRON_SECRET 未配置/);
  assert.match(route, /authorization !== `Bearer \$\{cronSecret\}`/);
});

test("admin-created accounts do not fall back to the fixed 123456 password", () => {
  const teamRoute = readSource("src/app/api/team/route.ts");
  const batchExpertsRoute = readSource("src/app/api/team/batch-experts/route.ts");
  const profileAccountRoute = readSource("src/app/api/team/expert-profiles/[id]/account/route.ts");
  const workspaceContext = readSource("src/components/workspace-context.tsx");
  const workspaceShell = readSource("src/components/workspace-shell.tsx");

  assert.match(teamRoute, /generateTemporaryPassword/);
  assert.match(batchExpertsRoute, /generateTemporaryPassword/);
  assert.match(profileAccountRoute, /generateTemporaryPassword/);
  assert.doesNotMatch(teamRoute, /const defaultPassword = "123456"/);
  assert.doesNotMatch(batchExpertsRoute, /const defaultExpertPassword = "123456"/);
  assert.doesNotMatch(profileAccountRoute, /const defaultExpertPassword = "123456"/);
  assert.doesNotMatch(workspaceContext, /默认 123456|\"123456\"/);
  assert.doesNotMatch(workspaceShell, /默认使用 123456|王老师,expertwang,123456/);
});

test("temporary passwords are not predictable fixed values", () => {
  const passwords = Array.from({ length: 20 }, () => generateTemporaryPassword());

  assert.equal(passwords.every((password) => password.length >= 8), true);
  assert.equal(passwords.includes("123456"), false);
  assert.ok(new Set(passwords).size > 1);
  assert.equal(
    passwords.every((password) =>
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      /[@#$%]/.test(password),
    ),
    true,
  );
});
