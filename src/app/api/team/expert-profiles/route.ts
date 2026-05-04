import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  normalizeExpertProfileInput,
  serializeExpertProfile,
  type ExpertProfileInput,
} from "@/lib/expert-profiles";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限查看专家库" }, { status: 403 });
  }

  const profiles = await prisma.expertProfile.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
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

  return NextResponse.json({ expertProfiles: profiles.map(serializeExpertProfile) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限新增专家档案" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as ExpertProfileInput | null;
  const normalized = normalizeExpertProfileInput(body);
  if ("error" in normalized) {
    return NextResponse.json({ message: normalized.error }, { status: 400 });
  }

  const profile = await prisma.expertProfile.create({
    data: {
      ...normalized.data,
      createdById: user.id,
    },
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

  return NextResponse.json({ expertProfile: serializeExpertProfile(profile) }, { status: 201 });
}
