import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  TEACHER_TRAINING_CHECK_IN_DEFAULT_RADIUS_METERS,
  areValidTeacherTrainingCoordinates,
  isTeacherTrainingDateKey,
  parseTeacherTrainingTimeToMinutes,
} from "@/lib/teacher-training";
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
    return TEACHER_TRAINING_CHECK_IN_DEFAULT_RADIUS_METERS;
  }

  return Math.min(5000, Math.max(50, Math.round(radius)));
};

const hasCoordinateValue = (value: unknown) =>
  value !== null && value !== undefined && String(value).trim() !== "";

type TeacherTrainingCheckInTaskInput = {
  id?: string;
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
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as TeacherTrainingCheckInTaskInput | null;
  const cohortId = body?.cohortId?.trim();
  const courseSessionId = body?.courseSessionId?.trim();
  const title = body?.title?.trim();
  const signDate = body?.signDate?.trim();
  const startTime = body?.startTime?.trim() || null;
  const endTime = body?.endTime?.trim() || null;

  if (!cohortId || !title || !signDate) {
    return NextResponse.json({ message: "请填写班次、签到标题和签到日期" }, { status: 400 });
  }
  if (!isTeacherTrainingDateKey(signDate)) {
    return NextResponse.json({ message: "签到日期格式不正确" }, { status: 400 });
  }
  const startMinutes = parseTeacherTrainingTimeToMinutes(startTime);
  const endMinutes = parseTeacherTrainingTimeToMinutes(endTime);
  if ((startTime && startMinutes === null) || (endTime && endMinutes === null)) {
    return NextResponse.json({ message: "签到时间格式不正确" }, { status: 400 });
  }
  if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
    return NextResponse.json({ message: "签到结束时间不能早于开始时间" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: { id: cohortId, deletedAt: null },
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
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!courseSession) {
      return NextResponse.json({ message: "课程不属于当前省培班次" }, { status: 404 });
    }
  }

  const hasLatitude = hasCoordinateValue(body?.latitude);
  const hasLongitude = hasCoordinateValue(body?.longitude);
  const latitude = parseOptionalNumber(body?.latitude);
  const longitude = parseOptionalNumber(body?.longitude);
  if (hasLatitude !== hasLongitude) {
    return NextResponse.json({ message: "请同时填写纬度和经度" }, { status: 400 });
  }
  if (hasLatitude && (latitude === null || longitude === null || !areValidTeacherTrainingCoordinates(latitude, longitude))) {
    return NextResponse.json({ message: "经纬度范围不正确" }, { status: 400 });
  }

  const checkInTask = await prisma.teacherTrainingCheckInTask.create({
    data: {
      cohortId,
      courseSessionId: courseSessionId || null,
      title,
      signDate,
      startTime,
      endTime,
      locationName: body?.locationName?.trim() || null,
      latitude,
      longitude,
      radiusMeters: clampRadiusMeters(body?.radiusMeters),
      createdById: user.id,
    },
  });

  return NextResponse.json({ checkInTask }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as TeacherTrainingCheckInTaskInput | null;
  const id = body?.id?.trim();
  const title = body?.title?.trim();
  const signDate = body?.signDate?.trim();
  const startTime = body?.startTime?.trim() || null;
  const endTime = body?.endTime?.trim() || null;

  if (!id || !title || !signDate) {
    return NextResponse.json({ message: "请填写签到任务、签到标题和签到日期" }, { status: 400 });
  }
  if (!isTeacherTrainingDateKey(signDate)) {
    return NextResponse.json({ message: "签到日期格式不正确" }, { status: 400 });
  }
  const startMinutes = parseTeacherTrainingTimeToMinutes(startTime);
  const endMinutes = parseTeacherTrainingTimeToMinutes(endTime);
  if ((startTime && startMinutes === null) || (endTime && endMinutes === null)) {
    return NextResponse.json({ message: "签到时间格式不正确" }, { status: 400 });
  }
  if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
    return NextResponse.json({ message: "签到结束时间不能早于开始时间" }, { status: 400 });
  }

  const existing = await prisma.teacherTrainingCheckInTask.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, cohortId: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "签到任务不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, existing.cohortId))) {
    return NextResponse.json({ message: "无权限修改该省培班次签到任务" }, { status: 403 });
  }

  const courseSessionId = body?.courseSessionId?.trim();
  if (courseSessionId) {
    const courseSession = await prisma.teacherTrainingCourseSession.findFirst({
      where: {
        id: courseSessionId,
        cohortId: existing.cohortId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!courseSession) {
      return NextResponse.json({ message: "课程不属于当前省培班次" }, { status: 404 });
    }
  }

  const hasLatitude = hasCoordinateValue(body?.latitude);
  const hasLongitude = hasCoordinateValue(body?.longitude);
  const latitude = parseOptionalNumber(body?.latitude);
  const longitude = parseOptionalNumber(body?.longitude);
  if (hasLatitude !== hasLongitude) {
    return NextResponse.json({ message: "请同时填写纬度和经度" }, { status: 400 });
  }
  if (hasLatitude && (latitude === null || longitude === null || !areValidTeacherTrainingCoordinates(latitude, longitude))) {
    return NextResponse.json({ message: "经纬度范围不正确" }, { status: 400 });
  }

  const checkInTask = await prisma.teacherTrainingCheckInTask.update({
    where: { id },
    data: {
      courseSessionId: courseSessionId || null,
      title,
      signDate,
      startTime,
      endTime,
      locationName: body?.locationName?.trim() || null,
      latitude,
      longitude,
      radiusMeters: clampRadiusMeters(body?.radiusMeters),
    },
  });

  return NextResponse.json({ checkInTask });
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) {
    return NextResponse.json({ message: "请先选择要删除的签到任务" }, { status: 400 });
  }

  const existing = await prisma.teacherTrainingCheckInTask.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, cohortId: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "签到任务不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, existing.cohortId))) {
    return NextResponse.json({ message: "无权限删除该省培班次签到任务" }, { status: 403 });
  }

  await prisma.teacherTrainingCheckInTask.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
