import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (filePath: string) => readFileSync(path.join(process.cwd(), filePath), "utf8");

test("documents are scoped by persisted teamGroupId instead of owner current group", () => {
  const schemaSource = read("prisma/schema.prisma");
  const documentsRoute = read("src/app/api/documents/route.ts");
  const documentRoute = read("src/app/api/documents/[id]/route.ts");
  const downloadRoute = read("src/app/api/documents/[id]/download/route.ts");
  const previewRoute = read("src/app/api/documents/[id]/preview/route.ts");
  const reviewRoute = read("src/app/api/documents/[id]/review/route.ts");
  const versionRoute = read("src/app/api/documents/[id]/version/route.ts");

  assert.match(schemaSource, /model Document \{[\s\S]*?teamGroupId\s+String\?/);
  assert.match(schemaSource, /model Document \{[\s\S]*?teamGroup\s+TeamGroup\?/);
  assert.match(schemaSource, /model Document \{[\s\S]*?@@index\(\[teamGroupId\]\)/);
  assert.match(documentsRoute, /teamGroupId:\s*user\.teamGroupId \?\? null/);

  for (const source of [documentRoute, downloadRoute, previewRoute, reviewRoute, versionRoute]) {
    assert.match(source, /teamGroupId:\s*document\.teamGroupId/);
    assert.doesNotMatch(source, /teamGroupId:\s*document\.owner\.teamGroupId/);
  }
});

test("workspace labels document center as scoped archive and removes fake global search", () => {
  const contextSource = read("src/components/workspace-context.tsx");
  const documentsTabSource = read("src/components/tabs/documents-tab.tsx");
  const shellSource = read("src/components/workspace-shell.tsx");

  assert.match(contextSource, /key:\s*"documents"[\s\S]*?label:\s*"资料归档"/);
  assert.match(documentsTabSource, /title="资料归档"/);
  assert.match(documentsTabSource, /全校项目组资料/);
  assert.match(documentsTabSource, /仅展示本项目组资料/);
  assert.doesNotMatch(shellSource, /globalSearchQuery/);
  assert.doesNotMatch(shellSource, /暂无匹配结果，请尝试更换关键词/);
});
