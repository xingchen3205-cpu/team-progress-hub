import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import {
  isTeacherTrainingDateKey,
  TEACHER_TRAINING_IMPORT_ONLY_LOCATION_MARKER,
  validateTeacherTrainingSessionTimeRange,
} from "@/lib/teacher-training";
import { buildTeacherTrainingImportNote } from "@/lib/teacher-training-checkin-import";
import {
  analyzeCheckInImport,
  parseCheckInImportFile,
} from "@/lib/teacher-training-checkin-import-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const toDateTimeLabel = (value: Date) =>
  value.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

type ResolutionInput = { key?: string; participantId?: string };

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const cohortId = `${formData?.get("cohortId") ?? ""}`.trim();
  const checkInTaskId = `${formData?.get("checkInTaskId") ?? ""}`.trim();
  // 新建"名单导入签到"时的任务字段（无经纬度 => 纯线上，不向教师发布定位入口）。
  const title = `${formData?.get("title") ?? ""}`.trim();
  const signDate = `${formData?.get("signDate") ?? ""}`.trim();
  const startTime = `${formData?.get("startTime") ?? ""}`.trim() || null;
  const endTime = `${formData?.get("endTime") ?? ""}`.trim() || null;
  const courseSessionId = `${formData?.get("courseSessionId") ?? ""}`.trim() || null;

  let resolutions: ResolutionInput[] = [];
  const rawResolutions = formData?.get("resolutions");
  if (typeof rawResolutions === "string" && rawResolutions.trim()) {
    try {
      const parsed = JSON.parse(rawResolutions);
      if (Array.isArray(parsed)) resolutions = parsed as ResolutionInput[];
    } catch {
      return NextResponse.json({ message: "冲突处理数据格式不正确" }, { status: 400 });
    }
  }

  if (!cohortId) {
    return NextResponse.json({ message: "请选择省培班次" }, { status: 400 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限导入该省培班次签到名单" }, { status: 403 });
  }

  // 目标任务：使用已有任务（混合签到），或用提交的字段新建纯线上名单签到。
  let targetTaskId = "";
  let creatingTask: { title: string; signDate: string; startTime: string | null; endTime: string | null; courseSessionId: string | null } | null =
    null;
  if (checkInTaskId) {
    const task = await prisma.teacherTrainingCheckInTask.findFirst({
      where: { id: checkInTaskId, cohortId, deletedAt: null, cohort: { deletedAt: null } },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ message: "签到任务不存在或不属于当前班次" }, { status: 404 });
    }
    targetTaskId = task.id;
  } else {
    if (!title || !signDate) {
      return NextResponse.json({ message: "请填写签到名称和签到日期" }, { status: 400 });
    }
    if (!isTeacherTrainingDateKey(signDate)) {
      return NextResponse.json({ message: "签到日期格式不正确" }, { status: 400 });
    }
    const timeRangeError = validateTeacherTrainingSessionTimeRange(startTime, endTime);
    if (timeRangeError) {
      return NextResponse.json({ message: timeRangeError }, { status: 400 });
    }
    if (courseSessionId) {
      const courseSession = await prisma.teacherTrainingCourseSession.findFirst({
        where: { id: courseSessionId, cohortId, deletedAt: null },
        select: { id: true },
      });
      if (!courseSession) {
        return NextResponse.json({ message: "课程不属于当前省培班次" }, { status: 404 });
      }
    }
    creatingTask = { title, signDate, startTime, endTime, courseSessionId };
  }

  // 已签到人员（用于跳过，不覆盖现有定位/补签/导入记录）。
  const alreadySignedParticipantIds = targetTaskId
    ? (
        await prisma.teacherTrainingCheckInRecord.findMany({
          where: { checkInTaskId: targetTaskId },
          select: { participantId: true },
        })
      ).map((record) => record.participantId)
    : [];

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

  // 组装待写入清单：自动匹配的可导入项 + 管理员在冲突里手动选择的项。
  const importByParticipant = new Map(
    analysis.importable.map((match) => [match.participantId, match.attendee]),
  );
  if (resolutions.length > 0) {
    const conflictByKey = new Map(
      analysis.conflicts.map((conflict) => [
        conflict.attendee.phone ? `p:${conflict.attendee.phone}` : `n:${conflict.attendee.name}`,
        conflict,
      ]),
    );
    for (const resolution of resolutions) {
      const key = `${resolution.key ?? ""}`.trim();
      const participantId = `${resolution.participantId ?? ""}`.trim();
      const conflict = conflictByKey.get(key);
      if (!conflict || !participantId) continue;
      if (!conflict.candidates.some((candidate) => candidate.id === participantId)) continue;
      if (alreadySignedParticipantIds.includes(participantId)) continue;
      if (!importByParticipant.has(participantId)) {
        importByParticipant.set(participantId, conflict.attendee);
      }
    }
  }

  if (importByParticipant.size === 0) {
    return NextResponse.json(
      { message: "没有可导入的教师，请检查未匹配、冲突或已签到名单。" },
      { status: 400 },
    );
  }

  const fileName = file instanceof File ? file.name : "";
  const importedAtLabel = toDateTimeLabel(new Date());

  const result = await prisma.$transaction(async (tx) => {
    let effectiveTaskId = targetTaskId;
    if (!effectiveTaskId && creatingTask) {
      const created = await tx.teacherTrainingCheckInTask.create({
        data: {
          cohortId,
          courseSessionId: creatingTask.courseSessionId,
          title: creatingTask.title,
          signDate: creatingTask.signDate,
          startTime: creatingTask.startTime,
          endTime: creatingTask.endTime,
          // 纯线上名单签到使用明确内部标记，不影响既有“无中心坐标但仍需定位”的任务。
          locationName: TEACHER_TRAINING_IMPORT_ONLY_LOCATION_MARKER,
          latitude: null,
          longitude: null,
          createdById: user.id,
        },
        select: { id: true },
      });
      effectiveTaskId = created.id;
    }

    // 事务内再查一次已存在记录，避免覆盖现有签到，并保证重复导入幂等。
    const existingRecords = await tx.teacherTrainingCheckInRecord.findMany({
      where: { checkInTaskId: effectiveTaskId },
      select: { participantId: true },
    });
    const existingParticipantIds = new Set(existingRecords.map((record) => record.participantId));

    const toCreate = [...importByParticipant.entries()].filter(([participantId]) => !existingParticipantIds.has(participantId));
    if (toCreate.length > 0) {
      await tx.teacherTrainingCheckInRecord.createMany({
        data: toCreate.map(([participantId, attendee]) => ({
          checkInTaskId: effectiveTaskId,
          participantId,
          latitude: null,
          longitude: null,
          accuracy: null,
          distanceMeters: null,
          status: "imported",
          note: buildTeacherTrainingImportNote({ fileName, operatorName: user.name, importedAt: importedAtLabel, attendee }),
        })),
      });
    }

    return { taskId: effectiveTaskId, importedCount: toCreate.length };
  });

  return NextResponse.json({
    ok: true,
    checkInTaskId: result.taskId,
    importedCount: result.importedCount,
    stats: analysis.stats,
  });
}
