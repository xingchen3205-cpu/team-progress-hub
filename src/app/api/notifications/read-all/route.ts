import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  return NextResponse.json({ success: true });
}
