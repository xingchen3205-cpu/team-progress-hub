import type { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { roleLabels } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const roleValues = new Set<Role>(["admin", "school_admin", "teacher", "leader", "member", "expert"]);
const quietActions = ["workspace.page_view", "auth.login.success", "auth.logout"];

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
};

const getRangeStart = (range: string | null) => {
  const now = new Date();
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

const buildKindWhere = (kind: string | null): Prisma.AuditLogWhereInput => {
  switch (kind) {
    case "access":
      return { action: "workspace.page_view" };
    case "auth":
      return { action: { in: ["auth.login.success", "auth.logout"] } };
    case "review":
      return {
        OR: [
          { action: { contains: "review" } },
          { action: { contains: "screen" } },
          { objectType: { contains: "review" } },
        ],
      };
    case "critical":
      return { NOT: { action: { in: quietActions } } };
    default:
      return {};
  }
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
  const action = searchParams.get("action");
  const objectType = searchParams.get("objectType");
  const keyword = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const requestedLimit = Number(searchParams.get("limit") ?? 120);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 20), 200) : 120;

  const where: Prisma.AuditLogWhereInput = {
    ...buildKindWhere(searchParams.get("kind")),
  };

  if (rangeStart) {
    where.createdAt = { gte: rangeStart };
  }

  if (operatorRole && roleValues.has(operatorRole as Role)) {
    where.operatorRole = operatorRole as Role;
  }

  if (action && action !== "all") {
    where.action = action;
  }

  if (objectType && objectType !== "all") {
    where.objectType = objectType;
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: keyword ? 250 : limit,
  });

  const operatorIds = Array.from(new Set(logs.map((log) => log.operatorId)));
  const teamGroupIds = Array.from(new Set(logs.map((log) => log.teamGroupId).filter(Boolean))) as string[];

  const [operators, teamGroups] = await Promise.all([
    operatorIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            role: true,
            teamGroupId: true,
            teamGroup: { select: { id: true, name: true } },
          },
        })
      : [],
    teamGroupIds.length > 0
      ? prisma.teamGroup.findMany({
          where: { id: { in: teamGroupIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const operatorMap = new Map(operators.map((operator) => [operator.id, operator]));
  const teamGroupMap = new Map(teamGroups.map((group) => [group.id, group]));

  const rows = logs.map((log) => {
    const operator = operatorMap.get(log.operatorId);
    const metadata = parseAuditJson(log.metadata);
    const meta = getActionMeta(log.action);
    const role = operator?.role ?? log.operatorRole;
    const teamGroup = log.teamGroupId ? teamGroupMap.get(log.teamGroupId) ?? null : operator?.teamGroup ?? null;

    return {
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      action: log.action,
      actionLabel: meta.label,
      moduleLabel: meta.module,
      tone: meta.tone,
      objectType: log.objectType,
      objectId: log.objectId,
      objectLabel: getObjectLabel(log.objectType, log.objectId, metadata),
      operatorRole: log.operatorRole,
      operator: {
        id: log.operatorId,
        name: operator?.name ?? "未知用户",
        username: operator?.username ?? "",
        email: operator?.email ?? "",
        role,
        roleLabel: roleLabels[role],
      },
      teamGroup: teamGroup ? { id: teamGroup.id, name: teamGroup.name } : null,
      reason: log.reason,
      beforeState: parseAuditJson(log.beforeState),
      afterState: parseAuditJson(log.afterState),
      metadata,
      ip: isRecord(metadata) ? readString(metadata.ip, "unknown") : "unknown",
      userAgent: isRecord(metadata) ? readString(metadata.userAgent, "unknown") : "unknown",
    };
  });

  const filteredRows = keyword
    ? rows.filter((row) =>
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
          .includes(keyword),
      )
    : rows;

  const todayStart = getRangeStart("today") ?? new Date();
  const visibleRows = filteredRows.slice(0, limit);
  const actions = Array.from(new Set(rows.map((row) => row.action))).map((value) => ({
    value,
    label: getActionMeta(value).label,
  }));

  return NextResponse.json({
    logs: visibleRows,
    stats: {
      total: filteredRows.length,
      todayCount: filteredRows.filter((row) => new Date(row.createdAt) >= todayStart).length,
      accessCount: filteredRows.filter((row) => row.action === "workspace.page_view").length,
      criticalCount: filteredRows.filter((row) => !quietActions.includes(row.action)).length,
      userCount: new Set(filteredRows.map((row) => row.operator.id)).size,
    },
    filters: {
      actions,
    },
  });
}
