import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("training drill excludes answered questions from the current random round", () => {
  const contextSource = read("src/components/workspace-context.tsx");

  assert.match(contextSource, /answeredDrillQuestionIds/);
  assert.match(contextSource, /setAnsweredDrillQuestionIds/);
  assert.match(contextSource, /answeredQuestionIds\.includes\(question\.id\)/);
  assert.match(contextSource, /unansweredCandidates/);
  assert.match(contextSource, /setAnsweredDrillQuestionIds\(\(current\) =>/);
});
