import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition } from "@/lib/downloads";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { buildTeacherTrainingCsv, serializeTeacherTrainingCohort } from "@/lib/teacher-training";

const exportTypeSet = new Set(["participants", "attendance", "checkIns", "submissions"]);

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const cohortId = request.nextUrl.searchParams.get("cohortId")?.trim();
  const type = request.nextUrl.searchParams.get("type")?.trim() || "attendance";
  if (!cohortId || !exportTypeSet.has(type)) {
    return NextResponse.json({ message: "导出参数不完整" }, { status: 400 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限导出该省培班次数据" }, { status: 403 });
  }

  const cohort = await prisma.teacherTrainingCohort.findUnique({
    where: { id: cohortId },
    include: {
      creator: {
        select: { name: true },
      },
      participants: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          accountUser: { select: { name: true, username: true } },
          attendances: {
            include: {
              markedBy: { select: { name: true } },
            },
          },
        },
      },
      managers: {
        include: {
          user: { select: { id: true, name: true, username: true, role: true } },
        },
      },
      attendances: {
        orderBy: [{ sessionDate: "asc" }, { sessionLabel: "asc" }],
        include: {
          markedBy: { select: { name: true } },
        },
      },
      checkInTasks: {
        orderBy: [{ signDate: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
        include: {
          creator: { select: { name: true } },
          records: {
            orderBy: [{ signedAt: "asc" }],
            include: {
              participant: { select: { name: true } },
            },
          },
        },
      },
      tasks: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          creator: { select: { name: true } },
          submissions: {
            orderBy: [{ submittedAt: "asc" }],
            include: {
              participant: { select: { name: true } },
              submittedBy: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }

  const serialized = serializeTeacherTrainingCohort(cohort);
  const csv = `\uFEFF${buildTeacherTrainingCsv({
    cohort: serialized,
    type: type as "participants" | "attendance" | "checkIns" | "submissions",
  })}`;
  const labelMap = {
    participants: "参训名单",
    attendance: "签到记录",
    checkIns: "课程签到",
    submissions: "任务汇报",
  } as const;
  const fileName = `${serialized.title}-${labelMap[type as keyof typeof labelMap]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": buildAttachmentDisposition(fileName),
    },
  });
}
