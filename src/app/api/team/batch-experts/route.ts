import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { validateUsername } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { canManageUser } from "@/lib/permissions";
import { generateTemporaryPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

type BatchExpertInput = {
  name?: string;
  username?: string;
  password?: string;
  email?: string;
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (!canManageUser(user.role, "expert", "expert")) {
    return NextResponse.json({ message: "无权限批量创建评审专家账号" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        experts?: BatchExpertInput[];
      }
    | null;

  const experts = body?.experts ?? [];
  if (experts.length === 0) {
    return NextResponse.json({ message: "请至少填写一位评审专家" }, { status: 400 });
  }

  if (experts.length > 100) {
    return NextResponse.json({ message: "单次最多批量创建 100 位评审专家" }, { status: 400 });
  }

  const normalizedExperts = experts.map((expert, index) => ({
    lineNumber: index + 1,
    name: expert.name?.trim() ?? "",
    username: expert.username?.trim() ?? "",
    password: expert.password?.trim() || generateTemporaryPassword(),
    generatedPassword: !expert.password?.trim(),
    email: expert.email?.trim() || null,
  }));

  for (const expert of normalizedExperts) {
    if (!expert.name || !expert.username) {
      return NextResponse.json(
        { message: `第 ${expert.lineNumber} 行数据不完整，请填写姓名和账号名` },
        { status: 400 },
      );
    }

    const usernameError = validateUsername(expert.username);
    if (usernameError) {
      return NextResponse.json(
        { message: `第 ${expert.lineNumber} 行账号名不符合规则：${usernameError}` },
        { status: 400 },
      );
    }

    if (expert.password.length < 6) {
      return NextResponse.json(
        { message: `第 ${expert.lineNumber} 行初始密码至少需要 6 位` },
        { status: 400 },
      );
    }
  }

  const usernames = normalizedExperts.map((expert) => expert.username);
  const emails = normalizedExperts.flatMap((expert) => (expert.email ? [expert.email] : []));
  const duplicatedUsername = usernames.find((username, index) => usernames.indexOf(username) !== index);
  const duplicatedEmail = emails.find((email, index) => emails.indexOf(email) !== index);

  if (duplicatedUsername || duplicatedEmail) {
    return NextResponse.json(
      { message: `批量数据里存在重复账号：${duplicatedUsername || duplicatedEmail}` },
      { status: 400 },
    );
  }

  const existingAccounts = await prisma.user.findMany({
    where: {
      OR: [
        ...usernames.map((username) => ({ username })),
        ...usernames.map((username) => ({ email: username })),
        ...emails.map((email) => ({ email })),
        ...emails.map((email) => ({ username: email })),
      ],
    },
    select: { username: true, email: true },
  });

  if (existingAccounts.length > 0) {
    const existingAccount = existingAccounts[0];
    return NextResponse.json(
      { message: `账号已存在：${existingAccount.username || existingAccount.email}` },
      { status: 409 },
    );
  }

  const expertsWithPasswordHash = await Promise.all(
    normalizedExperts.map(async (expert) => ({
      ...expert,
      passwordHash: await bcrypt.hash(expert.password, 10),
    })),
  );

  try {
    const createdExperts = await prisma.$transaction(
      expertsWithPasswordHash.map((expert) =>
        prisma.user.create({
          data: {
            name: expert.name,
            username: expert.username,
            email: expert.email,
            password: expert.passwordHash,
            role: "expert",
            approvalStatus: "approved",
            approvedAt: new Date(),
            approvedById: user.id,
            avatar: expert.name.slice(0, 1),
            avatarImagePath: null,
            responsibility: "职教赛道创业组专家评审",
          },
          select: { id: true, username: true },
        }),
      ),
    );

    return NextResponse.json(
      {
        createdCount: createdExperts.length,
        generatedPasswords: normalizedExperts
          .filter((expert) => expert.generatedPassword)
          .map((expert) => ({ username: expert.username, password: expert.password })),
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
      (error instanceof Error &&
        /UNIQUE constraint failed: User\.(email|username)/i.test(error.message))
    ) {
      return NextResponse.json({ message: "用户名或邮箱已存在，请更换后再试" }, { status: 409 });
    }

    return NextResponse.json({ message: "批量创建评审专家失败，请稍后重试" }, { status: 500 });
  }
}
