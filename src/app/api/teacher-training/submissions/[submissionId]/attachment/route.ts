import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition } from "@/lib/downloads";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { decodeTeacherTrainingSubmissionAttachmentFile } from "@/lib/teacher-training-submission-attachments";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { submissionId } = await params;
  const submission = await prisma.teacherTrainingSubmission.findFirst({
    where: {
      id: submissionId,
      task: {
        deletedAt: null,
        cohort: {
          deletedAt: null,
        },
      },
    },
    include: {
      task: { select: { cohortId: true } },
      participant: { select: { accountUserId: true } },
    },
  });

  if (!submission) {
    return NextResponse.json({ message: "任务汇报不存在" }, { status: 404 });
  }

  const canManage = await hasTeacherTrainingCohortManageAccess(user, submission.task.cohortId);
  const isOwner = submission.participant.accountUserId === user.id;
  if (!canManage && !isOwner) {
    return NextResponse.json({ message: "无权限下载该任务汇报附件" }, { status: 403 });
  }

  const attachmentFile = decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment);
  if (!attachmentFile) {
    return NextResponse.json({ message: "附件不存在" }, { status: 404 });
  }

  const fileData = await readStoredFile(attachmentFile.filePath).catch((error) => {
    console.error("Teacher training submission attachment download failed", error);
    return null;
  });
  if (!fileData) {
    return NextResponse.json({ message: "附件文件不存在或已丢失" }, { status: 404 });
  }

  return new NextResponse(fileData.buffer, {
    headers: {
      "Content-Type": fileData.contentType || attachmentFile.mimeType || "application/octet-stream",
      "Content-Disposition": buildAttachmentDisposition(attachmentFile.fileName),
      "Content-Length": `${attachmentFile.fileSize}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
