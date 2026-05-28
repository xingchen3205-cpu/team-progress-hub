import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        taskId?: string;
        participantId?: string;
        content?: string;
        attachment?: string;
        status?: string;
      }
    | null;
  const taskId = body?.taskId?.trim();
  const participantId = body?.participantId?.trim();
  const content = body?.content?.trim();

  if (!taskId || !participantId || !content) {
    return NextResponse.json({ message: "请填写任务、参训教师和汇报内容" }, { status: 400 });
  }

  const task = await prisma.teacherTrainingTask.findUnique({
    where: { id: taskId },
    select: { cohortId: true },
  });
  if (!task) {
    return NextResponse.json({ message: "省培任务不存在" }, { status: 404 });
  }

  const canManageCohort = await hasTeacherTrainingCohortManageAccess(user, task.cohortId);
  const participant = await prisma.teacherTrainingParticipant.findFirst({
      where: {
        id: participantId,
        ...(canManageCohort ? {} : { accountUserId: user.id }),
      },
      select: { cohortId: true },
    });

  if (!task || !participant || task.cohortId !== participant.cohortId) {
    return NextResponse.json({ message: "任务和参训教师不属于同一班次或当前账号无权提交" }, { status: 400 });
  }

  const submission = await prisma.teacherTrainingSubmission.upsert({
    where: {
      taskId_participantId: {
        taskId,
        participantId,
      },
    },
    update: {
      content,
      attachment: body?.attachment?.trim() || null,
      status: body?.status?.trim() || "submitted",
      submittedById: user.id,
      submittedAt: new Date(),
    },
    create: {
      taskId,
      participantId,
      content,
      attachment: body?.attachment?.trim() || null,
      status: body?.status?.trim() || "submitted",
      submittedById: user.id,
    },
  });

  return NextResponse.json({ submission });
}
