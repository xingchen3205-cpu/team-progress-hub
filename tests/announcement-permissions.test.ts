import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const readSource = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

const roleBlock = (source: string, role: string, nextRole: string) => {
  const match = source.match(new RegExp(`${role}:\\s*\\{[\\s\\S]*?\\n  ${nextRole}:`));
  assert.ok(match, `missing ${role} permission block`);
  return match[0];
};

test("announcement publishing is limited to global administrator roles", () => {
  const contextSource = readSource("src/components/workspace-context.tsx");

  assert.match(roleBlock(contextSource, "admin", "school_admin"), /canPublishAnnouncement:\s*true/);
  assert.match(roleBlock(contextSource, "school_admin", "teacher"), /canPublishAnnouncement:\s*true/);
  assert.match(roleBlock(contextSource, "teacher", "leader"), /canPublishAnnouncement:\s*false/);
  assert.match(roleBlock(contextSource, "leader", "member"), /canPublishAnnouncement:\s*false/);
  assert.match(roleBlock(contextSource, "member", "expert"), /canPublishAnnouncement:\s*false/);
  assert.match(contextSource, /expert:\s*\{[\s\S]*?canPublishAnnouncement:\s*false/);
});

test("topbar hides the publish announcement action for roles without permission", () => {
  const shellSource = readSource("src/components/workspace-shell.tsx");
  const topbarStart = shellSource.indexOf('<header className="topbar-enhanced relative z-50 mx-auto max-w-[1200px]');
  const contentStart = shellSource.indexOf('<div className="mx-auto mt-4 flex max-w-[1200px] flex-col gap-4">', topbarStart);
  const topbarBlock = shellSource.slice(topbarStart, contentStart);

  assert.match(topbarBlock, /\{permissions\.canPublishAnnouncement \? \(/);
  assert.match(topbarBlock, /className="topbar-action-primary"/);
  assert.match(topbarBlock, /\) : null\}/);
  assert.doesNotMatch(topbarBlock, /disabled=\{!permissions\.canPublishAnnouncement\}/);
});

test("announcement create and delete routes reject teacher and leader roles", () => {
  const createRoute = readSource("src/app/api/announcements/route.ts");
  const deleteRoute = readSource("src/app/api/announcements/[id]/route.ts");

  assert.match(createRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(deleteRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.doesNotMatch(createRoute, /assertRole\(user\.role,\s*\[[^\]]*"teacher"[^\]]*\]\)/);
  assert.doesNotMatch(createRoute, /assertRole\(user\.role,\s*\[[^\]]*"leader"[^\]]*\]\)/);
  assert.doesNotMatch(deleteRoute, /assertRole\(user\.role,\s*\[[^\]]*"teacher"[^\]]*\]\)/);
  assert.doesNotMatch(deleteRoute, /assertRole\(user\.role,\s*\[[^\]]*"leader"[^\]]*\]\)/);
  assert.doesNotMatch(createRoute, /user\.role === "teacher"/);
});

test("seed and demo copy no longer describes teachers as announcement publishers", () => {
  const demoData = readSource("src/data/demo-data.ts");
  const seed = readSource("prisma/seed.ts");

  assert.doesNotMatch(demoData, /发布公告和校内资源协调/);
  assert.doesNotMatch(seed, /发布公告和校内资源协调/);
});
