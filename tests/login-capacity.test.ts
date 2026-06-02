import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { authRateLimits } from "../src/lib/security";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

test("login rate limits allow shared-campus bursts while keeping account brute-force protection", () => {
  assert.equal(authRateLimits.loginIp.windowMs, 60_000);
  assert.ok(authRateLimits.loginIp.max >= 200);
  assert.equal(authRateLimits.loginAccount.windowMs, 10 * 60_000);
  assert.ok(authRateLimits.loginAccount.max <= 8);
});

test("successful login audit logging does not block the response", () => {
  const loginRouteSource = read("src/app/api/auth/login/route.ts");
  const successStart = loginRouteSource.indexOf("const response = NextResponse.json({\n    token,");
  const successEnd = loginRouteSource.indexOf("return response", successStart);
  const successBlock = loginRouteSource.slice(successStart, successEnd);

  assert.match(loginRouteSource, /import \{ after, NextRequest, NextResponse \} from "next\/server"/);
  assert.match(successBlock, /after\(\(\)\s*=>[\s\S]*prisma[\s\S]*\.\$transaction/);
  assert.doesNotMatch(successBlock, /await prisma\.\$transaction/);
});

test("province access serialization uses existence checks instead of count scans", () => {
  const accessSource = read("src/lib/teacher-training-access.ts");

  assert.match(accessSource, /teacherTrainingParticipant\.findFirst/);
  assert.match(accessSource, /teacherTrainingCohortManager\.findFirst/);
  assert.doesNotMatch(accessSource, /teacherTrainingParticipant\.count/);
  assert.doesNotMatch(accessSource, /teacherTrainingCohortManager\.count/);
});
