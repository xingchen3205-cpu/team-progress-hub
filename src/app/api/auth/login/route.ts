import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { signAuthToken, setAuthCookie } from "@/lib/auth";
import { CAPTCHA_COOKIE_NAME, clearCaptchaCookie, verifyCaptchaChallenge } from "@/lib/captcha";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/api-serializers";
import { applyRateLimitHeaders, authRateLimits, checkRateLimit } from "@/lib/security";

const jsonWithClearedCaptcha = (body: unknown, init?: ResponseInit) => {
  const response = NextResponse.json(body, init);
  clearCaptchaCookie(response);
  return response;
};

const isMobileWebRequest = (request: NextRequest) =>
  /Mobile|Android|iPhone|iPad|iPod|Windows Phone|MicroMessenger|Mobi/i.test(
    request.headers.get("user-agent") ?? "",
  );

export async function POST(request: NextRequest) {
  const ipLimit = checkRateLimit(request, authRateLimits.loginIp);
  if (!ipLimit.allowed) {
    const response = applyRateLimitHeaders(
      NextResponse.json({ message: "登录尝试过于频繁，请稍后再试" }, { status: 429 }),
      ipLimit,
    );
    clearCaptchaCookie(response);
    return response;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
        username?: string;
        password?: string;
        captcha?: string;
      }
    | null;

  const account = body?.email?.trim() || body?.username?.trim();
  const password = body?.password?.trim();
  const captcha = body?.captcha?.trim();
  const captchaRequired = !isMobileWebRequest(request);

  if (account) {
    const accountLimit = checkRateLimit(request, authRateLimits.loginAccount, account);
    if (!accountLimit.allowed) {
      const response = applyRateLimitHeaders(
        NextResponse.json({ message: "该账号登录尝试过于频繁，请稍后再试" }, { status: 429 }),
        accountLimit,
      );
      clearCaptchaCookie(response);
      return response;
    }
  }

  if (!account || !password || (captchaRequired && !captcha)) {
    return jsonWithClearedCaptcha(
      { message: captchaRequired && !captcha ? "请输入验证码" : "请输入账号和密码" },
      { status: 400 },
    );
  }

  if (captchaRequired) {
    const captchaChallenge = request.cookies.get(CAPTCHA_COOKIE_NAME)?.value;
    if (!verifyCaptchaChallenge(captchaChallenge, captcha ?? "")) {
      return jsonWithClearedCaptcha({ message: "验证码错误或已过期" }, { status: 400 });
    }
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: account },
        { username: account },
        { name: account },
      ],
    },
  });

  if (!user) {
    return jsonWithClearedCaptcha({ message: "账号或密码错误" }, { status: 401 });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return jsonWithClearedCaptcha({ message: "账号或密码错误" }, { status: 401 });
  }

  if (user.approvalStatus !== "approved") {
    return jsonWithClearedCaptcha(
      { message: "账号待上一级审核通过后方可登录" },
      { status: 403 },
    );
  }

  const token = signAuthToken({
    sub: user.id,
    role: user.role,
    email: user.email ?? user.username,
    name: user.name,
  });

  const response = NextResponse.json({
    token,
    user: serializeUser(user),
  });

  setAuthCookie(response, token);
  clearCaptchaCookie(response);

  return response;
}
