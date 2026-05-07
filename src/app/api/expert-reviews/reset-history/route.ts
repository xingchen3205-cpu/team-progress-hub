import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const parseScoreSnapshot = (snapshot: string) => {
  try {
    return JSON.parse(snapshot) as {
      assignmentId?: string;
      expertUserId?: string;
      expertName?: string;
      score?: {
        totalScore?: number;
        submittedAt?: string;
        lockedAt?: string | null;
      };
    };
  } catch {
    return null;
  }
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const packageId = request.nextUrl.searchParams.get("packageId")?.trim();
  const histories = await prisma.expertReviewScoreHistory.findMany({
    where: packageId ? { packageId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    histories: histories.map((history) => {
      const snapshot = parseScoreSnapshot(history.snapshot);
      return {
        id: history.id,
        packageId: history.packageId,
        assignmentId: history.assignmentId,
        reviewerId: history.reviewerId,
        resetById: history.resetById,
        resetReason: history.resetReason,
        createdAt: history.createdAt.toISOString(),
        expertName: snapshot?.expertName ?? "未知专家",
        totalScoreText:
          typeof snapshot?.score?.totalScore === "number"
            ? (snapshot.score.totalScore / 100).toFixed(2)
            : "--",
        submittedAt: snapshot?.score?.submittedAt ?? null,
        lockedAt: snapshot?.score?.lockedAt ?? null,
      };
    }),
  });
}
