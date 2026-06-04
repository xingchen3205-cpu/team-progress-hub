import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { validateRequiredEmail, validateUsername } from "@/lib/account-policy";
import { createAuditLogEntry } from "@/lib/audit-log";
import { setAuthCookie, signAuthToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createReviewScreenToken, hashReviewScreenToken } from "@/lib/review-screen-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const sessionId = token?.trim();
  const screenToken = request.nextUrl.searchParams.get("token")?.trim();
  if (!sessionId || !screenToken) {
    return NextResponse.json({ message: "缺少团队抽签入口参数" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        packageId?: string;
        name?: string;
        phone?: string;
        email?: string;
        college?: string;
        className?: string;
        studentId?: string;
        password?: string;
      }
    | null;

  const packageId = body?.packageId?.trim() ?? "";
  const name = body?.name?.trim() ?? "";
  const phone = body?.phone?.replace(/\D/g, "") ?? "";
  const username = phone;
  const email = body?.email?.trim() ?? "";
  const college = body?.college?.trim() ?? "";
  const className = body?.className?.trim() ?? "";
  const studentId = body?.studentId?.trim() ?? "";
  const password = body?.password?.trim() ?? "";

  if (!packageId) {
    return NextResponse.json({ message: "请先选择项目" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ message: "请填写项目负责人姓名" }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ message: "请填写项目负责人手机号" }, { status: 400 });
  }
  const usernameError = validateUsername(username);
  if (usernameError) {
    return NextResponse.json({ message: "手机号需为 4-20 位数字，并将作为登录账号" }, { status: 400 });
  }
  const emailError = validateRequiredEmail(email);
  if (emailError) {
    return NextResponse.json({ message: emailError }, { status: 400 });
  }
  if (!college) {
    return NextResponse.json({ message: "请填写所属学院" }, { status: 400 });
  }
  if (!className) {
    return NextResponse.json({ message: "请填写专业班级" }, { status: 400 });
  }
  if (!studentId) {
    return NextResponse.json({ message: "请填写学号" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ message: "密码至少需要 6 位" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const session = await tx.reviewDisplaySession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          tokenHash: true,
          status: true,
          screenPhase: true,
          startedAt: true,
          tokenExpiresAt: true,
          teamDrawEnabled: true,
          creator: {
            select: {
              id: true,
              role: true,
            },
          },
        },
      });

      if (!session || session.tokenHash !== hashReviewScreenToken(screenToken)) {
        throw new Error("团队抽签入口无效");
      }
      if (!session.teamDrawEnabled) {
        throw new Error("管理员未开启团队线上抽签");
      }
      if (session.tokenExpiresAt.getTime() <= now.getTime()) {
        throw new Error("团队抽签入口已过期");
      }
      if (session.status !== "waiting" || session.screenPhase !== "draw" || session.startedAt) {
        throw new Error("本轮抽签已开始，不能继续注册项目账号");
      }

      const projectOrder = await tx.reviewDisplayProjectOrder.findUnique({
        where: {
          sessionId_packageId: {
            sessionId,
            packageId,
          },
        },
        select: {
          packageId: true,
          selfDrawnAt: true,
          reviewPackage: {
            select: {
              id: true,
              targetName: true,
              roundLabel: true,
              teamGroupId: true,
              teamGroup: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!projectOrder) {
        throw new Error("所选项目不在本轮抽签名单中");
      }
      if (projectOrder.selfDrawnAt) {
        throw new Error("该项目已完成抽签，不能重复注册");
      }

      const existingTeamDrawToken = await tx.reviewDisplayTeamDrawToken.findUnique({
        where: {
          sessionId_packageId: {
            sessionId,
            packageId,
          },
        },
        select: { id: true },
      });
      if (existingTeamDrawToken) {
        throw new Error("该项目已完成注册，请使用已注册账号进入抽签");
      }

      let teamGroup = projectOrder.reviewPackage.teamGroup;
      if (!teamGroup) {
        const targetName = projectOrder.reviewPackage.targetName.trim();
        if (!targetName) {
          throw new Error("项目名称为空，不能自助注册");
        }

        const existingTeamGroup = await tx.teamGroup.findUnique({
          where: { name: targetName },
          select: { id: true, name: true },
        });
        teamGroup =
          existingTeamGroup ??
          (await tx.teamGroup.create({
            data: {
              name: targetName,
              description: `${projectOrder.reviewPackage.roundLabel ?? "项目路演评审"}自助注册创建`,
            },
            select: { id: true, name: true },
          }));

        await tx.expertReviewPackage.update({
          where: { id: projectOrder.reviewPackage.id },
          data: { teamGroupId: teamGroup.id },
          select: { id: true },
        });
      }

      const existingTeamAccount = await tx.user.findFirst({
        where: {
          teamGroupId: teamGroup.id,
          role: { in: ["leader", "member"] },
          approvalStatus: "approved",
        },
        select: { id: true },
      });
      if (existingTeamAccount) {
        throw new Error("该项目已注册团队账号，请使用已注册账号进入抽签");
      }

      const existingAccount = await tx.user.findFirst({
        where: {
          OR: [{ username }, { email }, { username: email }, { email: username }],
        },
        select: { id: true },
      });
      if (existingAccount) {
        throw new Error("手机号或邮箱已存在，请更换后再试");
      }

      const claimToken = createReviewScreenToken();
      await tx.reviewDisplayTeamDrawToken.create({
        data: {
          sessionId,
          packageId,
          tokenHash: claimToken.tokenHash,
          tokenExpiresAt: session.tokenExpiresAt,
          usedAt: now,
        },
      });

      const createdUser = await tx.user.create({
        data: {
          name,
          username,
          email,
          phone,
          password: await bcrypt.hash(password, 10),
          role: "leader",
          approvalStatus: "approved",
          approvedAt: now,
          approvedById: session.creator.id,
          avatar: name.slice(0, 1),
          avatarImagePath: null,
          teamGroupId: teamGroup.id,
          college,
          className,
          studentId,
          responsibility: "项目负责人",
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          phone: true,
          role: true,
          teamGroupId: true,
          college: true,
          className: true,
          studentId: true,
        },
      });

      await createAuditLogEntry({
        tx,
        operator: session.creator,
        action: "review_screen_session.team_account_registered",
        objectType: "review_screen_session",
        objectId: session.id,
        teamGroupId: teamGroup.id,
        beforeState: null,
        afterState: {
          packageId,
          targetName: projectOrder.reviewPackage.targetName,
          phone,
          college,
          className,
          studentId,
        },
      });

      return {
        user: createdUser,
        targetName: projectOrder.reviewPackage.targetName,
      };
    });

    const authToken = signAuthToken({
      sub: result.user.id,
      role: result.user.role,
      email: result.user.email ?? result.user.username,
      name: result.user.name,
    });
    const response = NextResponse.json({
      message: "注册成功，正在进入抽签",
      targetName: result.targetName,
      user: {
        id: result.user.id,
        name: result.user.name,
        username: result.user.username,
        phone: result.user.phone,
        role: result.user.role,
        teamGroupId: result.user.teamGroupId,
        college: result.user.college,
        className: result.user.className,
        studentId: result.user.studentId,
      },
    });
    setAuthCookie(response, authToken);
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { message: "该项目已完成注册，请使用已注册账号进入抽签" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "团队账号注册失败，请刷新后重试" },
      { status: 409 },
    );
  }
}
