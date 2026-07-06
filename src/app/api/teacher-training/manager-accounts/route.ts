import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { validatePasswordPolicy, validateUsername } from "@/lib/account-policy";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const teacherTrainingManagerIdentities = ["省培负责人", "省培班主任"] as const;
const teacherTrainingManagerIdentityValues = [...teacherTrainingManagerIdentities, "班主任"] as const;
const defaultTeacherTrainingManagerPassword = "123456";

const teacherTrainingManagerTitleWhere: Prisma.TeacherTrainingCohortManagerWhereInput = {
  OR: [{ title: { contains: "负责人" } }, { title: { contains: "班主任" } }],
};

const parseManagerIdentity = (value?: string | null) => {
  const managerIdentity = value?.trim() || "";
  if (managerIdentity.includes("负责人")) {
    return "省培负责人";
  }
  if (managerIdentity.includes("班主任")) {
    return "省培班主任";
  }
  if (managerIdentity !== "省培负责人" && managerIdentity !== "省培班主任") {
    return null;
  }
  return managerIdentity;
};

const assertTeacherTrainingSystemAdmin = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: NextResponse.json({ message: "未登录" }, { status: 401 }) };
  }

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { error: NextResponse.json({ message: "只有系统管理员可以管理省培系统账号" }, { status: 403 }) };
  }

  return { user };
};

export async function POST(request: NextRequest) {
  const auth = await assertTeacherTrainingSystemAdmin(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        username?: string;
        phone?: string;
        email?: string;
        password?: string;
        managerIdentity?: string;
      }
    | null;
  const name = body?.name?.trim() ?? "";
  const username = body?.username?.trim() ?? "";
  const phone = body?.phone?.trim() ?? "";
  const email = body?.email?.trim() || null;
  const managerIdentity = parseManagerIdentity(body?.managerIdentity);
  const password = body?.password?.trim() || defaultTeacherTrainingManagerPassword;

  if (!name || !username || !managerIdentity) {
    return NextResponse.json({ message: "请填写姓名、账号和省培管理身份" }, { status: 400 });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return NextResponse.json({ message: usernameError }, { status: 400 });
  }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    return NextResponse.json({ message: "手机号格式不正确，请填写 11 位中国大陆手机号" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "邮箱格式不正确，请检查后重新填写" }, { status: 400 });
  }
  if (!teacherTrainingManagerIdentities.includes(managerIdentity)) {
    return NextResponse.json({ message: "省培管理身份不正确" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username }, ...(email ? [{ email }] : [])],
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ message: "账号名或邮箱已存在" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const account = await prisma.user.create({
    data: {
      name,
      username,
      email,
      phone,
      password: passwordHash,
      role: "member",
      approvalStatus: "approved",
      approvedAt: new Date(),
      approvedById: auth.user.id,
      responsibility: managerIdentity,
      avatar: name.slice(0, 1) || "省",
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      phone: true,
      role: true,
      responsibility: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    account,
    initialPassword: password,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await assertTeacherTrainingSystemAdmin(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | {
        id?: string;
        name?: string;
        username?: string;
        phone?: string;
        email?: string;
        password?: string;
        managerIdentity?: string;
      }
    | null;
  const id = body?.id?.trim() ?? "";
  const name = body?.name?.trim() ?? "";
  const username = body?.username?.trim() ?? "";
  const phone = body?.phone?.trim() ?? "";
  const email = body?.email?.trim() || null;
  const managerIdentity = parseManagerIdentity(body?.managerIdentity);
  const password = body?.password?.trim() ?? "";

  if (!id || !name || !username || !managerIdentity) {
    return NextResponse.json({ message: "请填写姓名、账号和省培管理身份" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, phone: true },
  });
  if (!target) {
    return NextResponse.json({ message: "省培管理账号不存在" }, { status: 404 });
  }
  if (target.role === "admin") {
    return NextResponse.json({ message: "系统管理员账号不能在这里修改" }, { status: 400 });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return NextResponse.json({ message: usernameError }, { status: 400 });
  }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    return NextResponse.json({ message: "手机号格式不正确，请填写 11 位中国大陆手机号" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "邮箱格式不正确，请检查后重新填写" }, { status: 400 });
  }

  const duplicated = await prisma.user.findFirst({
    where: {
      id: { not: id },
      OR: [{ username }, ...(email ? [{ email }] : [])],
    },
    select: { id: true },
  });
  if (duplicated) {
    return NextResponse.json({ message: "账号名或邮箱已被其他账号使用" }, { status: 409 });
  }

  const passwordError = password
    ? validatePasswordPolicy(password, { username, phone, disallowDefaultPassword: true })
    : null;
  if (passwordError) {
    return NextResponse.json({ message: passwordError }, { status: 400 });
  }

  const account = await prisma.$transaction(async (tx) => {
    const updatedAccount = await tx.user.update({
      where: { id },
      data: {
        name,
        username,
        email,
        phone,
        responsibility: managerIdentity,
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        responsibility: true,
        createdAt: true,
      },
    });

    await tx.teacherTrainingCohortManager.updateMany({
      where: {
        userId: id,
        ...teacherTrainingManagerTitleWhere,
      },
      data: {
        title: managerIdentity,
      },
    });

    return updatedAccount;
  });

  return NextResponse.json({ account });
}

export async function DELETE(request: NextRequest) {
  const auth = await assertTeacherTrainingSystemAdmin(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
  const ids = Array.from(new Set((body?.ids ?? []).map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return NextResponse.json({ message: "请选择要移出省培账号池的账号" }, { status: 400 });
  }

  const accounts = await prisma.user.findMany({
    where: {
      id: { in: ids },
      OR: [
        {
          responsibility: { in: [...teacherTrainingManagerIdentityValues] },
        },
        {
          teacherTrainingManagedCohorts: {
            some: {
              ...teacherTrainingManagerTitleWhere,
              cohort: {
                deletedAt: null,
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      role: true,
    },
  });
  if (accounts.length !== ids.length) {
    return NextResponse.json({ message: "只能移出省培管理账号池中的账号" }, { status: 400 });
  }
  if (accounts.some((account) => account.role === "admin")) {
    return NextResponse.json({ message: "系统管理员账号不能移出省培账号池" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherTrainingCohortManager.deleteMany({
      where: {
        userId: { in: ids },
        ...teacherTrainingManagerTitleWhere,
      },
    });

    await tx.user.updateMany({
      where: {
        id: { in: ids },
        role: { not: "admin" },
        responsibility: { in: [...teacherTrainingManagerIdentityValues] },
      },
      data: {
        responsibility: null,
      },
    });
  });

  return NextResponse.json({ ok: true, removedCount: ids.length });
}
