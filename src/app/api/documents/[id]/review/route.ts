import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeDocument } from "@/lib/api-serializers";
import {
  type DocumentReviewAction,
  getDocumentReviewTransition,
} from "@/lib/document-workflow";
import { createNotifications, getUserIdsByRoles } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { action?: DocumentReviewAction; comment?: string }
    | null;

  const action = body?.action;
  if (!action) {
    return NextResponse.json({ message: "审核动作无效" }, { status: 400 });
  }

  const currentDocument = await prisma.document.findUnique({
    where: { id },
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

  if (!currentDocument) {
    return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  }

  const transition = getDocumentReviewTransition({
    actorRole: user.role,
    currentStatus: currentDocument.status,
    action,
  });

  if (!transition) {
    return NextResponse.json({ message: "当前角色无法执行该审批动作" }, { status: 403 });
  }

  const document = await prisma.document.update({
    where: { id },
    data: {
      status: transition.nextStatus,
      comment: body?.comment?.trim() || transition.defaultComment,
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

  if (action === "leaderApprove") {
    const recipientIds = await getUserIdsByRoles({
      roles: transition.notificationTargetRoles,
      excludeUserIds: [user.id],
    });

    await createNotifications({
      userIds: recipientIds,
      documentId: document.id,
      title: transition.notificationTitle,
      detail: `${user.name} 已完成《${document.name}》初审，请及时终审。`,
      type: "document_review",
      targetTab: "documents",
      relatedId: document.id,
    });
  } else if (action === "teacherRevision") {
    const recipientIds = await getUserIdsByRoles({
      roles: ["leader", "admin"],
      excludeUserIds: [user.id],
    });

    await createNotifications({
      userIds: [...new Set([...recipientIds, document.ownerId])],
      documentId: document.id,
      title: transition.notificationTitle,
      detail: `《${document.name}》已被教师打回，等待负责人修改后重新提交。`,
      type: "document_review_result",
      targetTab: "documents",
      relatedId: document.id,
    });
  } else {
    await createNotifications({
      userIds: [document.ownerId],
      documentId: document.id,
      title: transition.notificationTitle,
      detail:
        action === "teacherApprove"
          ? `《${document.name}》已通过终审。`
          : `《${document.name}》已被负责人打回，请修改后重新提交。`,
      type: "document_review_result",
      targetTab: "documents",
      relatedId: document.id,
    });
  }

  return NextResponse.json({ document: serializeDocument(document) });
}
