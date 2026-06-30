import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getAiPermissionForUser } from "@/lib/ai-chat";
import { competitionAiDisabledMessage, isCompetitionAiEnabled } from "@/lib/competition-ai";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCompetitionAiEnabled()) {
    return NextResponse.json({ message: competitionAiDisabledMessage }, { status: 503 });
  }

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
