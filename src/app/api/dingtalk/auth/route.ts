import { NextRequest, NextResponse } from "next/server";

import { serializeUser } from "@/lib/api-serializers";
import { signAuthToken, setAuthCookie } from "@/lib/auth";
import { createAuditLogEntry } from "@/lib/audit-log";
import { getDingTalkUserByAuthCode } from "@/lib/dingtalk";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { applyRateLimitHeaders, authRateLimits, checkRateLimit } from "@/lib/security";

export async function POST(request: NextRequest) {
  const ipLimit = checkRateLimit(request, authRateLimits.loginIp);
  if (!ipLimit.allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ message: "钉钉登录尝试过于频繁，请稍后再试" }, { status: 429 }),
      ipLimit,
    );
  }

  const body = (await request.json().catch(() => null)) as { authCode?: string } | null;
  const authCode = body?.authCode?.trim();
  if (!authCode) {
    return NextResponse.json({ message: "缺少钉钉免登授权码" }, { status: 400 });
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

  const binding = await prisma.dingTalkAccount.findUnique({
    where: {
      corpId_userIdInCorp: {
        corpId: dingTalkUser.corpId,
        userIdInCorp: dingTalkUser.userId,
      },
    },
    include: {
      user: {
        include: {
          teamGroup: true,
        },
      },
    },
  });

  if (!binding) {
    return NextResponse.json(
      {
        code: "DINGTALK_ACCOUNT_UNBOUND",
        message: "当前钉钉账号尚未绑定大赛平台账号",
        dingTalkUser: {
          name: dingTalkUser.name,
        },
      },
      { status: 404 },
    );
  }

  if (binding.user.approvalStatus !== "approved") {
    return NextResponse.json({ message: "账号待审核通过后方可登录" }, { status: 403 });
  }

  const token = signAuthToken({
    sub: binding.user.id,
    role: binding.user.role,
    email: binding.user.email ?? binding.user.username,
    name: binding.user.name,
  });

  const response = NextResponse.json({
    token,
    user: serializeUser(binding.user),
  });
  setAuthCookie(response, token);

  await prisma
    .$transaction(async (tx) => {
      await tx.dingTalkAccount.update({
        where: { id: binding.id },
        data: {
          unionId: dingTalkUser.unionId,
          name: dingTalkUser.name,
        },
      });

      await createAuditLogEntry({
        tx,
        operator: { id: binding.user.id, role: binding.user.role },
        action: "auth.dingtalk.login.success",
        objectType: "user",
        objectId: binding.user.id,
        teamGroupId: binding.user.teamGroupId,
        metadata: {
          corpId: dingTalkUser.corpId,
          dingTalkName: dingTalkUser.name,
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
        },
      });
    })
    .catch(() => undefined);

  return response;
}
