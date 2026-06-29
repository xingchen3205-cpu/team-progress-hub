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
        checkInTaskId?: string;
        participantId?: string;
        note?: string;
      }
    | null;
  const checkInTaskId = body?.checkInTaskId?.trim();
  const participantId = body?.participantId?.trim();
  const note = body?.note?.trim();

  if (!checkInTaskId || !participantId) {
    return NextResponse.json({ message: "补签信息不完整" }, { status: 400 });
  }
  if (!note) {
    return NextResponse.json({ message: "请填写人工补签原因" }, { status: 400 });
  }

  const checkInTask = await prisma.teacherTrainingCheckInTask.findFirst({
    where: {
      id: checkInTaskId,
      isActive: true,
      deletedAt: null,
      cohort: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
      cohortId: true,
    },
  });
  if (!checkInTask) {
    return NextResponse.json({ message: "签到任务不存在或已关闭" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, checkInTask.cohortId))) {
    return NextResponse.json({ message: "无权限处理该省培班次签到" }, { status: 403 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      cohortId: checkInTask.cohortId,
      cohort: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "参训教师不属于当前班次" }, { status: 404 });
  }

  const recordNote = `${note}；工作人员：${user.name}`;
  const record = await prisma.teacherTrainingCheckInRecord.upsert({
    where: {
      checkInTaskId_participantId: {
        checkInTaskId,
        participantId,
      },
    },
    update: {
      latitude: null,
      longitude: null,
      accuracy: null,
      distanceMeters: null,
      status: "manual",
      note: recordNote,
      signedAt: new Date(),
    },
    create: {
      checkInTaskId,
      participantId,
      latitude: null,
      longitude: null,
      accuracy: null,
      distanceMeters: null,
      status: "manual",
      note: recordNote,
    },
  });

  return NextResponse.json({ record });
}
