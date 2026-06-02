import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { validateUsername } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { generateTemporaryPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { buildTeacherTrainingAccountMessage } from "@/lib/teacher-training";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { deleteStoredFile } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{
    participantId: string;
  }>;
};

const normalizeUsernameSeed = (value: string) => value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);

const buildDefaultUsername = (participant: { phone?: string | null; name: string }) => {
  const phoneDigits = participant.phone?.replace(/\D/g, "") ?? "";
  const suffix = phoneDigits ? phoneDigits.slice(-8) : normalizeUsernameSeed(participant.name);

  return `sp${suffix || Date.now().toString().slice(-8)}`;
};

const buildUniqueUsername = async (preferredUsername: string) => {
  const baseUsername = normalizeUsernameSeed(preferredUsername) || `sp${Date.now().toString().slice(-8)}`;
  for (let index = 0; index < 20; index += 1) {
    const username = index === 0 ? baseUsername : `${baseUsername}${index + 1}`;
    const existingAccount = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email: username }],
      },
      select: { id: true },
    });

    if (!existingAccount) {
      return username;
    }
  }

  return `${baseUsername}${Math.floor(Math.random() * 9000) + 1000}`;
};

const getManageableParticipantAccount = async (participantId: string) =>
  prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      cohort: {
        deletedAt: null,
      },
    },
    include: {
      cohort: {
        select: {
          title: true,
        },
      },
      accountUser: {
        select: {
          id: true,
          username: true,
          role: true,
          avatarImagePath: true,
        },
      },
    },
  });

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { participantId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        accountUsername?: string;
        accountPassword?: string;
      }
    | null;

  const participant = await getManageableParticipantAccount(participantId);
  if (!participant) {
    return NextResponse.json({ message: "参训教师不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, participant.cohortId))) {
    return NextResponse.json({ message: "无权限分配该省培班次账号" }, { status: 403 });
  }

  const requestedUsername = body?.accountUsername?.trim();
  if (requestedUsername) {
    const usernameError = validateUsername(requestedUsername);
    if (usernameError) {
      return NextResponse.json({ message: usernameError }, { status: 400 });
    }

    const existingAccount = await prisma.user.findFirst({
      where: {
        OR: [{ username: requestedUsername }, { email: requestedUsername }],
      },
      select: {
        id: true,
        username: true,
        role: true,
      },
    });

    if (existingAccount && existingAccount.id !== participant.accountUserId) {
      if (existingAccount.role === "expert") {
        return NextResponse.json({ message: "评审专家账号不能绑定为省培参训教师" }, { status: 400 });
      }

      const updatedParticipant = await prisma.teacherTrainingParticipant.update({
        where: { id: participant.id },
        data: {
          accountUserId: existingAccount.id,
        },
        include: {
          accountUser: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      });

      return NextResponse.json({
        participant: updatedParticipant,
        username: existingAccount.username,
        temporaryPassword: null,
        linkedExistingAccount: true,
        messageText: [
          `${participant.name}老师您好，您的省培权限已开通。`,
          `培训：${participant.cohort.title}`,
          `登录账号：${existingAccount.username}`,
          "请使用原平台密码登录创新创业管理平台，并在顶部切换到省培系统。",
          "首次进入省培后请完整填写个人资料和预计到达信息，并及时修改初始密码。",
          "登录地址：https://xingchencxcy.com/login",
        ].join("\n"),
      });
    }
  }

  let accountUsername = participant.accountUser?.username ?? "";
  if (!accountUsername) {
    accountUsername = requestedUsername || buildDefaultUsername(participant);
    const usernameError = validateUsername(accountUsername);
    if (requestedUsername && usernameError) {
      return NextResponse.json({ message: usernameError }, { status: 400 });
    }
    accountUsername = await buildUniqueUsername(accountUsername);
  }

  const temporaryPassword = body?.accountPassword?.trim() || generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const accountUser = participant.accountUserId && participant.accountUser?.role === "training_teacher"
    ? await prisma.user.update({
        where: { id: participant.accountUserId },
        data: {
          name: participant.name,
          username: accountUsername,
          password: passwordHash,
          role: "training_teacher",
          approvalStatus: "approved",
          approvedAt: new Date(),
          approvedById: user.id,
          responsibility: "江苏省职业院校创新创业教育（竞赛）指导能力提升培训参训教师",
        },
        select: { id: true, username: true },
      })
    : participant.accountUserId && participant.accountUser
      ? {
          id: participant.accountUser.id,
          username: participant.accountUser.username,
        }
    : await prisma.user.create({
        data: {
          name: participant.name,
          username: accountUsername,
          email: null,
          password: passwordHash,
          role: "training_teacher",
          approvalStatus: "approved",
          approvedAt: new Date(),
          approvedById: user.id,
          avatar: participant.name.slice(0, 1) || "师",
          avatarImagePath: null,
          responsibility: "江苏省职业院校创新创业教育（竞赛）指导能力提升培训参训教师",
        },
        select: { id: true, username: true },
      });

  const updatedParticipant = await prisma.teacherTrainingParticipant.update({
    where: { id: participant.id },
    data: {
      accountUserId: accountUser.id,
    },
    include: {
      accountUser: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  });
  const messageText = buildTeacherTrainingAccountMessage({
    cohortTitle: participant.cohort.title,
    name: participant.name,
    username: accountUser.username,
    password: participant.accountUserId && participant.accountUser?.role !== "training_teacher" ? "使用原平台密码" : temporaryPassword,
  });

  return NextResponse.json({
    participant: updatedParticipant,
    username: accountUser.username,
    temporaryPassword: participant.accountUserId && participant.accountUser?.role !== "training_teacher" ? null : temporaryPassword,
    messageText,
    linkedExistingAccount: Boolean(participant.accountUserId && participant.accountUser?.role !== "training_teacher"),
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { participantId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        accountUsername?: string;
        accountPassword?: string;
      }
    | null;

  const participant = await getManageableParticipantAccount(participantId);
  if (!participant) {
    return NextResponse.json({ message: "参训教师不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, participant.cohortId))) {
    return NextResponse.json({ message: "无权限修改该省培班次账号" }, { status: 403 });
  }
  if (!participant.accountUserId || !participant.accountUser) {
    return NextResponse.json({ message: "该参训教师尚未开通省培账号" }, { status: 404 });
  }
  if (participant.accountUser.role !== "training_teacher") {
    return NextResponse.json({ message: "该参训教师绑定的是原平台账号，不能在省培里修改密码或用户名" }, { status: 400 });
  }

  const nextUsername = body?.accountUsername?.trim();
  if (nextUsername && nextUsername !== participant.accountUser.username) {
    const usernameError = validateUsername(nextUsername);
    if (usernameError) {
      return NextResponse.json({ message: usernameError }, { status: 400 });
    }

    const conflictAccount = await prisma.user.findFirst({
      where: {
        id: {
          not: participant.accountUser.id,
        },
        OR: [{ username: nextUsername }, { email: nextUsername }],
      },
      select: { id: true },
    });
    if (conflictAccount) {
      return NextResponse.json({ message: "用户名已存在，请更换后再试" }, { status: 409 });
    }
  }

  const nextPassword = body?.accountPassword?.trim();
  const passwordHash = nextPassword ? await bcrypt.hash(nextPassword, 10) : undefined;
  const accountUser = await prisma.user.update({
    where: { id: participant.accountUser.id },
    data: {
      name: participant.name,
      username: nextUsername || undefined,
      password: passwordHash,
      role: "training_teacher",
      approvalStatus: "approved",
      approvedAt: new Date(),
      approvedById: user.id,
      avatar: participant.name.slice(0, 1) || "师",
      responsibility: "江苏省职业院校创新创业教育（竞赛）指导能力提升培训参训教师",
    },
    select: {
      id: true,
      username: true,
    },
  });

  return NextResponse.json({
    username: accountUser.username,
    messageText: nextPassword
      ? buildTeacherTrainingAccountMessage({
          cohortTitle: participant.cohort.title,
          name: participant.name,
          username: accountUser.username,
          password: nextPassword,
        })
      : "",
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(_request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { participantId } = await context.params;
  const participant = await getManageableParticipantAccount(participantId);
  if (!participant) {
    return NextResponse.json({ message: "参训教师不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, participant.cohortId))) {
    return NextResponse.json({ message: "无权限删除该省培班次账号" }, { status: 403 });
  }
  if (!participant.accountUserId || !participant.accountUser) {
    return NextResponse.json({ message: "该参训教师尚未开通省培账号" }, { status: 404 });
  }
  if (participant.accountUser.role !== "training_teacher") {
    return NextResponse.json({ message: "只能删除省培教师账号，已绑定的原平台账号不能在省培里删除" }, { status: 400 });
  }
  if (participant.accountUser.id === user.id) {
    return NextResponse.json({ message: "不能删除当前登录账号" }, { status: 400 });
  }

  const accountUserId = participant.accountUser.id;
  const blockingApprovalCount = await prisma.teacherTrainingLeaveApproval.count({
    where: { approverId: accountUserId },
  });
  if (blockingApprovalCount > 0) {
    return NextResponse.json({ message: "该账号已有审批记录，不能删除账号；可先解绑参训档案。" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherTrainingParticipant.updateMany({
      where: { accountUserId },
      data: { accountUserId: null },
    });
    await tx.teacherTrainingLeaveRequest.updateMany({
      where: { submittedById: accountUserId },
      data: { submittedById: user.id },
    });
    await tx.teacherTrainingSubmission.updateMany({
      where: { submittedById: accountUserId },
      data: { submittedById: user.id },
    });
    await tx.report.deleteMany({
      where: { userId: accountUserId },
    });
    await tx.notification.deleteMany({
      where: { userId: accountUserId },
    });
    await tx.notification.updateMany({
      where: { senderId: accountUserId },
      data: { senderId: null },
    });
    await tx.user.updateMany({
      where: { approvedById: accountUserId },
      data: { approvedById: null },
    });
    await tx.user.delete({
      where: { id: accountUserId },
    });
  });

  if (participant.accountUser.avatarImagePath) {
    await deleteStoredFile(participant.accountUser.avatarImagePath).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
