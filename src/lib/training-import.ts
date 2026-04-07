export type TrainingQuestionImportCandidate = {
  category: string;
  question: string;
  answerPoints: string;
};

const defaultTrainingCategory = "商业模式";

const createTrainingImportCandidate = (
  values: Partial<TrainingQuestionImportCandidate> & Pick<TrainingQuestionImportCandidate, "question">,
): TrainingQuestionImportCandidate => ({
  category: values.category?.trim() || defaultTrainingCategory,
  question: values.question.trim(),
  answerPoints: values.answerPoints?.trim() || "待补充回答要点",
});

const parseCsvTrainingLine = (line: string) => {
  const columns: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      columns.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  columns.push(current.trim());

  return columns.map((item) => item.replace(/^"|"$/g, "").trim()).filter(Boolean);
};

export const parseTrainingQuestionText = (text: string): TrainingQuestionImportCandidate[] => {
  const source = text.replace(/\r\n/g, "\n").trim();
  if (!source) {
    return [];
  }

  try {
    const json = JSON.parse(source) as unknown;
    const items = Array.isArray(json) ? json : [];
    const rows = items
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as Record<string, unknown>;
        const question = String(record.question ?? record.title ?? record.问题 ?? "").trim();
        const answerPoints = String(record.answerPoints ?? record.answer ?? record.回答要点 ?? record.答案 ?? "").trim();
        const category = String(record.category ?? record.分类 ?? defaultTrainingCategory).trim();

        if (!question) {
          return null;
        }

        return createTrainingImportCandidate({ category, question, answerPoints });
      })
      .filter((item): item is TrainingQuestionImportCandidate => Boolean(item));

    if (rows.length > 0) {
      return rows;
    }
  } catch {
    // Not JSON; continue with plain-text parsing.
  }

  const lines = source.split("\n").map((line) => line.trim());
  const rows: TrainingQuestionImportCandidate[] = [];

  if (lines.some((line) => parseCsvTrainingLine(line).length >= 3)) {
    lines.forEach((line) => {
      const columns = parseCsvTrainingLine(line);
      if (columns.length < 2 || ["category", "分类"].includes(columns[0]?.toLowerCase())) {
        return;
      }

      const [maybeCategory, maybeQuestion, ...rest] = columns;
      const category = rest.length > 0 ? maybeCategory : defaultTrainingCategory;
      const question = rest.length > 0 ? maybeQuestion : maybeCategory;
      const answerPoints = rest.length > 0 ? rest.join("；") : maybeQuestion;

      rows.push(createTrainingImportCandidate({ category, question, answerPoints }));
    });

    if (rows.length > 0) {
      return rows;
    }
  }

  let currentQuestion = "";
  let currentAnswer = "";
  let currentCategory = defaultTrainingCategory;

  const flush = () => {
    if (!currentQuestion.trim()) {
      return;
    }

    rows.push(
      createTrainingImportCandidate({
        category: currentCategory,
        question: currentQuestion,
        answerPoints: currentAnswer || "待补充回答要点",
      }),
    );
    currentQuestion = "";
    currentAnswer = "";
    currentCategory = defaultTrainingCategory;
  };

  lines.forEach((line) => {
    if (!line) {
      flush();
      return;
    }

    const categoryMatch = line.match(/^(分类|类别|方向)[:：]\s*(.+)$/);
    const questionMatch = line.match(/^(Q|问题|提问)[:：]\s*(.+)$/i);
    const answerMatch = line.match(/^(A|答案|回答|要点|回答要点)[:：]\s*(.+)$/i);

    if (categoryMatch?.[2]) {
      currentCategory = categoryMatch[2].trim();
      return;
    }

    if (questionMatch?.[2]) {
      flush();
      currentQuestion = questionMatch[2].trim();
      return;
    }

    if (answerMatch?.[2]) {
      currentAnswer = currentAnswer ? `${currentAnswer}\n${answerMatch[2].trim()}` : answerMatch[2].trim();
      return;
    }

    if (!currentQuestion && /[?？]$/.test(line)) {
      currentQuestion = line;
      return;
    }

    if (!currentQuestion) {
      currentQuestion = line;
      return;
    }

    currentAnswer = currentAnswer ? `${currentAnswer}\n${line}` : line;
  });
  flush();

  return rows;
};
