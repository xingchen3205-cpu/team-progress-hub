import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { mergeTeacherTrainingParticipantExtraInfo } from "@/lib/teacher-training";

type GroupAssignment = { participantId?: string; groupName?: string };

const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { cohortId?: string; groupSize?: number } | null;
  const cohortId = body?.cohortId?.trim() || "";
  const groupSize = Math.floor(Number(body?.groupSize));
  if (!cohortId || !Number.isFinite(groupSize) || groupSize < 2 || groupSize > 20) {
    return NextResponse.json({ message: "每组人数须为 2 至 20 人" }, { status: 400 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限为该班次分组" }, { status: 403 });
  }

  const participants = await prisma.teacherTrainingParticipant.findMany({
    where: { cohortId, cohort: { deletedAt: null } },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, name: true, organization: true },
  });
  if (participants.length < 2) {
    return NextResponse.json({ message: "参训教师不足 2 人，无法随机分组" }, { status: 400 });
  }

  const groupCount = Math.max(1, Math.ceil(participants.length / groupSize));
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    name: `第${index + 1}组`,
    members: [] as typeof participants,
  }));
  shuffle(participants).forEach((participant, index) => {
    groups[index % groupCount].members.push(participant);
  });

  return NextResponse.json({ groups });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { cohortId?: string; assignments?: GroupAssignment[] }
    | null;
  const cohortId = body?.cohortId?.trim() || "";
  const assignments = (body?.assignments ?? [])
    .map((item) => ({ participantId: item.participantId?.trim() || "", groupName: item.groupName?.trim() || "" }))
    .filter((item) => item.participantId && item.groupName);
  if (!cohortId || assignments.length === 0) {
    return NextResponse.json({ message: "没有可保存的分组结果" }, { status: 400 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限为该班次分组" }, { status: 403 });
  }

  const uniqueIds = [...new Set(assignments.map((item) => item.participantId))];
  if (uniqueIds.length !== assignments.length) {
    return NextResponse.json({ message: "分组结果包含重复教师，请重新随机" }, { status: 400 });
  }
  const existingMembers = await prisma.teacherTrainingParticipant.findMany({
    where: { cohortId, id: { in: uniqueIds } },
    select: { id: true, extraInfo: true },
  });
  if (existingMembers.length !== uniqueIds.length) {
    return NextResponse.json({ message: "部分教师不属于当前班次，请刷新后重试" }, { status: 400 });
  }
  const extraInfoById = new Map(existingMembers.map((member) => [member.id, member.extraInfo]));

  // 重新分组会打散原有小组，旧组长身份不再适用，保存时统一清除，避免出现跨组或一组多名组长。
  await prisma.$transaction(
    assignments.map((item) =>
      prisma.teacherTrainingParticipant.update({
        where: { id: item.participantId },
        data: {
          groupName: item.groupName,
          extraInfo: mergeTeacherTrainingParticipantExtraInfo(extraInfoById.get(item.participantId), {
            isGroupLeader: false,
          }),
        },
      }),
    ),
  );
  return NextResponse.json({ ok: true, updatedCount: assignments.length });
}

export async function PUT(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { cohortId?: string; groupName?: string; leaderId?: string }
    | null;
  const cohortId = body?.cohortId?.trim() || "";
  const groupName = body?.groupName?.trim() || "";
  const leaderId = body?.leaderId?.trim() || "";
  if (!cohortId || !groupName || !leaderId) {
    return NextResponse.json({ message: "请选择分组和组长" }, { status: 400 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限设置该班次组长" }, { status: 403 });
  }

  const members = await prisma.teacherTrainingParticipant.findMany({
    where: { cohortId, groupName },
    select: { id: true, extraInfo: true },
  });
  if (!members.some((member) => member.id === leaderId)) {
    return NextResponse.json({ message: "所选教师不属于该分组" }, { status: 400 });
  }

  await prisma.$transaction(
    members.map((member) =>
      prisma.teacherTrainingParticipant.update({
        where: { id: member.id },
        data: {
          extraInfo: mergeTeacherTrainingParticipantExtraInfo(member.extraInfo, {
            isGroupLeader: member.id === leaderId,
          }),
        },
      }),
    ),
  );
  return NextResponse.json({ ok: true, leaderId });
}
