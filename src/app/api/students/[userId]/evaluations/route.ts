import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeReportEvaluation } from "@/lib/api-serializers";
import { canViewStudentEvaluationResource } from "@/lib/report-evaluations";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
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

  const { userId } = await params;
  if (
    !canViewStudentEvaluationResource({
      actorId: user.id,
      actorRole: user.role,
      targetUserId: userId,
    })
  ) {
    return NextResponse.json({ message: "无权查看该学生评价" }, { status: 403 });
  }

  const unreadOnly = request.nextUrl.searchParams.get("unread_only") === "true";
  const limit = Math.min(50, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") || "20", 10) || 20));

  const evaluations = await prisma.reportEvaluation.findMany({
    where: {
      revokedAt: null,
      ...(unreadOnly ? { isRead: false } : {}),
      report: {
        userId,
      },
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
