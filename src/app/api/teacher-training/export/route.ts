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

export const runtime = "nodejs";
export const maxDuration = 60;

const exportTypeSet = new Set([
  "participants",
  "attendance",
  "checkIns",
  "leaves",
  "submissions",
  "submissionScores",
  "arrivals",
]);

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
      leaveRequests: {
        orderBy: [{ submittedAt: "asc" }],
        include: {
          participant: { select: { name: true, organization: true } },
          approvals: {
            orderBy: [{ stepIndex: "asc" }, { reviewedAt: "asc" }],
            include: {
              approver: { select: { name: true } },
            },
          },
        },
      },
      tasks: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: "asc" }],
        include: {
          creator: { select: { name: true } },
          courseSession: {
            select: {
              title: true,
              courseDate: true,
              startTime: true,
              endTime: true,
            },
          },
          submissions: {
            orderBy: [{ submittedAt: "asc" }],
            include: {
              participant: { select: { name: true } },
              submittedBy: { select: { name: true } },
              finalReviewer: { select: { name: true } },
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
    const maxInlineZipBytes = 4 * 1024 * 1024;
    const cleanPathPart = (value: string) =>
      value
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .trim() || "未命名";
    const usedParticipantFolders = new Set<string>();
    const uniqueParticipantFolder = (folder: string) => {
      if (!usedParticipantFolders.has(folder)) {
        usedParticipantFolders.add(folder);
        return folder;
      }

      let index = 2;
      let candidate = `${folder}_${index}`;
      while (usedParticipantFolders.has(candidate)) {
        index += 1;
        candidate = `${folder}_${index}`;
      }
      usedParticipantFolders.add(candidate);
      return candidate;
    };
    const participantFolders = new Map(
      serialized.participants.map((participant) => [
        participant.id,
        uniqueParticipantFolder(`${cleanPathPart(participant.name)}-${cleanPathPart(participant.organization)}`),
      ]),
    );
    const usedZipPaths = new Set<string>();
    const uniqueZipPath = (path: string) => {
      if (!usedZipPaths.has(path)) {
        usedZipPaths.add(path);
        return path;
      }

      const lastDotIndex = path.lastIndexOf(".");
      const basePath = lastDotIndex > 0 ? path.slice(0, lastDotIndex) : path;
      const extension = lastDotIndex > 0 ? path.slice(lastDotIndex) : "";
      let index = 2;
      let candidate = `${basePath}_${index}${extension}`;
      while (usedZipPaths.has(candidate)) {
        index += 1;
        candidate = `${basePath}_${index}${extension}`;
      }
      usedZipPaths.add(candidate);
      return candidate;
    };
    const zipEntries: ZipArchiveEntry[] = serialized.participants.map((participant) => {
      const content = buildTeacherTrainingSubmissionWordDocument({
        cohort: serialized,
        participant,
      });
      return {
        path: uniqueZipPath(`${cleanPathPart(participant.name)}-${cleanPathPart(participant.organization)}/省培任务汇报汇总.docx`),
        content,
      };
    });

    const estimatedBaseBytes = zipEntries.reduce(
      (total, entry) => total + (Buffer.isBuffer(entry.content) ? entry.content.length : Buffer.byteLength(entry.content, "utf8")),
      0,
    );
    const attachmentFiles = cohort.tasks.flatMap((task) =>
      task.submissions
        .map((submission) => {
          const attachmentFile = decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment);
          return attachmentFile
            ? {
                taskTitle: task.title,
                participantId: submission.participantId,
                participantName: submission.participant?.name ?? "参训教师",
                file: attachmentFile,
              }
            : null;
        })
        .filter((item): item is {
          taskTitle: string;
          participantId: string;
          participantName: string;
          file: NonNullable<ReturnType<typeof decodeTeacherTrainingSubmissionAttachmentFile>>;
        } => Boolean(item)),
    );
    const estimatedAttachmentBytes = attachmentFiles.reduce((total, item) => total + item.file.fileSize, 0);
    if (estimatedBaseBytes + estimatedAttachmentBytes > maxInlineZipBytes) {
      return NextResponse.json(
        {
          message:
            "任务附件总量较大，当前平台不能在网页请求中直接打包下载。请先在任务汇报列表中分批下载附件，后续建议改为后台归档后再下载。",
        },
        { status: 413 },
      );
    }

    for (const item of attachmentFiles) {
      const folder = participantFolders.get(item.participantId) ?? `未命名-${cleanPathPart(item.participantName)}`;
      const attachmentPath = `${folder}/任务附件/${cleanPathPart(item.taskTitle)}-${cleanPathPart(item.file.fileName)}`;
      try {
        const fileData = await readStoredFile(item.file.filePath);
        zipEntries.push({
          path: uniqueZipPath(attachmentPath),
          content: fileData.buffer,
        });
      } catch {
        zipEntries.push({
          path: uniqueZipPath(`${attachmentPath}.缺失说明.txt`),
          content: `附件读取失败：${item.file.fileName}\n请联系管理员重新上传。`,
        });
      }
    }

    const zipBuffer = createZipArchive(zipEntries);
    const fileName = `${serialized.title}-任务汇报归档.zip`;

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": buildAttachmentDisposition(fileName),
      },
    });
  }

  const csvType = type === "submissionScores" ? "submissions" : type;
  const csv = `\uFEFF${buildTeacherTrainingCsv({
    cohort: serialized,
    type: csvType as "participants" | "attendance" | "checkIns" | "leaves" | "submissions" | "arrivals",
  })}`;
  const labelMap = {
    participants: "参训名单",
    attendance: "报到信息",
    checkIns: "课程签到",
    leaves: "请假审批",
    submissions: "任务汇报",
    submissionScores: "任务汇报评分表",
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
