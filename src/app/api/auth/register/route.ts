import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { validateUsername } from "@/lib/account-policy";
import { prisma } from "@/lib/prisma";
import { getRegistrationApproverRoles, roleLabels } from "@/lib/permissions";

const registrationRoleMap = {
  指导教师: "teacher",
  项目负责人: "leader",
  团队成员: "member",
  评审专家: "expert",
} as const;

const defaultResponsibilityByRole = {
  teacher: "待审核通过后补充指导职责",
  leader: "待审核通过后补充负责内容",
  member: "待审核通过后补充负责内容",
  expert: "待审核通过后补充评审方向",
} as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        username?: string;
        password?: string;
        role?: keyof typeof registrationRoleMap;
      }
    | null;

  const name = body?.name?.trim();
  const username = body?.username?.trim();
  const password = body?.password?.trim();
  const role = body?.role ? registrationRoleMap[body.role] : null;

  if (!name || !username || !password || !role) {
    return NextResponse.json({ message: "请完整填写姓名、账号名、密码和身份" }, { status: 400 });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return NextResponse.json({ message: usernameError }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ message: "密码至少需要 6 位" }, { status: 400 });
  }

  const approverRoles = getRegistrationApproverRoles(role);
  if (!approverRoles) {
    return NextResponse.json({ message: "当前身份不支持自助注册" }, { status: 400 });
  }

  const existingAccount = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username }],
    },
    select: { id: true },
  });

  if (existingAccount) {
    return NextResponse.json({ message: "账号名已存在，请更换后再试" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: {
        name,
        username,
        email: null,
        password: passwordHash,
        role,
        approvalStatus: "pending",
        avatar: name.slice(0, 1),
        responsibility: defaultResponsibilityByRole[role],
      },
    });

    return NextResponse.json(
      {
        message: `注册申请已提交，请等待${approverRoles.map((item) => roleLabels[item]).join(" / ")}审核通过后登录`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
      (error instanceof Error && /UNIQUE constraint failed: User\.(email|username)/i.test(error.message))
    ) {
      return NextResponse.json({ message: "账号名已存在，请更换后再试" }, { status: 409 });
    }

    return NextResponse.json({ message: "注册失败，请稍后重试" }, { status: 500 });
  }
}
