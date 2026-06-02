import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";

type TeacherTrainingCourseSessionInput = {
  id?: string;
  cohortId?: string;
  title?: string;
  courseDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  instructor?: string;
  description?: string;
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | (TeacherTrainingCourseSessionInput & {
        courses?: TeacherTrainingCourseSessionInput[];
      })
    | null;

  if (Array.isArray(body?.courses)) {
    const cohortId = body?.cohortId?.trim();
    if (!cohortId) {
      return NextResponse.json({ message: "请先选择省培班次" }, { status: 400 });
    }
    const cohort = await prisma.teacherTrainingCohort.findFirst({
      where: { id: cohortId, deletedAt: null },
      select: { id: true },
    });
    if (!cohort) {
      return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
    }
    if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
      return NextResponse.json({ message: "无权限维护该省培班次课程安排" }, { status: 403 });
    }

    const rows = body.courses.map((course) => ({
      title: course.title?.trim() ?? "",
      courseDate: course.courseDate?.trim() ?? "",
      startTime: course.startTime?.trim() || null,
      endTime: course.endTime?.trim() || null,
      location: course.location?.trim() || null,
      instructor: course.instructor?.trim() || null,
      description: course.description?.trim() || null,
    }));
    if (rows.length === 0 || rows.some((course) => !course.title || !course.courseDate)) {
      return NextResponse.json({ message: "导入课程需包含课程名称和日期" }, { status: 400 });
    }

    await prisma.teacherTrainingCourseSession.createMany({
      data: rows.map((course) => ({
        cohortId,
        createdById: user.id,
        ...course,
      })),
    });

    return NextResponse.json({ count: rows.length }, { status: 201 });
  }

  const cohortId = body?.cohortId?.trim();
  const title = body?.title?.trim();
  const courseDate = body?.courseDate?.trim();

  if (!cohortId || !title || !courseDate) {
    return NextResponse.json({ message: "请填写班次、课程名称和上课日期" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: { id: cohortId, deletedAt: null },
    select: { id: true },
  });
  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限维护该省培班次课程安排" }, { status: 403 });
  }

  const courseSession = await prisma.teacherTrainingCourseSession.create({
    data: {
      cohortId,
      title,
      courseDate,
      startTime: body?.startTime?.trim() || null,
      endTime: body?.endTime?.trim() || null,
      location: body?.location?.trim() || null,
      instructor: body?.instructor?.trim() || null,
      description: body?.description?.trim() || null,
      createdById: user.id,
    },
  });

  return NextResponse.json({ courseSession }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as TeacherTrainingCourseSessionInput | null;
  const id = body?.id?.trim();
  const title = body?.title?.trim();
  const courseDate = body?.courseDate?.trim();
  if (!id || !title || !courseDate) {
    return NextResponse.json({ message: "请填写课程、课程名称和上课日期" }, { status: 400 });
  }

  const existing = await prisma.teacherTrainingCourseSession.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, cohortId: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "课程不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, existing.cohortId))) {
    return NextResponse.json({ message: "无权限修改该省培班次课程安排" }, { status: 403 });
  }

  const courseSession = await prisma.teacherTrainingCourseSession.update({
    where: { id },
    data: {
      title,
      courseDate,
      startTime: body?.startTime?.trim() || null,
      endTime: body?.endTime?.trim() || null,
      location: body?.location?.trim() || null,
      instructor: body?.instructor?.trim() || null,
      description: body?.description?.trim() || null,
    },
  });

  return NextResponse.json({ courseSession });
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) {
    return NextResponse.json({ message: "请先选择要删除的课程" }, { status: 400 });
  }

  const existing = await prisma.teacherTrainingCourseSession.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, cohortId: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "课程不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, existing.cohortId))) {
    return NextResponse.json({ message: "无权限删除该省培班次课程安排" }, { status: 403 });
  }

  await prisma.teacherTrainingCourseSession.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: user.id,
      deletedByName: user.name,
    },
  });

  return NextResponse.json({ ok: true });
}
