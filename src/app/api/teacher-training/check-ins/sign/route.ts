import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  areValidTeacherTrainingCoordinates,
  calculateDistanceMeters,
  getAllowedTeacherTrainingCheckInDistanceMeters,
  getTeacherTrainingCheckInWindowState,
  teacherTrainingCheckInWindowMessages,
} from "@/lib/teacher-training";

const parseRequiredNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        checkInTaskId?: string;
        participantId?: string;
        latitude?: number;
        longitude?: number;
        accuracy?: number;
        note?: string;
      }
    | null;
  const checkInTaskId = body?.checkInTaskId?.trim();
  const participantId = body?.participantId?.trim();
  const latitude = parseRequiredNumber(body?.latitude);
  const longitude = parseRequiredNumber(body?.longitude);
  const accuracy = parseRequiredNumber(body?.accuracy);
  const hasCoordinateInput = body?.latitude !== undefined || body?.longitude !== undefined;

  if (!checkInTaskId || !participantId) {
    return NextResponse.json({ message: "签到信息不完整" }, { status: 400 });
  }
  if (
    hasCoordinateInput &&
    (latitude === null || longitude === null || !areValidTeacherTrainingCoordinates(latitude, longitude))
  ) {
    return NextResponse.json({ message: "定位坐标不正确" }, { status: 400 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      accountUserId: user.id,
      cohort: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
      cohortId: true,
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "参训教师身份不匹配" }, { status: 404 });
  }

  const checkInTask = await prisma.teacherTrainingCheckInTask.findFirst({
    where: {
      id: checkInTaskId,
      cohortId: participant.cohortId,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      signDate: true,
      startTime: true,
      endTime: true,
      isActive: true,
      latitude: true,
      longitude: true,
      radiusMeters: true,
    },
  });
  if (!checkInTask) {
    return NextResponse.json({ message: "签到任务不存在或已关闭" }, { status: 404 });
  }

  const windowState = getTeacherTrainingCheckInWindowState(checkInTask);
  if (windowState !== "open") {
    return NextResponse.json(
      { message: teacherTrainingCheckInWindowMessages[windowState] ?? "当前不在签到时间内" },
      { status: 400 },
    );
  }

  if ((checkInTask.latitude !== null || checkInTask.longitude !== null) && (latitude === null || longitude === null)) {
    return NextResponse.json({ message: "请允许浏览器定位后再签到" }, { status: 400 });
  }

  const distanceMeters =
    checkInTask.latitude !== null && checkInTask.longitude !== null && latitude !== null && longitude !== null
      ? calculateDistanceMeters(checkInTask.latitude, checkInTask.longitude, latitude, longitude)
      : null;

  const allowedDistanceMeters = getAllowedTeacherTrainingCheckInDistanceMeters(checkInTask.radiusMeters, accuracy);

  if (distanceMeters !== null && distanceMeters > allowedDistanceMeters) {
    return NextResponse.json({ message: `不在签到范围内，当前距离约 ${distanceMeters} 米` }, { status: 400 });
  }

  const record = await prisma.teacherTrainingCheckInRecord.upsert({
    where: {
      checkInTaskId_participantId: {
        checkInTaskId,
        participantId,
      },
    },
    update: {
      latitude,
      longitude,
      accuracy,
      distanceMeters,
      status: "valid",
      note: body?.note?.trim() || null,
      signedAt: new Date(),
    },
    create: {
      checkInTaskId,
      participantId,
      latitude,
      longitude,
      accuracy,
      distanceMeters,
      status: "valid",
      note: body?.note?.trim() || null,
    },
  });

  return NextResponse.json({ record });
}
