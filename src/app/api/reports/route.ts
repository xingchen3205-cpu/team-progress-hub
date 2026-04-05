import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { toIsoDateKey } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { serializeReport } from "@/lib/api-serializers";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const reports = await prisma.report.findMany({
    where: user.role === "member" ? { userId: user.id } : undefined,
    orderBy: [{ date: "desc" }, { submittedAt: "desc" }],
    include: {
      user: {
        select: { id: true, name: true, avatar: true, role: true },
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

  if (user.role === "teacher") {
    return NextResponse.json({ message: "指导教师无需提交汇报" }, { status: 403 });
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
        select: { id: true, name: true, avatar: true, role: true },
      },
    },
  });

  return NextResponse.json({ report: serializeReport(report) }, { status: 201 });
}
