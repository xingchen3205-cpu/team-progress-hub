import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { updateAiPermissionForUser } from "@/lib/ai-chat";
import { assertRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        isEnabled?: boolean;
        maxCount?: string | null;
        resetUsage?: boolean;
      }
    | null;
  const { userId } = await context.params;

  if (typeof body?.isEnabled !== "boolean") {
    return NextResponse.json({ message: "缺少权限开关参数" }, { status: 400 });
  }

  try {
    const permission = await updateAiPermissionForUser(userId, {
      isEnabled: body.isEnabled,
      maxCountInput: body.maxCount ?? null,
      resetUsage: body.resetUsage === true,
    });

    return NextResponse.json({ permission });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "更新 AI 权限失败" },
      { status: 500 },
    );
  }
}
