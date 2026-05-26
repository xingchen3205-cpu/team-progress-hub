import assert from "node:assert/strict";
import test from "node:test";

import { buildTrainingJudgePrompt, parseTrainingJudgeResponse } from "../src/lib/training-ai-judge";
import { normalizeDifySpeechErrorMessage, validateTrainingAudioFile } from "../src/lib/training-voice";

test("training judge prompt anchors feedback to source question and current follow-up", () => {
  const prompt = buildTrainingJudgePrompt({
    sourceQuestion: {
      category: "技术壁垒",
      question: "你们的技术壁垒是什么？",
      answerPoints: "核心算法、场景数据、验证结果",
    },
    currentPrompt: "你刚才说效率更高，具体提升多少？",
    transcript: "我们在真实线路数据上测试过，效率提升了 18%。",
    previousTurns: [
      {
        prompt: "你们的技术壁垒是什么？",
        transcript: "我们有算法和数据。",
        summary: "回答偏泛，需要数据支撑。",
      },
    ],
  });

  assert.match(prompt, /技术壁垒/);
  assert.match(prompt, /你们的技术壁垒是什么/);
  assert.match(prompt, /你刚才说效率更高，具体提升多少/);
  assert.match(prompt, /核心算法、场景数据、验证结果/);
  assert.match(prompt, /历史追问记录/);
  assert.match(prompt, /followUpQuestion/);
  assert.match(prompt, /只返回 JSON/);
});

test("training judge parser accepts fenced json and normalizes unsafe fields", () => {
  const feedback = parseTrainingJudgeResponse(`\`\`\`json
{
  "score": 135,
  "summary": "回答有数据，但没有解释对比对象。",
  "hitPoints": ["有测试数据"],
  "missingPoints": ["缺少竞品对比"],
  "expressionRisks": ["“效率更高”需要说明基准"],
  "improvedAnswer": "我们基于真实线路数据做了对比测试。",
  "followUpQuestion": "这个 18% 是和什么方案相比？"
}
\`\`\``);

  assert.equal(feedback.score, 100);
  assert.deepEqual(feedback.hitPoints, ["有测试数据"]);
  assert.deepEqual(feedback.missingPoints, ["缺少竞品对比"]);
  assert.equal(feedback.followUpQuestion, "这个 18% 是和什么方案相比？");
});

test("training audio validation rejects empty and oversized recordings", () => {
  const empty = new File([], "empty.webm", { type: "audio/webm" });
  const tooLarge = new File([new Blob([new Uint8Array(15 * 1024 * 1024 + 1)])], "large.webm", {
    type: "audio/webm",
  });
  const valid = new File([new Blob(["voice"])], "answer.webm", { type: "audio/webm" });

  assert.equal(validateTrainingAudioFile(null), "请先录制一段回答");
  assert.equal(validateTrainingAudioFile(empty), "录音内容为空，请重新回答");
  assert.equal(validateTrainingAudioFile(tooLarge), "单次录音最大 15MB，请缩短回答时间后重试");
  assert.equal(validateTrainingAudioFile(valid), null);
});

test("training audio validation accepts Chrome webm recordings with codec parameters", () => {
  const chromeWebm = new File([new Blob(["voice"])], "answer.webm", {
    type: "audio/webm;codecs=opus",
  });

  assert.equal(validateTrainingAudioFile(chromeWebm), null);
});

test("training voice service maps disabled Dify speech setting to an actionable Chinese message", () => {
  assert.equal(
    normalizeDifySpeechErrorMessage("Speech to text is not enabled"),
    "服务端语音转写未开启，请管理员在 Dify 应用中启用 Speech to text。",
  );
});
