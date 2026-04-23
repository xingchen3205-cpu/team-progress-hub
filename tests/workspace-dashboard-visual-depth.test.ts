import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("overview-tab uses campus-welcome-banner class", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.match(source, /campus-welcome-banner/);
});

test("overview-tab references login-campus.jpg", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.match(source, /\/login-campus\.jpg/);
});

test("overview-tab contains system full name", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.match(source, /中国国际大学生创新大赛管理系统/);
});

test("overview-tab keeps all required module titles", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.match(source, /业务进度/);
  assert.match(source, /赛事日程/);
  assert.match(source, /紧急事项/);
  assert.match(source, /今日汇报/);
  assert.match(source, /通知公告/);
});

test("overview-tab removes old module labels", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/tabs/overview-tab.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /快捷办理提示/);
  assert.doesNotMatch(source, /今日工作提示/);
  assert.doesNotMatch(source, /优先关注/);
  assert.doesNotMatch(source, /业务办理/);
});

test("workspace-shell brand area contains full system name and school", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/workspace-shell.tsx"),
    "utf8",
  );
  assert.match(source, /中国国际大学生创新大赛管理系统/);
  assert.match(source, /南京铁道职业技术学院/);
  assert.match(source, /智在必行/);
});
