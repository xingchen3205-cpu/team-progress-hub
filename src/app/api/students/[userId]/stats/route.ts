import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { toIsoDateKey } from "@/lib/date";
import {
  buildStudentRanking,
  calculateContinuousSubmitDays,
  calculateMonthlySubmitRate,
  canViewStudentEvaluationResource,
  getMonthReference,
} from "@/lib/report-evaluations";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type RankingSnapshotInput = {
  userId: string;
  reports: Array<{ date: string; submittedAt: string }>;
  praiseEventCount: number;
};

const buildSnapshotReports = (
  reports: Array<{ date: string; submittedAt: string }>,
  referenceDateKey: string,
) =>
  reports
    .filter((item) => item.date <= referenceDateKey)
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date < right.date ? 1 : -1;
      }

      return left.submittedAt < right.submittedAt ? 1 : -1;
    });

const countPraiseEventsInMonth = ({
  userId,
  praiseEvents,
  monthKey,
  referenceDateKey,
}: {
  userId: string;
  praiseEvents: Array<{ userId: string; createdAt: Date }>;
  monthKey: string;
  referenceDateKey: string;
}) =>
  praiseEvents.filter((item) => {
    const createdDateKey = toIsoDateKey(item.createdAt);
    return item.userId === userId && createdDateKey <= referenceDateKey && createdDateKey.slice(0, 7) === monthKey;
  }).length;

const buildRankingSnapshot = (
  items: RankingSnapshotInput[],
  referenceDate: Date,
) => {
  const { monthKey, dateKey, eligibleDaysInMonth } = getMonthReference(referenceDate);

  return buildStudentRanking(
    items.map((item) => {
      const snapshotReports = buildSnapshotReports(item.reports, dateKey);
      const submittedDateKeys = snapshotReports.map((report) => report.date);
      return {
        userId: item.userId,
        submittedDateKeys,
        praiseCount: item.praiseEventCount,
        continuousSubmitDays: calculateContinuousSubmitDays(submittedDateKeys),
        eligibleDaysInMonth,
        lastSubmittedAt: snapshotReports[0]?.submittedAt ?? null,
      };
    }),
    monthKey,
  );
};

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
    return NextResponse.json({ message: "无权查看该学生统计" }, { status: 403 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      teamGroupId: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json({ message: "学生不存在" }, { status: 404 });
  }

  const groupMembers = await prisma.user.findMany({
    where: targetUser.teamGroupId
      ? {
          approvalStatus: "approved",
          teamGroupId: targetUser.teamGroupId,
          role: {
            in: ["leader", "member"],
          },
        }
      : {
          id: targetUser.id,
        },
    select: {
      id: true,
    },
  });

  const groupMemberIds = groupMembers.map((member) => member.id);
  const reports = await prisma.report.findMany({
    where: {
      userId: {
        in: groupMemberIds,
      },
    },
    select: {
      id: true,
      userId: true,
      date: true,
      submittedAt: true,
      praiseCount: true,
      improveCount: true,
      commentCount: true,
    },
  });

  const praiseEvents = await prisma.reportEvaluation.findMany({
    where: {
      revokedAt: null,
      type: "praise",
      report: {
        userId: {
          in: groupMemberIds,
        },
      },
    },
    select: {
      createdAt: true,
      report: {
        select: {
          userId: true,
        },
      },
    },
  });

  const reportsByUser = new Map<string, Array<{ date: string; submittedAt: string }>>();
  const allTimeTotalsByUser = new Map<string, { praise: number; improve: number }>();

  for (const report of reports) {
    const existingReports = reportsByUser.get(report.userId) ?? [];
    reportsByUser.set(report.userId, [
      ...existingReports,
      {
        date: report.date,
        submittedAt: report.submittedAt.toISOString(),
      },
    ]);

    const existing = allTimeTotalsByUser.get(report.userId) ?? { praise: 0, improve: 0 };
    allTimeTotalsByUser.set(report.userId, {
      praise: existing.praise + report.praiseCount,
      improve: existing.improve + report.improveCount,
    });
  }

  const normalizedPraiseEvents = praiseEvents.map((item) => ({
    userId: item.report.userId,
    createdAt: item.createdAt,
  }));

  const currentReferenceDate = new Date();
  const previousReferenceDate = new Date(currentReferenceDate.getTime() - 24 * 60 * 60 * 1000);
  const currentMonthReference = getMonthReference(currentReferenceDate);
  const currentUserReports = reportsByUser.get(userId) ?? [];
  const currentUserReportDateKeys = currentUserReports.map((item) => item.date);
  const currentUserTotals = allTimeTotalsByUser.get(userId) ?? { praise: 0, improve: 0 };

  const rankingInputs: RankingSnapshotInput[] = groupMemberIds.map((memberId) => ({
    userId: memberId,
    reports: reportsByUser.get(memberId) ?? [],
    praiseEventCount: countPraiseEventsInMonth({
      userId: memberId,
      praiseEvents: normalizedPraiseEvents,
      monthKey: currentMonthReference.monthKey,
      referenceDateKey: currentMonthReference.dateKey,
    }),
  }));

  const currentRanking = buildRankingSnapshot(rankingInputs, currentReferenceDate);
  const previousMonthReference = getMonthReference(previousReferenceDate);
  const previousRanking = buildRankingSnapshot(
    rankingInputs.map((item) => ({
      ...item,
      praiseEventCount: countPraiseEventsInMonth({
        userId: item.userId,
        praiseEvents: normalizedPraiseEvents,
        monthKey: previousMonthReference.monthKey,
        referenceDateKey: previousMonthReference.dateKey,
      }),
    })),
    previousReferenceDate,
  );

  const currentRank = currentRanking.find((item) => item.userId === userId)?.rank ?? currentRanking.length;
  const previousRank = previousRanking.find((item) => item.userId === userId)?.rank ?? currentRank;
  const rankChange = currentRank < previousRank ? "up" : currentRank > previousRank ? "down" : "same";

  return NextResponse.json({
    continuous_submit_days: calculateContinuousSubmitDays(currentUserReportDateKeys),
    monthly_submit_rate: calculateMonthlySubmitRate({
      submittedDateKeys: currentUserReportDateKeys,
      month: currentMonthReference.monthKey,
      eligibleDaysInMonth: currentMonthReference.eligibleDaysInMonth,
    }),
    total_praise_count: currentUserTotals.praise,
    total_improve_count: currentUserTotals.improve,
    group_rank: currentRank,
    group_total: groupMemberIds.length,
    rank_change: rankChange,
    /**
     * 排名规则说明：
     * - 本月提交率 × 40%
     * - 本月累计红花数 × 40%
     * - 当前连续提交天数 × 20%
     * - 同分时按最后提交时间早的优先
     */
  });
}
