import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const reviewRouteSource = readFileSync(
  path.join(process.cwd(), "src/app/api/documents/[id]/review/route.ts"),
  "utf8",
);
const documentsTabSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/documents-tab.tsx"),
  "utf8",
);

test("document review keeps reviewer comment optional instead of forcing a system default", () => {
  assert.match(reviewRouteSource, /comment:\s*body\?\.comment\?\.trim\(\)\s*\?\?\s*null/);
  assert.doesNotMatch(reviewRouteSource, /\|\|\s*transition\.defaultComment/);
});

test("documents tab leaves empty review comments blank instead of rendering a fallback label", () => {
  assert.match(documentsTabSource, /document-comment-text">\{doc\.comment\s*\?\?\s*""\}<\/p>/);
  assert.doesNotMatch(documentsTabSource, /暂无批注/);
});
