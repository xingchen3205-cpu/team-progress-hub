import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        participantId?: string;
        name?: string;
        organization?: string;
        phone?: string;
        groupName?: string;
        note?: string;
      }
    | null;
  const participantId = body?.participantId?.trim();
  const name = body?.name?.trim();
  const organization = body?.organization?.trim();

  if (!participantId || !name || !organization) {
    return NextResponse.json({ message: "请填写姓名和单位" }, { status: 400 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      accountUserId: user.id,
    },
    select: {
      id: true,
      accountUserId: true,
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "未找到当前省培账号对应的参训档案" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.teacherTrainingParticipant.update({
      where: { id: participant.id },
      data: {
        name,
        organization,
        phone: body?.phone?.trim() || null,
        groupName: body?.groupName?.trim() || null,
        note: body?.note?.trim() || null,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        avatar: name.slice(0, 1),
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
