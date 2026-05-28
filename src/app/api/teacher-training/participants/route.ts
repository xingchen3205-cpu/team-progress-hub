import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { validateUsername } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { generateTemporaryPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限维护参训教师名单" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        name?: string;
        organization?: string;
        phone?: string;
        groupName?: string;
        extraInfo?: string;
        accountUsername?: string;
        accountPassword?: string;
        note?: string;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const name = body?.name?.trim();
  const organization = body?.organization?.trim();

  if (!cohortId || !name || !organization) {
    return NextResponse.json({ message: "请填写班次、姓名和单位" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findUnique({
    where: { id: cohortId },
    select: { id: true },
  });
  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }

  const accountUsername = body?.accountUsername?.trim();
  const providedPassword = body?.accountPassword?.trim();
  let accountUserId: string | null = null;
  let temporaryPassword: string | null = null;

  if (accountUsername) {
    const usernameError = validateUsername(accountUsername);
    if (usernameError) {
      return NextResponse.json({ message: usernameError }, { status: 400 });
    }

    const existingAccount = await prisma.user.findFirst({
      where: {
        OR: [{ username: accountUsername }, { email: accountUsername }],
      },
      select: { id: true, role: true },
    });
    if (existingAccount) {
      if (existingAccount.role === "expert") {
        return NextResponse.json({ message: "评审专家账号不能绑定为省培参训教师" }, { status: 400 });
      }
      accountUserId = existingAccount.id;
    } else {
      temporaryPassword = providedPassword ? null : generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(providedPassword || temporaryPassword || generateTemporaryPassword(), 10);
      const accountUser = await prisma.user.create({
        data: {
          name,
          username: accountUsername,
          email: null,
          password: passwordHash,
          role: "training_teacher",
          approvalStatus: "approved",
          approvedAt: new Date(),
          approvedById: user.id,
          avatar: name.slice(0, 1),
          avatarImagePath: null,
          responsibility: "江苏省职业院校创新创业教育（竞赛）指导能力提升培训参训教师",
        },
        select: {
          id: true,
        },
      });
      accountUserId = accountUser.id;
    }
  }

  const participant = await prisma.teacherTrainingParticipant.create({
    data: {
      cohortId,
      name,
      organization,
      phone: body?.phone?.trim() || null,
      groupName: body?.groupName?.trim() || null,
      accountUserId,
      extraInfo: body?.extraInfo?.trim() || null,
      note: body?.note?.trim() || null,
    },
  });

  return NextResponse.json({ participant, temporaryPassword }, { status: 201 });
}
