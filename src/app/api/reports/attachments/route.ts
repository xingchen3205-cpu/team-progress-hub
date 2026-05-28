import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { toIsoDateKey } from "@/lib/date";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { encodeReportAttachmentFile } from "@/lib/report-attachments";
import { saveUploadedFile } from "@/lib/uploads";

export const runtime = "nodejs";

const reportDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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

  if (user.role !== "leader" && user.role !== "member") {
    return NextResponse.json({ message: "当前角色无需提交汇报" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const fileValue = formData?.get("file");
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ message: "请先选择附件文件" }, { status: 400 });
  }

  const dateValue = formData?.get("date");
  const rawDate = typeof dateValue === "string" ? dateValue.trim() : "";
  const reportDate = reportDatePattern.test(rawDate) ? rawDate : toIsoDateKey(new Date());

  try {
    const storedFile = await saveUploadedFile({
      file: fileValue,
      folder: `report-attachments/${user.id}/${reportDate}`,
    });

    return NextResponse.json({
      attachment: encodeReportAttachmentFile(storedFile),
      attachmentFile: {
        fileName: storedFile.fileName,
        fileSize: storedFile.fileSize,
        mimeType: storedFile.mimeType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "附件上传失败" },
      { status: 400 },
    );
  }
}
