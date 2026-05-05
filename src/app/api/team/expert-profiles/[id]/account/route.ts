import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { validateUsername } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { parseJsonList, serializeExpertProfile } from "@/lib/expert-profiles";
import { assertRole } from "@/lib/permissions";
import { generateTemporaryPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const buildResponsibility = (profile: {
  title: string | null;
  organization: string | null;
  specialtyTags: string;
  specialtyTracks: string;
}) => {
  const parts = [
    profile.title,
    profile.organization,
    ...parseJsonList(profile.specialtyTracks),
    ...parseJsonList(profile.specialtyTags),
  ]
    .map((item) => item?.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "专家评审";
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限开通专家账号" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        username?: string;
        password?: string;
      }
    | null;

  const username = body?.username?.trim() ?? "";
  const providedPassword = body?.password?.trim();
  const temporaryPassword = providedPassword ? null : generateTemporaryPassword();
  const password = providedPassword || temporaryPassword || generateTemporaryPassword();
  const usernameError = validateUsername(username);
  if (usernameError) {
    return NextResponse.json({ message: usernameError }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ message: "初始密码至少需要 6 位" }, { status: 400 });
  }

  const profile = await prisma.expertProfile.findUnique({
    where: { id },
    include: {
      linkedUser: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
        },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ message: "专家档案不存在" }, { status: 404 });
  }

  if (profile.linkedUserId) {
    return NextResponse.json({ message: "该专家已开通账号" }, { status: 409 });
  }

  const existingAccount = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username }, ...(profile.email ? [{ email: profile.email }, { username: profile.email }] : [])],
    },
    select: { id: true },
  });

  if (existingAccount) {
    return NextResponse.json({ message: "用户名或邮箱已存在，请更换后再试" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const updatedProfile = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: profile.name,
          username,
          email: profile.email,
          password: passwordHash,
          role: "expert",
          approvalStatus: "approved",
          approvedAt: new Date(),
          approvedById: user.id,
          avatar: profile.name.slice(0, 1),
          avatarImagePath: null,
          responsibility: buildResponsibility(profile),
        },
        select: {
          id: true,
        },
      });

      return tx.expertProfile.update({
        where: { id: profile.id },
        data: {
          linkedUserId: createdUser.id,
        },
        include: {
          linkedUser: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
            },
          },
        },
      });
    });

    return NextResponse.json(
      {
        expertProfile: serializeExpertProfile(updatedProfile),
        temporaryPassword,
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
      (error instanceof Error &&
        /UNIQUE constraint failed: User\.(email|username)|UNIQUE constraint failed: ExpertProfile\.linkedUserId/i.test(
          error.message,
        ))
    ) {
      return NextResponse.json({ message: "用户名或邮箱已存在，请更换后再试" }, { status: 409 });
    }

    return NextResponse.json({ message: "专家账号开通失败，请稍后重试" }, { status: 500 });
  }
}
