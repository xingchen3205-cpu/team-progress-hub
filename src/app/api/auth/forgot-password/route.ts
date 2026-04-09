import { NextResponse } from "next/server";

import { buildAppUrl, renderSystemEmail, sendEmail } from "@/lib/email";
import { createPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

const successMessage = "如账号存在且已绑定邮箱，系统已发送密码重置邮件，请注意查收。";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { account?: string } | null;
  const account = body?.account?.trim();

  if (!account) {
    return NextResponse.json({ message: "请输入账号名或邮箱" }, { status: 400 });
  }

  const user =
    (await prisma.user.findUnique({
      where: { email: account },
      select: { id: true, name: true, email: true, approvalStatus: true },
    })) ??
    (await prisma.user.findUnique({
      where: { username: account },
      select: { id: true, name: true, email: true, approvalStatus: true },
    }));

  if (!user?.email) {
    return NextResponse.json({ message: successMessage });
  }

  const { token, tokenHash, expiresAt } = createPasswordResetToken();

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  const resetUrl = buildAppUrl(`/login?resetToken=${encodeURIComponent(token)}`);
  const noticeType = user.approvalStatus === "approved" ? "账号安全" : "注册账号";

  await sendEmail({
    to: user.email,
    subject: "密码重置提醒",
    html: renderSystemEmail({
      title: "密码重置提醒",
      detail: "系统已收到你的密码重置申请。请点击下方入口，在 30 分钟内完成新密码设置。",
      actionUrl: resetUrl,
      actionLabel: "立即重置密码",
      recipientName: user.name,
      noticeType,
    }),
  });

  return NextResponse.json({ message: successMessage });
}
