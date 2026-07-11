import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

import { getSessionUser } from "@/lib/auth";
import { buildInlineDisposition } from "@/lib/downloads";
import { getFileExtension } from "@/lib/file-policy";
import { prisma } from "@/lib/prisma";
import { GetObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { decodeTeacherTrainingSubmissionAttachmentFile } from "@/lib/teacher-training-submission-attachments";

export const runtime = "nodejs";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const HTML_SECURITY_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy":
    "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const renderPreviewHtml = ({ title, body }: { title: string; body: string }) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f8fafc;
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      }
      main {
        max-width: 920px;
        min-height: 100vh;
        margin: 0 auto;
        background: #ffffff;
        padding: 40px 48px;
        box-shadow: 0 0 0 1px #e2e8f0;
      }
      h1, h2, h3 { line-height: 1.45; }
      p, li { font-size: 15px; line-height: 1.9; }
      table { width: 100%; border-collapse: collapse; margin: 18px 0; }
      th, td { border: 1px solid #cbd5e1; padding: 8px 10px; vertical-align: top; }
      img { max-width: 100%; height: auto; }
      .notice {
        max-width: 680px;
        margin: 80px auto;
        padding: 24px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #f8fafc;
      }
      .notice h1 { margin-top: 0; font-size: 22px; }
      .notice p { margin-bottom: 0; color: #475569; }
      @media (max-width: 720px) {
        main { padding: 24px 18px; }
        .notice { margin: 32px auto; }
      }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;

const htmlResponse = (html: string) =>
  new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...HTML_SECURITY_HEADERS,
    },
  });

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
    return NextResponse.json({ message: "无权限预览该任务汇报附件" }, { status: 403 });
  }

  const attachmentFile = decodeTeacherTrainingSubmissionAttachmentFile(submission.attachment);
  if (!attachmentFile) {
    return NextResponse.json({ message: "附件不存在" }, { status: 404 });
  }

  const extension = getFileExtension(attachmentFile.fileName);
  const mimeType = attachmentFile.mimeType.split(";")[0]?.trim().toLowerCase();
  const isPdf = extension === ".pdf" || mimeType === "application/pdf";
  const isDocx = extension === ".docx" || mimeType === DOCX_MIME_TYPE;
  const isLegacyDoc = extension === ".doc" || mimeType === "application/msword";

  if (!isPdf && !isDocx && !isLegacyDoc) {
    return NextResponse.json({ message: "当前文件类型暂不支持站内预览" }, { status: 415 });
  }

  try {
    const object = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: attachmentFile.filePath,
      }),
    );
    if (!object.Body) {
      throw new Error("附件文件不存在或已丢失");
    }

    const fileBuffer = Buffer.from(await object.Body.transformToByteArray());

    if (isPdf) {
      return new NextResponse(fileBuffer, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": buildInlineDisposition(attachmentFile.fileName),
          "Content-Length": String(fileBuffer.length),
          "Content-Type": "application/pdf",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (isLegacyDoc) {
      return htmlResponse(
        renderPreviewHtml({
          title: attachmentFile.fileName,
          body: `<section class="notice"><h1>暂不支持预览旧版 Word 文档</h1><p>文件“${escapeHtml(
            attachmentFile.fileName,
          )}”采用 .doc 格式，系统无法在站内安全转换。请下载后使用本地受信任的办公软件打开。</p></section>`,
        }),
      );
    }

    const converted = await mammoth.convertToHtml({ buffer: fileBuffer });
    return htmlResponse(
      renderPreviewHtml({
        title: attachmentFile.fileName,
        body: converted.value || "<p>文档暂无可预览内容。</p>",
      }),
    );
  } catch (error) {
    console.error("Teacher training submission attachment preview failed", error);
    return NextResponse.json({ message: "附件文件不存在或预览失败" }, { status: 404 });
  }
}
