import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { recognizeCustomReviewTargetNamesFromImage } from "@/lib/custom-review-target-ocr";

export const dynamic = "force-dynamic";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxScreenshotSize = 6 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "请上传项目名称列截图" }, { status: 400 });
    }

    if (!allowedImageTypes.has(file.type)) {
      return NextResponse.json({ message: "请上传 PNG、JPG 或 WebP 截图" }, { status: 400 });
    }

    if (file.size > maxScreenshotSize) {
      return NextResponse.json({ message: "截图不能超过 6MB" }, { status: 400 });
    }

    const projectNames = await recognizeCustomReviewTargetNamesFromImage(file, user.id);
    return NextResponse.json({ projectNames });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "FORBIDDEN"
        ? "无权限识别项目截图"
        : error instanceof Error
          ? error.message
          : "截图识别失败";

    return NextResponse.json({ message }, { status: message === "无权限识别项目截图" ? 403 : 500 });
  }
}
