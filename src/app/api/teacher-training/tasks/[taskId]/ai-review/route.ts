import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";

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
const maxSubmissionContentLength = 600;

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

  if (task.submissions.length > maxAiReviewSubmissionsPerBatch) {
    return NextResponse.json(
      { message: `单次 AI 评分最多处理 ${maxAiReviewSubmissionsPerBatch} 份汇报，请先筛选或分批处理` },
      { status: 400 },
    );
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
  const submissionPayload = task.submissions.map((submission) => ({
    submissionId: submission.id,
    teacher: submission.participant?.name ?? "参训教师",
    organization: submission.participant?.organization ?? "",
    content: submission.content.slice(0, maxSubmissionContentLength),
  }));

  const query = [
    "你是省培任务汇报的辅助评分员。请根据评分细则对每份汇报给出初评分。",
    "要求：只返回 JSON 数组，不要 Markdown，不要解释。",
    "数组元素格式：{\"submissionId\":\"原ID\",\"score\":0-100整数,\"comment\":\"80字以内中文短评\"}。",
    "AI 初评仅供管理端参考，最终成绩由人工确认，所以请保守、客观，不要输出排名。",
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

  let parsedResults: AiScoreResult[];
  try {
    parsedResults = extractJsonArray(answer);
  } catch {
    return NextResponse.json({ message: "AI 返回格式异常，请稍后重试" }, { status: 502 });
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
