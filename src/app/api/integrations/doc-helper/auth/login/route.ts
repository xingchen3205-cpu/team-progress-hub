import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const DOC_HELPER_SECRET = process.env.DOC_HELPER_SECRET ?? "";

function unauthorized(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("X-Doc-Helper-Secret") ?? "";
  if (!DOC_HELPER_SECRET || secret !== DOC_HELPER_SECRET) {
    return forbidden("服务密钥无效");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        account?: string;
        password?: string;
      }
    | null;

  const account = body?.account?.trim();
  const password = body?.password?.trim();

  if (!account || !password) {
    return NextResponse.json(
      { ok: false, error: "请输入账号和密码" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: account }, { username: account }, { name: account }],
    },
  });

  if (!user) {
    return unauthorized("账号或密码错误");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return unauthorized("账号或密码错误");
  }

  if (user.approvalStatus !== "approved") {
    return NextResponse.json(
      { ok: false, error: "账号待上一级审核通过后方可登录" },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email ?? "",
      role: user.role,
      approval_status: user.approvalStatus,
    },
  });
}
