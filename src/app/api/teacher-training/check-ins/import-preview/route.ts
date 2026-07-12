import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import {
  analyzeCheckInImport,
  parseCheckInImportFile,
} from "@/lib/teacher-training-checkin-import-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const cohortId = `${formData?.get("cohortId") ?? ""}`.trim();
  const checkInTaskId = `${formData?.get("checkInTaskId") ?? ""}`.trim();

  if (!cohortId) {
    return NextResponse.json({ message: "请选择省培班次" }, { status: 400 });
  }
  // 后端二次校验班次管理权限，不能只靠前端隐藏按钮。
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限导入该省培班次签到名单" }, { status: 403 });
  }

  let alreadySignedParticipantIds: string[] = [];
  if (checkInTaskId) {
    const task = await prisma.teacherTrainingCheckInTask.findFirst({
      where: { id: checkInTaskId, cohortId, deletedAt: null, cohort: { deletedAt: null } },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ message: "签到任务不存在或不属于当前班次" }, { status: 404 });
    }
    const records = await prisma.teacherTrainingCheckInRecord.findMany({
      where: { checkInTaskId },
      select: { participantId: true },
    });
    alreadySignedParticipantIds = records.map((record) => record.participantId);
  }

  const fileResult = await parseCheckInImportFile(file);
  if (!fileResult.ok) {
    return NextResponse.json({ message: fileResult.message }, { status: fileResult.status });
  }

  const analysisResult = await analyzeCheckInImport({
    rows: fileResult.rows,
    cohortId,
    alreadySignedParticipantIds,
  });
  if (!analysisResult.ok) {
    return NextResponse.json({ message: analysisResult.message }, { status: analysisResult.status });
  }

  const { analysis } = analysisResult;
  if (analysis.stats.importableCount === 0 && analysis.stats.conflictCount === 0) {
    // 允许仍返回预览（便于显示未匹配/已签到），但明确提示没有可导入人员。
    return NextResponse.json({
      fileName: file instanceof File ? file.name : "",
      stats: analysis.stats,
      importable: [],
      alreadySigned: analysis.alreadySigned.map(serializeMatch),
      unmatched: analysis.unmatched.map(serializeAttendee),
      conflicts: [],
      message: "没有可导入的教师，请检查名单或匹配情况。",
    });
  }

  return NextResponse.json({
    fileName: file instanceof File ? file.name : "",
    stats: analysis.stats,
    importable: analysis.importable.map(serializeMatch),
    alreadySigned: analysis.alreadySigned.map(serializeMatch),
    unmatched: analysis.unmatched.map(serializeAttendee),
    conflicts: analysis.conflicts.map((conflict) => ({
      attendee: serializeAttendee(conflict.attendee),
      candidates: conflict.candidates,
    })),
  });
}

const serializeAttendee = (attendee: {
  name: string;
  phone: string;
  joinTime: string;
  leaveTime: string;
  durationMinutes: number;
  mergedCount: number;
}) => ({
  name: attendee.name,
  phone: attendee.phone,
  joinTime: attendee.joinTime,
  leaveTime: attendee.leaveTime,
  durationMinutes: attendee.durationMinutes,
  mergedCount: attendee.mergedCount,
});

const serializeMatch = (match: {
  attendee: Parameters<typeof serializeAttendee>[0];
  participantId: string;
  participantName: string;
  matchedBy: "phone" | "name";
}) => ({
  participantId: match.participantId,
  participantName: match.participantName,
  matchedBy: match.matchedBy,
  attendee: serializeAttendee(match.attendee),
});
