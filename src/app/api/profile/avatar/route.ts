import { NextRequest, NextResponse } from "next/server";

import { validateAvatarUploadMeta } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { serializeUser } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile, saveUploadedFile } from "@/lib/uploads";

const allowedAvatarMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);

  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "请选择头像文件" }, { status: 400 });
  }

  if (
    file.type &&
    !allowedAvatarMimeTypes.includes(file.type as (typeof allowedAvatarMimeTypes)[number])
  ) {
    return NextResponse.json({ message: "头像仅支持 JPG、PNG 或 WEBP 格式" }, { status: 400 });
  }

  let storedAvatar:
    | {
        fileName: string;
        filePath: string;
        fileSize: number;
        mimeType: string;
      }
    | null = null;

  try {
    storedAvatar = await saveUploadedFile({
      file,
      folder: "avatars",
      validator: validateAvatarUploadMeta,
    });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        avatarImagePath: storedAvatar.filePath,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        avatar: true,
        avatarImagePath: true,
        responsibility: true,
        approvalStatus: true,
        approvedAt: true,
        createdAt: true,
      },
    });

    if (user.avatarImagePath && user.avatarImagePath !== storedAvatar.filePath) {
      await deleteStoredFile(user.avatarImagePath).catch(() => {});
    }

    return NextResponse.json(
      {
        user: serializeUser(updatedUser),
        message: "头像已更新",
      },
      { status: 200 },
    );
  } catch (error) {
    if (storedAvatar?.filePath) {
      await deleteStoredFile(storedAvatar.filePath).catch(() => {});
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "头像上传失败，请稍后重试",
      },
      { status: 400 },
    );
  }
}
