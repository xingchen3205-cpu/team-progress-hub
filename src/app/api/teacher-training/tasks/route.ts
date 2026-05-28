import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限发布省培任务" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cohortId?: string;
        title?: string;
        description?: string;
        dueDate?: string;
        requireAttachment?: boolean;
      }
    | null;
  const cohortId = body?.cohortId?.trim();
  const title = body?.title?.trim();
  const description = body?.description?.trim();

  if (!cohortId || !title || !description) {
    return NextResponse.json({ message: "请填写任务名称、说明和所属班次" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findUnique({
    where: { id: cohortId },
    select: { id: true },
  });
  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
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
