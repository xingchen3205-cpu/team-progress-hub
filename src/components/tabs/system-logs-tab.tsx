"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";

type SystemLogRow = {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  moduleLabel: string;
  tone: "info" | "success" | "warning";
  objectLabel: string;
  operator: {
    id: string;
    name: string;
    username: string;
    email: string;
    role: string;
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

type SystemLogsResponse = {
  logs: SystemLogRow[];
  stats: {
    total: number;
    todayCount: number;
    accessCount: number;
    criticalCount: number;
    userCount: number;
  };
  filters: {
    actions: Array<{ value: string; label: string }>;
  };
};

type RangeKey = "today" | "7d" | "30d" | "all";
type KindKey = "all" | "access" | "auth" | "review" | "critical";

const rangeOptions: Array<{ value: RangeKey; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "all", label: "全部" },
];

const kindOptions: Array<{ value: KindKey; label: string; description: string }> = [
  { value: "all", label: "全部", description: "所有审计记录" },
  { value: "access", label: "访问记录", description: "谁进入了哪个页面" },
  { value: "auth", label: "登录登出", description: "账号进入与退出" },
  { value: "review", label: "评审相关", description: "专家评审与大屏操作" },
  { value: "critical", label: "关键操作", description: "排除、重置、锁分等" },
];

const roleOptions = [
  { value: "all", label: "全部角色" },
  { value: "admin", label: "系统管理员" },
  { value: "school_admin", label: "校级管理员" },
  { value: "teacher", label: "指导教师" },
  { value: "leader", label: "项目负责人" },
  { value: "member", label: "团队成员" },
  { value: "expert", label: "评审专家" },
];

const toneClassNames: Record<SystemLogRow["tone"], string> = {
  info: "border-slate-200 bg-slate-50 text-slate-600",
  success: "border-emerald-100 bg-emerald-50 text-emerald-700",
  warning: "border-amber-100 bg-amber-50 text-amber-700",
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));

export const formatAuditJson = (value: unknown) => {
  if (value == null) {
    return "无";
  }

  if (typeof value === "string") {
    return value || "无";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "无法解析";
  }
};

export default function SystemLogsTab() {
  const { currentRole } = Workspace.useWorkspaceContext();
  const {
    ActionButton,
    EmptyState,
    FileText,
    Loader2,
    RotateCcw,
    Search,
    fieldClassName,
    requestJson,
  } = Workspace;

  const [range, setRange] = useState<RangeKey>("7d");
  const [kind, setKind] = useState<KindKey>("all");
  const [role, setRole] = useState("all");
  const [action, setAction] = useState("all");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [payload, setPayload] = useState<SystemLogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      range,
      kind,
      role,
      action,
      limit: "120",
    });
    if (keyword.trim()) {
      params.set("q", keyword.trim());
    }
    return params.toString();
  }, [action, keyword, kind, range, role]);

  const loadLogs = useCallback(async () => {
    if (currentRole !== "admin") {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const nextPayload = await requestJson<SystemLogsResponse>(
        `/api/system-logs?${query}`,
        undefined,
        { cacheTtlMs: 0, force: true },
      );
      setPayload(nextPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "系统日志加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [currentRole, query, requestJson]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  if (currentRole !== "admin") {
    return (
      <section className="depth-card rounded-xl p-8">
        <EmptyState
          description="系统日志包含全站访问与关键操作记录，仅系统管理员可见。"
          icon={FileText}
          title="无权查看系统日志"
        />
      </section>
    );
  }

  const stats = payload?.stats ?? {
    total: 0,
    todayCount: 0,
    accessCount: 0,
    criticalCount: 0,
    userCount: 0,
  };
  const logs = payload?.logs ?? [];
  const actionOptions = payload?.filters.actions ?? [];

  return (
    <div className="space-y-5">
      <section className="depth-card overflow-hidden rounded-xl p-0">
        <div className="border-b border-white/70 bg-white/75 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#1a6fd4]/15 bg-[#1a6fd4]/8 px-3 py-1 text-xs font-semibold text-[#1a6fd4]">
                <FileText className="h-3.5 w-3.5" />
                系统管理员专用
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-950">系统日志</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                集中查看账号登录、页面访问和关键业务操作。列表只展示审计摘要，操作前后数据放在详情中展开查看。
              </p>
            </div>
            <ActionButton disabled={isLoading} onClick={() => void loadLogs()}>
              <span className="inline-flex items-center gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                <span>刷新日志</span>
              </span>
            </ActionButton>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200/70 md:grid-cols-4">
          {[
            { label: "当前结果", value: stats.total, helper: "符合筛选条件" },
            { label: "今日记录", value: stats.todayCount, helper: "今天写入" },
            { label: "访问记录", value: stats.accessCount, helper: "工作台页面访问" },
            { label: "关键操作", value: stats.criticalCount, helper: `${stats.userCount} 人涉及` },
          ].map((item) => (
            <div className="bg-white/80 px-6 py-4" key={item.label}>
              <p className="text-xs font-medium text-slate-500">{item.label}</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-semibold tabular-nums text-slate-950">{item.value}</span>
                <span className="pb-1 text-xs text-slate-400">{item.helper}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="depth-subtle rounded-xl p-5">
        <div className="grid gap-3 xl:grid-cols-[1.3fr_160px_160px_180px_1fr_auto] xl:items-end">
          <div>
            <p className="text-xs font-semibold text-slate-500">日志类型</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-5">
              {kindOptions.map((option) => {
                const isActive = kind === option.value;
                return (
                  <button
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-[#1a6fd4]/35 bg-[#1a6fd4]/10 text-[#1a6fd4]"
                        : "border-white/70 bg-white/80 text-slate-500 hover:border-[#1a6fd4]/20 hover:text-slate-800"
                    }`}
                    key={option.value}
                    onClick={() => setKind(option.value)}
                    type="button"
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-1 block truncate text-[11px] opacity-70">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block text-xs font-semibold text-slate-500">
            时间范围
            <select className={fieldClassName} onChange={(event) => setRange(event.target.value as RangeKey)} value={range}>
              {rangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-500">
            操作角色
            <select className={fieldClassName} onChange={(event) => setRole(event.target.value)} value={role}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-500">
            操作类型
            <select className={fieldClassName} onChange={(event) => setAction(event.target.value)} value={action}>
              <option value="all">全部操作</option>
              {actionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-500">
            关键词
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${fieldClassName} pl-9`}
                onChange={(event) => setKeywordDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setKeyword(keywordDraft);
                  }
                }}
                placeholder="搜人名、IP、操作、对象"
                value={keywordDraft}
              />
            </div>
          </label>

          <ActionButton onClick={() => setKeyword(keywordDraft)} variant="primary">
            查询
          </ActionButton>
        </div>
      </section>

      <section className="depth-card rounded-xl p-0">
        <div className="flex items-center justify-between border-b border-white/70 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">时间 / 操作人 / 操作内容</h2>
            <p className="mt-1 text-xs text-slate-500">按发生时间倒序展示，点击每条日志下方“详情”查看原因和状态快照。</p>
          </div>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#1a6fd4]" /> : null}
        </div>

        {error ? (
          <div className="m-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {!isLoading && !error && logs.length === 0 ? (
          <EmptyState description="当前筛选条件下没有系统日志。可放宽时间范围或清空关键词后再查。" icon={FileText} title="暂无日志" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[150px_180px_1fr_180px_130px] border-b border-slate-100 bg-slate-50/80 px-6 py-3 text-xs font-semibold text-slate-500">
                <div>时间</div>
                <div>操作人</div>
                <div>操作内容</div>
                <div>对象 / 项目组</div>
                <div className="text-right">来源 IP</div>
              </div>

              <div className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <article className="px-6 py-4 transition hover:bg-slate-50/70" key={log.id}>
                    <div className="grid grid-cols-[150px_180px_1fr_180px_130px] items-start gap-3">
                      <div className="font-mono text-sm tabular-nums text-slate-600">{formatDateTime(log.createdAt)}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{log.operator.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{log.operator.roleLabel}</p>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClassNames[log.tone]}`}>
                            {log.moduleLabel}
                          </span>
                          <span className="text-sm font-semibold text-slate-950">{log.actionLabel}</span>
                        </div>
                        <p className="mt-2 truncate text-xs text-slate-500">{log.action}</p>
                        {log.reason ? (
                          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                            原因：{log.reason}
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-0 text-sm text-slate-600">
                        <p className="truncate font-medium text-slate-800">{log.objectLabel}</p>
                        <p className="mt-1 truncate text-xs text-slate-400">{log.teamGroup?.name ?? "全局 / 未绑定项目组"}</p>
                      </div>
                      <div className="truncate text-right font-mono text-xs text-slate-500">{log.ip}</div>
                    </div>

                    <details className="mt-3 rounded-xl border border-slate-100 bg-white/70 px-4 py-3">
                      <summary className="cursor-pointer text-xs font-semibold text-[#1a6fd4]">详情</summary>
                      <div className="mt-3 grid gap-3 lg:grid-cols-3">
                        {[
                          { label: "操作前", value: log.beforeState },
                          { label: "操作后", value: log.afterState },
                          { label: "环境信息", value: log.metadata },
                        ].map((item) => (
                          <div className="min-w-0 rounded-lg bg-slate-950/[0.03] p-3" key={item.label}>
                            <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                              {formatAuditJson(item.value)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
