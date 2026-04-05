import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  categoryValueToDb,
  serializeDocument,
} from "@/lib/api-serializers";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: {
        select: { id: true, name: true },
      },
      versions: {
        orderBy: { uploadedAt: "desc" },
        include: {
          uploader: {
            select: { name: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ documents: documents.map(serializeDocument) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        category?: "计划书" | "PPT" | "答辩材料" | "证明附件";
        note?: string;
      }
    | null;

  const name = body?.name?.trim();
  const category = body?.category ? categoryValueToDb[body.category] : null;
  const note = body?.note?.trim() || `${user.name} 上传初始版本`;

  if (!name || !category) {
    return NextResponse.json({ message: "文档信息不完整" }, { status: 400 });
  }

  const document = await prisma.document.create({
    data: {
      name,
      category,
      ownerId: user.id,
      status: "pending",
      comment: "等待审核",
      currentVersion: "v1.0",
      versions: {
        create: {
          version: "v1.0",
          uploaderId: user.id,
          note,
        },
      },
    },
    include: {
      owner: {
        select: { id: true, name: true },
      },
      versions: {
        orderBy: { uploadedAt: "desc" },
        include: {
          uploader: {
            select: { name: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ document: serializeDocument(document) }, { status: 201 });
}
