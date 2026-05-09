import type { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { roleLabels } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const roleValues = new Set<Role>(["admin", "school_admin", "teacher", "leader", "member", "expert"]);
const quietActions = ["workspace.page_view", "auth.login.success", "auth.logout"];
const mayRangeStart = new Date("2026-04-30T16:00:00.000Z");

const actionMeta: Record<string, { label: string; module: string; tone: "info" | "success" | "warning" }> = {
  "workspace.page_view": { label: "访问工作台页面", module: "访问记录", tone: "info" },
  "auth.login.success": { label: "登录成功", module: "账号登录", tone: "success" },
  "auth.logout": { label: "退出登录", module: "账号登录", tone: "info" },
  "review_screen_session.token_generated": { label: "生成大屏链接", module: "路演大屏", tone: "warning" },
  "review_screen_project.final_score_locked": { label: "锁定最终分", module: "路演大屏", tone: "warning" },
  "review_display_seat.excluded": { label: "排除专家席位", module: "路演大屏", tone: "warning" },
  "expert_review_assignment.closed_by_admin": { label: "关闭未提交任务", module: "专家评审", tone: "warning" },
  "expert_review_stage.reset": { label: "重置评审阶段", module: "专家评审", tone: "warning" },
  "expert_review_package.reset": { label: "重置评审包", module: "专家评审", tone: "warning" },
  "expert_review_stage.cancel": { label: "取消评审阶段", module: "专家评审", tone: "warning" },
  "expert_review_package.cancel": { label: "取消评审包", module: "专家评审", tone: "warning" },
  "account.created": { label: "账号创建", module: "账号管理", tone: "info" },
  "announcement.created": { label: "发布公告", module: "通知公告", tone: "info" },
  "task.created": { label: "创建任务", module: "任务中心", tone: "info" },
  "task.submitted": { label: "提交任务", module: "任务中心", tone: "success" },
  "report.submitted": { label: "提交日报", module: "日程汇报", tone: "success" },
  "report.evaluated": { label: "评价日报", module: "日程汇报", tone: "info" },
  "event.created": { label: "创建时间节点", module: "时间进度", tone: "info" },
  "expert_feedback.created": { label: "记录专家意见", module: "专家意见", tone: "info" },
  "document.created": { label: "创建归档资料", module: "资料归档", tone: "info" },
  "document.version_uploaded": { label: "上传资料版本", module: "资料归档", tone: "success" },
  "project_stage.created": { label: "创建评审阶段", module: "项目管理", tone: "info" },
  "project_material.submitted": { label: "提交项目材料", module: "项目管理", tone: "success" },
  "project_material.approved": { label: "审核通过项目材料", module: "项目管理", tone: "success" },
  "project_material.rejected": { label: "退回项目材料", module: "项目管理", tone: "warning" },
  "expert_review_package.created": { label: "配置评审包", module: "专家评审", tone: "info" },
  "expert_review.score_submitted": { label: "提交专家评分", module: "专家评审", tone: "success" },
  "training_question.created": { label: "新增训练题", module: "训练中心", tone: "info" },
  "training_session.created": { label: "记录训练", module: "训练中心", tone: "info" },
};

const getRangeStart = (range: string | null) => {
  const now = new Date();
  if (!range || range === "may") {
    return mayRangeStart;
  }

  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (range === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  if (range === "all") {
    return null;
  }

  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
};

const parseAuditJson = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readString = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const getActionMeta = (action: string) => {
  if (actionMeta[action]) {
    return actionMeta[action];
  }

  if (action.includes("reset") || action.includes("cancel") || action.includes("excluded")) {
    return { label: action, module: "关键操作", tone: "warning" as const };
  }

  return { label: action, module: "系统操作", tone: "info" as const };
};

const getObjectLabel = (
  objectType: string,
  objectId: string,
  metadata: unknown,
) => {
  if (isRecord(metadata)) {
    const tabLabel = readString(metadata.tabLabel);
    if (objectType === "workspace_tab" && tabLabel) {
      return tabLabel;
    }

    const targetName = readString(metadata.targetName) || readString(metadata.projectName);
    if (targetName) {
      return targetName;
    }
  }

  if (objectType === "user") {
    return "用户账号";
  }

  return `${objectType} · ${objectId}`;
};

type ActivityOperator = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: Role;
  teamGroupId: string | null;
  teamGroup?: { id: string; name: string } | null;
  createdAt?: Date;
};

type SystemLogRow = {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  moduleLabel: string;
  tone: "info" | "success" | "warning";
  objectType: string;
  objectId: string;
  objectLabel: string;
  operatorRole: Role;
  operator: {
    id: string;
    name: string;
    username: string;
    email: string;
    role: Role;
    roleLabel: string;
  };
  teamGroup: { id: string; name: string } | null;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  metadata: unknown;
  ip: string;
  userAgent: string;
};

const userSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  teamGroupId: true,
  teamGroup: { select: { id: true, name: true } },
  createdAt: true,
} satisfies Prisma.UserSelect;

const teamGroupSelect = { id: true, name: true } satisfies Prisma.TeamGroupSelect;

const buildLogRow = ({
  id,
  createdAt,
  action,
  objectType,
  objectId,
  objectLabel,
  operator,
  operatorRole,
  teamGroup,
  reason = null,
  beforeState = null,
  afterState = null,
  metadata = null,
  ip = "unknown",
  userAgent = "unknown",
}: {
  id: string;
  createdAt: Date;
  action: string;
  objectType: string;
  objectId: string;
  objectLabel: string;
  operator?: ActivityOperator | null;
  operatorRole: Role;
  teamGroup?: { id: string; name: string } | null;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: unknown;
  ip?: string;
  userAgent?: string;
}): SystemLogRow => {
  const meta = getActionMeta(action);
  const role = operator?.role ?? operatorRole;

  return {
    id,
    createdAt: createdAt.toISOString(),
    action,
    actionLabel: meta.label,
    moduleLabel: meta.module,
    tone: meta.tone,
    objectType,
    objectId,
    objectLabel,
    operatorRole,
    operator: {
      id: operator?.id ?? "unknown",
      name: operator?.name ?? "未知用户",
      username: operator?.username ?? "",
      email: operator?.email ?? "",
      role,
      roleLabel: roleLabels[role],
    },
    teamGroup: teamGroup ?? operator?.teamGroup ?? null,
    reason,
    beforeState,
    afterState,
    metadata,
    ip,
    userAgent,
  };
};

const getDerivedActivityLogs = async (rangeStart: Date | null) => {
  const sinceWhere = rangeStart ? { gte: rangeStart } : undefined;
  const rows: SystemLogRow[] = [];
  const push = (row: Parameters<typeof buildLogRow>[0]) => rows.push(buildLogRow(row));

  const [
    users,
    announcements,
    tasks,
    taskAssignments,
    reports,
    reportEvaluations,
    events,
    expertFeedbacks,
    documents,
    documentVersions,
    projectStages,
    projectMaterials,
    reviewPackages,
    reviewScores,
    trainingQuestions,
    trainingSessions,
  ] = await Promise.all([
    prisma.user.findMany({
      where: rangeStart ? { createdAt: { gte: rangeStart } } : {},
      select: userSelect,
    }),
    prisma.announcement.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { author: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
    prisma.task.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { creator: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
    prisma.taskAssignment.findMany({
      where: sinceWhere ? { submittedAt: sinceWhere } : { submittedAt: { not: null } },
      include: {
        assignee: { select: userSelect },
        task: { select: { id: true, title: true, teamGroup: { select: teamGroupSelect } } },
      },
    }),
    prisma.report.findMany({
      where: sinceWhere ? { submittedAt: sinceWhere } : {},
      include: { user: { select: userSelect } },
    }),
    prisma.reportEvaluation.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: {
        evaluator: { select: userSelect },
        report: { select: { id: true, date: true, user: { select: { name: true, teamGroup: { select: teamGroupSelect } } } } },
      },
    }),
    prisma.event.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { creator: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
    prisma.expertFeedback.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { createdBy: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
    prisma.document.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { owner: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
    prisma.documentVersion.findMany({
      where: sinceWhere ? { uploadedAt: sinceWhere } : {},
      include: {
        uploader: { select: userSelect },
        document: { select: { id: true, name: true, teamGroup: { select: teamGroupSelect } } },
      },
    }),
    prisma.projectReviewStage.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { creator: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
    prisma.projectMaterialSubmission.findMany({
      where: rangeStart
        ? {
            OR: [
              { createdAt: { gte: rangeStart } },
              { approvedAt: { gte: rangeStart } },
              { rejectedAt: { gte: rangeStart } },
            ],
          }
        : {},
      include: {
        submitter: { select: userSelect },
        approver: { select: userSelect },
        rejecter: { select: userSelect },
        teamGroup: { select: teamGroupSelect },
        stage: { select: { name: true } },
      },
    }),
    prisma.expertReviewPackage.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { creator: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
    prisma.expertReviewScore.findMany({
      where: sinceWhere ? { submittedAt: sinceWhere } : {},
      include: {
        reviewer: { select: userSelect },
        assignment: {
          select: {
            reviewPackage: {
              select: {
                id: true,
                targetName: true,
                teamGroup: { select: teamGroupSelect },
              },
            },
          },
        },
      },
    }),
    prisma.trainingQuestion.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { createdBy: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
    prisma.trainingSession.findMany({
      where: sinceWhere ? { createdAt: sinceWhere } : {},
      include: { createdBy: { select: userSelect }, teamGroup: { select: teamGroupSelect } },
    }),
  ]);

  users.forEach((item) => {
    push({
      id: `derived-account-${item.id}`,
      createdAt: item.createdAt,
      action: "account.created",
      objectType: "user",
      objectId: item.id,
      objectLabel: item.name,
      operator: item,
      operatorRole: item.role,
      metadata: { source: "derived", username: item.username },
    });
  });
  announcements.forEach((item) =>
    push({
      id: `derived-announcement-${item.id}`,
      createdAt: item.createdAt,
      action: "announcement.created",
      objectType: "announcement",
      objectId: item.id,
      objectLabel: item.title,
      operator: item.author,
      operatorRole: item.author.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived" },
    }),
  );
  tasks.forEach((item) =>
    push({
      id: `derived-task-${item.id}`,
      createdAt: item.createdAt,
      action: "task.created",
      objectType: "task",
      objectId: item.id,
      objectLabel: item.title,
      operator: item.creator,
      operatorRole: item.creator.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived", status: item.status },
    }),
  );
  taskAssignments.forEach((item) => {
    if (!item.submittedAt) return;
    push({
      id: `derived-task-submitted-${item.id}`,
      createdAt: item.submittedAt,
      action: "task.submitted",
      objectType: "task_assignment",
      objectId: item.id,
      objectLabel: item.task.title,
      operator: item.assignee,
      operatorRole: item.assignee.role,
      teamGroup: item.task.teamGroup,
      metadata: { source: "derived", taskId: item.task.id },
    });
  });
  reports.forEach((item) =>
    push({
      id: `derived-report-${item.id}`,
      createdAt: item.submittedAt,
      action: "report.submitted",
      objectType: "report",
      objectId: item.id,
      objectLabel: `日报 ${item.date}`,
      operator: item.user,
      operatorRole: item.user.role,
      teamGroup: item.user.teamGroup,
      metadata: { source: "derived", date: item.date },
    }),
  );
  reportEvaluations.forEach((item) =>
    push({
      id: `derived-report-evaluation-${item.id}`,
      createdAt: item.createdAt,
      action: "report.evaluated",
      objectType: "report_evaluation",
      objectId: item.id,
      objectLabel: `${item.report.user.name} · 日报 ${item.report.date}`,
      operator: item.evaluator,
      operatorRole: item.evaluator.role,
      teamGroup: item.report.user.teamGroup,
      metadata: { source: "derived", type: item.type },
    }),
  );
  events.forEach((item) => {
    if (!item.creator) return;
    push({
      id: `derived-event-${item.id}`,
      createdAt: item.createdAt,
      action: "event.created",
      objectType: "event",
      objectId: item.id,
      objectLabel: item.title,
      operator: item.creator,
      operatorRole: item.creator.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived" },
    });
  });
  expertFeedbacks.forEach((item) => {
    if (!item.createdBy) return;
    push({
      id: `derived-expert-feedback-${item.id}`,
      createdAt: item.createdAt,
      action: "expert_feedback.created",
      objectType: "expert_feedback",
      objectId: item.id,
      objectLabel: item.topic,
      operator: item.createdBy,
      operatorRole: item.createdBy.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived", expert: item.expert },
    });
  });
  documents.forEach((item) =>
    push({
      id: `derived-document-${item.id}`,
      createdAt: item.createdAt,
      action: "document.created",
      objectType: "document",
      objectId: item.id,
      objectLabel: item.name,
      operator: item.owner,
      operatorRole: item.owner.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived", category: item.category, status: item.status },
    }),
  );
  documentVersions.forEach((item) =>
    push({
      id: `derived-document-version-${item.id}`,
      createdAt: item.uploadedAt,
      action: "document.version_uploaded",
      objectType: "document_version",
      objectId: item.id,
      objectLabel: item.document.name,
      operator: item.uploader,
      operatorRole: item.uploader.role,
      teamGroup: item.document.teamGroup,
      metadata: { source: "derived", fileName: item.fileName, documentId: item.document.id },
    }),
  );
  projectStages.forEach((item) =>
    push({
      id: `derived-project-stage-${item.id}`,
      createdAt: item.createdAt,
      action: "project_stage.created",
      objectType: "project_review_stage",
      objectId: item.id,
      objectLabel: item.name,
      operator: item.creator,
      operatorRole: item.creator.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived", type: item.type },
    }),
  );
  projectMaterials.forEach((item) => {
    push({
      id: `derived-project-material-${item.id}`,
      createdAt: item.createdAt,
      action: "project_material.submitted",
      objectType: "project_material",
      objectId: item.id,
      objectLabel: item.title || item.fileName,
      operator: item.submitter,
      operatorRole: item.submitter.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived", stageName: item.stage.name, status: item.status },
    });
    if (item.approvedAt && item.approver) {
      push({
        id: `derived-project-material-approved-${item.id}`,
        createdAt: item.approvedAt,
        action: "project_material.approved",
        objectType: "project_material",
        objectId: item.id,
        objectLabel: item.title || item.fileName,
        operator: item.approver,
        operatorRole: item.approver.role,
        teamGroup: item.teamGroup,
        metadata: { source: "derived", stageName: item.stage.name },
      });
    }
    if (item.rejectedAt && item.rejecter) {
      push({
        id: `derived-project-material-rejected-${item.id}`,
        createdAt: item.rejectedAt,
        action: "project_material.rejected",
        objectType: "project_material",
        objectId: item.id,
        objectLabel: item.title || item.fileName,
        operator: item.rejecter,
        operatorRole: item.rejecter.role,
        teamGroup: item.teamGroup,
        reason: item.rejectReason,
        metadata: { source: "derived", stageName: item.stage.name },
      });
    }
  });
  reviewPackages.forEach((item) =>
    push({
      id: `derived-review-package-${item.id}`,
      createdAt: item.createdAt,
      action: "expert_review_package.created",
      objectType: "expert_review_package",
      objectId: item.id,
      objectLabel: item.targetName,
      operator: item.creator,
      operatorRole: item.creator.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived", status: item.status },
    }),
  );
  reviewScores.forEach((item) =>
    push({
      id: `derived-review-score-${item.id}`,
      createdAt: item.submittedAt,
      action: "expert_review.score_submitted",
      objectType: "expert_review_score",
      objectId: item.id,
      objectLabel: item.assignment.reviewPackage.targetName,
      operator: item.reviewer,
      operatorRole: item.reviewer.role,
      teamGroup: item.assignment.reviewPackage.teamGroup,
      metadata: { source: "derived", totalScore: item.totalScore },
    }),
  );
  trainingQuestions.forEach((item) =>
    push({
      id: `derived-training-question-${item.id}`,
      createdAt: item.createdAt,
      action: "training_question.created",
      objectType: "training_question",
      objectId: item.id,
      objectLabel: item.question,
      operator: item.createdBy,
      operatorRole: item.createdBy.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived", category: item.category },
    }),
  );
  trainingSessions.forEach((item) =>
    push({
      id: `derived-training-session-${item.id}`,
      createdAt: item.createdAt,
      action: "training_session.created",
      objectType: "training_session",
      objectId: item.id,
      objectLabel: item.title || "训练记录",
      operator: item.createdBy,
      operatorRole: item.createdBy.role,
      teamGroup: item.teamGroup,
      metadata: { source: "derived", durationSeconds: item.durationSeconds },
    }),
  );

  return rows;
};

const rowMatchesKind = (row: SystemLogRow, kind: string | null) => {
  switch (kind) {
    case "access":
      return row.action === "workspace.page_view";
    case "auth":
      return row.action === "auth.login.success" || row.action === "auth.logout";
    case "review":
      return row.action.includes("review") || row.objectType.includes("review") || row.action.includes("project_material");
    case "critical":
      return !quietActions.includes(row.action) && row.tone === "warning";
    default:
      return true;
  }
};

const rowMatchesKeyword = (row: SystemLogRow, keyword: string) =>
  !keyword ||
  [
    row.action,
    row.actionLabel,
    row.moduleLabel,
    row.objectLabel,
    row.operator.name,
    row.operator.username,
    row.operator.email,
    row.operator.roleLabel,
    row.teamGroup?.name,
    row.reason,
    row.ip,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(keyword);

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);

  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ message: "仅系统管理员可查看系统日志" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const rangeStart = getRangeStart(searchParams.get("range"));
  const operatorRole = searchParams.get("role");
  const operatorId = searchParams.get("operatorId");
  const action = searchParams.get("action");
  const objectType = searchParams.get("objectType");
  const keyword = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limitParam = searchParams.get("limit");
  const requestedLimit = Number(limitParam ?? 120);
  const limit =
    limitParam === "all"
      ? null
      : Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 20), 500)
        : 120;
  const auditWhere: Prisma.AuditLogWhereInput = rangeStart ? { createdAt: { gte: rangeStart } } : {};

  const auditLogs = await prisma.auditLog.findMany({
    where: auditWhere,
    orderBy: { createdAt: "desc" },
  });

  const operatorIds = Array.from(new Set(auditLogs.map((log) => log.operatorId)));
  const teamGroupIds = Array.from(new Set(auditLogs.map((log) => log.teamGroupId).filter(Boolean))) as string[];

  const [allOperators, logOperators, teamGroups, derivedRows] = await Promise.all([
    prisma.user.findMany({
      where: { approvalStatus: "approved" },
      select: userSelect,
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    operatorIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: userSelect,
        })
      : [],
    teamGroupIds.length > 0
      ? prisma.teamGroup.findMany({
          where: { id: { in: teamGroupIds } },
          select: { id: true, name: true },
        })
      : [],
    getDerivedActivityLogs(rangeStart),
  ]);

  const operatorMap = new Map(
    [...allOperators, ...logOperators].map((operator) => [operator.id, operator]),
  );
  const teamGroupMap = new Map(teamGroups.map((group) => [group.id, group]));

  const auditRows = auditLogs.map((log) => {
    const operator = operatorMap.get(log.operatorId);
    const metadata = parseAuditJson(log.metadata);
    const teamGroup = log.teamGroupId ? teamGroupMap.get(log.teamGroupId) ?? null : operator?.teamGroup ?? null;
    const ip = isRecord(metadata) ? readString(metadata.ip, "unknown") : "unknown";
    const userAgent = isRecord(metadata) ? readString(metadata.userAgent, "unknown") : "unknown";

    return buildLogRow({
      id: log.id,
      createdAt: log.createdAt,
      action: log.action,
      objectType: log.objectType,
      objectId: log.objectId,
      objectLabel: getObjectLabel(log.objectType, log.objectId, metadata),
      operatorRole: log.operatorRole,
      operator,
      teamGroup,
      reason: log.reason,
      beforeState: parseAuditJson(log.beforeState),
      afterState: parseAuditJson(log.afterState),
      metadata,
      ip,
      userAgent,
    });
  });

  const rows = [...auditRows, ...derivedRows]
    .filter((row) => rowMatchesKind(row, searchParams.get("kind")))
    .filter((row) => !operatorRole || !roleValues.has(operatorRole as Role) || row.operator.role === operatorRole)
    .filter((row) => !operatorId || operatorId === "all" || row.operator.id === operatorId)
    .filter((row) => !action || action === "all" || row.action === action)
    .filter((row) => !objectType || objectType === "all" || row.objectType === objectType)
    .filter((row) => rowMatchesKeyword(row, keyword))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const todayStart = getRangeStart("today") ?? new Date();
  const visibleRows = limit === null ? rows : rows.slice(0, limit);
  const actions = Array.from(new Set(rows.map((row) => row.action))).map((value) => ({
    value,
    label: getActionMeta(value).label,
  }));

  return NextResponse.json({
    logs: visibleRows,
    stats: {
      total: rows.length,
      todayCount: rows.filter((row) => new Date(row.createdAt) >= todayStart).length,
      accessCount: rows.filter((row) => row.action === "workspace.page_view").length,
      criticalCount: rows.filter((row) => !quietActions.includes(row.action) && row.tone === "warning").length,
      userCount: new Set(rows.map((row) => row.operator.id)).size,
    },
    filters: {
      actions,
      operators: allOperators.map((operator) => ({
        value: operator.id,
        label: `${operator.name} · ${roleLabels[operator.role]}`,
      })),
    },
  });
}
