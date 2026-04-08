import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

const getFileExtension = (fileName?: string | null) => {
  if (!fileName) {
    return "";
  }

  const normalized = fileName.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
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
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "SFMono-Regular", Consolas, monospace;
        line-height: 1.8;
      }
      @media (max-width: 720px) {
        main { padding: 24px 18px; }
      }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const versionId = request.nextUrl.searchParams.get("versionId");

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { uploadedAt: "desc" },
      },
    },
  });

  if (!document) {
    return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  }

  const version =
    document.versions.find((item) => item.id === versionId) ??
    document.versions.find((item) => item.version === document.currentVersion) ??
    document.versions[0];

  if (!version) {
    return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  }

  const extension = getFileExtension(version.fileName);
  const isDocx =
    extension === ".docx" ||
    version.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isText = extension === ".txt" || version.mimeType?.startsWith("text/");

  if (!isDocx && !isText) {
    return NextResponse.json({ message: "当前文件类型暂不支持站内预览" }, { status: 415 });
  }

  try {
    const fileData = await readStoredFile(version.filePath);
    const html = isDocx
      ? renderPreviewHtml({
          title: version.fileName,
          body: (await mammoth.convertToHtml({ buffer: fileData.buffer })).value || "<p>文档暂无可预览内容。</p>",
        })
      : renderPreviewHtml({
          title: version.fileName,
          body: `<pre>${escapeHtml(fileData.buffer.toString("utf8"))}</pre>`,
        });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ message: "文件不存在或预览失败" }, { status: 404 });
  }
}
