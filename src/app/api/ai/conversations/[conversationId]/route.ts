import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { deleteAiConversation, getAiConversationMessages } from "@/lib/ai-chat";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { conversationId } = await context.params;
  if (!conversationId) {
    return NextResponse.json({ message: "缺少对话标识" }, { status: 400 });
  }

  try {
    const messages = await getAiConversationMessages({
      userId: user.id,
      conversationId,
    });

    return NextResponse.json({
      conversationId,
      messages,
    });
  } catch (error) {
    console.error("[ai-conversations] messages failed", error);
    return NextResponse.json(
      { message: "获取历史消息失败，请稍后重试" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { conversationId } = await context.params;
  if (!conversationId) {
    return NextResponse.json({ message: "缺少对话标识" }, { status: 400 });
  }

  try {
    await deleteAiConversation({
      userId: user.id,
      conversationId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ai-conversations] delete failed", error);
    return NextResponse.json(
      { message: "删除历史对话失败，请稍后重试" },
      { status: 500 },
    );
  }
}
