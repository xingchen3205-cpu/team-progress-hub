import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { buildTeacherTrainingAttendanceNote, type TeacherTrainingAttendanceStatus } from "@/lib/teacher-training";

type AttendanceUpdateStatus = TeacherTrainingAttendanceStatus | "pending";

const attendanceStatusSet = new Set<AttendanceUpdateStatus>(["present", "leave", "absent", "online", "pending"]);

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        attendanceId?: string;
        participantId?: string;
        sessionDate?: string;
        sessionLabel?: string;
        status?: AttendanceUpdateStatus;
        roomNumber?: string;
        materialsComplete?: boolean;
        note?: string;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const attendanceId = body?.attendanceId?.trim() || "";
  const participantId = body?.participantId?.trim();
  const sessionDate = body?.sessionDate?.trim();
  const sessionLabel = body?.sessionLabel?.trim() || "报到";
  const status = body?.status;
  const roomNumber = body?.roomNumber?.trim() || "";
  const materialsComplete = typeof body?.materialsComplete === "boolean" ? body.materialsComplete : null;

  if (!cohortId || !participantId || !sessionDate || !status || !attendanceStatusSet.has(status)) {
    return NextResponse.json({ message: "报到信息不完整" }, { status: 400 });
  }
  if (status === "present" && sessionLabel === "报到" && (!roomNumber || materialsComplete === null)) {
    return NextResponse.json({ message: "请填写酒店房号并确认报到材料是否齐全" }, { status: 400 });
  }
  if ((status === "pending" || status === "online") && sessionLabel !== "报到") {
    return NextResponse.json({ message: "待报到和线上参训仅适用于报到登记" }, { status: 400 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限登记该省培班次报到" }, { status: 403 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      cohortId,
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

  if (status === "pending") {
    if (!attendanceId) {
      return NextResponse.json({ attendance: null, revertedToPending: true, deletedCount: 0 });
    }
    const deleted = await prisma.teacherTrainingAttendance.deleteMany({
      where: {
        id: attendanceId,
        cohortId,
        participantId,
        sessionLabel: "报到",
        status: { in: ["present", "online"] },
      },
    });

    return NextResponse.json({ attendance: null, revertedToPending: true, deletedCount: deleted.count });
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
      note:
        status === "present" && sessionLabel === "报到"
          ? buildTeacherTrainingAttendanceNote({
              roomNumber,
              materialsComplete,
              registrationNote: body?.note?.trim() || "",
            }) || null
          : body?.note?.trim() || null,
      markedById: user.id,
      markedAt: new Date(),
    },
    create: {
      cohortId,
      participantId,
      sessionDate,
      sessionLabel,
      status,
      note:
        status === "present" && sessionLabel === "报到"
          ? buildTeacherTrainingAttendanceNote({
              roomNumber,
              materialsComplete,
              registrationNote: body?.note?.trim() || "",
            }) || null
          : body?.note?.trim() || null,
      markedById: user.id,
    },
  });

  return NextResponse.json({ attendance });
}
