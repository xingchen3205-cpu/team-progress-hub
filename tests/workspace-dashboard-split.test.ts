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

test("training question bank controls stay readable and use bounded internal scrolling", () => {
  const source = read("src/components/tabs/training-tab.tsx");

  assert.doesNotMatch(source, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(260px,360px\)_auto\]/);
  assert.match(source, /min-w-\[200px\]/);
  assert.match(source, /whitespace-nowrap text-xs font-medium text-slate-500/);
  assert.match(source, /flex w-full flex-wrap items-end gap-3/);
  assert.match(source, /max-h-\[min\(62vh,640px\)\]/);
  assert.match(source, /overscroll-contain/);
});

test("daily report modal supports direct local attachment upload", () => {
  const shellSource = read("src/components/workspace-shell.tsx");
  const uploadRouteSource = read("src/app/api/reports/attachments/route.ts");
  const downloadRouteSource = read("src/app/api/reports/[reportId]/attachment/route.ts");

  assert.match(shellSource, /reportAttachmentInputRef/);
  assert.match(shellSource, /type="file"/);
  assert.match(shellSource, /选择本机文件/);
  assert.match(shellSource, /\/api\/reports\/attachments/);
  assert.match(uploadRouteSource, /saveUploadedFile/);
  assert.match(uploadRouteSource, /encodeReportAttachmentFile/);
  assert.match(uploadRouteSource, /report-attachments/);
  assert.match(downloadRouteSource, /decodeReportAttachmentFile/);
  assert.match(downloadRouteSource, /readStoredFile/);
});

test("question bank import supports AI recognition and update-or-create review", () => {
  const shellSource = read("src/components/workspace-shell.tsx");
  const contextSource = read("src/components/workspace-context.tsx");
  const importRouteSource = read("src/app/api/training/questions/import/route.ts");

  assert.match(shellSource, /AI 智能识别/);
  assert.match(shellSource, /更新匹配题目/);
  assert.match(contextSource, /questionImportMode/);
  assert.match(contextSource, /importAction === "update"/);
  assert.match(contextSource, /method: "PATCH"/);
  assert.match(importRouteSource, /generateTrainingQuestionImportCandidates/);
  assert.match(importRouteSource, /buildTeamScopedResourceWhere/);
  assert.match(importRouteSource, /modeValue === "ai"/);
});

test("training drill mode can draw from a selected question category", () => {
  const contextSource = read("src/components/workspace-context.tsx");
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");

  assert.match(contextSource, /selectedDrillCategory/);
  assert.match(contextSource, /setSelectedDrillCategory/);
  assert.match(contextSource, /getDrillQuestionPool/);
  assert.match(contextSource, /question\.category === selectedDrillCategory/);
  assert.match(contextSource, /当前分类暂无可抽查的问题/);
  assert.match(trainingTabSource, /drillCategoryOptions/);
  assert.match(trainingTabSource, /抽查范围/);
  assert.match(trainingTabSource, /全部分类/);
  assert.match(trainingTabSource, /setSelectedDrillCategory/);
});

test("training center supports web voice AI judge practice", () => {
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");
  const transcriptRouteSource = read("src/app/api/training/voice-transcripts/route.ts");
  const judgeRouteSource = read("src/app/api/training/ai-judge/route.ts");
  const voiceLibSource = read("src/lib/training-voice.ts");
  const judgeLibSource = read("src/lib/training-ai-judge.ts");

  assert.match(trainingTabSource, /AI 模拟评委/);
  assert.match(trainingTabSource, /webkitSpeechRecognition/);
  assert.match(trainingTabSource, /SpeechRecognition/);
  assert.match(trainingTabSource, /MediaRecorder/);
  assert.match(trainingTabSource, /开始回答/);
  assert.match(trainingTabSource, /确认转写/);
  assert.match(trainingTabSource, /提交点评/);
  assert.match(trainingTabSource, /继续追问/);
  assert.match(trainingTabSource, /仅修正语音识别错误/);
  assert.match(trainingTabSource, /\/api\/training\/voice-transcripts/);
  assert.match(trainingTabSource, /\/api\/training\/ai-judge/);

  assert.match(transcriptRouteSource, /assertMainWorkspaceRole\(user\.role\)/);
  assert.match(transcriptRouteSource, /request\.formData\(\)/);
  assert.match(transcriptRouteSource, /transcribeTrainingAudio/);
  assert.match(voiceLibSource, /\/audio-to-text/);
  assert.match(voiceLibSource, /new FormData\(\)/);
  assert.match(voiceLibSource, /DIFY_API_KEY/);

  const securitySource = read("src/lib/security.ts");
  assert.match(securitySource, /microphone=\(self\)/);
  assert.doesNotMatch(securitySource, /microphone=\(\)/);
  assert.match(securitySource, /geolocation=\(self\)/);
  assert.doesNotMatch(securitySource, /geolocation=\(\)/);

  assert.match(judgeRouteSource, /assertMainWorkspaceRole\(user\.role\)/);
  assert.match(judgeRouteSource, /buildTeamScopedResourceWhere/);
  assert.match(judgeRouteSource, /generateTrainingJudgeFeedback/);
  assert.match(judgeLibSource, /buildTrainingJudgePrompt/);
  assert.match(judgeLibSource, /sendAiChatMessage/);
  assert.match(judgeLibSource, /followUpQuestion/);
  assert.match(judgeLibSource, /命中要点/);
});

test("training AI judge records audio before falling back to browser speech recognition", () => {
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");
  const startRecordingIndex = trainingTabSource.indexOf("const startAiJudgeRecording = async () =>");
  const mediaRecorderIndex = trainingTabSource.indexOf("typeof MediaRecorder", startRecordingIndex);
  const speechRecognitionIndex = trainingTabSource.indexOf("getBrowserSpeechRecognition()", startRecordingIndex);

  assert.ok(startRecordingIndex >= 0);
  assert.ok(mediaRecorderIndex >= 0);
  assert.ok(speechRecognitionIndex >= 0);
  assert.ok(mediaRecorderIndex < speechRecognitionIndex);
  assert.match(trainingTabSource, /录音转写回答/);
  assert.match(trainingTabSource, /服务端转写/);
});

test("training AI judge shows live transcript preview while recording and keeps it as fallback", () => {
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");
  const startRecordingIndex = trainingTabSource.indexOf("const startAiJudgeRecording = async () =>");
  const recorderStartIndex = trainingTabSource.indexOf("recorder.start()", startRecordingIndex);
  const livePreviewStartIndex = trainingTabSource.indexOf("startAiJudgeBrowserSpeech(SpeechRecognitionConstructor, \"preview\")", startRecordingIndex);

  assert.ok(startRecordingIndex >= 0);
  assert.ok(recorderStartIndex >= 0);
  assert.ok(livePreviewStartIndex > recorderStartIndex);
  assert.match(trainingTabSource, /aiJudgeLiveTranscript/);
  assert.match(trainingTabSource, /实时转写预览/);
  assert.match(trainingTabSource, /结束后可编辑确认/);
  assert.match(trainingTabSource, /实时识别文本/);
});

test("training voice fallback lets users type an answer when speech recognition is unavailable", () => {
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");
  const judgeRouteSource = read("src/app/api/training/ai-judge/route.ts");
  const voiceLibSource = read("src/lib/training-voice.ts");

  assert.match(trainingTabSource, /enterManualAiJudgeAnswer/);
  assert.match(trainingTabSource, /可直接输入回答后提交点评/);
  assert.match(trainingTabSource, /语音识别失败时，可以直接在这里输入你的回答/);
  assert.doesNotMatch(trainingTabSource, /没有识别到有效语音内容，请重新回答/);
  assert.match(judgeRouteSource, /请先输入回答内容，或完成语音回答并确认转写内容/);
  assert.doesNotMatch(judgeRouteSource, /请先完成语音回答并确认转写内容/);
  assert.doesNotMatch(voiceLibSource, /没有识别到有效语音内容，请重新回答/);
});

test("training AI judge uses explicit microphone prompt and team AI permission gating", () => {
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");

  assert.match(trainingTabSource, /requestAiJudgeMicrophonePermission/);
  assert.match(trainingTabSource, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(trainingTabSource, /\/api\/ai\/permission/);
  assert.match(trainingTabSource, /aiJudgePermission/);
  assert.match(trainingTabSource, /暂无 AI 点评权限/);
  assert.match(trainingTabSource, /次数已用完/);
});

test("training AI judge question is independent from drill mode and bank can filter by category", () => {
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");

  assert.match(trainingTabSource, /aiJudgeQuestionId/);
  assert.match(trainingTabSource, /drawRandomAiJudgeQuestion/);
  assert.doesNotMatch(trainingTabSource, /const currentAiJudgeQuestion = activeDrillQuestion/);
  assert.match(trainingTabSource, /trainingQuestionCategoryFilter/);
  assert.match(trainingTabSource, /题库分类/);
  assert.match(trainingTabSource, /category=\$\{encodeURIComponent\(trainingQuestionCategoryFilter\)\}/);
});

test("training AI judge opens as a dedicated workspace with judging progress", () => {
  const trainingTabSource = read("src/components/tabs/training-tab.tsx");

  assert.match(trainingTabSource, /aiJudgeViewOpen/);
  assert.match(trainingTabSource, /进入 AI 模拟答辩/);
  assert.match(trainingTabSource, /返回题库/);
  assert.match(trainingTabSource, /AI 正在评估/);
  assert.match(trainingTabSource, /role="progressbar"/);
  assert.match(trainingTabSource, /aiJudgeStage === "judging"/);
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
  assert.match(exportRouteSource, /题目类型/);
  assert.match(exportRouteSource, /标准答案/);
  assert.doesNotMatch(exportRouteSource, /<table/);
  assert.doesNotMatch(exportRouteSource, /录入人/);
  assert.doesNotMatch(exportRouteSource, /最近修订/);
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
