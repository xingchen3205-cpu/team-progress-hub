import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { toIsoDateKey } from "@/lib/date";
import { assertMainWorkspaceRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeReport } from "@/lib/api-serializers";
import { createNotifications } from "@/lib/notifications";
import { getAdminReportDeleteFilter, getScopedReportViewFilter } from "@/lib/report-history";

const getReportNotificationRecipientIds = async ({
  role,
  teamGroupId,
  excludeUserId,
}: {
  role: "leader" | "member";
  teamGroupId?: string | null;
  excludeUserId: string;
}) => {
  const teamRoles: Role[] = role === "member" ? ["leader", "teacher"] : ["teacher"];
  const users = await prisma.user.findMany({
    where: {
      approvalStatus: "approved",
      id: {
        not: excludeUserId,
      },
      OR: [
        { role: { in: ["admin", "school_admin"] satisfies Role[] } },
        ...(teamGroupId
          ? [
              {
                teamGroupId,
                role: {
                  in: [...teamRoles],
                },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const selectedTeamGroupId = request.nextUrl.searchParams.get("teamGroupId")?.trim() || null;

  const reportWhere = getScopedReportViewFilter({
    role: user.role,
    userId: user.id,
    viewerTeamGroupId: user.teamGroupId,
    selectedTeamGroupId,
  });

  const reports = await prisma.report.findMany({
    where: reportWhere,
    orderBy: [{ date: "desc" }, { submittedAt: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatar: true,
          role: true,
          teamGroupId: true,
          teamGroup: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  const dates = Array.from(new Set(reports.map((item) => item.date))).sort((a, b) =>
    a < b ? 1 : -1,
  );

  return NextResponse.json({
    dates,
    reports: reports.map(serializeReport),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  if (user.role !== "leader" && user.role !== "member") {
    return NextResponse.json({ message: "当前角色无需提交汇报" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        date?: string;
        summary?: string;
        nextPlan?: string;
        attachment?: string;
      }
    | null;

  const date = body?.date?.trim() || toIsoDateKey(new Date());
  const summary = body?.summary?.trim();
  const nextPlan = body?.nextPlan?.trim();
  const attachment = body?.attachment?.trim() || "";

  if (!summary || !nextPlan) {
    return NextResponse.json({ message: "请填写今日完成和明日计划" }, { status: 400 });
  }

  const existingReport = await prisma.report.findUnique({
    where: {
      userId_date: {
        userId: user.id,
        date,
      },
    },
    select: { id: true },
  });

  const report = await prisma.report.upsert({
    where: {
      userId_date: {
        userId: user.id,
        date,
      },
    },
    update: {
      summary,
      nextPlan,
      attachment,
      submittedAt: new Date(),
    },
    create: {
      userId: user.id,
      date,
      summary,
      nextPlan,
      attachment,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatar: true,
          role: true,
          teamGroupId: true,
          teamGroup: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  const recipientIds = await getReportNotificationRecipientIds({
    role: user.role,
    teamGroupId: user.teamGroupId,
    excludeUserId: user.id,
  });

  if (!existingReport) {
    await createNotifications({
      userIds: recipientIds,
      title: "工作汇报提交提醒",
      detail: `${report.user.name} 提交了 ${date} 的工作汇报`,
      type: "report_submit",
      targetTab: "reports",
      relatedId: report.id,
      email: { noticeType: "日程汇报提醒" },
      emailTeamGroupId: user.teamGroupId ?? null,
    });
  }

  return NextResponse.json(
    { report: serializeReport(report) },
    { status: existingReport ? 200 : 201 },
  );
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const date = request.nextUrl.searchParams.get("date")?.trim();
  if (!date) {
    return NextResponse.json({ message: "缺少汇报日期" }, { status: 400 });
  }

  if (hasGlobalAdminPrivileges(user.role)) {
    const teamGroupId = request.nextUrl.searchParams.get("teamGroupId")?.trim();
    const where = getAdminReportDeleteFilter({ date, teamGroupId });

    if (!where) {
      return NextResponse.json({ message: "请选择要删除的项目组和日期" }, { status: 400 });
    }

    const result = await prisma.report.deleteMany({ where });
    return NextResponse.json({ success: true, deletedCount: result.count });
  }

  if (user.role !== "leader" && user.role !== "member") {
    return NextResponse.json({ message: "当前角色无需撤回汇报" }, { status: 403 });
  }

  const existingReport = await prisma.report.findUnique({
    where: {
      userId_date: {
        userId: user.id,
        date,
      },
    },
  });

  if (!existingReport) {
    return NextResponse.json({ message: "当日汇报不存在" }, { status: 404 });
  }

  await prisma.report.delete({
    where: {
      userId_date: {
        userId: user.id,
        date,
      },
    },
  });

  return NextResponse.json({ success: true });
}
