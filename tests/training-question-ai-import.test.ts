import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTrainingQuestionAiImportPrompt,
  parseTrainingQuestionAiImportResponse,
  resolveTrainingImportMatches,
} from "../src/lib/training-question-ai-import";

describe("training question AI import", () => {
  it("parses AI rows with update targets from fenced JSON", () => {
    const rows = parseTrainingQuestionAiImportResponse(`\`\`\`json
[
  {
    "category": "市场与竞品",
    "question": "高铁提速具体带来了什么挑战？",
    "answerPoints": "围绕安全监测、调度协同和成本说明。",
    "action": "update",
    "matchedQuestionId": "question-1",
    "matchReason": "与现有题目含义一致，补充回答要点"
  }
]
\`\`\``);

    assert.deepEqual(rows, [
      {
        category: "市场与竞品",
        question: "高铁提速具体带来了什么挑战？",
        answerPoints: "围绕安全监测、调度协同和成本说明。",
        importAction: "update",
        matchedQuestionId: "question-1",
        matchReason: "与现有题目含义一致，补充回答要点",
      },
    ]);
  });

  it("matches exact existing questions when AI does not provide a target", () => {
    const rows = resolveTrainingImportMatches(
      [
        {
          category: "综合答辩",
          question: "你们为什么能和上海铁路局签订合同？",
          answerPoints: "补充合同依据、试点进展和交付能力。",
        },
      ],
      [
        {
          id: "question-2",
          category: "市场与竞品",
          question: "你们为什么能和上海铁路局签订合同？",
          answerPoints: "说明客户真实性和合同范围。",
        },
      ],
    );

    assert.equal(rows[0]?.importAction, "update");
    assert.equal(rows[0]?.matchedQuestionId, "question-2");
    assert.equal(rows[0]?.matchedQuestionLabel, "你们为什么能和上海铁路局签订合同？");
  });

  it("builds a prompt that asks AI to return create or update decisions", () => {
    const prompt = buildTrainingQuestionAiImportPrompt({
      documentText: "问题：商业模式如何持续？\n答案：收入、成本、复购。",
      existingQuestions: [
        {
          id: "question-3",
          category: "商业模式",
          question: "你们的商业模式如何形成可持续收入？",
          answerPoints: "客户、收入、成本、复购。",
        },
      ],
    });

    assert.match(prompt, /matchedQuestionId/);
    assert.match(prompt, /create/);
    assert.match(prompt, /update/);
    assert.match(prompt, /question-3/);
    assert.match(prompt, /只返回 JSON/);
  });
});
