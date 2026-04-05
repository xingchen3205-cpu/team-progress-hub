import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { signAuthToken, setAuthCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/api-serializers";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
        username?: string;
        password?: string;
      }
    | null;

  const email = body?.email?.trim() || body?.username?.trim();
  const password = body?.password?.trim();

  if (!email || !password) {
    return NextResponse.json({ message: "请输入账号和密码" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  const token = signAuthToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  });

  const response = NextResponse.json({
    token,
    user: serializeUser(user),
  });

  setAuthCookie(response, token);

  return response;
}
