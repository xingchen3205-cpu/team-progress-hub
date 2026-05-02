import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { validateRequiredEmail, validateUsername } from "@/lib/account-policy";
import {
  emailVerificationMaxAttempts,
  verifyEmailVerificationCode,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";
import { getRegistrationApproverRoles, roleLabels } from "@/lib/permissions";
import { authRateLimits, checkRateLimit, rateLimitExceededResponse } from "@/lib/security";

const registrationRoleMap = {
  指导教师: "teacher",
  项目负责人: "leader",
  团队成员: "member",
} as const;

const defaultResponsibilityByRole = {
  teacher: "待审核通过后补充指导职责",
  leader: "待审核通过后补充负责内容",
  member: "待审核通过后补充负责内容",
} as const;

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, authRateLimits.registerIp);
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit, "注册请求过于频繁，请稍后再试");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        username?: string;
        email?: string;
        emailCode?: string;
        password?: string;
        role?: keyof typeof registrationRoleMap;
        college?: string;
        className?: string;
        studentId?: string;
      }
    | null;

  const name = body?.name?.trim();
  const username = body?.username?.trim();
  const email = body?.email?.trim().toLowerCase();
  const emailCode = body?.emailCode?.trim();
  const password = body?.password?.trim();
  const role = body?.role ? registrationRoleMap[body.role] : null;
  const college = body?.college?.trim();
  const className = body?.className?.trim();
  const studentId = body?.studentId?.trim();

  if (!name || !username || !email || !emailCode || !password || !role) {
    return NextResponse.json({ message: "请完整填写姓名、账号名、邮箱、邮箱验证码、密码和身份" }, { status: 400 });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return NextResponse.json({ message: usernameError }, { status: 400 });
  }

  const emailError = validateRequiredEmail(email);
  if (emailError) {
    return NextResponse.json({ message: emailError }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ message: "密码至少需要 6 位" }, { status: 400 });
  }

  if ((role === "leader" || role === "member") && (!college || !className || !studentId)) {
    return NextResponse.json(
      { message: "项目负责人和团队成员请填写学院、专业班级和学号" },
      { status: 400 },
    );
  }

  if (role === "teacher" && !college) {
    return NextResponse.json({ message: "指导教师请填写所属学院或部门" }, { status: 400 });
  }

  const approverRoles = getRegistrationApproverRoles(role);
  if (!approverRoles) {
    return NextResponse.json({ message: "当前身份不支持自助注册" }, { status: 400 });
  }

  const existingAccount = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username }, { email }, { username: email }],
    },
    select: { id: true },
  });

  if (existingAccount) {
    return NextResponse.json({ message: "账号名或邮箱已存在，请更换后再试" }, { status: 409 });
  }

  const verification = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      purpose: "register",
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!verification || verification.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ message: "邮箱验证码错误或已过期，请重新获取" }, { status: 400 });
  }

  if (verification.attempts >= emailVerificationMaxAttempts) {
    return NextResponse.json({ message: "邮箱验证码尝试次数过多，请重新获取" }, { status: 400 });
  }

  const codeMatched = verifyEmailVerificationCode({
    email,
    code: emailCode,
    purpose: "register",
    codeHash: verification.codeHash,
  });

  if (!codeMatched) {
    await prisma.emailVerificationCode.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ message: "邮箱验证码错误或已过期，请重新获取" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationCode.update({
        where: { id: verification.id },
        data: {
          attempts: { increment: 1 },
          consumedAt: new Date(),
        },
      });

      await tx.user.create({
        data: {
          name,
          username,
          email,
          emailVerifiedAt: new Date(),
          password: passwordHash,
          role,
          approvalStatus: "pending",
          avatar: name.slice(0, 1),
          responsibility: defaultResponsibilityByRole[role],
          college: college || null,
          className: role === "leader" || role === "member" ? className || null : null,
          studentId: role === "leader" || role === "member" ? studentId || null : null,
        },
      });
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
      return NextResponse.json({ message: "账号名或邮箱已存在，请更换后再试" }, { status: 409 });
    }

    return NextResponse.json({ message: "注册失败，请稍后重试" }, { status: 500 });
  }
}
