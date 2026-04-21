"use client";

import type { TimelineNodeTone } from "@/components/workspace-context";
import * as Workspace from "@/components/workspace-context";

export default function TimelineTab() {
  const {
    events,
    permissions,
    nearestUpcomingIndex,
    openEventModal,
  } = Workspace.useWorkspaceContext();

  const {
    Pencil,
    Plus,
    surfaceCardClassName,
    subtleCardClassName,
    formatDateTime,
    getTimelinePointStyle,
    getTimelineDateTag,
    SectionHeader,
  } = Workspace;

const renderTimeline = () => (
    <div className="space-y-4">
      <SectionHeader
        description="用横向时间轴统一查看比赛节点推进情况，关键节点会被重点高亮。"
        title="时间进度"
      />

      <section className={surfaceCardClassName}>
        {events.length === 0 ? (
          <p className="text-sm leading-7 text-slate-500">当前还没有时间节点，请先新增比赛关键节点。</p>
        ) : null}
        <div className="timeline-mobile-list md:hidden">
          {events.map((item, index) => {
            const tone: TimelineNodeTone =
              index < nearestUpcomingIndex ? "past" : index === nearestUpcomingIndex ? "current" : "future";
            const { dateLabel, timeLabel } = getTimelineDateTag(item.dateTime);
            const description = item.description.trim().length > 2 ? item.description : "暂无描述，点击编辑补充";

            return (
              <article key={`${item.id}-mobile`} className="timeline-mobile-card">
                <div className={`timeline-mobile-node ${tone}`}>
                  <span className="timeline-mobile-dot" />
                  {index < events.length - 1 ? <span className="timeline-mobile-line" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="timeline-tag">{item.type}</span>
                        <span className="timeline-tag">{dateLabel}</span>
                        <span className="timeline-tag">{timeLabel}</span>
                      </div>
                    </div>
                    <button
                      className="timeline-edit-button"
                      disabled={!permissions.canEditTimeline}
                      onClick={() => openEventModal(item)}
                      title={permissions.canEditTimeline ? "编辑节点" : "无权限"}
                      type="button"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  <p className={`mt-3 text-sm leading-6 ${item.description.trim().length > 2 ? "text-slate-500" : "text-slate-400"}`}>
                    {description}
                  </p>
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

        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <div className="md:min-w-[860px]">
              <div className="timeline-shell relative px-6 pt-8">
                <div className="timeline-axis">
                  {events.slice(0, -1).map((item, index) => {
                    const leftPoint = getTimelinePointStyle(events, index);
                    const rightPoint = getTimelinePointStyle(events, index + 1);
                    const segmentTone =
                      index < nearestUpcomingIndex ? "solid" : "dashed";

                    return (
                      <span
                        className={`timeline-segment ${segmentTone}`}
                        key={`${item.id}-segment`}
                        style={{
                          left: leftPoint.left,
                          width: `calc(${rightPoint.left} - ${leftPoint.left})`,
                        }}
                      />
                    );
                  })}
                  {events.map((item, index) => {
                    const tone: TimelineNodeTone =
                      index < nearestUpcomingIndex ? "past" : index === nearestUpcomingIndex ? "current" : "future";
                    const pointStyle = getTimelinePointStyle(events, index);

                    return (
                      <div key={item.id} className="timeline-point" style={pointStyle}>
                        <div className={`timeline-node ${tone}`}>
                          {tone === "current" ? <span className="timeline-node-ping" /> : null}
                        </div>
                        <p className="timeline-node-title">{item.title}</p>
                        <p className="timeline-node-time">{formatDateTime(item.dateTime)}</p>
                      </div>
                    );
                  })}
                  {permissions.canEditTimeline ? (
                    <button
                      className="timeline-add-button"
                      onClick={() => openEventModal()}
                      title="新增节点"
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {events.map((item) => {
                  const { dateLabel, timeLabel } = getTimelineDateTag(item.dateTime);
                  const description = item.description.trim().length > 2 ? item.description : "暂无描述，点击编辑补充";

                  return (
                  <article key={item.id} className={subtleCardClassName}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-wrap gap-2">
                        <span className="timeline-tag">{item.type}</span>
                        <span className="timeline-tag">{dateLabel}</span>
                        <span className="timeline-tag">{timeLabel}</span>
                      </div>
                      <button
                        className="timeline-edit-button"
                        disabled={!permissions.canEditTimeline}
                        onClick={() => openEventModal(item)}
                        title={permissions.canEditTimeline ? "编辑节点" : "无权限"}
                        type="button"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h3>
                    <p className={`mt-3 text-sm leading-7 ${item.description.trim().length > 2 ? "text-slate-500" : "text-slate-400"}`}>{description}</p>
                  </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  return renderTimeline();
}
