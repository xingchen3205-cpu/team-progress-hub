"use client";

import { useMemo, useState } from "react";

import * as Workspace from "@/components/workspace-context";

type OpinionScopeFilter = "all" | "assigned" | "unassigned";
type OpinionTimeFilter = "all" | "week" | "month" | "quarter";

export default function ExpertOpinionTab() {
  const {
    experts,
    currentRole,
    currentDateTime,
    teamGroups,
    setExpertModalOpen,
    setExpertDraft,
    setExpertFiles,
    setExpertDraftErrors,
    openExpertAttachmentMenuId,
    setOpenExpertAttachmentMenuId,
    permissions,
    handleDownload,
    handlePreviewDocument,
    openEditExpert,
    removeExpert,
  } = Workspace.useWorkspaceContext();

  const {
    ChevronDown,
    Download,
    Paperclip,
    Trash2,
    Upload,
    Pencil,
    Search,
    Users,
    defaultExpertDraft,
    defaultExpertDraftErrors,
  } = Workspace;

  const isGlobalExpertOpinionView = currentRole === "admin" || currentRole === "school_admin";
  const canUseGlobalExpertOpinionFilters = isGlobalExpertOpinionView;
  const [selectedExpertOpinionGroupId, setSelectedExpertOpinionGroupId] = useState("all");
  const [opinionScopeFilter, setOpinionScopeFilter] = useState<OpinionScopeFilter>("all");
  const [opinionTimeFilter, setOpinionTimeFilter] = useState<OpinionTimeFilter>("all");
  const [expertOpinionSearch, setExpertOpinionSearch] = useState("");
  const [closedExpertOpinionGroupIds, setClosedExpertOpinionGroupIds] = useState<string[]>([]);
  const currentTimestamp = currentDateTime.getTime();

  const openCreateExpertModal = () => {
    setExpertDraft(defaultExpertDraft);
    setExpertFiles([]);
    setExpertDraftErrors(defaultExpertDraftErrors());
    setExpertModalOpen(true);
  };

  const baseExpertOpinionGroups = useMemo(
    () =>
      isGlobalExpertOpinionView
        ? [
            {
              id: "global",
              title: "待分配意见",
              description: "校级统一整理、暂不指定项目组的专家意见，仅作为全校台账留存。",
              items: experts.filter((session) => !session.teamGroupId),
            },
            ...teamGroups.map((group) => ({
              id: group.id,
              title: group.name,
              description: "指定给该项目组的专家意见，组内教师和学生可见。",
              items: experts.filter((session) => session.teamGroupId === group.id),
            })),
          ]
        : [
            {
              id: "current-team",
              title: "本组专家意见",
              description: "本项目组沉淀的专家辅导、评审反馈与后续动作。",
              items: experts,
            },
          ],
    [experts, isGlobalExpertOpinionView, teamGroups],
  );

  const expertOpinionGroups = useMemo(() => {
    const keyword = expertOpinionSearch.trim().toLowerCase();
    const isWithinTimeRange = (date: string) => {
      if (opinionTimeFilter === "all") {
        return true;
      }

      const timestamp = new Date(date).getTime();
      if (!Number.isFinite(timestamp)) {
        return true;
      }

      const days = Math.floor((currentTimestamp - timestamp) / 86_400_000);
      if (opinionTimeFilter === "week") {
        return days <= 7;
      }
      if (opinionTimeFilter === "month") {
        return days <= 31;
      }
      return days <= 93;
    };

    const matchesSearch = (session: (typeof experts)[number]) => {
      if (!keyword) {
        return true;
      }

      return [
        session.date,
        session.format,
        session.teamGroupName,
        session.expert,
        session.topic,
        session.summary,
        session.nextAction,
      ]
        .filter(Boolean)
        .some((value) => `${value}`.toLowerCase().includes(keyword));
    };

    return baseExpertOpinionGroups
      .filter(
        (group) =>
          !canUseGlobalExpertOpinionFilters ||
          selectedExpertOpinionGroupId === "all" ||
          group.id === selectedExpertOpinionGroupId,
      )
      .map((group) => ({
        ...group,
        items: group.items.filter((session) => {
          const matchesScope = canUseGlobalExpertOpinionFilters
            ? opinionScopeFilter === "all" ||
              (opinionScopeFilter === "assigned"
                ? Boolean(session.teamGroupId)
                : opinionScopeFilter === "unassigned"
                  ? !session.teamGroupId
                  : true)
            : true;
          return matchesScope && isWithinTimeRange(session.date) && matchesSearch(session);
        }),
      }));
  }, [
    baseExpertOpinionGroups,
    canUseGlobalExpertOpinionFilters,
    currentTimestamp,
    expertOpinionSearch,
    opinionScopeFilter,
    opinionTimeFilter,
    selectedExpertOpinionGroupId,
  ]);

  const visibleExpertOpinionGroups = expertOpinionGroups;
  const filteredOpinionCount = expertOpinionGroups.reduce((total, group) => total + group.items.length, 0);
  const representedGroupCount = expertOpinionGroups.filter((group) => group.id !== "global").length;

  const toggleGroup = (groupId: string) => {
    setClosedExpertOpinionGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
  };

  const renderExpertCard = (session: (typeof experts)[number]) => (
    <article className="opinion-card" key={session.id}>
      <div className="opinion-head">
        <div className="opinion-meta">
          <span className="date">{session.date}</span>
          <span className="meta-dot" />
          <span className="tag">{session.format}</span>
          <span className="meta-dot" />
          <span className="experts">
            <Users className="h-3.5 w-3.5" />
            <strong>{session.expert}</strong>
          </span>
        </div>
        <div className="opinion-actions">
          {session.attachments.length > 0 ? (
            <div className="relative">
              <button
                className="icon-mini"
                onClick={() =>
                  setOpenExpertAttachmentMenuId((current) => (current === session.id ? null : session.id))
                }
                title="附件"
                type="button"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              {openExpertAttachmentMenuId === session.id ? (
                <div className="document-view-menu absolute right-0 top-full z-20 mt-2 min-w-[260px] rounded-xl p-1">
                  {session.attachments.map((attachment) => (
                    <div className="flex items-center gap-2" key={attachment.id}>
                      <button
                        className="document-view-menu-item min-w-0 flex-1"
                        disabled={!attachment.downloadUrl}
                        onClick={() => {
                          setOpenExpertAttachmentMenuId(null);
                          if (attachment.downloadUrl) {
                            handlePreviewDocument({
                              downloadUrl: attachment.downloadUrl,
                              fileName: attachment.fileName,
                              mimeType: attachment.mimeType,
                            });
                          }
                        }}
                        title={attachment.fileName}
                        type="button"
                      >
                        <span className="block truncate">{attachment.fileName}</span>
                      </button>
                      <button
                        className="team-icon-button opacity-100"
                        disabled={!attachment.downloadUrl}
                        onClick={() => {
                          setOpenExpertAttachmentMenuId(null);
                          handleDownload(attachment.downloadUrl);
                        }}
                        title="下载附件"
                        type="button"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {permissions.canDeleteExpert && isGlobalExpertOpinionView ? (
            <button className="icon-mini" onClick={() => openEditExpert(session)} title="编辑专家意见" type="button">
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
          {permissions.canDeleteExpert ? (
            <button
              className="icon-mini danger"
              onClick={() => removeExpert(session.id, session.topic)}
              title="删除意见"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="opinion-body">
        <div className="opinion-row">
          <span className="label"><span className="dot-color amber" />反馈摘要</span>
          <p className="value">
            {session.summary}
            {session.attachments.length > 0 ? (
              <button
                className="link"
                onClick={() => setOpenExpertAttachmentMenuId((current) => (current === session.id ? null : session.id))}
                type="button"
              >
                <Paperclip className="h-3 w-3" />
                查看附件 ({session.attachments.length})
              </button>
            ) : null}
          </p>
        </div>
        <div className="opinion-row">
          <span className="label"><span className="dot-color emerald" />落实动作</span>
          <p className="value">{session.nextAction}</p>
        </div>
      </div>
    </article>
  );

  return (
    <div className="expert-opinion-retrofit">
      <div className="opinion-page-head">
        <div className="page-head-left">
          <div className="breadcrumb">
            <span>工作台</span>
            <span className="sep">/</span>
            <span className="here">专家意见台账</span>
          </div>
          <h1 className="page-title">专家意见台账</h1>
          <p className="page-desc">按项目组沉淀专家辅导、评审反馈与后续落地动作。组内教师和学生仅可见本组指定的意见。</p>
        </div>
        <button className="btn btn-primary" disabled={!permissions.canUploadExpert} onClick={openCreateExpertModal} type="button">
          <Upload className="h-4 w-4" />
          录入专家意见
        </button>
      </div>

      <div className="opinion-ledger-toolbar">
        <span className="sr-only">分组设置</span>
        <span className="toolbar-label">筛选</span>
        {canUseGlobalExpertOpinionFilters ? (
          <>
            <select
              className="filter-select"
              onChange={(event) => setOpinionScopeFilter(event.target.value as OpinionScopeFilter)}
              value={opinionScopeFilter}
            >
              <option value="all">全部意见</option>
              <option value="assigned">已分配项目组</option>
              <option value="unassigned">待分配</option>
            </select>
            <select
              className="filter-select"
              onChange={(event) => setSelectedExpertOpinionGroupId(event.target.value)}
              value={selectedExpertOpinionGroupId}
            >
              <option value="all">全部项目组</option>
              {baseExpertOpinionGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.title}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <select
          className="filter-select"
          onChange={(event) => setOpinionTimeFilter(event.target.value as OpinionTimeFilter)}
          value={opinionTimeFilter}
        >
          <option value="all">全部时间</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
          <option value="quarter">近三个月</option>
        </select>
        <label className="search-wrap">
          <Search className="search-icon h-4 w-4" />
          <input
            className="search-input"
            onChange={(event) => setExpertOpinionSearch(event.target.value)}
            placeholder="搜索专家或反馈内容..."
            value={expertOpinionSearch}
          />
        </label>
        <span className="toolbar-spacer" />
        <span className="toolbar-meta">
          共 <strong>{filteredOpinionCount}</strong> 条意见 · <strong>{representedGroupCount}</strong> 个项目组
        </span>
      </div>

      <div className="space-y-3">
        {visibleExpertOpinionGroups.map((group) => {
          const isOpen = !closedExpertOpinionGroupIds.includes(group.id);
          const latestDate = group.items[0]?.date;
          return (
            <section className={`opinion-ledger-group ${isOpen ? "open" : ""}`} key={group.id}>
              <button className="group-header" onClick={() => toggleGroup(group.id)} type="button">
                <span className="group-chevron">
                  <ChevronDown className="h-4 w-4" />
                </span>
                <span className="group-name">{group.title}</span>
                <span className={`group-count ${group.items.length === 0 ? "zero" : ""}`}>
                  {group.items.length > 0 ? `${group.items.length} 条意见` : "0 条"}
                </span>
                <span className="group-meta">
                  {group.items.length > 0
                    ? `${group.description} · 最近更新 ${latestDate ?? "-"}`
                    : "暂无专家意见"}
                </span>
              </button>
              {isOpen ? (
                <div className="group-body">
                  {group.items.length > 0 ? (
                    group.items.map(renderExpertCard)
                  ) : (
                    <div className="group-empty">该项目组暂无专家意见，可点击右上角「录入专家意见」按钮添加。</div>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {permissions.canUploadExpert ? (
        <button className="expert-upload-guide mt-4" onClick={openCreateExpertModal} type="button">
          <Upload className="h-5 w-5 text-[#1a6fd4]" />
          <div>
            <p className="text-sm font-medium text-slate-700">录入更多专家意见</p>
            <p className="mt-1 text-xs text-slate-400">继续补充新的专家反馈、附件与落实动作。</p>
          </div>
        </button>
      ) : null}
    </div>
  );
}
