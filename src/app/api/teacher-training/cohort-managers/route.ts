import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const teacherTrainingManagerResponsibilities = ["省培负责人", "省培班主任"] as const;

const normalizeTeacherTrainingManagerResponsibility = (value?: string | null) => {
  const title = value?.trim() ?? "";
  if (title.includes("负责人")) return "省培负责人";
  if (title.includes("班主任")) return "省培班主任";
  return "";
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return NextResponse.json({ message: "无权限设置省培负责人或省培班主任" }, { status: 403 });
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
  const title = normalizeTeacherTrainingManagerResponsibility(body?.title) || "省培班主任";

  if (!cohortId || !userId) {
    return NextResponse.json({ message: "请选择省培班次和工作人员账号" }, { status: 400 });
  }
  if (!teacherTrainingManagerResponsibilities.some((responsibility) => responsibility === title)) {
    return NextResponse.json({ message: "省培管理身份不正确" }, { status: 400 });
  }

  const [cohort, targetUser] = await Promise.all([
    prisma.teacherTrainingCohort.findFirst({
      where: { id: cohortId, deletedAt: null },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        id: userId,
        approvalStatus: "approved",
        role: { notIn: ["admin", "expert"] },
      },
      select: {
        id: true,
        responsibility: true,
      },
    }),
  ]);

  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  if (!targetUser) {
    return NextResponse.json({ message: "只能选择已审核通过的非系统管理员、非专家账号作为省培负责人或省培班主任" }, { status: 404 });
  }
  const targetUserTeacherTrainingResponsibility = normalizeTeacherTrainingManagerResponsibility(targetUser.responsibility);
  if (targetUserTeacherTrainingResponsibility && targetUserTeacherTrainingResponsibility !== title) {
    return NextResponse.json({ message: `该账号未在省培账号管理中设置为${title}` }, { status: 400 });
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
    assertRole(user.role, ["admin"]);
  } catch {
    return NextResponse.json({ message: "无权限移除省培负责人或省培班主任" }, { status: 403 });
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
