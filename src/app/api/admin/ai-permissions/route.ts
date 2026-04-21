import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { listAiPermissions } from "@/lib/ai-chat";
import { assertRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  try {
    const items = await listAiPermissions();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "获取 AI 权限列表失败" },
      { status: 500 },
    );
  }
}
