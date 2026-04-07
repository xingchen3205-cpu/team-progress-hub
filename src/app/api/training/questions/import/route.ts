import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { parseTrainingQuestionText } from "@/lib/training-import";

export const runtime = "nodejs";

const importMaxBytes = 4 * 1024 * 1024;

const getFileExtension = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
};

const extractPdfText = async (buffer: Buffer) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });
  const document = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
  } finally {
    await document.destroy().catch(() => undefined);
  }

  return pageTexts.join("\n\n");
};

const extractTextFromFile = async (file: File) => {
  const extension = getFileExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (extension) {
    case ".txt":
    case ".md":
    case ".csv":
    case ".json":
      return buffer.toString("utf8");
    case ".pdf":
      return extractPdfText(buffer);
    case ".docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case ".doc":
      throw new Error("旧版 .doc 暂不支持自动识别，请另存为 .docx 后再导入");
    default:
      throw new Error("暂不支持该文件格式，请上传 PDF、Word(.docx)、txt、md、csv 或 json");
  }
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "请上传题库文档" }, { status: 400 });
  }

  if (file.size > importMaxBytes) {
    return NextResponse.json({ message: "题库导入文档最大 4MB，较大的 PDF 建议先拆分或导出文本" }, { status: 400 });
  }

  try {
    const text = await extractTextFromFile(file);
    const rows = parseTrainingQuestionText(text);

    if (rows.length === 0) {
      return NextResponse.json({ message: "没有识别到可导入的问题，请检查文档是否包含问题和回答要点" }, { status: 400 });
    }

    return NextResponse.json({ rows, fileName: file.name });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "题库文档识别失败" },
      { status: 400 },
    );
  }
}
