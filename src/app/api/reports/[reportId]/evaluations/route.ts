import { NextRequest, NextResponse } from "next/server";
import type { ReportEvaluationType } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { serializeReportEvaluation } from "@/lib/api-serializers";
import { createNotifications } from "@/lib/notifications";
import {
  buildReportEvaluationCountUpdate,
  buildReportEvaluationNotification,
  canCreateReportEvaluation,
  canViewReportEvaluationThread,
  validateEvaluationContent,
} from "@/lib/report-evaluations";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const reportEvaluationTypes = new Set<ReportEvaluationType>(["praise", "improve", "comment"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { reportId } = await params;
  const limit = Math.min(50, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") || "20", 10) || 20));

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          teamGroupId: true,
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ message: "汇报不存在" }, { status: 404 });
  }

  if (
    !canViewReportEvaluationThread({
      actorId: user.id,
      actorRole: user.role,
      actorTeamGroupId: user.teamGroupId,
      reportOwnerId: report.userId,
      reportOwnerTeamGroupId: report.user.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权查看该汇报评价" }, { status: 403 });
  }

  const evaluations = await prisma.reportEvaluation.findMany({
    where: {
      reportId,
      revokedAt: null,
    },
    include: {
      evaluator: {
        select: {
          id: true,
          name: true,
          avatar: true,
          avatarImagePath: true,
          role: true,
        },
      },
      report: {
        select: {
          id: true,
          date: true,
          summary: true,
          submittedAt: true,
          userId: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return NextResponse.json({
    evaluations: evaluations.map(serializeReportEvaluation),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { reportId } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        type?: ReportEvaluationType;
        content?: string;
      }
    | null;

  const evaluationType = body?.type;
  if (!evaluationType || !reportEvaluationTypes.has(evaluationType)) {
    return NextResponse.json({ message: "评价类型无效" }, { status: 400 });
  }

  const contentValidation = validateEvaluationContent({
    type: evaluationType,
    content: body.content,
  });
  if (!contentValidation.valid) {
    return NextResponse.json({ message: contentValidation.message }, { status: 400 });
  }

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          teamGroupId: true,
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ message: "汇报不存在" }, { status: 404 });
  }

  if (
    !canCreateReportEvaluation({
      actorRole: user.role,
      actorTeamGroupId: user.teamGroupId,
      reportOwnerTeamGroupId: report.user.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "只有本组绑定教师可以评价该汇报" }, { status: 403 });
  }

  if (evaluationType === "praise") {
    const existingPraiseEvaluation = await prisma.reportEvaluation.findFirst({
      where: {
        evaluatorId: user.id,
        reportId,
        revokedAt: null,
        type: "praise",
      },
      select: {
        id: true,
      },
    });

    if (existingPraiseEvaluation) {
      return NextResponse.json({ message: "今天已经给这份汇报点过赞" }, { status: 409 });
    }
  }

  const evaluation = await prisma.$transaction(async (tx) => {
    const createdEvaluation = await tx.reportEvaluation.create({
      data: {
        reportId,
        evaluatorId: user.id,
        evaluatorRole: user.role,
        type: evaluationType,
        content: contentValidation.normalizedContent,
      },
      include: {
        evaluator: {
          select: {
            id: true,
            name: true,
            avatar: true,
            avatarImagePath: true,
            role: true,
          },
        },
        report: {
          select: {
            id: true,
            date: true,
            summary: true,
            submittedAt: true,
            userId: true,
          },
        },
      },
    });

    await tx.report.update({
      where: { id: reportId },
      data: buildReportEvaluationCountUpdate(evaluationType, "increment"),
    });

    return createdEvaluation;
  });

  const notification = buildReportEvaluationNotification({
    evaluatorName: user.name,
    type: evaluationType,
    content: contentValidation.normalizedContent,
  });

  await createNotifications({
    userIds: [report.userId],
    senderId: user.id,
    title: notification.title,
    detail: notification.detail,
    type: "report_evaluation",
    targetTab: "reports",
    relatedId: evaluation.id,
  }).catch((error) => {
    console.error("Report evaluation notification failed", error);
  });

  return NextResponse.json(
    {
      evaluation: serializeReportEvaluation(evaluation),
    },
    { status: 201 },
  );
}
