import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { decodeTeacherTrainingSubmissionAttachmentFile } from "@/lib/teacher-training-submission-attachments";
import { deleteStoredFile } from "@/lib/uploads";

type TeacherTrainingTaskInput = {
  id?: string;
  cohortId?: string;
  title?: string;
  description?: string;
  dueDate?: string;
  requireAttachment?: boolean;
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

  const task = await prisma.teacherTrainingTask.create({
    data: {
      cohortId,
      title,
      description,
      dueDate: body?.dueDate?.trim() || null,
      requireAttachment: Boolean(body?.requireAttachment),
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

  const task = await prisma.teacherTrainingTask.update({
    where: { id },
    data: {
      title,
      description,
      dueDate: body?.dueDate?.trim() || null,
      requireAttachment: Boolean(body?.requireAttachment),
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
