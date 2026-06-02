import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition } from "@/lib/downloads";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import {
  buildTeacherTrainingCsv,
  buildTeacherTrainingSubmissionWordDocument,
  serializeTeacherTrainingCohort,
} from "@/lib/teacher-training";
import { decodeTeacherTrainingSubmissionAttachmentFile } from "@/lib/teacher-training-submission-attachments";
import { readStoredFile } from "@/lib/uploads";
import { createZipArchive, type ZipArchiveEntry } from "@/lib/zip";

const exportTypeSet = new Set(["participants", "attendance", "checkIns", "submissions", "arrivals"]);

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

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: { id: cohortId, deletedAt: null },
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
        where: { deletedAt: null },
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
        where: { deletedAt: null },
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
  if (type === "submissions") {
    const cleanPathPart = (value: string) =>
      value
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .trim() || "未命名";
    const participantFolders = new Map(
      serialized.participants.map((participant) => [
        participant.id,
        `${cleanPathPart(participant.name)}-${cleanPathPart(participant.organization)}`,
      ]),
    );
    const zipEntries: ZipArchiveEntry[] = serialized.participants.map((participant) => ({
        path: `${cleanPathPart(participant.name)}-${cleanPathPart(participant.organization)}/省培任务汇报.docx`,
        content: buildTeacherTrainingSubmissionWordDocument({
          cohort: serialized,
          participant,
        }),
      }));

    for (const task of cohort.tasks) {
      for (const submission of task.submissions) {
        const attachmentFile = decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment);
        if (!attachmentFile) continue;

        const folder = participantFolders.get(submission.participantId) ?? `未命名-${cleanPathPart(submission.participant?.name ?? "参训教师")}`;
        const attachmentPath = `${folder}/任务附件/${cleanPathPart(task.title)}-${cleanPathPart(attachmentFile.fileName)}`;
        try {
          const fileData = await readStoredFile(attachmentFile.filePath);
          zipEntries.push({
            path: attachmentPath,
            content: fileData.buffer,
          });
        } catch {
          zipEntries.push({
            path: `${attachmentPath}.缺失说明.txt`,
            content: `附件读取失败：${attachmentFile.fileName}\n请联系管理员重新上传。`,
          });
        }
      }
    }

    const zipBuffer = createZipArchive(zipEntries);
    const fileName = `${serialized.title}-任务汇报Word归档.zip`;

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": buildAttachmentDisposition(fileName),
      },
    });
  }

  const csv = `\uFEFF${buildTeacherTrainingCsv({
    cohort: serialized,
    type: type as "participants" | "attendance" | "checkIns" | "submissions" | "arrivals",
  })}`;
  const labelMap = {
    participants: "参训名单",
    attendance: "报到信息",
    checkIns: "课程签到",
    submissions: "任务汇报",
    arrivals: "预计到达信息",
  } as const;
  const fileName = `${serialized.title}-${labelMap[type as keyof typeof labelMap]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": buildAttachmentDisposition(fileName),
    },
  });
}
