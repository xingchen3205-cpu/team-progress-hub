import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { listAiConversations } from "@/lib/ai-chat";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    const conversations = await listAiConversations(user.id);
    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("[ai-conversations] list failed", error);
    return NextResponse.json(
      { message: "获取历史对话失败，请稍后重试" },
      { status: 500 },
    );
  }
}
