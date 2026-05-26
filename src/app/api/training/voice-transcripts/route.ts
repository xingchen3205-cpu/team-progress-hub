import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { transcribeTrainingAudio } from "@/lib/training-voice";

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

  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const file = fileValue instanceof File ? fileValue : null;
    const transcript = await transcribeTrainingAudio({ file, userId: user.id });

    return NextResponse.json({ transcript });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "语音转写失败" },
      { status: 400 },
    );
  }
}
