import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeExpertFeedback } from "@/lib/api-serializers";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const experts = await prisma.expertFeedback.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ experts: experts.map(serializeExpertFeedback) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        date?: string;
        expert?: string;
        topic?: string;
        format?: string;
        summary?: string;
        nextAction?: string;
        attachments?: string[];
      }
    | null;

  const feedback = await prisma.expertFeedback.create({
    data: {
      date: body?.date?.trim() || new Date().toISOString().slice(0, 10),
      expert: body?.expert?.trim() || "",
      topic: body?.topic?.trim() || "",
      format: body?.format?.trim() || "线上点评",
      summary: body?.summary?.trim() || "",
      nextAction: body?.nextAction?.trim() || "",
      attachments: JSON.stringify(body?.attachments ?? []),
    },
  });

  return NextResponse.json({ expert: serializeExpertFeedback(feedback) }, { status: 201 });
}
