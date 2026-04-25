import { NextRequest, NextResponse } from "next/server";

import { toIsoDateKey } from "@/lib/date";
import { getEmailReminderSettings, isDailyReportReminderDue } from "@/lib/email-settings";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (cronSecret && authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "无权限" }, { status: 401 });
  }

  const now = new Date();
  const emailSettings = await getEmailReminderSettings();
  if (!isDailyReportReminderDue(emailSettings, now)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "not_configured_hour",
      configuredHour: emailSettings.dailyReportHour,
    });
  }

  const date = toIsoDateKey(new Date());
  const reportUsers = await prisma.user.findMany({
    where: {
      approvalStatus: "approved",
      role: {
        in: ["leader", "member"],
      },
    },
    select: {
      id: true,
      name: true,
      teamGroupId: true,
      teamGroup: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const userIds = reportUsers.map((user) => user.id);

  if (userIds.length === 0) {
    return NextResponse.json({ success: true, date, remindedCount: 0 });
  }

  const [reports, existingReminders] = await Promise.all([
    prisma.report.findMany({
      where: {
        date,
        userId: {
          in: userIds,
        },
      },
      select: {
        userId: true,
      },
    }),
    prisma.notification.findMany({
      where: {
        type: "report_daily_missing",
        relatedId: date,
        userId: {
          in: userIds,
        },
      },
      select: {
        userId: true,
      },
    }),
  ]);

  const submittedUserIds = new Set(reports.map((report) => report.userId));
  const alreadyRemindedUserIds = new Set(existingReminders.map((reminder) => reminder.userId));
  const pendingUserIds = userIds.filter(
    (userId) => !submittedUserIds.has(userId) && !alreadyRemindedUserIds.has(userId),
  );

  if (pendingUserIds.length > 0) {
    await createNotifications({
      userIds: pendingUserIds,
      title: "日程汇报填写提醒",
      detail: `今天的日程汇报还没有提交，请在当日结束前补充今日完成和明日计划。`,
      type: "report_daily_missing",
      targetTab: "reports",
      relatedId: date,
      email: true,
    });
  }

  const groupStats = new Map<string, { name: string; expected: number; missing: number }>();
  for (const user of reportUsers) {
    if (!user.teamGroupId) {
      continue;
    }

    const current = groupStats.get(user.teamGroupId) ?? {
      name: user.teamGroup?.name ?? "未命名项目组",
      expected: 0,
      missing: 0,
    };
    current.expected += 1;
    if (pendingUserIds.includes(user.id)) {
      current.missing += 1;
    }
    groupStats.set(user.teamGroupId, current);
  }

  const abnormalGroups = [...groupStats.values()].filter((group) => group.missing > 0);
  if (abnormalGroups.length > 0) {
    const adminUsers = await prisma.user.findMany({
      where: {
        approvalStatus: "approved",
        role: {
          in: ["admin", "school_admin"],
        },
      },
      select: {
        id: true,
      },
    });
    const existingAdminSummaries = await prisma.notification.findMany({
      where: {
        type: "report_daily_admin_summary",
        relatedId: date,
        userId: {
          in: adminUsers.map((user) => user.id),
        },
      },
      select: {
        userId: true,
      },
    });
    const alreadySummarizedAdminIds = new Set(existingAdminSummaries.map((notification) => notification.userId));
    const pendingAdminSummaryUserIds = adminUsers
      .map((user) => user.id)
      .filter((userId) => !alreadySummarizedAdminIds.has(userId));

    await createNotifications({
      userIds: pendingAdminSummaryUserIds,
      title: "全校汇报异常汇总",
      detail: `今日有 ${abnormalGroups.length} 个项目组未全员提交，${pendingUserIds.length} 人未提交。`,
      type: "report_daily_admin_summary",
      targetTab: "reports",
      relatedId: date,
    });
  }

  return NextResponse.json({
    success: true,
    date,
    remindedCount: pendingUserIds.length,
    adminSummaryCount: abnormalGroups.length,
  });
}
