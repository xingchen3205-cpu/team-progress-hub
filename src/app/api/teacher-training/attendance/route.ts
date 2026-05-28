import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import type { TeacherTrainingAttendanceStatus } from "@/lib/teacher-training";

const attendanceStatusSet = new Set<TeacherTrainingAttendanceStatus>(["present", "leave", "absent"]);

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        participantId?: string;
        sessionDate?: string;
        sessionLabel?: string;
        status?: TeacherTrainingAttendanceStatus;
        note?: string;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const participantId = body?.participantId?.trim();
  const sessionDate = body?.sessionDate?.trim();
  const sessionLabel = body?.sessionLabel?.trim() || "报到";
  const status = body?.status;

  if (!cohortId || !participantId || !sessionDate || !status || !attendanceStatusSet.has(status)) {
    return NextResponse.json({ message: "签到信息不完整" }, { status: 400 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限登记该省培班次签到" }, { status: 403 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      cohortId,
    },
    select: {
      id: true,
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "参训教师不属于当前班次" }, { status: 404 });
  }

  const attendance = await prisma.teacherTrainingAttendance.upsert({
    where: {
      participantId_sessionDate_sessionLabel: {
        participantId,
        sessionDate,
        sessionLabel,
      },
    },
    update: {
      status,
      note: body?.note?.trim() || null,
      markedById: user.id,
      markedAt: new Date(),
    },
    create: {
      cohortId,
      participantId,
      sessionDate,
      sessionLabel,
      status,
      note: body?.note?.trim() || null,
      markedById: user.id,
    },
  });

  return NextResponse.json({ attendance });
}
