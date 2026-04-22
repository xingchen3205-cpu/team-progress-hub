import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { canViewStudentEvaluationResource } from "@/lib/report-evaluations";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(
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
    return NextResponse.json({ message: "无权更新该学生评价状态" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { evaluation_ids?: string[] } | null;
  const evaluationIds = [...new Set((body?.evaluation_ids ?? []).filter((item): item is string => Boolean(item && item.trim())))];

  if (evaluationIds.length === 0) {
    return NextResponse.json({ message: "缺少评价 ID" }, { status: 400 });
  }

  const result = await prisma.reportEvaluation.updateMany({
    where: {
      id: {
        in: evaluationIds,
      },
      revokedAt: null,
      report: {
        userId,
      },
    },
    data: {
      isRead: true,
    },
  });

  return NextResponse.json({
    success: true,
    updatedCount: result.count,
  });
}
