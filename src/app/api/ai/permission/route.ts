import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getAiPermissionForUser } from "@/lib/ai-chat";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    const permission = await getAiPermissionForUser(user.id);
    return NextResponse.json({ permission });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "获取 AI 权限失败" },
      { status: 500 },
    );
  }
}
