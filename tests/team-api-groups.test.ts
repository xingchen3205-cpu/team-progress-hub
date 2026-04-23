import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("team api route returns all groups for global admin", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/team/route.ts"),
    "utf8",
  );

  assert.match(source, /hasGlobalAdminPrivileges\(user\.role\)/);
  assert.match(source, /prisma\.teamGroup\.findMany\(\{/);
});

test("team api route filters groups by user teamGroupId for non-admin", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/team/route.ts"),
    "utf8",
  );

  const getBlock = source.slice(source.indexOf("export async function GET"));
  const groupsIndex = getBlock.indexOf("const groups");
  const groupsBlock = getBlock.slice(groupsIndex, getBlock.indexOf("return NextResponse.json", groupsIndex));

  assert.match(groupsBlock, /user\.teamGroupId/);
  assert.match(groupsBlock, /where:\s*\{\s*id:\s*user\.teamGroupId\s*\}/);
});

test("team api route returns empty groups for unbound non-admin", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/team/route.ts"),
    "utf8",
  );

  const getBlock = source.slice(source.indexOf("export async function GET"));
  const groupsIndex = getBlock.indexOf("const groups");
  const groupsBlock = getBlock.slice(groupsIndex, getBlock.indexOf("return NextResponse.json", groupsIndex));

  assert.match(groupsBlock, /:\s*\[\]/);
});

test("team api route does not expose all groups to non-admins", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/team/route.ts"),
    "utf8",
  );

  const getBlock = source.slice(source.indexOf("export async function GET"));
  const groupsIndex = getBlock.indexOf("const groups");
  const groupsBlock = getBlock.slice(groupsIndex, getBlock.indexOf("return NextResponse.json", groupsIndex));

  assert.doesNotMatch(groupsBlock, /:\s*\[\][\s\S]*?prisma\.teamGroup\.findMany\(\{[\s\S]*?orderBy/);
});
