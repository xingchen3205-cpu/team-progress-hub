import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { sendAiChatMessage, streamAiChatMessage } from "@/lib/ai-chat";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    query?: string;
    conversationId?: string | null;
    stream?: boolean;
  } | null;
  const query = body?.query?.trim() ?? "";
  const conversationId = body?.conversationId?.trim() ?? null;
  const stream = body?.stream === true;

  if (!query) {
    return NextResponse.json({ message: "请输入问题后再发送" }, { status: 400 });
  }

  try {
    if (stream) {
      const responseStream = await streamAiChatMessage({
        userId: user.id,
        query,
        conversationId,
      });

      return new Response(responseStream, {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await sendAiChatMessage({
      userId: user.id,
      query,
      conversationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ai-chat] request failed", error);

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? ((error as { status: number }).status)
        : 500;

    return NextResponse.json(
      { message: "AI 助手暂时不可用，请稍后重试" },
      { status },
    );
  }
}
