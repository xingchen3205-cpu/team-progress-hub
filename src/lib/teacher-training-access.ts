import type { Role } from "@prisma/client";

import { serializeUser } from "@/lib/api-serializers";
import { hasGlobalAdminPrivileges } from "@/lib/permissions";
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

export const getTeacherTrainingAccessFlags = async (
  user: TeacherTrainingAccessUser,
): Promise<TeacherTrainingAccessFlags> => {
  if (hasGlobalAdminPrivileges(user.role)) {
    return {
      hasTeacherTrainingAccess: true,
      hasTeacherTrainingManagerAccess: true,
      teacherTrainingParticipantCount: 0,
      teacherTrainingManagedCohortCount: 0,
    };
  }

  const [participantCount, managedCohortCount] = await Promise.all([
    prisma.teacherTrainingParticipant.count({
      where: {
        accountUserId: user.id,
      },
    }),
    prisma.teacherTrainingCohortManager.count({
      where: {
        userId: user.id,
      },
    }),
  ]);

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

export const getManagedTeacherTrainingCohortIds = async (user: TeacherTrainingAccessUser) => {
  if (hasGlobalAdminPrivileges(user.role)) {
    return null;
  }

  const rows = await prisma.teacherTrainingCohortManager.findMany({
    where: {
      userId: user.id,
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
) => {
  if (hasGlobalAdminPrivileges(user.role)) {
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
    },
  });

  return Boolean(assignment);
};
