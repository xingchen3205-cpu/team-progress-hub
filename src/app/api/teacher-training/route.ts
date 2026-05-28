import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeTeacherTrainingCohort } from "@/lib/teacher-training";

const buildTeacherTrainingInclude = (accountUserId?: string) => ({
  creator: {
    select: {
      name: true,
    },
  },
  participants: {
    where: accountUserId ? { accountUserId } : undefined,
    orderBy: [{ createdAt: "asc" as const }],
    include: {
      accountUser: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      attendances: {
        orderBy: [{ sessionDate: "desc" as const }, { sessionLabel: "asc" as const }],
        include: {
          markedBy: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
  courseSessions: {
    orderBy: [{ courseDate: "asc" as const }, { startTime: "asc" as const }, { createdAt: "asc" as const }],
    include: {
      creator: {
        select: {
          name: true,
        },
      },
    },
  },
  attendances: {
    where: accountUserId ? { participant: { accountUserId } } : undefined,
    orderBy: [{ sessionDate: "desc" as const }, { sessionLabel: "asc" as const }, { markedAt: "desc" as const }],
    include: {
      markedBy: {
        select: {
          name: true,
        },
      },
    },
  },
  tasks: {
    orderBy: [{ createdAt: "desc" as const }],
    include: {
      creator: {
        select: {
          name: true,
        },
      },
      submissions: {
        where: accountUserId ? { participant: { accountUserId } } : undefined,
        orderBy: [{ submittedAt: "desc" as const }],
        include: {
          participant: {
            select: {
              name: true,
            },
          },
          submittedBy: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
});

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin", "training_teacher"]);
  } catch {
    return NextResponse.json({ message: "无权限查看省培平台" }, { status: 403 });
  }

  const isManager = hasGlobalAdminPrivileges(user.role);
  const cohorts = await prisma.teacherTrainingCohort.findMany({
    where: isManager
      ? undefined
      : {
          participants: {
            some: {
              accountUserId: user.id,
            },
          },
        },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: buildTeacherTrainingInclude(isManager ? undefined : user.id),
  });

  return NextResponse.json({ cohorts: cohorts.map(serializeTeacherTrainingCohort) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限创建省培班次" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        location?: string;
        startDate?: string;
        endDate?: string;
        description?: string;
      }
    | null;
  const title = body?.title?.trim();
  const startDate = body?.startDate?.trim();
  const endDate = body?.endDate?.trim();

  if (!title || !startDate || !endDate) {
    return NextResponse.json({ message: "请填写培训名称、开始日期和结束日期" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.create({
    data: {
      title,
      location: body?.location?.trim() || null,
      startDate,
      endDate,
      description: body?.description?.trim() || null,
      createdById: user.id,
    },
    include: buildTeacherTrainingInclude(),
  });

  return NextResponse.json({ cohort: serializeTeacherTrainingCohort(cohort) }, { status: 201 });
}
