import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeDocument } from "@/lib/api-serializers";
import {
  type DocumentReviewAction,
  getDocumentReviewTransition,
} from "@/lib/document-workflow";
import {
  buildDocumentReworkTaskTitle,
  getDocumentReworkDueDate,
  getDocumentReworkInitialStatus,
  shouldCreateDocumentReworkTask,
} from "@/lib/document-rework-task";
import { createNotifications, getUserIdsByRoles } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTeamScopedResource } from "@/lib/team-scope";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
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
        select: {
          id: true,
          name: true,
          role: true,
          teamGroupId: true,
          teamGroup: {
            select: { id: true, name: true },
          },
        },
      },
      teamGroup: {
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

  if (
    !canAccessTeamScopedResource(user, {
      ownerId: currentDocument.ownerId,
      teamGroupId: currentDocument.teamGroupId ?? currentDocument.owner.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权限访问该文档" }, { status: 403 });
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
      comment: body?.comment?.trim() ?? null,
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          role: true,
          teamGroupId: true,
          teamGroup: {
            select: { id: true, name: true },
          },
        },
      },
      teamGroup: {
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
  const documentTeamGroupId = document.teamGroupId ?? document.owner.teamGroupId ?? null;

  if (shouldCreateDocumentReworkTask(action)) {
    const existingReworkTask = await prisma.task.findFirst({
      where: {
        sourceDocumentId: document.id,
        status: {
          notIn: ["archived", "done"],
        },
      },
      select: {
        id: true,
      },
    });

    const reworkTask =
      existingReworkTask ??
      (await prisma.task.create({
        data: {
          title: buildDocumentReworkTaskTitle(document.name),
          assigneeId: document.ownerId,
          creatorId: user.id,
          reviewerId: user.id,
          teamGroupId: documentTeamGroupId,
          sourceDocumentId: document.id,
          dueDate: getDocumentReworkDueDate(),
          priority: "high",
          status: getDocumentReworkInitialStatus(document.owner.role),
          acceptedAt: document.owner.role === "leader" ? new Date() : null,
        },
        select: {
          id: true,
        },
      }));

    await createNotifications({
      userIds: [document.ownerId],
      documentId: document.id,
      title: `文档修改工单：${document.name}`,
      detail: existingReworkTask
        ? `《${document.name}》仍有未归档的修改工单，请继续在任务工单中处理。`
        : `《${document.name}》已被打回，系统已为你创建修改工单，请在任务工单中处理并提交验收。`,
      type: "document_rework_task",
      targetTab: "board",
      relatedId: reworkTask.id,
      senderId: user.id,
      email: { noticeType: "工单处理", actionLabel: "进入系统处理" },
      emailTeamGroupId: documentTeamGroupId,
    }).catch((error) => {
      console.error("Document rework task notification failed", error);
    });
  }

  if (action === "leaderApprove") {
    const recipientIds = await getUserIdsByRoles({
      roles: transition.notificationTargetRoles,
      excludeUserIds: [user.id],
      teamGroupId: documentTeamGroupId,
    });

    await createNotifications({
      userIds: recipientIds,
      documentId: document.id,
      title: transition.notificationTitle,
      detail: `${user.name} 已完成《${document.name}》初审，请及时终审。`,
      type: "document_review",
      targetTab: "documents",
      relatedId: document.id,
      email: { noticeType: "文档审批", actionLabel: "进入系统处理" },
      emailTeamGroupId: documentTeamGroupId,
    }).catch((error) => {
      console.error("Document leader approval notification failed", error);
    });
  } else if (action === "teacherRevision") {
    const recipientIds = await getUserIdsByRoles({
      roles: ["leader", "admin"],
      excludeUserIds: [user.id],
      teamGroupId: documentTeamGroupId,
    });

    await createNotifications({
      userIds: [...new Set([...recipientIds, document.ownerId])],
      documentId: document.id,
      title: transition.notificationTitle,
      detail: `《${document.name}》已被教师打回，等待负责人修改后重新提交。`,
      type: "document_review_result",
      targetTab: "documents",
      relatedId: document.id,
      email: { noticeType: "文档审批", actionLabel: "进入系统处理" },
      emailTeamGroupId: documentTeamGroupId,
    }).catch((error) => {
      console.error("Document teacher revision notification failed", error);
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
      email: { noticeType: "文档审批", actionLabel: "进入系统处理" },
      emailTeamGroupId: documentTeamGroupId,
    }).catch((error) => {
      console.error("Document review result notification failed", error);
    });
  }

  return NextResponse.json({ document: serializeDocument(document) });
}
