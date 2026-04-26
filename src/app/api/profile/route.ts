import { NextRequest, NextResponse } from "next/server";

import { validateRequiredEmail } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/api-serializers";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);

  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  return NextResponse.json({ user: serializeUser(user) });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);

  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        email?: string;
        responsibility?: string;
        password?: string;
      }
    | null;

  const name = body?.name?.trim();
  const responsibility = body?.responsibility?.trim();
  const email = body?.email?.trim() || "";
  const password = body?.password?.trim();

  if (!name) {
    return NextResponse.json({ message: "姓名不能为空" }, { status: 400 });
  }

  if (user.role !== "expert") {
    const emailError = validateRequiredEmail(email);
    if (emailError) {
      return NextResponse.json({ message: emailError }, { status: 400 });
    }
  }

  if (email) {
    const emailConflict = await prisma.user.findFirst({
      where: {
        id: {
          not: user.id,
        },
        OR: [{ email }, { username: email }],
      },
      select: { id: true },
    });

    if (emailConflict) {
      return NextResponse.json({ message: "邮箱已被占用，请更换后再试" }, { status: 409 });
    }
  }

  let passwordHash: string | undefined;
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ message: "密码至少需要 6 位" }, { status: 400 });
    }

    const bcrypt = await import("bcryptjs");
    passwordHash = await bcrypt.hash(password, 10);
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      email: email ? email : null,
      responsibility: responsibility || "",
      avatar: name.slice(0, 1),
      password: passwordHash,
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      avatar: true,
      avatarImagePath: true,
      responsibility: true,
      approvalStatus: true,
      approvedAt: true,
      createdAt: true,
      teamGroupId: true,
      teamGroup: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({ user: serializeUser(updatedUser) });
}
