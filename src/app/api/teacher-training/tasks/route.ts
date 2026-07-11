import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import {
  normalizeTeacherTrainingDueDateForSave,
  normalizeTeacherTrainingTaskDateTime,
  normalizeTeacherTrainingTaskReleaseMode,
  validateTeacherTrainingDueAgainstRelease,
} from "@/lib/teacher-training";
import { decodeTeacherTrainingSubmissionAttachmentFile } from "@/lib/teacher-training-submission-attachments";
import { deleteStoredFile } from "@/lib/uploads";

type TeacherTrainingTaskInput = {
  id?: string;
  cohortId?: string;
  courseSessionId?: string;
  title?: string;
  description?: string;
  dueDate?: string;
  taskType?: string;
  releaseMode?: string;
  releaseAt?: string;
  requireAttachment?: boolean;
  enableAiReview?: boolean;
  scoringRubric?: string;
};

const normalizeTeacherTrainingTaskType = (value?: string | null, courseSessionId?: string | null) => {
  if (value === "group") return "group";
  if (value === "course" || courseSessionId) return "course";
  if (value === "stage") return "stage";
  return "cohort";
};

const validateTeacherTrainingTaskOptions = async ({
  cohortId,
  courseSessionId,
  releaseMode,
  releaseAt,
  dueDate,
}: {
  cohortId: string;
  courseSessionId: string | null;
  releaseMode: ReturnType<typeof normalizeTeacherTrainingTaskReleaseMode>;
  releaseAt: string;
  dueDate: string;
}) => {
  let courseSession: { courseDate: string; startTime: string | null; endTime: string | null } | null = null;
  if (courseSessionId) {
    courseSession = await prisma.teacherTrainingCourseSession.findFirst({
      where: { id: courseSessionId, cohortId, deletedAt: null },
      select: { courseDate: true, startTime: true, endTime: true },
    });
    if (!courseSession) {
      return "关联课程不存在或不属于当前班次";
    }
  }

  if (releaseMode === "after_course" && !courseSessionId) {
    return "课程结束后开放必须先选择关联课程";
  }

  if (releaseMode === "scheduled" && !releaseAt) {
    return "指定时间开放必须填写开放时间";
  }

  // 截止时间必须晚于开放时间/课程结束时间（Asia/Shanghai）。
  const dueError = validateTeacherTrainingDueAgainstRelease({ dueDate, releaseMode, releaseAt, courseSession });
  if (dueError) {
    return dueError;
  }

  return "";
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as TeacherTrainingTaskInput | null;
  const cohortId = body?.cohortId?.trim();
  const title = body?.title?.trim();
  const description = body?.description?.trim();
  const courseSessionId = body?.courseSessionId?.trim() || null;
  const releaseMode = normalizeTeacherTrainingTaskReleaseMode(body?.releaseMode);
  const releaseAt = normalizeTeacherTrainingTaskDateTime(body?.releaseAt);
  const dueDate = normalizeTeacherTrainingDueDateForSave(body?.dueDate);
  const taskType = normalizeTeacherTrainingTaskType(body?.taskType, courseSessionId);

  if (!cohortId || !title || !description) {
    return NextResponse.json({ message: "请填写任务名称、说明和所属班次" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: { id: cohortId, deletedAt: null },
    select: { id: true },
  });
  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限发布该省培班次任务" }, { status: 403 });
  }
  if (taskType === "group") {
    const groupedParticipantCount = await prisma.teacherTrainingParticipant.count({
      where: {
        cohortId,
        AND: [{ groupName: { not: null } }, { groupName: { not: "" } }],
      },
    });
    if (!groupedParticipantCount) {
      return NextResponse.json(
        { message: "当前班次尚未完成分组，请先在参训教师中保存分组。" },
        { status: 400 },
      );
    }
  }
  const optionError = await validateTeacherTrainingTaskOptions({
    cohortId,
    courseSessionId,
    releaseMode,
    releaseAt,
    dueDate,
  });
  if (optionError) {
    return NextResponse.json({ message: optionError }, { status: 400 });
  }

  const task = await prisma.teacherTrainingTask.create({
    data: {
      cohortId,
      courseSessionId,
      title,
      description,
      dueDate: dueDate || null,
      taskType,
      releaseMode,
      releaseAt: releaseMode === "scheduled" ? releaseAt : null,
      requireAttachment: true,
      enableAiReview: Boolean(body?.enableAiReview),
      scoringRubric: body?.scoringRubric?.trim() || null,
      createdById: user.id,
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as TeacherTrainingTaskInput | null;
  const id = body?.id?.trim();
  const title = body?.title?.trim();
  const description = body?.description?.trim();
  const courseSessionId = body?.courseSessionId?.trim() || null;
  const releaseMode = normalizeTeacherTrainingTaskReleaseMode(body?.releaseMode);
  const releaseAt = normalizeTeacherTrainingTaskDateTime(body?.releaseAt);
  const dueDate = normalizeTeacherTrainingDueDateForSave(body?.dueDate);
  const taskType = normalizeTeacherTrainingTaskType(body?.taskType, courseSessionId);

  if (!id || !title || !description) {
    return NextResponse.json({ message: "请填写任务、任务名称和任务说明" }, { status: 400 });
  }

  const existing = await prisma.teacherTrainingTask.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, cohortId: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "省培任务不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, existing.cohortId))) {
    return NextResponse.json({ message: "无权限修改该省培班次任务" }, { status: 403 });
  }
  if (taskType === "group") {
    const groupedParticipantCount = await prisma.teacherTrainingParticipant.count({
      where: {
        cohortId: existing.cohortId,
        AND: [{ groupName: { not: null } }, { groupName: { not: "" } }],
      },
    });
    if (!groupedParticipantCount) {
      return NextResponse.json(
        { message: "当前班次尚未完成分组，请先在参训教师中保存分组。" },
        { status: 400 },
      );
    }
  }
  const optionError = await validateTeacherTrainingTaskOptions({
    cohortId: existing.cohortId,
    courseSessionId,
    releaseMode,
    releaseAt,
    dueDate,
  });
  if (optionError) {
    return NextResponse.json({ message: optionError }, { status: 400 });
  }

  const task = await prisma.teacherTrainingTask.update({
    where: { id },
    data: {
      courseSessionId,
      title,
      description,
      dueDate: dueDate || null,
      taskType,
      releaseMode,
      releaseAt: releaseMode === "scheduled" ? releaseAt : null,
      requireAttachment: true,
      enableAiReview: Boolean(body?.enableAiReview),
      scoringRubric: body?.scoringRubric?.trim() || null,
    },
  });

  return NextResponse.json({ task });
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) {
    return NextResponse.json({ message: "请先选择要删除的省培任务" }, { status: 400 });
  }

  const existing = await prisma.teacherTrainingTask.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, cohortId: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "省培任务不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, existing.cohortId))) {
    return NextResponse.json({ message: "无权限删除该省培班次任务" }, { status: 403 });
  }

  const submissions = await prisma.teacherTrainingSubmission.findMany({
    where: { taskId: id },
    select: { attachment: true },
  });
  const attachmentObjectKeys = [
    ...new Set(
      submissions
        .map((submission) => decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment)?.filePath)
        .filter((filePath): filePath is string => Boolean(filePath)),
    ),
  ];

  await prisma.teacherTrainingTask.delete({ where: { id } });
  await Promise.allSettled(attachmentObjectKeys.map((objectKey) => deleteStoredFile(objectKey)));

  return NextResponse.json({ ok: true });
}
