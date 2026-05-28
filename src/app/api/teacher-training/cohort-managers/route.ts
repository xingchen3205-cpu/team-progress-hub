import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限设置省培班主任" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        userId?: string;
        title?: string;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const userId = body?.userId?.trim();
  const title = body?.title?.trim() || "班主任";

  if (!cohortId || !userId) {
    return NextResponse.json({ message: "请选择省培班次和工作人员账号" }, { status: 400 });
  }

  const [cohort, targetUser] = await Promise.all([
    prisma.teacherTrainingCohort.findUnique({
      where: { id: cohortId },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        id: userId,
        approvalStatus: "approved",
        role: { not: "expert" },
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  if (!targetUser) {
    return NextResponse.json({ message: "只能选择已审核通过的非专家账号作为班主任" }, { status: 404 });
  }

  const manager = await prisma.teacherTrainingCohortManager.upsert({
    where: {
      cohortId_userId: {
        cohortId,
        userId,
      },
    },
    update: {
      title,
      createdById: user.id,
    },
    create: {
      cohortId,
      userId,
      title,
      createdById: user.id,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
        },
      },
    },
  });

  return NextResponse.json({ manager });
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限移除省培班主任" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        userId?: string;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const userId = body?.userId?.trim();

  if (!cohortId || !userId) {
    return NextResponse.json({ message: "请选择省培班次和工作人员账号" }, { status: 400 });
  }

  await prisma.teacherTrainingCohortManager.deleteMany({
    where: {
      cohortId,
      userId,
    },
  });

  return NextResponse.json({ ok: true });
}
