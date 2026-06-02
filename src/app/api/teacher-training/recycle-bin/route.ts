import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getManagedTeacherTrainingCohortIds,
  hasTeacherTrainingCohortManageAccess,
  isTeacherTrainingSystemAdmin,
} from "@/lib/teacher-training-access";
import type { TeacherTrainingRecycleBinItem, TeacherTrainingRecycleBinItemType } from "@/lib/teacher-training";
import { decodeTeacherTrainingSubmissionAttachmentFile } from "@/lib/teacher-training-submission-attachments";
import { deleteStoredFile } from "@/lib/uploads";

const recycleTypeLabels: Record<TeacherTrainingRecycleBinItemType, string> = {
  cohort: "班次",
  course: "课程",
  checkIn: "签到任务",
  task: "任务",
};

const recycleItemTypes = new Set<TeacherTrainingRecycleBinItemType>(["cohort", "course", "checkIn", "task"]);

const formatRecycleDateTime = (value: Date | string | null | undefined) => {
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

const getAccessibleCohortIds = async (user: Awaited<ReturnType<typeof getSessionUser>>) => {
  if (!user) return [];
  if (isTeacherTrainingSystemAdmin(user)) return null;
  return getManagedTeacherTrainingCohortIds(user, { includeDeleted: true });
};

const validateRecycleItemType = (value?: string): TeacherTrainingRecycleBinItemType | null =>
  value && recycleItemTypes.has(value as TeacherTrainingRecycleBinItemType)
    ? (value as TeacherTrainingRecycleBinItemType)
    : null;

const getRecycleTargetCohortId = async (type: TeacherTrainingRecycleBinItemType, id: string) => {
  if (type === "cohort") {
    const cohort = await prisma.teacherTrainingCohort.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    return cohort?.deletedAt ? cohort.id : null;
  }

  if (type === "course") {
    const course = await prisma.teacherTrainingCourseSession.findUnique({
      where: { id },
      select: { cohortId: true, deletedAt: true },
    });
    return course?.deletedAt ? course.cohortId : null;
  }

  if (type === "checkIn") {
    const checkInTask = await prisma.teacherTrainingCheckInTask.findUnique({
      where: { id },
      select: { cohortId: true, deletedAt: true },
    });
    return checkInTask?.deletedAt ? checkInTask.cohortId : null;
  }

  const task = await prisma.teacherTrainingTask.findUnique({
    where: { id },
    select: { cohortId: true, deletedAt: true },
  });
  return task?.deletedAt ? task.cohortId : null;
};

const restoreRecycleItem = async (type: TeacherTrainingRecycleBinItemType, id: string) => {
  const data = {
    deletedAt: null,
    deletedById: null,
    deletedByName: null,
  };

  if (type === "cohort") {
    await prisma.teacherTrainingCohort.update({ where: { id }, data });
    return;
  }
  if (type === "course") {
    await prisma.teacherTrainingCourseSession.update({ where: { id }, data });
    return;
  }
  if (type === "checkIn") {
    await prisma.teacherTrainingCheckInTask.update({ where: { id }, data });
    return;
  }
  await prisma.teacherTrainingTask.update({ where: { id }, data });
};

const permanentlyDeleteRecycleItem = async (type: TeacherTrainingRecycleBinItemType, id: string) => {
  if (type === "cohort") {
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
    return;
  }

  if (type === "task") {
    const submissions = await prisma.teacherTrainingSubmission.findMany({
      where: { taskId: id },
      select: { attachment: true },
    });
    const attachmentObjectKeys = [
      ...new Set(
        submissions
          .map((submission) => decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment)?.filePath)
          .filter((filePath): filePath is string => Boolean(filePath)),
      ),
    ];

    await prisma.teacherTrainingTask.delete({ where: { id } });
    await Promise.allSettled(attachmentObjectKeys.map((objectKey) => deleteStoredFile(objectKey)));
    return;
  }

  if (type === "course") {
    await prisma.teacherTrainingCourseSession.delete({ where: { id } });
    return;
  }

  await prisma.teacherTrainingCheckInTask.delete({ where: { id } });
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const accessibleCohortIds = await getAccessibleCohortIds(user);
  if (Array.isArray(accessibleCohortIds) && accessibleCohortIds.length === 0) {
    return NextResponse.json({ items: [] satisfies TeacherTrainingRecycleBinItem[] });
  }

  const cohortAccessWhere: Prisma.TeacherTrainingCohortWhereInput = Array.isArray(accessibleCohortIds)
    ? { id: { in: accessibleCohortIds } }
    : {};
  const courseAccessWhere: Prisma.TeacherTrainingCourseSessionWhereInput = Array.isArray(accessibleCohortIds)
    ? { cohortId: { in: accessibleCohortIds } }
    : {};
  const checkInAccessWhere: Prisma.TeacherTrainingCheckInTaskWhereInput = Array.isArray(accessibleCohortIds)
    ? { cohortId: { in: accessibleCohortIds } }
    : {};
  const taskAccessWhere: Prisma.TeacherTrainingTaskWhereInput = Array.isArray(accessibleCohortIds)
    ? { cohortId: { in: accessibleCohortIds } }
    : {};

  const [cohorts, courses, checkInTasks, tasks] = await Promise.all([
    prisma.teacherTrainingCohort.findMany({
      where: { ...cohortAccessWhere, deletedAt: { not: null } },
      orderBy: [{ deletedAt: "desc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        deletedAt: true,
        deletedByName: true,
        startDate: true,
        endDate: true,
      },
    }),
    prisma.teacherTrainingCourseSession.findMany({
      where: { ...courseAccessWhere, deletedAt: { not: null } },
      orderBy: [{ deletedAt: "desc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        cohortId: true,
        courseDate: true,
        startTime: true,
        deletedAt: true,
        deletedByName: true,
        cohort: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.teacherTrainingCheckInTask.findMany({
      where: { ...checkInAccessWhere, deletedAt: { not: null } },
      orderBy: [{ deletedAt: "desc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        cohortId: true,
        signDate: true,
        startTime: true,
        deletedAt: true,
        deletedByName: true,
        cohort: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.teacherTrainingTask.findMany({
      where: { ...taskAccessWhere, deletedAt: { not: null } },
      orderBy: [{ deletedAt: "desc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        cohortId: true,
        dueDate: true,
        deletedAt: true,
        deletedByName: true,
        cohort: {
          select: {
            title: true,
          },
        },
      },
    }),
  ]);

  const items: TeacherTrainingRecycleBinItem[] = [
    ...cohorts.map((cohort) => ({
      id: cohort.id,
      type: "cohort" as const,
      typeLabel: recycleTypeLabels.cohort,
      title: cohort.title,
      cohortId: cohort.id,
      cohortTitle: cohort.title,
      deletedAt: formatRecycleDateTime(cohort.deletedAt),
      deletedByName: cohort.deletedByName || "管理员",
      detail: `${cohort.startDate} 至 ${cohort.endDate}`,
    })),
    ...courses.map((course) => ({
      id: course.id,
      type: "course" as const,
      typeLabel: recycleTypeLabels.course,
      title: course.title,
      cohortId: course.cohortId,
      cohortTitle: course.cohort.title,
      deletedAt: formatRecycleDateTime(course.deletedAt),
      deletedByName: course.deletedByName || "管理员",
      detail: [course.courseDate, course.startTime].filter(Boolean).join(" ") || "未填写时间",
    })),
    ...checkInTasks.map((task) => ({
      id: task.id,
      type: "checkIn" as const,
      typeLabel: recycleTypeLabels.checkIn,
      title: task.title,
      cohortId: task.cohortId,
      cohortTitle: task.cohort.title,
      deletedAt: formatRecycleDateTime(task.deletedAt),
      deletedByName: task.deletedByName || "管理员",
      detail: [task.signDate, task.startTime].filter(Boolean).join(" ") || "未填写时间",
    })),
    ...tasks.map((task) => ({
      id: task.id,
      type: "task" as const,
      typeLabel: recycleTypeLabels.task,
      title: task.title,
      cohortId: task.cohortId,
      cohortTitle: task.cohort.title,
      deletedAt: formatRecycleDateTime(task.deletedAt),
      deletedByName: task.deletedByName || "管理员",
      detail: task.dueDate ? `截止 ${task.dueDate}` : "未设置截止日期",
    })),
  ]
    .sort((first, second) => second.deletedAt.localeCompare(first.deletedAt))
    .slice(0, 50);

  return NextResponse.json({ items });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string; type?: string } | null;
  const id = body?.id?.trim();
  const type = validateRecycleItemType(body?.type);
  if (!id || !type) {
    return NextResponse.json({ message: "请先选择要恢复的省培回收站项目" }, { status: 400 });
  }

  const cohortId = await getRecycleTargetCohortId(type, id);
  if (!cohortId) {
    return NextResponse.json({ message: "该项目不在回收站中" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId, { includeDeleted: true }))) {
    return NextResponse.json({ message: "无权限恢复该省培项目" }, { status: 403 });
  }

  await restoreRecycleItem(type, id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    type?: string;
    confirmPermanent?: boolean;
  } | null;
  const id = body?.id?.trim();
  const type = validateRecycleItemType(body?.type);
  if (!id || !type) {
    return NextResponse.json({ message: "请先选择要永久删除的省培回收站项目" }, { status: 400 });
  }
  if (!body?.confirmPermanent) {
    return NextResponse.json({ message: "永久删除前请再次确认，相关记录和附件将无法恢复" }, { status: 409 });
  }

  const cohortId = await getRecycleTargetCohortId(type, id);
  if (!cohortId) {
    return NextResponse.json({ message: "该项目不在回收站中" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId, { includeDeleted: true }))) {
    return NextResponse.json({ message: "无权限永久删除该省培项目" }, { status: 403 });
  }

  await permanentlyDeleteRecycleItem(type, id);

  return NextResponse.json({ ok: true });
}
