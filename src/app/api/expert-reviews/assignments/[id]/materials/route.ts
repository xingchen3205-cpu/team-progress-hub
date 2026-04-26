import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  redactExpertReviewAssignmentForRole,
  serializeExpertReviewAssignment,
  validateExpertReviewMaterial,
} from "@/lib/expert-review";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTeamScopedResource } from "@/lib/team-scope";
import { deleteStoredFile, readStoredFileRange, saveUploadedFile } from "@/lib/uploads";

export const runtime = "nodejs";

const assignmentInclude = {
  expertUser: {
    select: {
      id: true,
      name: true,
      avatar: true,
      role: true,
    },
  },
  reviewPackage: {
    select: {
      id: true,
      targetName: true,
      roundLabel: true,
      overview: true,
      status: true,
      startAt: true,
      deadline: true,
      projectReviewStage: {
        select: {
          id: true,
          type: true,
        },
      },
      materials: {
        orderBy: { uploadedAt: "asc" },
        select: {
          id: true,
          kind: true,
          name: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          uploadedAt: true,
        },
      },
    },
  },
  score: {
    select: {
      id: true,
      scorePersonalGrowth: true,
      scoreInnovation: true,
      scoreIndustry: true,
      scoreTeamwork: true,
      totalScore: true,
      commentTotal: true,
      submittedAt: true,
      updatedAt: true,
      lockedAt: true,
    },
  },
} as const;

const isValidPdfFile = async (file: File) => {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return (
    header.length >= 5 &&
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46 &&
    header[4] === 0x2d
  );
};

const isPdfSignature = (header: Uint8Array | Buffer) =>
  header.length >= 5 &&
  header[0] === 0x25 &&
  header[1] === 0x50 &&
  header[2] === 0x44 &&
  header[3] === 0x46 &&
  header[4] === 0x2d;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id },
    include: {
      reviewPackage: {
        include: {
          materials: true,
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "评审任务不存在" }, { status: 404 });
  }

  if (assignment.reviewPackage.status !== "configured") {
    return NextResponse.json({ message: "评审配置已取消，不能维护材料" }, { status: 409 });
  }

  if (
    !canAccessTeamScopedResource(user, {
      ownerId: assignment.reviewPackage.createdById,
      teamGroupId: assignment.reviewPackage.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权限维护该评审材料" }, { status: 403 });
  }

  let storedFile: Awaited<ReturnType<typeof saveUploadedFile>> | null = null;
  let uploadedFilePath: string | null = null;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | {
          kind?: "plan" | "ppt" | "video";
          name?: string;
          fileName?: string;
          filePath?: string;
          fileSize?: number;
          mimeType?: string;
        }
      | null;

    const kind = body?.kind;
    const name = body?.name?.trim() || "";
    const fileName = body?.fileName?.trim() || "";
    const filePath = body?.filePath?.trim() || "";
    const fileSize = Number(body?.fileSize ?? 0);
    const mimeType = body?.mimeType?.trim() || "application/octet-stream";

    if (!kind || !["plan", "ppt", "video"].includes(kind) || !fileName || !filePath || !fileSize) {
      return NextResponse.json({ message: "评审材料信息不完整" }, { status: 400 });
    }
    const existingMaterial = assignment.reviewPackage.materials.find((item) => item.kind === kind) ?? null;

    const validationError = validateExpertReviewMaterial({
      kind,
      fileName,
      fileSize,
    });
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    if (kind !== "video") {
      try {
        const header = await readStoredFileRange({
          objectKey: filePath,
          start: 0,
          end: 4,
        });
        if (!isPdfSignature(header)) {
          await deleteStoredFile(filePath).catch(() => null);
          return NextResponse.json(
            { message: `${kind === "plan" ? "计划书" : "路演材料"}需上传有效的 PDF 文件` },
            { status: 400 },
          );
        }
      } catch {
        return NextResponse.json({ message: "评审材料上传后校验失败" }, { status: 400 });
      }
    }

    uploadedFilePath = filePath;

    try {
      await prisma.expertReviewMaterial.upsert({
        where: {
          packageId_kind: {
            packageId: assignment.reviewPackage.id,
            kind,
          },
        },
        update: {
          name: name || fileName,
          fileName,
          filePath,
          fileSize,
          mimeType,
          uploadedAt: new Date(),
        },
        create: {
          packageId: assignment.reviewPackage.id,
          kind,
          name: name || fileName,
          fileName,
          filePath,
          fileSize,
          mimeType,
        },
      });

      if (existingMaterial) {
        await deleteStoredFile(existingMaterial.filePath).catch(() => null);
      }

      const refreshedAssignment = await prisma.expertReviewAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: assignmentInclude,
      });

      return NextResponse.json({
        assignment: redactExpertReviewAssignmentForRole(
          serializeExpertReviewAssignment(refreshedAssignment),
          user.role,
        ),
      });
    } catch (error) {
      if (uploadedFilePath) {
        await deleteStoredFile(uploadedFilePath).catch(() => null);
      }

      const message = error instanceof Error ? error.message : "评审材料上传失败";
      return NextResponse.json({ message }, { status: 500 });
    }
  }

  const formData = await request.formData().catch(() => null);
  const kind = `${formData?.get("kind") ?? ""}`.trim() as "plan" | "ppt" | "video";
  const name = `${formData?.get("name") ?? ""}`.trim();
  const file = formData?.get("file");

  if (!["plan", "ppt", "video"].includes(kind) || !(file instanceof File)) {
    return NextResponse.json({ message: "评审材料信息不完整" }, { status: 400 });
  }
  const existingMaterial = assignment.reviewPackage.materials.find((item) => item.kind === kind) ?? null;

  const validationError = validateExpertReviewMaterial({
    kind,
    fileName: file.name,
    fileSize: file.size,
  });
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  if (kind !== "video" && !(await isValidPdfFile(file))) {
    return NextResponse.json(
      { message: `${kind === "plan" ? "计划书" : "路演材料"}需上传有效的 PDF 文件` },
      { status: 400 },
    );
  }

  try {
    storedFile = await saveUploadedFile({
      file,
      folder: "expert-review",
      validator: (meta) =>
        validateExpertReviewMaterial({
          kind,
          fileName: meta.fileName,
          fileSize: meta.fileSize,
        }),
    });

    await prisma.expertReviewMaterial.upsert({
      where: {
        packageId_kind: {
          packageId: assignment.reviewPackage.id,
          kind,
        },
      },
      update: {
        name: name || file.name,
        fileName: storedFile.fileName,
        filePath: storedFile.filePath,
        fileSize: storedFile.fileSize,
        mimeType: storedFile.mimeType,
        uploadedAt: new Date(),
      },
      create: {
        packageId: assignment.reviewPackage.id,
        kind,
        name: name || file.name,
        fileName: storedFile.fileName,
        filePath: storedFile.filePath,
        fileSize: storedFile.fileSize,
        mimeType: storedFile.mimeType,
      },
    });

    if (existingMaterial) {
      await deleteStoredFile(existingMaterial.filePath).catch(() => null);
    }

    const refreshedAssignment = await prisma.expertReviewAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: assignmentInclude,
    });

    return NextResponse.json({
      assignment: redactExpertReviewAssignmentForRole(
        serializeExpertReviewAssignment(refreshedAssignment),
        user.role,
      ),
    });
  } catch (error) {
    if (storedFile) {
      await deleteStoredFile(storedFile.filePath).catch(() => null);
    }

    const message = error instanceof Error ? error.message : "评审材料上传失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const kind = request.nextUrl.searchParams.get("kind") as "plan" | "ppt" | "video" | null;
  if (!kind || !["plan", "ppt", "video"].includes(kind)) {
    return NextResponse.json({ message: "缺少评审材料类型" }, { status: 400 });
  }

  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id },
    select: {
      packageId: true,
      reviewPackage: {
        select: {
          createdById: true,
          teamGroupId: true,
          status: true,
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "评审任务不存在" }, { status: 404 });
  }

  if (assignment.reviewPackage.status !== "configured") {
    return NextResponse.json({ message: "评审配置已取消，不能维护材料" }, { status: 409 });
  }

  if (
    !canAccessTeamScopedResource(user, {
      ownerId: assignment.reviewPackage.createdById,
      teamGroupId: assignment.reviewPackage.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权限删除该评审材料" }, { status: 403 });
  }

  const material = await prisma.expertReviewMaterial.findUnique({
    where: {
      packageId_kind: {
        packageId: assignment.packageId,
        kind,
      },
    },
  });

  if (!material) {
    return NextResponse.json({ message: "评审材料不存在" }, { status: 404 });
  }

  await prisma.expertReviewMaterial.delete({
    where: {
      id: material.id,
    },
  });
  await deleteStoredFile(material.filePath).catch(() => null);

  const refreshedAssignment = await prisma.expertReviewAssignment.findUniqueOrThrow({
    where: { id },
    include: assignmentInclude,
  });

  return NextResponse.json({
    assignment: redactExpertReviewAssignmentForRole(
      serializeExpertReviewAssignment(refreshedAssignment),
      user.role,
    ),
  });
}
