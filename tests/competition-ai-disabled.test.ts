import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("competition AI APIs are disabled behind one server-side switch", () => {
  const switchSource = read("src/lib/competition-ai.ts");
  assert.match(switchSource, /competitionAiDisabledMessage/);
  assert.match(switchSource, /ENABLE_COMPETITION_AI/);

  [
    "src/app/api/ai/chat/route.ts",
    "src/app/api/ai/permission/route.ts",
    "src/app/api/ai/conversations/route.ts",
    "src/app/api/ai/conversations/[conversationId]/route.ts",
    "src/app/api/admin/ai-permissions/route.ts",
    "src/app/api/admin/ai-permissions/[userId]/route.ts",
    "src/app/api/training/ai-judge/route.ts",
    "src/app/api/training/ai-sessions/route.ts",
    "src/app/api/training/ai-sessions/[sessionId]/complete/route.ts",
    "src/app/api/training/voice-transcripts/route.ts",
    "src/app/api/training/questions/import/route.ts",
    "src/app/api/expert-reviews/custom-targets/ocr/route.ts",
  ].forEach((file) => {
    const source = read(file);
    assert.match(source, /isCompetitionAiEnabled/);
    assert.match(source, /competitionAiDisabledMessage/);
  });
});

test("teacher training AI review stays independent from competition AI switch", () => {
  const source = read("src/app/api/teacher-training/tasks/[taskId]/ai-review/route.ts");
  assert.match(source, /DIFY_API_KEY/);
  assert.match(source, /hasTeacherTrainingCohortManageAccess/);
  assert.doesNotMatch(source, /isCompetitionAiEnabled/);
});
