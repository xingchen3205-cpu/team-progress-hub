import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { validateUsername } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { generateTemporaryPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { buildTeacherTrainingAccountMessage } from "@/lib/teacher-training";

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

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限分配省培账号" }, { status: 403 });
  }

  const { participantId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        accountUsername?: string;
        accountPassword?: string;
      }
    | null;

  const participant = await prisma.teacherTrainingParticipant.findUnique({
    where: { id: participantId },
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
        },
      },
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "参训教师不存在" }, { status: 404 });
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
