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
        role: { notIn: ["admin", "expert", "training_teacher"] },
        OR: [
          { responsibility: { in: ["省培负责人", "省培班主任", "班主任"] } },
          {
            teacherTrainingManagedCohorts: {
              some: {
                OR: [{ title: { contains: "负责人" } }, { title: { contains: "班主任" } }],
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
        responsibility: true,
        teacherTrainingManagedCohorts: {
          where: {
            cohort: {
              deletedAt: null,
            },
          },
          select: {
            title: true,
          },
        },
      },
    }),
  ]);

  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  if (!targetUser) {
    return NextResponse.json({ message: "只能选择省培账号管理中已设置身份的账号作为省培负责人或省培班主任" }, { status: 404 });
  }
  const targetUserTeacherTrainingResponsibility =
    normalizeTeacherTrainingManagerResponsibility(targetUser.responsibility) ||
    targetUser.teacherTrainingManagedCohorts
      .map((manager) => normalizeTeacherTrainingManagerResponsibility(manager.title))
      .find(Boolean) ||
    "";
  if (!targetUserTeacherTrainingResponsibility) {
    return NextResponse.json({ message: "请先在省培账号管理中设置该账号身份" }, { status: 400 });
  }
  if (targetUserTeacherTrainingResponsibility !== title) {
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
