import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("doc-helper login route checks service secret and returns user object", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/integrations/doc-helper/auth/login/route.ts"),
    "utf8",
  );

  assert.match(source, /X-Doc-Helper-Secret/);
  assert.match(source, /DOC_HELPER_SECRET/);
  assert.match(source, /prisma\.user\.findFirst/);
  assert.match(source, /bcrypt\.compare/);
  assert.match(source, /approvalStatus/);
  assert.match(source, /ok:\s*true/);
  assert.match(source, /ok:\s*false/);
  assert.match(source, /user:\s*\{/);
  assert.match(source, /id:\s*user\.id/);
  assert.match(source, /username:\s*user\.username/);
  assert.match(source, /role:\s*user\.role/);
  assert.doesNotMatch(source, /setAuthCookie/);
  assert.doesNotMatch(source, /setAuthCookie/);
});

test("doc-helper validate route checks secret and returns validity with user", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/integrations/doc-helper/auth/validate/route.ts"),
    "utf8",
  );

  assert.match(source, /X-Doc-Helper-Secret/);
  assert.match(source, /DOC_HELPER_SECRET/);
  assert.match(source, /prisma\.user\.findUnique/);
  assert.match(source, /ok:\s*true/);
  assert.match(source, /valid:\s*true/);
  assert.match(source, /valid:\s*false/);
  assert.match(source, /user_id/);
  assert.match(source, /approvalStatus/);
});

test("doc-helper auth routes do not set cookies", () => {
  const loginSource = readFileSync(
    path.join(process.cwd(), "src/app/api/integrations/doc-helper/auth/login/route.ts"),
    "utf8",
  );
  const validateSource = readFileSync(
    path.join(process.cwd(), "src/app/api/integrations/doc-helper/auth/validate/route.ts"),
    "utf8",
  );

  assert.doesNotMatch(loginSource, /setAuthCookie/);
  assert.doesNotMatch(loginSource, /cookies\(\)/);
  assert.doesNotMatch(validateSource, /setAuthCookie/);
  assert.doesNotMatch(validateSource, /cookies\(\)/);
});

test("doc-helper login route returns 403 for invalid service secret", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/integrations/doc-helper/auth/login/route.ts"),
    "utf8",
  );
  // login route uses a forbidden() helper for service secret errors
  const secretBlock = source.match(/X-Doc-Helper-Secret[\s\S]{0,400}/)?.[0] ?? "";
  assert.match(secretBlock, /forbidden\("服务密钥无效"\)/);
  // ensure forbidden helper sets 403 somewhere in the file
  assert.match(source, /status:\s*403/);
});

test("doc-helper validate route returns 403 for invalid service secret", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/integrations/doc-helper/auth/validate/route.ts"),
    "utf8",
  );
  const secretBlock = source.match(/X-Doc-Helper-Secret[\s\S]{0,400}/)?.[0] ?? "";
  assert.match(secretBlock, /status:\s*403/);
});
