import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { serializeTeacherTrainingSubmission } from "@/lib/teacher-training";

type RouteContext = {
  params: Promise<{ submissionId: string }>;
};

const parseScore = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const score = Number(value);
  if (!Number.isFinite(score)) {
    return NaN;
  }

  return Math.round(score);
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { submissionId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        finalScore?: number | string | null;
        finalComment?: string | null;
      }
    | null;

  const submission = await prisma.teacherTrainingSubmission.findFirst({
    where: {
      id: submissionId,
      task: {
        deletedAt: null,
        cohort: {
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      status: true,
      task: {
        select: {
          cohortId: true,
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ message: "任务汇报不存在" }, { status: 404 });
  }

  if (!(await hasTeacherTrainingCohortManageAccess(user, submission.task.cohortId))) {
    return NextResponse.json({ message: "无权限评分该任务汇报" }, { status: 403 });
  }

  if (submission.status === "rejected") {
    return NextResponse.json(
      { message: "该汇报已驳回，请等待教师重新提交后再评分" },
      { status: 409 },
    );
  }

  const finalScore = parseScore(body?.finalScore);
  if (Number.isNaN(finalScore) || (finalScore !== null && (finalScore < 0 || finalScore > 100))) {
    return NextResponse.json({ message: "最终得分需为 0 到 100 之间的整数" }, { status: 400 });
  }

  const finalComment = body?.finalComment?.trim() ?? "";
  if (finalComment.length > 1000) {
    return NextResponse.json({ message: "评语不能超过 1000 字" }, { status: 400 });
  }

  const updatedSubmission = await prisma.teacherTrainingSubmission.update({
    where: { id: submission.id },
    data: {
      finalScore,
      finalComment: finalComment || null,
      finalReviewedById: finalScore === null && !finalComment ? null : user.id,
      finalReviewedAt: finalScore === null && !finalComment ? null : new Date(),
    },
    include: {
      participant: {
        select: {
          name: true,
        },
      },
      submittedBy: {
        select: {
          name: true,
        },
      },
      finalReviewer: {
        select: {
          name: true,
        },
      },
    },
  });

  return NextResponse.json({ submission: serializeTeacherTrainingSubmission(updatedSubmission) });
}
