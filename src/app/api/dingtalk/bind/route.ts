import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { serializeUser } from "@/lib/api-serializers";
import { createAuditLogEntry } from "@/lib/audit-log";
import { signAuthToken, setAuthCookie } from "@/lib/auth";
import { getDingTalkUserByAuthCode } from "@/lib/dingtalk";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { applyRateLimitHeaders, authRateLimits, checkRateLimit } from "@/lib/security";

export async function POST(request: NextRequest) {
  const ipLimit = checkRateLimit(request, authRateLimits.loginIp);
  if (!ipLimit.allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ message: "绑定尝试过于频繁，请稍后再试" }, { status: 429 }),
      ipLimit,
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        authCode?: string;
        username?: string;
        password?: string;
      }
    | null;

  const authCode = body?.authCode?.trim();
  const account = body?.username?.trim();
  const password = body?.password?.trim();

  if (!authCode || !account || !password) {
    return NextResponse.json({ message: "请输入平台账号、密码并重新获取钉钉授权" }, { status: 400 });
  }

  const accountLimit = checkRateLimit(request, authRateLimits.loginAccount, account);
  if (!accountLimit.allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ message: "该账号绑定尝试过于频繁，请稍后再试" }, { status: 429 }),
      accountLimit,
    );
  }

  let dingTalkUser;
  try {
    dingTalkUser = await getDingTalkUserByAuthCode(authCode);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "钉钉免登失败" },
      { status: 502 },
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: account }, { username: account }, { name: account }],
    },
    include: {
      teamGroup: true,
    },
  });

  if (!user) {
    return NextResponse.json({ message: "平台账号或密码错误" }, { status: 401 });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return NextResponse.json({ message: "平台账号或密码错误" }, { status: 401 });
  }

  if (user.approvalStatus !== "approved") {
    return NextResponse.json({ message: "账号待审核通过后方可绑定钉钉" }, { status: 403 });
  }

  const existingBinding = await prisma.dingTalkAccount.findUnique({
    where: {
      corpId_userIdInCorp: {
        corpId: dingTalkUser.corpId,
        userIdInCorp: dingTalkUser.userId,
      },
    },
  });

  if (existingBinding && existingBinding.userId !== user.id) {
    return NextResponse.json({ message: "该钉钉账号已绑定其他平台账号" }, { status: 409 });
  }

  const binding = await prisma.$transaction(async (tx) => {
    const nextBinding = await tx.dingTalkAccount.upsert({
      where: { userId: user.id },
      update: {
        corpId: dingTalkUser.corpId,
        userIdInCorp: dingTalkUser.userId,
        unionId: dingTalkUser.unionId,
        name: dingTalkUser.name,
        boundAt: new Date(),
      },
      create: {
        userId: user.id,
        corpId: dingTalkUser.corpId,
        userIdInCorp: dingTalkUser.userId,
        unionId: dingTalkUser.unionId,
        name: dingTalkUser.name,
      },
    });

    await createAuditLogEntry({
      tx,
      operator: { id: user.id, role: user.role },
      action: "auth.dingtalk.bind",
      objectType: "user",
      objectId: user.id,
      teamGroupId: user.teamGroupId,
      metadata: {
        corpId: dingTalkUser.corpId,
        dingTalkName: dingTalkUser.name,
        ip: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
      },
    });

    return nextBinding;
  });

  const token = signAuthToken({
    sub: user.id,
    role: user.role,
    email: user.email ?? user.username,
    name: user.name,
  });

  const response = NextResponse.json({
    token,
    bindingId: binding.id,
    user: serializeUser(user),
  });
  setAuthCookie(response, token);

  return response;
}
