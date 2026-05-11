import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const DOC_HELPER_SECRET = process.env.DOC_HELPER_SECRET ?? "";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("X-Doc-Helper-Secret") ?? "";
  if (!DOC_HELPER_SECRET || secret !== DOC_HELPER_SECRET) {
    return NextResponse.json(
      { ok: false, error: "服务密钥无效" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        user_id?: string;
      }
    | null;

  const userId = body?.user_id?.trim();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "缺少用户标识" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return NextResponse.json({ ok: true, valid: false });
  }

  if (user.approvalStatus !== "approved") {
    return NextResponse.json({ ok: true, valid: false });
  }

  return NextResponse.json({
    ok: true,
    valid: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email ?? "",
      role: user.role,
      approval_status: user.approvalStatus,
    },
  });
}
