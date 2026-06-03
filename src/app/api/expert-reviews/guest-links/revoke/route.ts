import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        projectReviewStageId?: string;
        expertUserId?: string;
      }
    | null;
  const projectReviewStageId = body?.projectReviewStageId?.trim();
  const expertUserId = body?.expertUserId?.trim();

  if (!projectReviewStageId) {
    return NextResponse.json({ message: "缺少评审轮次" }, { status: 400 });
  }

  const now = new Date();
  const result = await prisma.expertReviewGuestToken.updateMany({
    where: {
      projectReviewStageId,
      expertUserId: expertUserId || undefined,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  });

  return NextResponse.json({
    revokedCount: result.count,
    revokedAt: now.toISOString(),
  });
}
