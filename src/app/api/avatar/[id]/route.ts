import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/uploads";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getSessionUser(request);

  if (!currentUser) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      avatarImagePath: true,
    },
  });

  if (!user?.avatarImagePath) {
    return NextResponse.json({ message: "头像不存在" }, { status: 404 });
  }

  try {
    const file = await readStoredFile(user.avatarImagePath);

    return new NextResponse(file.buffer, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "no-store",
        "Content-Disposition": 'inline; filename="avatar"',
      },
    });
  } catch {
    return NextResponse.json({ message: "头像加载失败" }, { status: 404 });
  }
}
