import type { TrainingQuestionImportCandidate } from "@/lib/training-import";

export type ExistingTrainingQuestionForImport = {
  id: string;
  category: string;
  question: string;
  answerPoints: string;
};

const maxDocumentChars = 20000;
const maxExistingQuestions = 120;

const normalizeQuestionKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。、“”‘’：:；;！？?（）()[\]【】{}《》,.]/g, "")
    .trim();

const normalizeImportAction = (value: unknown): "create" | "update" =>
  value === "update" ? "update" : "create";

const normalizeCandidate = (value: unknown): TrainingQuestionImportCandidate | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const question = `${record.question ?? record.title ?? record.问题 ?? ""}`.trim();
  const answerPoints = `${record.answerPoints ?? record.answer ?? record.回答要点 ?? record.答案 ?? ""}`.trim();
  const category = `${record.category ?? record.分类 ?? "综合答辩"}`.trim();
  const importAction = normalizeImportAction(record.importAction ?? record.action ?? record.处理方式);
  const matchedQuestionId = `${record.matchedQuestionId ?? record.matchId ?? record.匹配题目ID ?? ""}`.trim();
  const matchReason = `${record.matchReason ?? record.reason ?? record.匹配理由 ?? ""}`.trim();

  if (!question || !answerPoints) {
    return null;
  }

  return {
    category: category || "综合答辩",
    question,
    answerPoints,
    importAction: importAction === "update" && matchedQuestionId ? "update" : "create",
    matchedQuestionId: matchedQuestionId || undefined,
    matchReason: matchReason || undefined,
  };
};

export function parseTrainingQuestionAiImportResponse(rawAnswer: string): TrainingQuestionImportCandidate[] {
  const cleaned = rawAnswer
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonBlock = cleaned.match(/\[[\s\S]*\]/)?.[0] ?? cleaned;

  try {
    const parsedValue = JSON.parse(jsonBlock) as unknown;
    const rows = Array.isArray(parsedValue)
      ? parsedValue.map(normalizeCandidate).filter((row): row is TrainingQuestionImportCandidate => Boolean(row))
      : [];

    return rows.slice(0, 80);
  } catch {
    return [];
  }
}

export function resolveTrainingImportMatches(
  rows: TrainingQuestionImportCandidate[],
  existingQuestions: ExistingTrainingQuestionForImport[],
) {
  const existingById = new Map(existingQuestions.map((question) => [question.id, question]));
  const existingByKey = new Map(existingQuestions.map((question) => [normalizeQuestionKey(question.question), question]));

  return rows.map((row) => {
    const exactMatch = existingByKey.get(normalizeQuestionKey(row.question));
    const aiMatch = row.matchedQuestionId ? existingById.get(row.matchedQuestionId) : null;
    const matchedQuestion = aiMatch ?? exactMatch ?? null;

    if (!matchedQuestion) {
      return {
        ...row,
        importAction: "create" as const,
        matchedQuestionId: undefined,
        matchedQuestionLabel: undefined,
      };
    }

    return {
      ...row,
      importAction: row.importAction === "update" || exactMatch ? ("update" as const) : ("create" as const),
      matchedQuestionId: matchedQuestion.id,
      matchedQuestionLabel: matchedQuestion.question,
      matchReason:
        row.matchReason ??
        (exactMatch ? "与现有题目完全匹配，可更新标准回答要点。" : "AI 认为与现有题目相近。"),
    };
  });
}

export function buildTrainingQuestionAiImportPrompt({
  documentText,
  existingQuestions,
}: {
  documentText: string;
  existingQuestions: ExistingTrainingQuestionForImport[];
}) {
  const existingQuestionPayload = existingQuestions.slice(0, maxExistingQuestions).map((question) => ({
    id: question.id,
    category: question.category,
    question: question.question,
    answerPoints: question.answerPoints.slice(0, 500),
  }));
  const trimmedDocumentText = documentText.trim().slice(0, maxDocumentChars);

  return `你是中国国际大学生创新大赛训练题库整理助手。请从上传文档中提取适合答辩训练的 Q&A 题目，并判断每条是新增题目 create，还是更新已有题目 update。

分类只能优先使用：商业模式、技术壁垒、市场与竞品、财务数据、团队分工、综合答辩。确实不合适时可用自定义分类。

已有题库 JSON：
${JSON.stringify(existingQuestionPayload, null, 2)}

上传文档正文：
${trimmedDocumentText}

处理规则：
1. 每条题目必须适合评委追问或答辩训练，不要把普通段落硬拆成题。
2. 如果文档中的题目与已有题库语义一致，或只是补充/优化已有题目的答案要点，action 用 "update"，matchedQuestionId 必须填写已有题目的 id。
3. 如果是明显新问题，action 用 "create"，matchedQuestionId 留空。
4. answerPoints 写成可复盘的标准回答要点，保留证据、数据、场景、风险或追问角度；不要编造文档外事实。
5. matchReason 简短说明为什么新增或更新。
6. 最多返回 30 条，去重后按重要性排序。
7. 只返回 JSON 数组，不要 Markdown，不要解释 JSON 外的任何文字。

JSON 数组格式：
[
  {
    "category": "市场与竞品",
    "question": "评委可能追问的问题",
    "answerPoints": "标准回答要点",
    "action": "create 或 update",
    "matchedQuestionId": "更新时填写已有题目 id，否则空字符串",
    "matchReason": "新增或更新理由"
  }
]`;
}

export async function generateTrainingQuestionImportCandidates(input: {
  userId: string;
  documentText: string;
  existingQuestions: ExistingTrainingQuestionForImport[];
}) {
  const { sendAiChatMessage } = await import("@/lib/ai-chat");
  const prompt = buildTrainingQuestionAiImportPrompt({
    documentText: input.documentText,
    existingQuestions: input.existingQuestions,
  });
  const result = await sendAiChatMessage({
    userId: input.userId,
    query: prompt,
  });
  const rows = parseTrainingQuestionAiImportResponse(result.answer);

  return {
    rows: resolveTrainingImportMatches(rows, input.existingQuestions),
    permission: result.permission,
  };
}
