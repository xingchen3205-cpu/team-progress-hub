import { NextResponse } from "next/server";

import { validateRequiredEmail } from "@/lib/account-policy";
import { buildAppUrl, isEmailConfigured, renderSystemEmail, sendEmail } from "@/lib/email";
import {
  emailVerificationExpiresInMs,
  generateEmailVerificationCode,
  hashEmailVerificationCode,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";
import { applyRateLimitHeaders, authRateLimits, checkRateLimit } from "@/lib/security";

const purpose = "register";

export async function POST(request: Request) {
  const ipLimit = checkRateLimit(request, authRateLimits.registerEmailCodeIp);
  if (!ipLimit.allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ message: "验证码发送过于频繁，请稍后再试" }, { status: 429 }),
      ipLimit,
    );
  }

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ message: "请输入邮箱" }, { status: 400 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ message: "邮箱验证码服务未配置，请联系系统管理员" }, { status: 503 });
  }

  const emailError = validateRequiredEmail(email);
  if (emailError) {
    return NextResponse.json({ message: emailError }, { status: 400 });
  }

  const addressLimit = checkRateLimit(request, authRateLimits.registerEmailCodeAddress, email);
  if (!addressLimit.allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ message: "该邮箱验证码发送过于频繁，请 1 分钟后再试" }, { status: 429 }),
      addressLimit,
    );
  }

  const existingAccount = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username: email }],
    },
    select: { id: true },
  });

  if (existingAccount) {
    return NextResponse.json({ message: "该邮箱已被注册，请更换邮箱或直接登录" }, { status: 409 });
  }

  const code = generateEmailVerificationCode();
  await prisma.emailVerificationCode.create({
    data: {
      email,
      purpose,
      codeHash: hashEmailVerificationCode({ email, code, purpose }),
      expiresAt: new Date(Date.now() + emailVerificationExpiresInMs),
    },
  });

  await sendEmail({
    to: email,
    subject: "注册邮箱验证码",
    html: renderSystemEmail({
      title: "注册邮箱验证码",
      detail: `你的注册邮箱验证码为：${code}\n验证码 10 分钟内有效，请勿转发给他人。`,
      actionUrl: buildAppUrl("/login"),
      actionLabel: "返回注册页面",
      recipientName: email,
      noticeType: "注册账号",
    }),
  });

  return NextResponse.json({ message: "验证码已发送，请前往邮箱查收" });
}
