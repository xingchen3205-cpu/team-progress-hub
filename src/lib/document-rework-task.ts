import type { DocumentReviewAction } from "@/lib/document-workflow";
import type { Role, TaskStatus } from "@prisma/client";

export const shouldCreateDocumentReworkTask = (action: DocumentReviewAction) =>
  action === "leaderRevision" || action === "teacherRevision";

export const buildDocumentReworkTaskTitle = (documentName: string) => `修改文档：${documentName}`;

export const getDocumentReworkInitialStatus = (ownerRole: Role): TaskStatus =>
  ownerRole === "leader" ? "doing" : "todo";

export const getDocumentReworkDueDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
