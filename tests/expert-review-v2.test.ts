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

  it("replaces the old four-category expert scoring UI with v2 expert and projection panels", () => {
    const tabSource = readSource("src/components/tabs/expert-review-tab.tsx");

    assert.match(tabSource, /项目网络评审/);
    assert.match(tabSource, /项目路演评审/);
    assert.match(tabSource, /确认提交/);
    assert.match(tabSource, /路演管理后台/);
    assert.match(tabSource, /投屏模式/);
    assert.match(tabSource, /提交评分/);
    assert.match(tabSource, /toFixed\(2\)/);

    assert.doesNotMatch(tabSource, /评审规则设置/);
    assert.doesNotMatch(tabSource, /路演投屏与评分规则/);
    assert.doesNotMatch(tabSource, /个人成长/);
    assert.doesNotMatch(tabSource, /项目创新/);
    assert.doesNotMatch(tabSource, /产业价值/);
    assert.doesNotMatch(tabSource, /团队协作/);
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
});
