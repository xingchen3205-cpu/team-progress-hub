import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (filePath: string) => readFileSync(path.join(process.cwd(), filePath), "utf8");

const extractRoleBlock = (source: string, role: string) => {
  const marker = `  ${role}: {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing role block: ${role}`);
  const roleMarkers = ["admin", "school_admin", "teacher", "leader", "member", "expert"]
    .filter((candidate) => candidate !== role)
    .map((candidate) => source.indexOf(`  ${candidate}: {`, start + marker.length))
    .filter((index) => index !== -1);
  const nextRole = roleMarkers.length > 0 ? Math.min(...roleMarkers) : -1;
  return source.slice(start, nextRole === -1 ? undefined : nextRole);
};

test("system logs are registered as a system administrator only workspace tab", () => {
  const contextSource = read("src/components/workspace-context.tsx");
  const dashboardSource = read("src/components/workspace-dashboard.tsx");
  const workspacePageSource = read("src/app/workspace/page.tsx");

  assert.match(contextSource, /\|\s*"systemLogs"/);
  assert.match(contextSource, /key:\s*"systemLogs"[\s\S]*?label:\s*"系统日志"/);
  assert.match(extractRoleBlock(contextSource, "admin"), /"systemLogs"/);
  assert.doesNotMatch(extractRoleBlock(contextSource, "school_admin"), /"systemLogs"/);

  assert.match(dashboardSource, /SystemLogsTab/);
  assert.match(dashboardSource, /safeActiveTab === "systemLogs"/);
  assert.match(workspacePageSource, /validTabs\s*=\s*\[[\s\S]*?"systemLogs"/);
});

test("system logs api is readable only by system administrators", () => {
  const routePath = "src/app/api/system-logs/route.ts";
  assert.equal(existsSync(path.join(process.cwd(), routePath)), true);

  const routeSource = read(routePath);
  assert.match(routeSource, /user\.role !== "admin"/);
  assert.doesNotMatch(routeSource, /user\.role\s*===\s*"school_admin"[\s\S]*?logs:/);
  assert.match(routeSource, /operatorRole/);
  assert.match(routeSource, /beforeState/);
  assert.match(routeSource, /afterState/);
  assert.match(routeSource, /actionLabel/);
});

test("workspace page views and auth events are written to audit logs", () => {
  const accessRoutePath = "src/app/api/system-logs/access/route.ts";
  assert.equal(existsSync(path.join(process.cwd(), accessRoutePath)), true);

  const accessRouteSource = read(accessRoutePath);
  const shellSource = read("src/components/workspace-shell.tsx");
  const loginRouteSource = read("src/app/api/auth/login/route.ts");
  const logoutRouteSource = read("src/app/api/auth/logout/route.ts");

  assert.match(accessRouteSource, /workspace\.page_view/);
  assert.match(accessRouteSource, /createAuditLogEntry/);
  assert.match(shellSource, /\/api\/system-logs\/access/);
  assert.match(loginRouteSource, /auth\.login\.success/);
  assert.match(logoutRouteSource, /auth\.logout/);
});

test("system logs tab keeps the audit UI readable instead of dumping raw json", () => {
  const tabPath = "src/components/tabs/system-logs-tab.tsx";
  assert.equal(existsSync(path.join(process.cwd(), tabPath)), true);

  const tabSource = read(tabPath);
  assert.match(tabSource, /系统日志/);
  assert.match(tabSource, /访问记录/);
  assert.match(tabSource, /关键操作/);
  assert.match(tabSource, /时间 \/ 操作人 \/ 操作内容/);
  assert.match(tabSource, /详情/);
  assert.match(tabSource, /formatAuditJson/);
  assert.doesNotMatch(tabSource, /<pre[^>]*>\{JSON\.stringify\(log\)/);
});
