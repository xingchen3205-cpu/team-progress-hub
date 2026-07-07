import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import {
  decodeTeacherTrainingSubmissionAttachmentFile,
  getTeacherTrainingSubmissionAttachmentLabel,
} from "@/lib/teacher-training-submission-attachments";
import { readStoredFile } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type DifyBlockingChatResponse = {
  answer?: string;
  message?: string;
};

type AiScoreResult = {
  submissionId?: string;
  score?: number;
  comment?: string;
};

const DEFAULT_DIFY_BASE_URL = "https://api.dify.ai/v1";
const maxAiReviewSubmissionsPerBatch = 60;
const maxSubmissionPdfContentLength = 4_000;

class PdfJsNodeDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  is2D = true;
  isIdentity = true;

  constructor(init?: number[] | PdfJsNodeDOMMatrix) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      this.isIdentity = this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
    } else if (init instanceof PdfJsNodeDOMMatrix) {
      this.a = init.a;
      this.b = init.b;
      this.c = init.c;
      this.d = init.d;
      this.e = init.e;
      this.f = init.f;
      this.isIdentity = init.isIdentity;
    }
  }

  multiplySelf() {
    return this;
  }

  preMultiplySelf() {
    return this;
  }

  translateSelf(x = 0, y = 0) {
    this.e += x;
    this.f += y;
    this.isIdentity = false;
    return this;
  }

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    this.a *= scaleX;
    this.d *= scaleY;
    this.isIdentity = false;
    return this;
  }

  rotateSelf() {
    return this;
  }

  invertSelf() {
    return this;
  }

  transformPoint(point: { x?: number; y?: number; z?: number; w?: number } = {}) {
    return {
      x: point.x ?? 0,
      y: point.y ?? 0,
      z: point.z ?? 0,
      w: point.w ?? 1,
    };
  }
}

class PdfJsNodeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

class PdfJsNodePath2D {}

const ensurePdfJsNodePolyfills = async () => {
  const globalWithPdfPolyfills = globalThis as unknown as Record<string, unknown>;

  globalWithPdfPolyfills.DOMMatrix ??= PdfJsNodeDOMMatrix;
  globalWithPdfPolyfills.ImageData ??= PdfJsNodeImageData;
  globalWithPdfPolyfills.Path2D ??= PdfJsNodePath2D;
  globalWithPdfPolyfills.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
};

const extractPdfText = async (buffer: Buffer) => {
  await ensurePdfJsNodePolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });
  const document = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
  } finally {
    await document.destroy().catch(() => undefined);
  }

  return pageTexts.join("\n").trim();
};

const getDifyConfig = () => {
  const apiKey = process.env.DIFY_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl: (process.env.DIFY_BASE_URL?.trim() || DEFAULT_DIFY_BASE_URL).replace(/\/$/, ""),
  };
};

const clampScore = (value: unknown) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const extractJsonArray = (value: string) => {
  const trimmed = value.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeBlockMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new Error("AI 返回内容不是评分数组");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as AiScoreResult[];
};

const chunkTeacherTrainingSubmissions = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { taskId } = await context.params;
  const task = await prisma.teacherTrainingTask.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      cohort: {
        deletedAt: null,
      },
    },
    include: {
      cohort: {
        select: {
          id: true,
          title: true,
        },
      },
      courseSession: {
        select: {
          title: true,
          courseDate: true,
          startTime: true,
          endTime: true,
        },
      },
      submissions: {
        orderBy: [{ submittedAt: "asc" }],
        include: {
          participant: {
            select: {
              name: true,
              organization: true,
            },
          },
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ message: "省培任务不存在" }, { status: 404 });
  }

  if (!(await hasTeacherTrainingCohortManageAccess(user, task.cohortId))) {
    return NextResponse.json({ message: "无权限使用该任务的 AI 评分" }, { status: 403 });
  }

  if (!task.enableAiReview) {
    return NextResponse.json({ message: "该任务未开启 AI 辅助评分" }, { status: 400 });
  }

  if (task.submissions.length === 0) {
    return NextResponse.json({ message: "当前任务暂无已提交汇报，无法评分" }, { status: 400 });
  }

  const config = getDifyConfig();
  if (!config) {
    return NextResponse.json({ message: "AI 评分尚未配置 Dify API Key" }, { status: 503 });
  }

  const rubric =
    task.scoringRubric?.trim() ||
    "总分100分：课程理解40分，结合教育教学或竞赛指导实际30分，结构表达20分，提交规范10分。";
  const courseLabel = task.courseSession
    ? `${task.courseSession.courseDate} ${[task.courseSession.startTime, task.courseSession.endTime].filter(Boolean).join("-")} ${task.courseSession.title}`.trim()
    : "未绑定具体课程";

  const submissionChunks = chunkTeacherTrainingSubmissions(task.submissions, maxAiReviewSubmissionsPerBatch);
  const parsedResults: AiScoreResult[] = [];

  for (const submissionChunk of submissionChunks) {
    const submissionPayload = [];
    for (const submission of submissionChunk) {
      const attachmentFile = decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment);
      let pdfContent = "";
      if (attachmentFile) {
        try {
          const fileData = await readStoredFile(attachmentFile.filePath);
          pdfContent = (await extractPdfText(fileData.buffer)).slice(0, maxSubmissionPdfContentLength);
        } catch {
          pdfContent = "";
        }
      }

      submissionPayload.push({
        submissionId: submission.id,
        teacher: submission.participant?.name ?? "参训教师",
        organization: submission.participant?.organization ?? "",
        attachment: getTeacherTrainingSubmissionAttachmentLabel(submission.attachment) || "",
        pdfContent,
      });
    }

    const query = [
      "你是省培任务汇报的辅助评分员。请根据 PDF 汇报正文和评分细则对每份汇报给出初评分。",
      "要求：只返回 JSON 数组，不要 Markdown，不要解释。",
      "数组元素格式：{\"submissionId\":\"原ID\",\"score\":0-100整数,\"comment\":\"80字以内中文短评\"}。",
      "AI 初评仅供管理端参考，最终成绩由人工确认，所以请保守、客观，不要输出排名。",
      "注意：pdfContent 为空时，说明 PDF 文本抽取失败或文件内容不可复制，请给出偏低的规范分并提示管理者人工查看附件。",
      `培训班次：${task.cohort.title}`,
      `关联课程：${courseLabel}`,
      `任务名称：${task.title}`,
      `任务说明：${task.description}`,
      `评分细则：${rubric}`,
      `汇报列表：${JSON.stringify(submissionPayload)}`,
    ].join("\n");

    const response = await fetch(`${config.baseUrl}/chat-messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "blocking",
        user: `teacher-training-review-${user.id}`,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      return NextResponse.json({ message: payload?.message || "AI 评分暂时不可用，请稍后重试" }, { status: 502 });
    }

    const payload = (await response.json().catch(() => null)) as DifyBlockingChatResponse | null;
    const answer = payload?.answer?.trim();
    if (!answer) {
      return NextResponse.json({ message: "AI 未返回评分结果，请稍后重试" }, { status: 502 });
    }

    try {
      parsedResults.push(...extractJsonArray(answer));
    } catch {
      return NextResponse.json({ message: "AI 返回格式异常，请稍后重试" }, { status: 502 });
    }
  }

  const validSubmissionIds = new Set(task.submissions.map((submission) => submission.id));
  const reviewedAt = new Date();
  const updates = parsedResults
    .map((result) => {
      const submissionId = result.submissionId?.trim() ?? "";
      const score = clampScore(result.score);
      if (!submissionId || !validSubmissionIds.has(submissionId) || score === null) {
        return null;
      }

      return {
        submissionId,
        score,
        comment: result.comment?.trim().slice(0, 300) || "AI 已完成初评。",
      };
    })
    .filter((item): item is { submissionId: string; score: number; comment: string } => Boolean(item));

  if (updates.length === 0) {
    return NextResponse.json({ message: "AI 评分结果没有匹配到有效汇报" }, { status: 502 });
  }

  await prisma.$transaction(
    updates.map((item) =>
      prisma.teacherTrainingSubmission.update({
        where: { id: item.submissionId },
        data: {
          aiScore: item.score,
          aiComment: item.comment,
          aiReviewedAt: reviewedAt,
        },
      }),
    ),
  );

  return NextResponse.json({ ok: true, reviewedCount: updates.length });
}
