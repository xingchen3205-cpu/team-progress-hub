import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { assertRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getTeacherTrainingAccessFlags } from "@/lib/teacher-training-access";
import { serializeTeacherTrainingCohort } from "@/lib/teacher-training";

const buildTeacherTrainingInclude = () => ({
  creator: {
    select: {
      name: true,
    },
  },
  participants: {
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
      checkInRecords: {
        orderBy: [{ signedAt: "desc" as const }],
        include: {
          participant: {
            select: {
              name: true,
            },
          },
        },
      },
      leaveRequests: {
        orderBy: [{ submittedAt: "desc" as const }],
        include: {
          participant: {
            select: {
              name: true,
              organization: true,
            },
          },
          approvals: {
            orderBy: [{ stepIndex: "asc" as const }, { reviewedAt: "asc" as const }],
            include: {
              approver: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  },
  managers: {
    orderBy: [{ createdAt: "asc" as const }],
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
    orderBy: [{ sessionDate: "desc" as const }, { sessionLabel: "asc" as const }, { markedAt: "desc" as const }],
    include: {
      markedBy: {
        select: {
          name: true,
        },
      },
    },
  },
  checkInTasks: {
    orderBy: [{ signDate: "desc" as const }, { startTime: "asc" as const }, { createdAt: "desc" as const }],
    include: {
      creator: {
        select: {
          name: true,
        },
      },
      records: {
        orderBy: [{ signedAt: "desc" as const }],
        include: {
          participant: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
  leaveFlow: true,
  leaveRequests: {
    orderBy: [{ submittedAt: "desc" as const }],
    include: {
      participant: {
        select: {
          name: true,
          organization: true,
        },
      },
      approvals: {
        orderBy: [{ stepIndex: "asc" as const }, { reviewedAt: "asc" as const }],
        include: {
          approver: {
            select: {
              name: true,
            },
          },
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
}) satisfies Prisma.TeacherTrainingCohortInclude;

type TeacherTrainingCohortWithRelations = Prisma.TeacherTrainingCohortGetPayload<{
  include: ReturnType<typeof buildTeacherTrainingInclude>;
}>;

const filterCohortForParticipantOnly = (
  cohort: TeacherTrainingCohortWithRelations,
  accountUserId: string,
  managedCohortIds: Set<string>,
) => {
  if (managedCohortIds.has(cohort.id)) {
    return cohort;
  }

  const participantIds = new Set(
    cohort.participants
      .filter((participant) => participant.accountUserId === accountUserId)
      .map((participant) => participant.id),
  );

  return {
    ...cohort,
    participants: cohort.participants.filter((participant) => participantIds.has(participant.id)),
    attendances: cohort.attendances.filter((attendance) => participantIds.has(attendance.participantId)),
    checkInTasks: cohort.checkInTasks.map((task) => ({
      ...task,
      records: task.records.filter((record) => participantIds.has(record.participantId)),
    })),
    leaveRequests: cohort.leaveRequests.filter((request) => participantIds.has(request.participantId)),
    tasks: cohort.tasks.map((task) => ({
      ...task,
      submissions: task.submissions.filter((submission) => participantIds.has(submission.participantId)),
    })),
  };
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const access = await getTeacherTrainingAccessFlags(user);
  if (!access.hasTeacherTrainingAccess) {
    return NextResponse.json({ message: "无权限查看省培平台" }, { status: 403 });
  }

  const isManager = hasGlobalAdminPrivileges(user.role);
  const managerAssignments = isManager
    ? []
    : await prisma.teacherTrainingCohortManager.findMany({
        where: {
          userId: user.id,
        },
        select: {
          cohortId: true,
        },
      });
  const managedCohortIds = new Set(managerAssignments.map((assignment) => assignment.cohortId));
  const [cohorts, approverOptions, managerOptions] = await Promise.all([
    prisma.teacherTrainingCohort.findMany({
      where: isManager
        ? undefined
        : {
            OR: [
              {
                participants: {
                  some: {
                    accountUserId: user.id,
                  },
                },
              },
              {
                managers: {
                  some: {
                    userId: user.id,
                  },
                },
              },
            ],
          },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      include: buildTeacherTrainingInclude(),
    }),
    isManager
      ? prisma.user.findMany({
          where: {
            role: {
              in: ["admin", "school_admin"],
            },
            approvalStatus: "approved",
          },
          orderBy: [{ role: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        })
      : Promise.resolve([]),
    isManager
      ? prisma.user.findMany({
          where: {
            role: {
              not: "expert",
            },
            approvalStatus: "approved",
          },
          orderBy: [{ role: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const visibleCohorts = isManager
    ? cohorts
    : cohorts.map((cohort) => filterCohortForParticipantOnly(cohort, user.id, managedCohortIds));

  return NextResponse.json({
    cohorts: visibleCohorts.map(serializeTeacherTrainingCohort),
    approverOptions,
    managerOptions,
  });
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
