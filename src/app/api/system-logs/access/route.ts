import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { createAuditLogEntry } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);

  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        tabKey?: string;
        tabLabel?: string;
        path?: string;
      }
    | null;

  const tabKey = body?.tabKey?.trim().slice(0, 80) || "unknown";
  const tabLabel = body?.tabLabel?.trim().slice(0, 80) || tabKey;

  await prisma.$transaction(async (tx) => {
    await createAuditLogEntry({
      tx,
      operator: { id: user.id, role: user.role },
      action: "workspace.page_view",
      objectType: "workspace_tab",
      objectId: tabKey,
      teamGroupId: user.teamGroupId,
      metadata: {
        tabKey,
        tabLabel,
        path: body?.path?.trim().slice(0, 160) || "/workspace",
        ip: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
        referrer: request.headers.get("referer") ?? null,
      },
    });
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
