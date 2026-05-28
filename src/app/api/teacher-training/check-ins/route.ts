import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";

const parseOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const clampRadiusMeters = (value: unknown) => {
  const radius = Number(value);
  if (!Number.isFinite(radius)) {
    return 300;
  }

  return Math.min(5000, Math.max(50, Math.round(radius)));
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        courseSessionId?: string;
        title?: string;
        signDate?: string;
        startTime?: string;
        endTime?: string;
        locationName?: string;
        latitude?: number | string;
        longitude?: number | string;
        radiusMeters?: number | string;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const courseSessionId = body?.courseSessionId?.trim();
  const title = body?.title?.trim();
  const signDate = body?.signDate?.trim();

  if (!cohortId || !title || !signDate) {
    return NextResponse.json({ message: "请填写班次、签到标题和签到日期" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findUnique({
    where: { id: cohortId },
    select: { id: true },
  });
  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限发布该省培班次签到任务" }, { status: 403 });
  }

  if (courseSessionId) {
    const courseSession = await prisma.teacherTrainingCourseSession.findFirst({
      where: {
        id: courseSessionId,
        cohortId,
      },
      select: { id: true },
    });
    if (!courseSession) {
      return NextResponse.json({ message: "课程不属于当前省培班次" }, { status: 404 });
    }
  }

  const latitude = parseOptionalNumber(body?.latitude);
  const longitude = parseOptionalNumber(body?.longitude);
  const checkInTask = await prisma.teacherTrainingCheckInTask.create({
    data: {
      cohortId,
      courseSessionId: courseSessionId || null,
      title,
      signDate,
      startTime: body?.startTime?.trim() || null,
      endTime: body?.endTime?.trim() || null,
      locationName: body?.locationName?.trim() || null,
      latitude,
      longitude,
      radiusMeters: clampRadiusMeters(body?.radiusMeters),
      createdById: user.id,
    },
  });

  return NextResponse.json({ checkInTask }, { status: 201 });
}
