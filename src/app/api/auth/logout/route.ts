import { NextRequest, NextResponse } from "next/server";

import { clearAuthCookie, getSessionUser } from "@/lib/auth";
import { createAuditLogEntry } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);

  if (user) {
    await prisma.$transaction(async (tx) => {
      await createAuditLogEntry({
        tx,
        operator: { id: user.id, role: user.role },
        action: "auth.logout",
        objectType: "user",
        objectId: user.id,
        teamGroupId: user.teamGroupId,
        metadata: {
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
        },
      });
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ success: true });
  clearAuthCookie(response);
  return response;
}
