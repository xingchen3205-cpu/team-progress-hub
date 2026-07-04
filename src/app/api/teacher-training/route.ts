import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  getTeacherTrainingAccessFlags,
  hasTeacherTrainingCohortManageAccess,
  isTeacherTrainingSystemAdmin,
} from "@/lib/teacher-training-access";
import {
  isTeacherTrainingTaskReleased,
  serializeTeacherTrainingCohort,
  type TeacherTrainingCohortItem,
} from "@/lib/teacher-training";
import { decodeTeacherTrainingSubmissionAttachmentFile } from "@/lib/teacher-training-submission-attachments";
import { deleteStoredFile } from "@/lib/uploads";

const teacherTrainingManagerResponsibilities = ["省培负责人", "班主任"] as const;

const buildTeacherTrainingInclude = (options: { participantAccountUserId?: string } = {}) => {
  const participantWhere = options.participantAccountUserId
    ? { accountUserId: options.participantAccountUserId }
    : undefined;
  const participantOwnedWhere = options.participantAccountUserId
    ? { participant: { is: { accountUserId: options.participantAccountUserId } } }
    : undefined;

  return {
  creator: {
    select: {
      name: true,
    },
  },
  participants: {
    where: participantWhere,
    orderBy: [{ createdAt: "asc" as const }],
    include: {
      accountUser: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
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
    where: {
      deletedAt: null,
    },
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
    where: participantOwnedWhere,
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
    where: {
      deletedAt: null,
    },
    orderBy: [{ signDate: "desc" as const }, { startTime: "asc" as const }, { createdAt: "desc" as const }],
    include: {
      creator: {
        select: {
          name: true,
        },
      },
      records: {
        where: participantOwnedWhere,
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
    where: participantOwnedWhere,
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
    where: {
      deletedAt: null,
    },
    orderBy: [{ createdAt: "desc" as const }],
    include: {
      creator: {
        select: {
          name: true,
        },
      },
      courseSession: {
        select: {
          title: true,
          courseDate: true,
          startTime: true,
          endTime: true,
        },
      },
      submissions: {
        where: participantOwnedWhere,
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
          finalReviewer: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
  } satisfies Prisma.TeacherTrainingCohortInclude;
};

const buildTeacherTrainingSummaryInclude = () =>
  ({
    creator: {
      select: {
        name: true,
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
    attendances: {
      select: {
        participantId: true,
        sessionLabel: true,
        status: true,
      },
    },
    checkInTasks: {
      where: {
        deletedAt: null,
      },
      select: {
        _count: {
          select: {
            records: true,
          },
        },
      },
    },
    tasks: {
      where: {
        deletedAt: null,
      },
      select: {
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    },
    courseSessions: {
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
      },
    },
    _count: {
      select: {
        participants: true,
        leaveRequests: true,
        managers: true,
      },
    },
  }) satisfies Prisma.TeacherTrainingCohortInclude;

type TeacherTrainingCohortWithRelations = Prisma.TeacherTrainingCohortGetPayload<{
  include: ReturnType<typeof buildTeacherTrainingInclude>;
}>;

type TeacherTrainingCohortSummaryWithRelations = Prisma.TeacherTrainingCohortGetPayload<{
  include: ReturnType<typeof buildTeacherTrainingSummaryInclude>;
}>;

const toSummaryDateTimeLabel = (value: Date | string | null | undefined) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const serializeTeacherTrainingCohortSummary = (
  cohort: TeacherTrainingCohortSummaryWithRelations,
): TeacherTrainingCohortItem => {
  const registeredParticipantIds = new Set(
    cohort.attendances
      .filter((attendance) => attendance.status === "present" && attendance.sessionLabel === "报到")
      .map((attendance) => attendance.participantId),
  );
  const leaveCount = cohort.attendances.filter((attendance) => attendance.status === "leave").length;
  const absentCount = cohort.attendances.filter((attendance) => attendance.status === "absent").length;

  return {
    id: cohort.id,
    includeDetails: false,
    title: cohort.title,
    location: cohort.location ?? "",
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    description: cohort.description ?? "",
    createdAt: toSummaryDateTimeLabel(cohort.createdAt),
    createdByName: cohort.creator?.name ?? "管理员",
    courseSessions: [],
    participants: [],
    attendances: [],
    checkInTasks: [],
    leaveFlow: null,
    leaveRequests: [],
    managers: cohort.managers.map((manager) => ({
      id: manager.id,
      cohortId: manager.cohortId,
      userId: manager.userId,
      name: manager.user?.name ?? "工作人员",
      username: manager.user?.username ?? "",
      role: manager.user?.role ?? "",
      title: manager.title || "班主任",
      createdAt: toSummaryDateTimeLabel(manager.createdAt),
    })),
    tasks: [],
    stats: {
      participantCount: cohort._count.participants,
      presentCount: registeredParticipantIds.size,
      leaveCount,
      absentCount,
      courseCount: cohort.courseSessions.length,
      checkInTaskCount: cohort.checkInTasks.length,
      checkInRecordCount: cohort.checkInTasks.reduce((total, task) => total + task._count.records, 0),
      leaveRequestCount: cohort._count.leaveRequests,
      managerCount: cohort._count.managers,
      taskCount: cohort.tasks.length,
      submissionCount: cohort.tasks.reduce((total, task) => total + task._count.submissions, 0),
    },
  };
};

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
    tasks: cohort.tasks
      .filter((task) => isTeacherTrainingTaskReleased(task))
      .map((task) => ({
        ...task,
        enableAiReview: false,
        scoringRubric: null,
        submissions: task.submissions
          .filter((submission) => participantIds.has(submission.participantId))
          .map((submission) => ({
            ...submission,
            aiScore: null,
            aiComment: null,
            aiReviewedAt: null,
            finalScore: null,
            finalComment: null,
            finalReviewedById: null,
            finalReviewedAt: null,
            finalReviewer: null,
          })),
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

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const cohortId = searchParams.get("cohortId");
  const isManager = isTeacherTrainingSystemAdmin(user);
  const managerAssignments = isManager
    ? []
    : await prisma.teacherTrainingCohortManager.findMany({
        where: {
          userId: user.id,
          cohort: {
            deletedAt: null,
          },
        },
        select: {
          cohortId: true,
        },
      });
  const managedCohortIds = new Set(managerAssignments.map((assignment) => assignment.cohortId));
  const isParticipantOnly = !isManager && managedCohortIds.size === 0;
  const baseWhere: Prisma.TeacherTrainingCohortWhereInput = isManager
    ? {
        deletedAt: null,
      }
    : {
        deletedAt: null,
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
      };
  const where: Prisma.TeacherTrainingCohortWhereInput = cohortId
    ? {
        AND: [baseWhere, { id: cohortId }],
      }
    : baseWhere;
  const shouldLoadSummary = mode === "summary" && !cohortId && !isParticipantOnly;
  const canManageAnyTeacherTraining = isManager || managedCohortIds.size > 0;
  const [cohorts, approverOptions, managerAccountOptions, participantAccountOptions] = await Promise.all([
    prisma.teacherTrainingCohort.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      include: shouldLoadSummary
        ? buildTeacherTrainingSummaryInclude()
        : buildTeacherTrainingInclude(isParticipantOnly ? { participantAccountUserId: user.id } : undefined),
    }),
    isManager
      ? prisma.user.findMany({
          where: {
            approvalStatus: "approved",
            OR: [
              {
                role: {
                  in: ["admin"],
                },
              },
              {
                teacherTrainingManagedCohorts: {
                  some: {
                    cohort: {
                      deletedAt: null,
                    },
                  },
                },
              },
            ],
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
            OR: [
              {
                responsibility: {
                  in: [...teacherTrainingManagerResponsibilities],
                },
              },
              {
                teacherTrainingManagedCohorts: {
                  some: {
                    title: {
                      in: [...teacherTrainingManagerResponsibilities],
                    },
                    cohort: {
                      deletedAt: null,
                    },
                  },
                },
              },
            ],
            role: { notIn: ["admin", "expert"] },
            approvalStatus: "approved",
          },
          orderBy: [{ responsibility: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            phone: true,
            role: true,
            responsibility: true,
            createdAt: true,
            teacherTrainingManagedCohorts: {
              where: {
                cohort: {
                  deletedAt: null,
                },
              },
              select: {
                cohortId: true,
                title: true,
                cohort: {
                  select: {
                    title: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : Promise.resolve([]),
    canManageAnyTeacherTraining
      ? prisma.user.findMany({
          where: {
            approvalStatus: "approved",
            role: {
              in: ["teacher", "leader", "member", "training_teacher"],
            },
          },
          orderBy: [{ role: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            phone: true,
            role: true,
            responsibility: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const managerOptions = managerAccountOptions.map((account) => ({
    id: account.id,
    name: account.name,
    username: account.username,
    role: account.role,
  }));
  const visibleCohorts = shouldLoadSummary
    ? cohorts
    : isManager
    ? cohorts
    : isParticipantOnly
      ? cohorts
      : (cohorts as TeacherTrainingCohortWithRelations[]).map((cohort) =>
          filterCohortForParticipantOnly(cohort, user.id, managedCohortIds),
        );

  return NextResponse.json({
    cohorts: shouldLoadSummary
      ? (visibleCohorts as TeacherTrainingCohortSummaryWithRelations[]).map(serializeTeacherTrainingCohortSummary)
      : (visibleCohorts as TeacherTrainingCohortWithRelations[]).map(serializeTeacherTrainingCohort),
    approverOptions,
    managerOptions,
    managerAccountOptions: managerAccountOptions.map((account) => {
      const managedCohorts = account.teacherTrainingManagedCohorts.map((manager) => ({
        cohortId: manager.cohortId,
        cohortTitle: manager.cohort.title,
        title: manager.title,
      }));
      const derivedResponsibility =
        teacherTrainingManagerResponsibilities.find((responsibility) => responsibility === account.responsibility) ??
        managedCohorts.find((manager) =>
          teacherTrainingManagerResponsibilities.some((responsibility) => responsibility === manager.title),
        )?.title ??
        "";

      return {
        id: account.id,
        name: account.name,
        username: account.username,
        email: account.email ?? "",
        phone: account.phone ?? "",
        role: account.role,
        responsibility: derivedResponsibility,
        createdAt: account.createdAt.toISOString(),
        managedCohorts,
      };
    }),
    participantAccountOptions: participantAccountOptions.map((account) => ({
      id: account.id,
      name: account.name,
      username: account.username,
      email: account.email ?? "",
      phone: account.phone ?? "",
      role: account.role,
      responsibility: account.responsibility ?? "",
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin"]);
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

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        id?: string;
        title?: string;
        location?: string;
        startDate?: string;
        endDate?: string;
        description?: string;
      }
    | null;
  const id = body?.id?.trim();
  const title = body?.title?.trim();
  const startDate = body?.startDate?.trim();
  const endDate = body?.endDate?.trim();

  if (!id || !title || !startDate || !endDate) {
    return NextResponse.json({ message: "请填写班次、培训名称、开始日期和结束日期" }, { status: 400 });
  }

  const existing = await prisma.teacherTrainingCohort.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  const canManageCohort = await hasTeacherTrainingCohortManageAccess(user, id);
  if (!canManageCohort) {
    return NextResponse.json({ message: "无权限修改该省培班次" }, { status: 403 });
  }

  const cohort = await prisma.teacherTrainingCohort.update({
    where: { id },
    data: {
      title,
      location: body?.location?.trim() || null,
      startDate,
      endDate,
      description: body?.description?.trim() || null,
    },
    include: buildTeacherTrainingInclude(),
  });

  return NextResponse.json({ cohort: serializeTeacherTrainingCohort(cohort) });
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string; confirmCascade?: boolean } | null;
  const id = body?.id?.trim();
  if (!id) {
    return NextResponse.json({ message: "请先选择要删除的省培班次" }, { status: 400 });
  }

  const existing = await prisma.teacherTrainingCohort.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      _count: {
        select: {
          participants: true,
          courseSessions: true,
          checkInTasks: true,
          leaveRequests: true,
          tasks: true,
          attendances: true,
        },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  const canManageCohort = await hasTeacherTrainingCohortManageAccess(user, id);
  if (!canManageCohort) {
    return NextResponse.json({ message: "无权限删除该省培班次" }, { status: 403 });
  }

  const relatedCount = Object.values(existing._count).reduce((sum, count) => sum + count, 0);
  if (relatedCount > 0 && !body?.confirmCascade) {
    return NextResponse.json(
      {
        message: `删除前请确认：该班次下已有 ${existing._count.participants} 位参训教师、${existing._count.courseSessions} 节课程、${existing._count.checkInTasks} 个签到、${existing._count.leaveRequests} 条请假、${existing._count.tasks} 个任务和 ${existing._count.attendances} 条考勤记录。`,
      },
      { status: 409 },
    );
  }

  const submissionAttachments = await prisma.teacherTrainingSubmission.findMany({
    where: {
      task: {
        cohortId: id,
      },
      attachment: {
        not: null,
      },
    },
    select: {
      attachment: true,
    },
  });
  const attachmentObjectKeys = [
    ...new Set(
      submissionAttachments
        .map((submission) => decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment)?.filePath)
        .filter((filePath): filePath is string => Boolean(filePath)),
    ),
  ];

  await prisma.teacherTrainingCohort.delete({ where: { id } });
  await Promise.allSettled(attachmentObjectKeys.map((objectKey) => deleteStoredFile(objectKey)));

  return NextResponse.json({ ok: true });
}
