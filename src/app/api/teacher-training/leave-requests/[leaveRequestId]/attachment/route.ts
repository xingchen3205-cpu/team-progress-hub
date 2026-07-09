import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition } from "@/lib/downloads";
import { prisma } from "@/lib/prisma";
import { GetObjectCommand, HeadObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { decodeTeacherTrainingLeaveAttachmentFile } from "@/lib/teacher-training-leave-attachments";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leaveRequestId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { leaveRequestId } = await params;
  const leaveRequest = await prisma.teacherTrainingLeaveRequest.findFirst({
    where: {
      id: leaveRequestId,
      cohort: {
        deletedAt: null,
      },
    },
    include: {
      participant: {
        select: {
          accountUserId: true,
        },
      },
    },
  });
  if (!leaveRequest) {
    return NextResponse.json({ message: "请假申请不存在" }, { status: 404 });
  }

  const canManage = await hasTeacherTrainingCohortManageAccess(user, leaveRequest.cohortId);
  const isOwner = leaveRequest.participant.accountUserId === user.id;
  if (!canManage && !isOwner) {
    return NextResponse.json({ message: "无权限查看该请假附件" }, { status: 403 });
  }

  const attachmentFile = decodeTeacherTrainingLeaveAttachmentFile(leaveRequest.attachment);
  if (!attachmentFile) {
    return NextResponse.json({ message: "请假附件不存在" }, { status: 404 });
  }

  const head = await r2Client.send(
    new HeadObjectCommand({
      Bucket: R2_BUCKET,
      Key: attachmentFile.filePath,
    }),
  ).catch((error) => {
    console.error("Teacher training leave attachment download failed", error);
    return null;
  });
  if (!head) {
    return NextResponse.json({ message: "请假附件文件不存在或已丢失" }, { status: 404 });
  }

  const downloadUrl = await getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: attachmentFile.filePath,
      ResponseContentDisposition: buildAttachmentDisposition(attachmentFile.fileName),
      ResponseContentType: head.ContentType || attachmentFile.mimeType || "application/octet-stream",
    }),
    { expiresIn: 60 * 5 },
  );

  return NextResponse.redirect(downloadUrl);
}
