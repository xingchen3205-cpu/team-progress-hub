import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { hashPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { authRateLimits, checkRateLimit, rateLimitExceededResponse } from "@/lib/security";

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, authRateLimits.passwordResetIp);
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit, "重置密码请求过于频繁，请稍后再试");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        token?: string;
        password?: string;
      }
    | null;

  const token = body?.token?.trim();
  const password = body?.password?.trim();

  if (!token || !password) {
    return NextResponse.json({ message: "请完整填写重置信息" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ message: "密码至少需要 6 位" }, { status: 400 });
  }

  const tokenHash = hashPasswordResetToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ message: "重置链接已失效，请重新申请找回密码" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const usedAt = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.user.id },
      data: { password: passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt },
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: record.user.id,
        id: { not: record.id },
      },
    }),
  ]);

  return NextResponse.json({ message: "密码已重置，请使用新密码登录" });
}
