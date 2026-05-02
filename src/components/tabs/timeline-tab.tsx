"use client";

import { useMemo, useState } from "react";

import type { EventItem } from "@/data/demo-data";
import * as Workspace from "@/components/workspace-context";

const isCompletedEvent = (item: EventItem, now: Date) => {
  const timestamp = new Date(item.dateTime).getTime();
  return Number.isFinite(timestamp) && timestamp < now.getTime();
};

const getShortDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "待定";
  }

  return `${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")}`;
};

export default function TimelineTab() {
  const { events, permissions, openEventModal } = Workspace.useWorkspaceContext();
  const {
    ChevronDown,
    ChevronRight,
    Pencil,
    Plus,
    surfaceCardClassName,
    subtleCardClassName,
    formatDateTime,
    getTimelineDateTag,
    SectionHeader,
  } = Workspace;

  const [showCompleted, setShowCompleted] = useState(false);
  const now = useMemo(() => new Date(), []);

  const completedEvents = useMemo(
    () => events.filter((item) => isCompletedEvent(item, now)),
    [events, now],
  );
  const activeEvents = useMemo(
    () => events.filter((item) => !isCompletedEvent(item, now)),
    [events, now],
  );

  const renderEventCard = (item: EventItem, tone: "past" | "current" | "future") => {
    const { dateLabel, timeLabel } = getTimelineDateTag(item.dateTime);
    const description = item.description.trim().length > 2
      ? item.description
      : "暂无描述，点击编辑补充";

    return (
      <article
        className={`${subtleCardClassName} flex min-h-[160px] flex-col`}
        key={item.id}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            <span className={`timeline-status-tag ${tone}`}>{tone === "past" ? "已完成" : tone === "current" ? "进行中" : "待完成"}</span>
            <span className="timeline-tag">{item.type}</span>
            <span className="timeline-tag">{dateLabel}</span>
            <span className="timeline-tag">{timeLabel}</span>
          </div>
          {permissions.canEditTimeline ? (
            <button
              className="timeline-edit-button"
              onClick={() => openEventModal(item)}
              title="编辑节点"
              type="button"
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h3>
        <p className={`mt-3 flex-1 text-sm leading-7 ${item.description.trim().length > 2 ? "text-slate-500" : "text-slate-400"}`}>
          {description}
        </p>
        <p className="mt-4 text-xs text-slate-400">{formatDateTime(item.dateTime)}</p>
      </article>
    );
  };

  const renderActiveTimeline = () => (
    <div className="hidden md:block">
      {activeEvents.length > 0 ? (
        <div className="overflow-x-auto pb-2">
          <div className="timeline-scroll-track">
            {activeEvents.map((item, index) => {
              const tone = index === 0 ? "current" : "future";
              const isLast = index === activeEvents.length - 1;
              const title = `${item.title} · ${formatDateTime(item.dateTime)}`;

              return (
                <div className="timeline-step" key={item.id} title={title}>
                  <div className="timeline-step-rail">
                    {index > 0 ? <span className="timeline-step-connector left dashed" /> : null}
                    <div className={`timeline-node ${tone}`}>
                      {tone === "current" ? <span className="timeline-node-ping" /> : null}
                    </div>
                    {!isLast ? <span className="timeline-step-connector right dashed" /> : null}
                  </div>
                  <p className="timeline-step-title">{item.title}</p>
                  <p className="timeline-step-date">{getShortDate(item.dateTime)}</p>
                </div>
              );
            })}
            {permissions.canEditTimeline ? (
              <button
                className="timeline-add-button timeline-add-button-inline"
                onClick={() => openEventModal()}
                title="新增节点"
                type="button"
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-center text-sm text-slate-500">
          后续暂无待完成节点，可展开已完成区域查看历史安排。
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        description="用横向时间轴统一查看比赛节点推进情况，已过期节点默认收起，当前节点保持重点高亮。"
        title="时间进度"
      />

      <section className={surfaceCardClassName}>
        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-center text-sm text-slate-500">
            {permissions.canEditTimeline ? "当前还没有时间节点，请先新增比赛关键节点。" : "当前还没有时间节点。"}
          </div>
        ) : null}

        {completedEvents.length > 0 ? (
          <div className="mb-6 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <button
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
              onClick={() => setShowCompleted((current) => !current)}
              type="button"
            >
              {showCompleted ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span>已完成 ({completedEvents.length}个节点)</span>
            </button>
            {showCompleted ? (
              <div className="mt-4 grid grid-cols-1 gap-4 opacity-60 md:grid-cols-2 xl:grid-cols-3">
                {completedEvents.map((item) => renderEventCard(item, "past"))}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeEvents.length > 0 ? (
          <div className="space-y-6">
            {renderActiveTimeline()}
            <div className="timeline-mobile-list md:hidden">
              {activeEvents.map((item, index) => {
                const tone = index === 0 ? "current" : "future";
                return (
                  <article key={`${item.id}-mobile`} className="timeline-mobile-card">
                    <div className={`timeline-mobile-node ${tone}`}>
                      <span className="timeline-mobile-dot" />
                      {index < activeEvents.length - 1 ? <span className="timeline-mobile-line" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      {renderEventCard(item, tone)}
                    </div>
                  </article>
                );
              })}
              {permissions.canEditTimeline ? (
                <button
                  className="timeline-mobile-add"
                  onClick={() => openEventModal()}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  <span>新增节点</span>
                </button>
              ) : null}
            </div>
            <div className="hidden md:grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeEvents.map((item, index) => renderEventCard(item, index === 0 ? "current" : "future"))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
