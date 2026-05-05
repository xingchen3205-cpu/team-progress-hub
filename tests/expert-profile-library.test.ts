import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (filePath: string) => readFileSync(path.join(process.cwd(), filePath), "utf8");

test("expert profile library is stored separately from login accounts", () => {
  const schemaSource = readSource("prisma/schema.prisma");

  assert.match(schemaSource, /model ExpertProfile/);
  assert.match(schemaSource, /specialtyTags\s+String/);
  assert.match(schemaSource, /specialtyTracks\s+String/);
  assert.match(schemaSource, /linkedUserId\s+String\?\s+@unique/);
  assert.match(schemaSource, /linkedUser\s+User\?\s+@relation\("ExpertProfileAccount"/);
});

test("expert profile APIs are reserved to system and school administrators", () => {
  const listRouteSource = readSource("src/app/api/team/expert-profiles/route.ts");
  const itemRouteSource = readSource("src/app/api/team/expert-profiles/[id]/route.ts");
  const accountRouteSource = readSource("src/app/api/team/expert-profiles/[id]/account/route.ts");

  assert.match(listRouteSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(itemRouteSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(accountRouteSource, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(accountRouteSource, /role:\s*"expert"/);
  assert.match(accountRouteSource, /linkedUserId:\s*createdUser\.id/);
});

test("team management exposes expert library fields and account opening action", () => {
  const contextSource = readSource("src/components/workspace-context.tsx");
  const teamTabSource = readSource("src/components/tabs/team-tab.tsx");
  const shellSource = readSource("src/components/workspace-shell.tsx");

  assert.match(contextSource, /ExpertProfileItem/);
  assert.match(contextSource, /expertProfiles/);
  assert.match(contextSource, /saveExpertProfile/);
  assert.match(contextSource, /openExpertProfileAccount/);

  assert.match(teamTabSource, /专家库/);
  assert.match(teamTabSource, /专业领域/);
  assert.match(teamTabSource, /擅长赛道/);
  assert.match(teamTabSource, /开通账号/);

  assert.match(shellSource, /专家姓名/);
  assert.match(shellSource, /工作单位/);
  assert.match(shellSource, /职务/);
  assert.match(shellSource, /擅长赛道/);
  assert.match(shellSource, /专业领域/);
});

test("expert profile library supports fast filtering by profile metadata", () => {
  const teamTabSource = readSource("src/components/tabs/team-tab.tsx");

  assert.match(teamTabSource, /expertProfileSearch/);
  assert.match(teamTabSource, /filteredExpertProfiles/);
  assert.match(teamTabSource, /搜索姓名、单位、领域或赛道/);
  assert.match(teamTabSource, /profile\.specialtyTags/);
  assert.match(teamTabSource, /profile\.specialtyTracks/);
  assert.match(teamTabSource, /未找到匹配专家/);
});
