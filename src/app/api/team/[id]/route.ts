import { NextRequest, NextResponse } from "next/server";

import { validateUsername } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import {
  assertMainWorkspaceRole,
  canApproveRegistration,
  canManageUser,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/api-serializers";
import { deleteStoredFile } from "@/lib/uploads";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json({ message: "成员不存在" }, { status: 404 });
  }

  if (
    user.role !== "admin" &&
    target.role !== "expert" &&
    target.id !== user.id &&
    target.teamGroupId !== user.teamGroupId
  ) {
    return NextResponse.json({ message: "无权限操作其他队伍账号" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        username?: string;
        email?: string;
        role?: "系统管理员" | "指导教师" | "项目负责人" | "团队成员" | "评审专家";
        responsibility?: string;
        password?: string;
        action?: "approve";
        teamGroupId?: string | null;
      }
    | null;

  const roleMap = {
    系统管理员: "admin",
    指导教师: "teacher",
    项目负责人: "leader",
    团队成员: "member",
    评审专家: "expert",
  } as const;

  const nextRole = body?.role ? roleMap[body.role] : target.role;

  if (body?.action === "approve") {
    if (target.approvalStatus === "approved") {
      return NextResponse.json({ message: "该账号已审核通过" }, { status: 400 });
    }

    if (!canApproveRegistration(user.role, target.role)) {
      return NextResponse.json({ message: "无权限审核该账号" }, { status: 403 });
    }

    const member = await prisma.user.update({
      where: { id },
      data: {
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedById: user.id,
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

    return NextResponse.json({ member: serializeUser(member) });
  }

  if (target.approvalStatus === "pending") {
    return NextResponse.json({ message: "待审核账号请先审核通过或删除" }, { status: 400 });
  }

  if (target.role === "admin" && nextRole !== "admin") {
    return NextResponse.json({ message: "admin 账号角色不能被修改" }, { status: 403 });
  }

  if (!canManageUser(user.role, target.role, nextRole)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  let nextTeamGroupId: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "teamGroupId")) {
    if (user.role !== "admin") {
      return NextResponse.json({ message: "无权限设置账号分组" }, { status: 403 });
    }

    if (nextRole === "expert") {
      nextTeamGroupId = null;
    } else if (body?.teamGroupId) {
      const group = await prisma.teamGroup.findUnique({
        where: { id: body.teamGroupId },
        select: { id: true },
      });

      if (!group) {
        return NextResponse.json({ message: "分组不存在" }, { status: 404 });
      }

      nextTeamGroupId = group.id;
    } else {
      nextTeamGroupId = null;
    }
  } else if (nextRole === "expert" && target.role !== "expert") {
    nextTeamGroupId = null;
  }

  const nextUsername = body?.username?.trim();
  const nextEmail =
    body?.email === ""
      ? null
      : body?.email?.trim() || undefined;

  if (nextUsername && nextUsername !== target.username) {
    const usernameError = validateUsername(nextUsername);
    if (usernameError) {
      return NextResponse.json({ message: usernameError }, { status: 400 });
    }
  }

  const conflictChecks = [
    ...(nextUsername ? [{ username: nextUsername }, { email: nextUsername }] : []),
    ...(typeof nextEmail === "string" ? [{ email: nextEmail }, { username: nextEmail }] : []),
  ];

  if (conflictChecks.length > 0) {
    const conflictAccount = await prisma.user.findFirst({
      where: {
        id: {
          not: target.id,
        },
        OR: conflictChecks,
      },
      select: { id: true },
    });

    if (conflictAccount) {
      return NextResponse.json({ message: "用户名或邮箱已存在，请更换后再试" }, { status: 409 });
    }
  }

  let nextPassword: string | undefined;
  if (body?.password?.trim()) {
    const bcrypt = await import("bcryptjs");
    nextPassword = await bcrypt.hash(body.password.trim(), 10);
  }

  const member = await prisma.user.update({
    where: { id },
    data: {
      name: body?.name?.trim() || undefined,
      username: nextUsername || undefined,
      email: nextEmail,
      role: target.role === "admin" ? undefined : nextRole,
      teamGroupId: nextTeamGroupId,
      responsibility: body?.responsibility?.trim() || undefined,
      avatar: body?.name?.trim()?.slice(0, 1) || undefined,
      password: nextPassword,
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

  return NextResponse.json({ member: serializeUser(member) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ message: "成员不存在" }, { status: 404 });
  }

  if (!canManageUser(user.role, target.role)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  if (target.approvalStatus === "pending") {
    if (!canApproveRegistration(user.role, target.role)) {
      return NextResponse.json({ message: "无权限删除该待审核账号" }, { status: 403 });
    }

    await prisma.user.delete({
      where: {
        id: target.id,
      },
    });

    if (target.avatarImagePath) {
      await deleteStoredFile(target.avatarImagePath).catch(() => {});
    }

    return NextResponse.json({ success: true });
  }

  if (target.role === "admin") {
    return NextResponse.json({ message: "admin 账号不能被删除" }, { status: 403 });
  }

  if (target.id === user.id) {
    return NextResponse.json({ message: "不能删除当前登录账号" }, { status: 400 });
  }

  const unfinishedTaskCount = await prisma.task.count({
    where: {
      assigneeId: target.id,
      status: {
        in: ["todo", "doing"],
      },
    },
  });

  if (unfinishedTaskCount > 0) {
    return NextResponse.json(
      { message: "该成员有未完成任务，无法删除，请先处理或转移任务。" },
      { status: 409 },
    );
  }

  const fallbackOwner =
    (await prisma.user.findFirst({
      where: {
        id: {
          not: target.id,
        },
        role: "leader",
      },
      orderBy: {
        createdAt: "asc",
      },
    })) ??
    (await prisma.user.findFirst({
      where: {
        id: {
          not: target.id,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }));

  if (!fallbackOwner) {
    return NextResponse.json({ message: "系统中缺少可接管关联数据的账号，暂时无法删除。" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: {
        approvedById: target.id,
      },
      data: {
        approvedById: null,
      },
    }),
    prisma.task.updateMany({
      where: {
        assigneeId: target.id,
      },
      data: {
        assigneeId: fallbackOwner.id,
      },
    }),
    prisma.task.updateMany({
      where: {
        creatorId: target.id,
      },
      data: {
        creatorId: fallbackOwner.id,
      },
    }),
    prisma.announcement.updateMany({
      where: {
        authorId: target.id,
      },
      data: {
        authorId: fallbackOwner.id,
      },
    }),
    prisma.notification.deleteMany({
      where: {
        userId: target.id,
      },
    }),
    prisma.notification.updateMany({
      where: {
        senderId: target.id,
      },
      data: {
        senderId: null,
      },
    }),
    prisma.document.updateMany({
      where: {
        ownerId: target.id,
      },
      data: {
        ownerId: fallbackOwner.id,
      },
    }),
    prisma.documentVersion.updateMany({
      where: {
        uploaderId: target.id,
      },
      data: {
        uploaderId: fallbackOwner.id,
      },
    }),
    prisma.expertReviewPackage.updateMany({
      where: {
        createdById: target.id,
      },
      data: {
        createdById: fallbackOwner.id,
      },
    }),
    prisma.expertReviewScore.deleteMany({
      where: {
        reviewerId: target.id,
      },
    }),
    prisma.expertReviewAssignment.deleteMany({
      where: {
        expertUserId: target.id,
      },
    }),
    prisma.report.deleteMany({
      where: {
        userId: target.id,
      },
    }),
    prisma.user.delete({
      where: {
        id: target.id,
      },
    }),
  ]);

  if (target.avatarImagePath) {
    await deleteStoredFile(target.avatarImagePath).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
