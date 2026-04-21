import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-dashboard.tsx"),
  "utf8",
);
const nextConfigSource = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

test("workspace dashboard uses next/image for avatars", () => {
  assert.match(dashboardSource, /import Image from "next\/image";/);

  const avatarComponentStart = dashboardSource.indexOf("function UserAvatar(");
  const dashboardStart = dashboardSource.indexOf("export function WorkspaceDashboard(");
  const avatarBlock = dashboardSource.slice(avatarComponentStart, dashboardStart);

  assert.match(avatarBlock, /<Image/);
  assert.doesNotMatch(avatarBlock, /<img/);
});

test("next config keeps response compression enabled", () => {
  assert.match(nextConfigSource, /compress:\s*true/);
});
