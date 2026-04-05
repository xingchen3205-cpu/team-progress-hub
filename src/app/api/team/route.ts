import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { canManageUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/api-serializers";

const defaultPassword = "123456";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const members = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      avatar: true,
      responsibility: true,
      createdAt: true,
    },
  });

  const tasks = await prisma.task.findMany({
    select: { assigneeId: true, status: true },
  });

  const reports = await prisma.report.findMany({
    orderBy: [{ date: "desc" }, { submittedAt: "desc" }],
    select: { userId: true, summary: true, nextPlan: true },
  });

  const latestReportByUser = new Map<string, { summary: string; nextPlan: string }>();
  for (const report of reports) {
    if (!latestReportByUser.has(report.userId)) {
      latestReportByUser.set(report.userId, {
        summary: report.summary,
        nextPlan: report.nextPlan,
      });
    }
  }

  return NextResponse.json({
    members: members.map((member) => {
      const userTasks = tasks.filter((task) => task.assigneeId === member.id);
      const doneCount = userTasks.filter((task) => task.status === "done").length;
      const progress = userTasks.length
        ? `${Math.round((doneCount / userTasks.length) * 100)}%`
        : "0%";
      const latestReport = latestReportByUser.get(member.id);

      return {
        ...serializeUser(member),
        account: member.email || member.username,
        systemRole: serializeUser(member).roleLabel,
        progress,
        canBeManagedByLeader: member.role === "member",
        todayFocus: latestReport?.nextPlan || "待补充",
        completed: latestReport?.summary || "待补充",
        blockers: "暂无",
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (user.role === "member") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        username?: string;
        email?: string;
        role?: "系统管理员" | "指导教师" | "项目负责人" | "团队成员";
        responsibility?: string;
        password?: string;
      }
    | null;

  const roleMap = {
    系统管理员: "admin",
    指导教师: "teacher",
    项目负责人: "leader",
    团队成员: "member",
  } as const;

  const name = body?.name?.trim();
  const username = body?.username?.trim();
  const email = body?.email?.trim() || null;
  const role = body?.role ? roleMap[body.role] : "member";

  if (!name || !username) {
    return NextResponse.json({ message: "成员信息不完整" }, { status: 400 });
  }

  if (!canManageUser(user.role, role, role)) {
    return NextResponse.json({ message: "无权限创建该角色账号" }, { status: 403 });
  }

  const passwordHash = await bcrypt.hash(body?.password?.trim() || defaultPassword, 10);

  const member = await prisma.user.create({
    data: {
      name,
      username,
      email,
      role,
      password: passwordHash,
      avatar: name.slice(0, 1),
      responsibility: body?.responsibility?.trim() || "待分配职责",
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      avatar: true,
      responsibility: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ member: serializeUser(member) }, { status: 201 });
}
