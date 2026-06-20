export type TrainingJudgeQuestion = {
  category: string;
  question: string;
  answerPoints: string;
};

export type TrainingJudgeTurn = {
  prompt: string;
  transcript: string;
  summary?: string;
};

export type TrainingJudgeFeedback = {
  score: number;
  dimensions: {
    questionResponse: number;
    keyPointCoverage: number;
    logicalStructure: number;
    evidenceQuality: number;
    expressionAccuracy: number;
  };
  summary: string;
  hitPoints: string[];
  missingPoints: string[];
  expressionRisks: string[];
  improvedAnswer: string;
  followUpQuestion: string;
};

const clampScore = (value: unknown, maximum = 100) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(maximum, Math.max(0, Math.round(numericValue)));
};

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => `${item}`.trim()).filter(Boolean).slice(0, 6);
};

const normalizeFeedback = (value: unknown): TrainingJudgeFeedback => {
  const payload = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawDimensions =
    payload.dimensions && typeof payload.dimensions === "object"
      ? (payload.dimensions as Record<string, unknown>)
      : {};
  const dimensions = {
    questionResponse: clampScore(rawDimensions.questionResponse, 20),
    keyPointCoverage: clampScore(rawDimensions.keyPointCoverage, 20),
    logicalStructure: clampScore(rawDimensions.logicalStructure, 20),
    evidenceQuality: clampScore(rawDimensions.evidenceQuality, 20),
    expressionAccuracy: clampScore(rawDimensions.expressionAccuracy, 20),
  };

  return {
    score: Object.values(dimensions).reduce((total, score) => total + score, 0),
    dimensions,
    summary: `${payload.summary ?? "AI 已完成点评，请结合命中要点继续复盘。"}`.trim(),
    hitPoints: normalizeStringArray(payload.hitPoints),
    missingPoints: normalizeStringArray(payload.missingPoints),
    expressionRisks: normalizeStringArray(payload.expressionRisks),
    improvedAnswer: `${payload.improvedAnswer ?? ""}`.trim(),
    followUpQuestion: `${payload.followUpQuestion ?? ""}`.trim(),
  };
};

export function parseTrainingJudgeResponse(rawAnswer: string): TrainingJudgeFeedback {
  const cleaned = rawAnswer
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonBlock = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;

  try {
    return normalizeFeedback(JSON.parse(jsonBlock));
  } catch {
    return normalizeFeedback({
      score: 0,
      summary: cleaned || "AI 点评返回内容异常，请重新提交。",
      hitPoints: [],
      missingPoints: [],
      expressionRisks: ["AI 未能返回结构化点评，本轮结果仅供参考。"],
      improvedAnswer: "",
      followUpQuestion: "",
    });
  }
}

export function buildTrainingJudgePrompt(input: {
  sourceQuestion: TrainingJudgeQuestion;
  currentPrompt: string;
  transcript: string;
  previousTurns?: TrainingJudgeTurn[];
}) {
  const previousTurnsText =
    input.previousTurns && input.previousTurns.length > 0
      ? input.previousTurns
          .slice(-3)
          .map(
            (turn, index) =>
              `第 ${index + 1} 轮问题：${turn.prompt}\n第 ${index + 1} 轮回答：${turn.transcript}\n第 ${index + 1} 轮点评：${turn.summary || "无"}`,
          )
          .join("\n\n")
      : "暂无";

  return `你是中国国际大学生创新大赛路演答辩的严谨评委，同时也是训练教练。请基于题库标准要点评价学生的语音转写回答，并给出下一轮追问。

题目分类：${input.sourceQuestion.category}
原始题库问题：${input.sourceQuestion.question}
本轮评委提问：${input.currentPrompt}
标准回答要点：${input.sourceQuestion.answerPoints}

学生语音转写回答：
${input.transcript}

历史追问记录：
${previousTurnsText}

评价要求：
1. 只能基于题库问题、标准回答要点和学生回答进行判断；不得编造项目事实、测试数据、专利、客户、收入、奖项或团队经历。
2. 可以给表达结构和答辩策略建议，但补充内容必须标明为“建议表达”，不能当成学生已有事实。
3. 不要因为学生用了专业词就直接给高分，要看是否有数据、场景、逻辑和证据。
4. 找出回答中真正命中的要点，也指出漏掉的关键点。
5. 标出空话、套话、夸大、没有支撑的表达风险。
6. followUpQuestion 必须像真实评委追问，针对刚才回答的漏洞，不要泛泛而问。
7. improvedAnswer 写一段学生下一次可以参考的 30-60 秒回答；没有依据的事实不要写进参考回答。
8. dimensions 必须分别评价问题回应、要点覆盖、逻辑结构、事实依据和表达准确性，每项 0 到 20 的整数。扣分必须能对应到具体缺失内容或具体文字。
9. 只返回 JSON，不要 Markdown，不要解释 JSON 外的任何文字。

JSON 格式：
{
  "dimensions": {
    "questionResponse": 0到20的整数,
    "keyPointCoverage": 0到20的整数,
    "logicalStructure": 0到20的整数,
    "evidenceQuality": 0到20的整数,
    "expressionAccuracy": 0到20的整数
  },
  "summary": "一句话总体评价",
  "hitPoints": ["命中要点1", "命中要点2"],
  "missingPoints": ["遗漏点1", "遗漏点2"],
  "expressionRisks": ["表达风险1", "表达风险2"],
  "improvedAnswer": "优化后的参考回答",
  "followUpQuestion": "下一轮追问"
}`;
}

export async function generateTrainingJudgeFeedback(input: {
  userId: string;
  sourceQuestion: TrainingJudgeQuestion;
  currentPrompt: string;
  transcript: string;
  previousTurns?: TrainingJudgeTurn[];
}) {
  const { sendAiChatMessage } = await import("@/lib/ai-chat");
  const prompt = buildTrainingJudgePrompt(input);
  const result = await sendAiChatMessage({
    userId: input.userId,
    query: prompt,
  });

  return {
    feedback: parseTrainingJudgeResponse(result.answer),
    permission: result.permission,
  };
}
