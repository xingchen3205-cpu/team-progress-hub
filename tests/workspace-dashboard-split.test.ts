import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");
const lineCount = (relativePath: string) => read(relativePath).split("\n").length;

test("workspace dashboard uses dynamic tab imports and stays small", () => {
  const source = read("src/components/workspace-dashboard.tsx");

  assert.match(source, /import dynamic from "next\/dynamic";/);
  assert.match(source, /WorkspaceProvider/);
  assert.match(source, /const OverviewTab = dynamic/);
  assert.match(source, /const TimelineTab = dynamic/);
  assert.match(source, /const TasksTab = dynamic/);
  assert.match(source, /const TrainingTab = dynamic/);
  assert.match(source, /const ScheduleTab = dynamic/);
  assert.match(source, /const ExpertOpinionTab = dynamic/);
  assert.match(source, /const ExpertReviewTab = dynamic/);
  assert.match(source, /const DocumentsTab = dynamic/);
  assert.match(source, /const TeamTab = dynamic/);
  assert.match(source, /const AssistantTab = dynamic/);
  assert.ok(lineCount("src/components/workspace-dashboard.tsx") <= 500);
});

test("workspace tabs stay split and bounded by tab complexity", () => {
  const tabFiles = [
    "src/components/tabs/overview-tab.tsx",
    "src/components/tabs/timeline-tab.tsx",
    "src/components/tabs/tasks-tab.tsx",
    "src/components/tabs/training-tab.tsx",
    "src/components/tabs/question-bank-tab.tsx",
    "src/components/tabs/expert-opinion-tab.tsx",
    "src/components/tabs/expert-review-tab.tsx",
    "src/components/tabs/documents-tab.tsx",
    "src/components/tabs/team-tab.tsx",
    "src/components/tabs/assistant-tab.tsx",
  ];

  for (const relativePath of tabFiles) {
    assert.ok(existsSync(path.join(root, relativePath)), `${relativePath} should exist`);
    assert.ok(lineCount(relativePath) <= 1500, `${relativePath} should stay under 1500 lines`);
  }

  assert.ok(existsSync(path.join(root, "src/components/tabs/schedule-tab.tsx")));
  assert.ok(
    lineCount("src/components/tabs/schedule-tab.tsx") <= 4000,
    "src/components/tabs/schedule-tab.tsx should stay bounded while it owns role-specific report views",
  );
});

test("workspace shared context and skeleton exist", () => {
  assert.ok(existsSync(path.join(root, "src/components/workspace-context.tsx")));
  assert.ok(existsSync(path.join(root, "src/components/tab-skeleton.tsx")));
});

test("tasks tab avoids a large fixed minimum height that leaves empty tails", () => {
  const source = read("src/components/tabs/tasks-tab.tsx");

  assert.doesNotMatch(source, /min-h-\[420px\]/);
});

test("training tab includes keyword search for Q&A questions", () => {
  const source = read("src/components/tabs/training-tab.tsx");

  assert.match(source, /trainingQuestionSearch/);
  assert.match(source, /filteredTrainingQuestions/);
  assert.match(source, /搜索题目、回答要点或分类/);
  assert.match(source, /item\.question/);
  assert.match(source, /item\.answerPoints/);
  assert.match(source, /item\.category/);
  assert.match(source, /没有找到匹配的题目/);
});

test("system administrator has a question bank center and everyone can export visible question banks", () => {
  const contextSource = read("src/components/workspace-context.tsx");
  const dashboardSource = read("src/components/workspace-dashboard.tsx");
  const workspacePageSource = read("src/app/workspace/page.tsx");
  const questionBankTabSource = read("src/components/tabs/question-bank-tab.tsx");
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");
  const exportRouteSource = read("src/app/api/training/questions/export/route.ts");
  const schoolAdminBlock = contextSource.match(/school_admin:\s*\{[\s\S]*?\n  teacher:/)?.[0] ?? "";

  assert.match(contextSource, /\|\s*"questionBank"/);
  assert.match(contextSource, /key:\s*"questionBank"[\s\S]*?label:\s*"题库中心"/);
  assert.match(contextSource, /admin:\s*\{[\s\S]*?"questionBank"/);
  assert.doesNotMatch(schoolAdminBlock, /"questionBank"/);
  assert.match(contextSource, /case "questionBank":[\s\S]*?return \["trainingQuestions", "team"\]/);
  assert.match(dashboardSource, /QuestionBankTab/);
  assert.match(dashboardSource, /safeActiveTab === "questionBank"/);
  assert.match(workspacePageSource, /validTabs\s*=\s*\[[\s\S]*?"questionBank"/);
  assert.match(questionBankTabSource, /题库中心/);
  assert.match(questionBankTabSource, /selectedTeamGroupId/);
  assert.match(questionBankTabSource, /selectedCategoryFilter/);
  assert.match(questionBankTabSource, /setSelectedCategoryFilter/);
  assert.match(questionBankTabSource, /团队题库/);
  assert.match(questionBankTabSource, /导出 Word/);
  assert.match(trainingTabSource, /exportTrainingQuestionsUrl/);
  assert.match(trainingTabSource, /导出 Word/);
  assert.match(exportRouteSource, /assertMainWorkspaceRole\(user\.role\)/);
  assert.match(exportRouteSource, /application\/msword/);
  assert.match(exportRouteSource, /filename\*=UTF-8''/);
  assert.match(exportRouteSource, /buildTeamScopedResourceWhere/);
  assert.match(exportRouteSource, /teamGroupId/);
  assert.match(exportRouteSource, /keyword/);
  assert.match(exportRouteSource, /category/);
});

test("question bank revisions notify the original question owner", () => {
  const questionBankTabSource = read("src/components/tabs/question-bank-tab.tsx");
  const updateRouteSource = read("src/app/api/training/questions/[id]/route.ts");
  const questionsRouteSource = read("src/app/api/training/questions/route.ts");
  const serializerSource = read("src/lib/api-serializers.ts");
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");

  assert.match(questionBankTabSource, /revisionTarget/);
  assert.match(questionBankTabSource, /修订答案/);
  assert.match(questionBankTabSource, /最近修订/);
  assert.match(questionBankTabSource, /保存并通知原录入人/);
  assert.match(updateRouteSource, /createNotifications/);
  assert.match(updateRouteSource, /createAuditLogEntry/);
  assert.match(updateRouteSource, /trainingQuestionRevisionAction/);
  assert.match(updateRouteSource, /题库答案已被修订/);
  assert.match(updateRouteSource, /targetTab:\s*"training"/);
  assert.match(updateRouteSource, /userIds:\s*\[existingQuestion\.createdById\]/);
  assert.match(questionsRouteSource, /getTrainingQuestionRevisionMeta/);
  assert.match(serializerSource, /lastEditedByName/);
  assert.match(serializerSource, /lastEditedAt/);
  assert.match(trainingTabSource, /最近修订/);
});
