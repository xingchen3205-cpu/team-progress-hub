import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  normalizeExpertProfileInput,
  serializeExpertProfile,
  type ExpertProfileInput,
} from "@/lib/expert-profiles";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限编辑专家档案" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as ExpertProfileInput | null;
  const normalized = normalizeExpertProfileInput(body);
  if ("error" in normalized) {
    return NextResponse.json({ message: normalized.error }, { status: 400 });
  }

  const existingProfile = await prisma.expertProfile.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingProfile) {
    return NextResponse.json({ message: "专家档案不存在" }, { status: 404 });
  }

  const profile = await prisma.expertProfile.update({
    where: { id },
    data: normalized.data,
    include: {
      linkedUser: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
        },
      },
    },
  });

  return NextResponse.json({ expertProfile: serializeExpertProfile(profile) });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限删除专家档案" }, { status: 403 });
  }

  const { id } = await context.params;
  const existingProfile = await prisma.expertProfile.findUnique({
    where: { id },
    select: {
      id: true,
      linkedUserId: true,
    },
  });

  if (!existingProfile) {
    return NextResponse.json({ message: "专家档案不存在" }, { status: 404 });
  }

  if (existingProfile.linkedUserId) {
    return NextResponse.json({ message: "该专家已开通账号，请先保留档案用于追溯" }, { status: 409 });
  }

  await prisma.expertProfile.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
