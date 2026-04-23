import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const contextSource = readFileSync(
  path.join(process.cwd(), "src/components/workspace-context.tsx"),
  "utf8",
);
const nextConfigSource = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

test("workspace dashboard uses next/image for avatars", () => {
  assert.match(contextSource, /import Image from "next\/image";/);

  const avatarComponentStart = contextSource.indexOf("export function UserAvatar(");
  const dashboardStart = contextSource.indexOf("function useWorkspaceController(");
  const avatarBlock = contextSource.slice(avatarComponentStart, dashboardStart);

  assert.match(avatarBlock, /<Image/);
  assert.doesNotMatch(avatarBlock, /<img/);
});

test("text avatar fallback is centered by default", () => {
  const avatarComponentStart = contextSource.indexOf("export function UserAvatar(");
  const dashboardStart = contextSource.indexOf("function useWorkspaceController(");
  const avatarBlock = contextSource.slice(avatarComponentStart, dashboardStart);

  assert.match(avatarBlock, /flex items-center justify-center/);
  assert.match(avatarBlock, /text-sm font-semibold leading-none/);
});

test("next config keeps response compression enabled", () => {
  assert.match(nextConfigSource, /compress:\s*true/);
});
