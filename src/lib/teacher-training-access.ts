import type { Role } from "@prisma/client";

import { serializeUser } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";

export type TeacherTrainingAccessUser = {
  id: string;
  role: Role;
};

export type TeacherTrainingAccessFlags = {
  hasTeacherTrainingAccess: boolean;
  hasTeacherTrainingManagerAccess: boolean;
  teacherTrainingParticipantCount: number;
  teacherTrainingManagedCohortCount: number;
};

export const isTeacherTrainingSystemAdmin = (user: TeacherTrainingAccessUser) =>
  user.role === "admin" || user.role === "school_admin";

export const getTeacherTrainingAccessFlags = async (
  user: TeacherTrainingAccessUser,
): Promise<TeacherTrainingAccessFlags> => {
  if (isTeacherTrainingSystemAdmin(user)) {
    return {
      hasTeacherTrainingAccess: true,
      hasTeacherTrainingManagerAccess: true,
      teacherTrainingParticipantCount: 0,
      teacherTrainingManagedCohortCount: 0,
    };
  }

  const [participantProfile, managedCohort] = await Promise.all([
    prisma.teacherTrainingParticipant.findFirst({
      where: {
        accountUserId: user.id,
        cohort: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
      },
    }),
    prisma.teacherTrainingCohortManager.findFirst({
      where: {
        userId: user.id,
        cohort: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
      },
    }),
  ]);
  const participantCount = participantProfile ? 1 : 0;
  const managedCohortCount = managedCohort ? 1 : 0;

  return {
    hasTeacherTrainingAccess: user.role === "training_teacher" || participantCount > 0 || managedCohortCount > 0,
    hasTeacherTrainingManagerAccess: managedCohortCount > 0,
    teacherTrainingParticipantCount: participantCount,
    teacherTrainingManagedCohortCount: managedCohortCount,
  };
};

export const serializeUserWithTeacherTrainingAccess = async <T extends Parameters<typeof serializeUser>[0] & TeacherTrainingAccessUser>(
  user: T,
) => {
  const access = await getTeacherTrainingAccessFlags(user);

  return {
    ...serializeUser(user),
    ...access,
  };
};

export const getManagedTeacherTrainingCohortIds = async (
  user: TeacherTrainingAccessUser,
  options: { includeDeleted?: boolean } = {},
) => {
  if (isTeacherTrainingSystemAdmin(user)) {
    return null;
  }

  const rows = await prisma.teacherTrainingCohortManager.findMany({
    where: {
      userId: user.id,
      ...(options.includeDeleted
        ? {}
        : {
            cohort: {
              deletedAt: null,
            },
          }),
    },
    select: {
      cohortId: true,
    },
  });

  return rows.map((row) => row.cohortId);
};

export const hasTeacherTrainingCohortManageAccess = async (
  user: TeacherTrainingAccessUser,
  cohortId: string,
  options: { includeDeleted?: boolean } = {},
) => {
  if (isTeacherTrainingSystemAdmin(user)) {
    return true;
  }

  const assignment = await prisma.teacherTrainingCohortManager.findUnique({
    where: {
      cohortId_userId: {
        cohortId,
        userId: user.id,
      },
    },
    select: {
      id: true,
      cohort: {
        select: {
          deletedAt: true,
        },
      },
    },
  });

  return Boolean(assignment && (options.includeDeleted || !assignment.cohort.deletedAt));
};
