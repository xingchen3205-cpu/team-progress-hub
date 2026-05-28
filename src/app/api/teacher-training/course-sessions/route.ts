import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        title?: string;
        courseDate?: string;
        startTime?: string;
        endTime?: string;
        location?: string;
        instructor?: string;
        description?: string;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const title = body?.title?.trim();
  const courseDate = body?.courseDate?.trim();

  if (!cohortId || !title || !courseDate) {
    return NextResponse.json({ message: "请填写班次、课程名称和上课日期" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findUnique({
    where: { id: cohortId },
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
