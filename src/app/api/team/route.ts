import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { validateUsername } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import {
  assertMainWorkspaceRole,
  canApproveRegistration,
  canManageUser,
  getRegistrationApproverRoles,
  hasGlobalAdminPrivileges,
  roleLabels,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/api-serializers";

const defaultPassword = "123456";
type TeamMemberRole = "admin" | "school_admin" | "teacher" | "leader" | "member" | "expert";
type TeamViewerRole = TeamMemberRole;
const teamAccountRoles: TeamMemberRole[] = ["teacher", "leader", "member"];
const teamGroupAssignableRoles = new Set<TeamMemberRole>(teamAccountRoles);

const canViewAccountIdentifier = (viewerRole: TeamViewerRole) =>
  hasGlobalAdminPrivileges(viewerRole) || viewerRole === "teacher";

const canViewApprovedMember = (
  viewer: { id: string; role: TeamViewerRole; teamGroupId?: string | null },
  member: { id: string; role: TeamMemberRole; teamGroup?: { id: string } | null },
) => {
  if (hasGlobalAdminPrivileges(viewer.role)) {
    return true;
  }

  if (member.role === "expert") {
    return viewer.role === "teacher";
  }

  if (member.id === viewer.id) {
    return true;
  }

  if (!viewer.teamGroupId) {
    return false;
  }

  return member.teamGroup?.id === viewer.teamGroupId;
};

const buildTeamMemberPayload = (
  member: {
    id: string;
    name: string;
    username: string;
    email: string | null;
    role: TeamMemberRole;
    avatar: string;
    avatarImagePath?: string | null;
    responsibility: string | null;
    approvalStatus: "pending" | "approved";
    approvedAt: Date | null;
    teamGroup?: { id: string; name: string } | null;
  },
  tasks: Array<{ assigneeId: string | null; status: "todo" | "doing" | "review" | "archived" | "done" }>,
  latestReportByUser: Map<string, { summary: string; nextPlan: string }>,
  options: { showAccount: boolean },
) => {
  const userTasks = tasks.filter((task) => task.assigneeId === member.id);
  const doneCount = userTasks.filter((task) => task.status === "done" || task.status === "archived").length;
  const progress = userTasks.length ? `${Math.round((doneCount / userTasks.length) * 100)}%` : "0%";
  const latestReport = latestReportByUser.get(member.id);
  const approverRoles = getRegistrationApproverRoles(member.role);

  return {
    ...serializeUser(member),
    username: options.showAccount ? member.username : "",
    email: options.showAccount ? member.email ?? "" : "",
    account: options.showAccount ? member.email || member.username : "",
    accountHidden: !options.showAccount,
    systemRole: serializeUser(member).roleLabel,
    progress,
    canBeManagedByLeader: member.role === "member",
    todayFocus: latestReport?.summary || "待补充",
    completed: latestReport?.summary || "待补充",
    blockers: "暂无",
    pendingApproverLabel: approverRoles ? approverRoles.map((item) => roleLabels[item]).join(" / ") : null,
  };
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

  const members = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      avatar: true,
      avatarImagePath: true,
      responsibility: true,
      approvalStatus: true,
      approvedAt: true,
      createdAt: true,
      teamGroup: {
        select: {
          id: true,
          name: true,
        },
      },
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

  const approvedMembers = members
    .filter(
      (member) =>
        member.approvalStatus === "approved" &&
        canViewApprovedMember(user, member),
    )
    .map((member) =>
      buildTeamMemberPayload(member, tasks, latestReportByUser, {
        showAccount: canViewAccountIdentifier(user.role),
      }),
    );

  const pendingMembers = members
    .filter(
      (member) =>
        member.approvalStatus === "pending" && canApproveRegistration(user.role, member.role),
    )
    .map((member) =>
      buildTeamMemberPayload(member, tasks, latestReportByUser, {
        showAccount: canViewAccountIdentifier(user.role),
      }),
    );

  const groups = hasGlobalAdminPrivileges(user.role)
    ? await prisma.teamGroup.findMany({
        orderBy: { createdAt: "asc" },
        include: {
          _count: {
            select: {
              members: {
                where: {
                  role: {
                    in: teamAccountRoles,
                  },
                },
              },
            },
          },
        },
      })
    : user.teamGroupId
      ? await prisma.teamGroup.findMany({
          where: { id: user.teamGroupId },
          orderBy: { createdAt: "asc" },
          include: {
            _count: {
              select: {
                members: {
                  where: {
                    role: {
                      in: teamAccountRoles,
                    },
                  },
                },
              },
            },
          },
        })
      : [];

  return NextResponse.json({
    members: approvedMembers,
    pendingMembers,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: group._count.members,
      createdAt: group.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (user.role === "member" || user.role === "expert") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        username?: string;
        email?: string;
        role?: "系统管理员" | "校级管理员" | "指导教师" | "项目负责人" | "团队成员" | "评审专家";
        responsibility?: string;
        password?: string;
        teamGroupId?: string | null;
      }
    | null;

  const roleMap = {
    系统管理员: "admin",
    校级管理员: "school_admin",
    指导教师: "teacher",
    项目负责人: "leader",
    团队成员: "member",
    评审专家: "expert",
  } as const;

  const name = body?.name?.trim();
  const username = body?.username?.trim();
  const email = body?.email?.trim() || null;
  const role = body?.role ? roleMap[body.role] : "member";
  const requestedTeamGroupId = body?.teamGroupId?.trim() || null;

  if (!name || !username) {
    return NextResponse.json({ message: "成员信息不完整" }, { status: 400 });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return NextResponse.json({ message: usernameError }, { status: 400 });
  }

  if (body?.role === "系统管理员") {
    return NextResponse.json({ message: "系统管理员账号为唯一保留账号，不支持新增" }, { status: 403 });
  }

  if (!canManageUser(user.role, role, role)) {
    return NextResponse.json({ message: "无权限创建该角色账号" }, { status: 403 });
  }

  let teamGroupId: string | null = null;
  if (requestedTeamGroupId && teamGroupAssignableRoles.has(role)) {
    if (!hasGlobalAdminPrivileges(user.role)) {
      return NextResponse.json({ message: "无权限设置账号分组" }, { status: 403 });
    }

    const group = await prisma.teamGroup.findUnique({
      where: { id: requestedTeamGroupId },
      select: { id: true },
    });

    if (!group) {
      return NextResponse.json({ message: "分组不存在" }, { status: 404 });
    }

    teamGroupId = group.id;
  } else if (!hasGlobalAdminPrivileges(user.role) && teamGroupAssignableRoles.has(role) && user.teamGroupId) {
    teamGroupId = user.teamGroupId;
  }

  const existingAccount = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username }, ...(email ? [{ email }, { username: email }] : [])],
    },
    select: { id: true },
  });

  if (existingAccount) {
    return NextResponse.json({ message: "用户名或邮箱已存在，请更换后再试" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body?.password?.trim() || defaultPassword, 10);

  try {
    const member = await prisma.user.create({
      data: {
        name,
        username,
        email,
        role,
        password: passwordHash,
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedById: user.id,
        avatar: name.slice(0, 1),
        avatarImagePath: null,
        teamGroupId,
        responsibility: body?.responsibility?.trim() || "待分配职责",
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        avatar: true,
        avatarImagePath: true,
        responsibility: true,
        approvalStatus: true,
        approvedAt: true,
        createdAt: true,
        teamGroup: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ member: serializeUser(member) }, { status: 201 });
  } catch (error) {
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
      (error instanceof Error &&
        /UNIQUE constraint failed: User\.(email|username)/i.test(error.message))
    ) {
      return NextResponse.json({ message: "用户名或邮箱已存在，请更换后再试" }, { status: 409 });
    }

    return NextResponse.json({ message: "创建账号失败，请稍后重试" }, { status: 500 });
  }
}
