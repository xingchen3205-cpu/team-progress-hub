import bcrypt from "bcryptjs";
import { after, NextRequest, NextResponse } from "next/server";

import { signAuthToken, setAuthCookie } from "@/lib/auth";
import { createAuditLogEntry } from "@/lib/audit-log";
import { CAPTCHA_COOKIE_NAME, clearCaptchaCookie, verifyCaptchaChallenge } from "@/lib/captcha";
import {
  getLoginHumanVerificationProvider,
  verifyHumanVerificationToken,
} from "@/lib/human-verification";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { applyRateLimitHeaders, authRateLimits, checkRateLimit } from "@/lib/security";
import { serializeUserWithTeacherTrainingAccess } from "@/lib/teacher-training-access";
import { isMobileWebUserAgent } from "@/lib/mobile-web";

const LOGIN_ACCOUNT_CAPTCHA_FAILURE_THRESHOLD = 2;
const LOGIN_IP_CAPTCHA_FAILURE_THRESHOLD = 20;
const LOGIN_CAPTCHA_WINDOW_MS = 10 * 60_000;
const MAX_LOGIN_CAPTCHA_BUCKETS = 5_000;

const loginCaptchaBuckets = new Map<string, { failures: number; resetAt: number }>();
let lastLoginCaptchaPruneAt = 0;

const jsonWithClearedCaptcha = (body: unknown, init?: ResponseInit) => {
  const response = NextResponse.json(body, init);
  clearCaptchaCookie(response);
  return response;
};

const isMobileWebRequest = (request: NextRequest) => isMobileWebUserAgent(request.headers.get("user-agent"));

const normalizeLoginChallengeIdentifier = (value?: string | null) =>
  value?.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 128) || "";

const pruneLoginCaptchaBuckets = (now = Date.now()) => {
  if (now - lastLoginCaptchaPruneAt < 60_000 && loginCaptchaBuckets.size < MAX_LOGIN_CAPTCHA_BUCKETS) {
    return;
  }

  lastLoginCaptchaPruneAt = now;

  for (const [key, bucket] of loginCaptchaBuckets) {
    if (bucket.resetAt <= now || loginCaptchaBuckets.size > MAX_LOGIN_CAPTCHA_BUCKETS) {
      loginCaptchaBuckets.delete(key);
    }
  }
};

const getLoginCaptchaChallengeKeys = (request: NextRequest, account?: string | null) => {
  const ip = normalizeLoginChallengeIdentifier(getRequestIp(request));
  const normalizedAccount = normalizeLoginChallengeIdentifier(account);
  const keys: Array<{ key: string; threshold: number }> = [
    { key: `ip:${ip || "unknown"}`, threshold: LOGIN_IP_CAPTCHA_FAILURE_THRESHOLD },
  ];

  if (normalizedAccount) {
    keys.push({
      key: `account:${normalizedAccount}`,
      threshold: LOGIN_ACCOUNT_CAPTCHA_FAILURE_THRESHOLD,
    });
  }

  return keys;
};

const shouldRequireLoginCaptcha = (request: NextRequest, account?: string | null) => {
  const now = Date.now();
  pruneLoginCaptchaBuckets(now);

  return getLoginCaptchaChallengeKeys(request, account).some(({ key, threshold }) => {
    const bucket = loginCaptchaBuckets.get(key);
    return Boolean(bucket && bucket.resetAt > now && bucket.failures >= threshold);
  });
};

const recordFailedLoginCaptchaChallenge = (request: NextRequest, account?: string | null) => {
  const now = Date.now();
  pruneLoginCaptchaBuckets(now);

  for (const { key } of getLoginCaptchaChallengeKeys(request, account)) {
    const existingBucket = loginCaptchaBuckets.get(key);
    const bucket =
      existingBucket && existingBucket.resetAt > now
        ? existingBucket
        : { failures: 0, resetAt: now + LOGIN_CAPTCHA_WINDOW_MS };

    bucket.failures += 1;
    loginCaptchaBuckets.set(key, bucket);
  }
};

const clearLoginCaptchaAccountChallenge = (account?: string | null) => {
  const normalizedAccount = normalizeLoginChallengeIdentifier(account);
  if (normalizedAccount) {
    loginCaptchaBuckets.delete(`account:${normalizedAccount}`);
  }
};

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
        humanVerificationToken?: string;
      }
    | null;

  const account = body?.email?.trim() || body?.username?.trim();
  const password = body?.password?.trim();
  const captcha = body?.captcha?.trim();
  const humanVerificationToken = body?.humanVerificationToken?.trim();
  const captchaRequired = shouldRequireLoginCaptcha(request, account);
  const humanVerificationProvider = captchaRequired ? getLoginHumanVerificationProvider() : "none";
  const humanVerificationRequired = captchaRequired && humanVerificationProvider !== "captcha";

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

  if (!account || !password || (captchaRequired && humanVerificationProvider === "captcha" && !captcha) || (humanVerificationRequired && !humanVerificationToken)) {
    return jsonWithClearedCaptcha(
      {
        message: humanVerificationRequired && !humanVerificationToken
          ? "请完成人机验证"
          : captchaRequired && humanVerificationProvider === "captcha" && !captcha
            ? "请输入验证码"
            : "请输入账号和密码",
        requiresCaptcha: captchaRequired,
        humanVerificationProvider,
        humanVerificationRequired,
      },
      { status: 400 },
    );
  }

  if (humanVerificationRequired) {
    const isHumanVerified = await verifyHumanVerificationToken({
      provider: humanVerificationProvider,
      request,
      token: humanVerificationToken,
    });
    if (!isHumanVerified) {
      return jsonWithClearedCaptcha(
        {
          message: "人机验证失败，请重试",
          requiresCaptcha: true,
          humanVerificationProvider,
          humanVerificationRequired: true,
        },
        { status: 400 },
      );
    }
  } else if (captchaRequired) {
    const captchaChallenge = request.cookies.get(CAPTCHA_COOKIE_NAME)?.value;
    if (!verifyCaptchaChallenge(captchaChallenge, captcha ?? "")) {
      return jsonWithClearedCaptcha(
        {
          message: "验证码错误或已过期",
          requiresCaptcha: true,
          humanVerificationProvider,
          humanVerificationRequired,
        },
        { status: 400 },
      );
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
    recordFailedLoginCaptchaChallenge(request, account);
    const nextCaptchaRequired = shouldRequireLoginCaptcha(request, account);
    return jsonWithClearedCaptcha(
      {
        message: "账号或密码错误",
        requiresCaptcha: nextCaptchaRequired,
        humanVerificationProvider: nextCaptchaRequired ? getLoginHumanVerificationProvider() : "none",
        humanVerificationRequired: nextCaptchaRequired && getLoginHumanVerificationProvider() !== "captcha",
      },
      { status: 401 },
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    recordFailedLoginCaptchaChallenge(request, account);
    const nextCaptchaRequired = shouldRequireLoginCaptcha(request, account);
    return jsonWithClearedCaptcha(
      {
        message: "账号或密码错误",
        requiresCaptcha: nextCaptchaRequired,
        humanVerificationProvider: nextCaptchaRequired ? getLoginHumanVerificationProvider() : "none",
        humanVerificationRequired: nextCaptchaRequired && getLoginHumanVerificationProvider() !== "captcha",
      },
      { status: 401 },
    );
  }

  if (user.approvalStatus !== "approved") {
    return jsonWithClearedCaptcha(
      {
        message: "账号待上一级审核通过后方可登录",
        requiresCaptcha: false,
        humanVerificationProvider: "none",
        humanVerificationRequired: false,
      },
      { status: 403 },
    );
  }

  clearLoginCaptchaAccountChallenge(account);

  const token = signAuthToken({
    sub: user.id,
    role: user.role,
    email: user.email ?? user.username,
    name: user.name,
  });

  const response = NextResponse.json({
    token,
    user: await serializeUserWithTeacherTrainingAccess(user),
  });

  setAuthCookie(response, token);
  clearCaptchaCookie(response);

  const loginAuditMetadata = {
    account,
    device: isMobileWebRequest(request) ? "mobile" : "desktop",
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
  };

  after(() =>
    prisma
      .$transaction(async (tx) => {
        await createAuditLogEntry({
          tx,
          operator: { id: user.id, role: user.role },
          action: "auth.login.success",
          objectType: "user",
          objectId: user.id,
          teamGroupId: user.teamGroupId,
          metadata: loginAuditMetadata,
        });
      })
      .catch(() => undefined),
  );

  return response;
}
