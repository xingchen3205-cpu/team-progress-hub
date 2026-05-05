"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { TabKey } from "@/components/workspace-context";

import TabSkeleton from "@/components/tab-skeleton";
import { WorkspaceProvider, useWorkspaceContext } from "@/components/workspace-context";
import { WorkspaceShell } from "@/components/workspace-shell";

const loadOverviewTab = () => import("@/components/tabs/overview-tab");
const loadTimelineTab = () => import("@/components/tabs/timeline-tab");
const loadTasksTab = () => import("@/components/tabs/tasks-tab");
const loadTrainingTab = () => import("@/components/tabs/training-tab");
const loadScheduleTab = () => import("@/components/tabs/schedule-tab");
const loadExpertOpinionTab = () => import("@/components/tabs/expert-opinion-tab");
const loadExpertReviewTab = () => import("@/components/tabs/expert-review-tab");
const loadDocumentsTab = () => import("@/components/tabs/documents-tab");
const loadProjectTab = () => import("@/components/tabs/project-tab");
const loadTeamTab = () => import("@/components/tabs/team-tab");
const loadAssistantTab = () => import("@/components/tabs/assistant-tab");
const loadProfileTab = () => import("@/components/tabs/profile-tab");

const OverviewTab = dynamic(loadOverviewTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const TimelineTab = dynamic(loadTimelineTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const TasksTab = dynamic(loadTasksTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const TrainingTab = dynamic(loadTrainingTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const ScheduleTab = dynamic(loadScheduleTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const ExpertOpinionTab = dynamic(loadExpertOpinionTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const ExpertReviewTab = dynamic(loadExpertReviewTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const DocumentsTab = dynamic(loadDocumentsTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const ProjectTab = dynamic(loadProjectTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const TeamTab = dynamic(loadTeamTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const AssistantTab = dynamic(loadAssistantTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});
const ProfileTab = dynamic(loadProfileTab, {
  loading: () => <TabSkeleton variant="workspace" />,
});

const preloadWorkspaceTabComponents: Record<TabKey, () => Promise<unknown>> = {
  overview: loadOverviewTab,
  timeline: loadTimelineTab,
  board: loadTasksTab,
  training: loadTrainingTab,
  reports: loadScheduleTab,
  experts: loadExpertOpinionTab,
  review: loadExpertReviewTab,
  documents: loadDocumentsTab,
  project: loadProjectTab,
  team: loadTeamTab,
  assistant: loadAssistantTab,
  profile: loadProfileTab,
};

const priorityPreloadTabs: TabKey[] = ["overview", "board", "reports", "documents", "project", "team"];

function WorkspaceDashboardContent() {
  const { safeActiveTab, isActiveTabResourceLoading } = useWorkspaceContext();
  const tabContent = (
    <>
      {safeActiveTab === "overview" && <OverviewTab />}
      {safeActiveTab === "timeline" && <TimelineTab />}
      {safeActiveTab === "board" && <TasksTab />}
      {safeActiveTab === "training" && <TrainingTab />}
      {safeActiveTab === "reports" && <ScheduleTab />}
      {safeActiveTab === "experts" && <ExpertOpinionTab />}
      {safeActiveTab === "review" && <ExpertReviewTab />}
      {safeActiveTab === "documents" && <DocumentsTab />}
      {safeActiveTab === "project" && <ProjectTab />}
      {safeActiveTab === "team" && <TeamTab />}
      {safeActiveTab === "assistant" && <AssistantTab />}
      {safeActiveTab === "profile" && <ProfileTab />}
    </>
  );
  const visibleTabContent = isActiveTabResourceLoading ? <TabSkeleton variant="workspace" /> : tabContent;

  useEffect(() => {
    const preloadTargets = priorityPreloadTabs.filter((tab) => tab !== safeActiveTab).slice(0, 2);
    const preload = () => {
      for (const tab of preloadTargets) {
        void preloadWorkspaceTabComponents[tab]();
      }
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const usedIdleCallback = Boolean(idleWindow.requestIdleCallback);
    const idleHandle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(preload, { timeout: 2000 })
      : window.setTimeout(preload, 2000);

    return () => {
      if (usedIdleCallback && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleHandle);
        return;
      }

      window.clearTimeout(idleHandle);
    };
  }, [safeActiveTab]);

  return (
    <WorkspaceShell
      tabContent={visibleTabContent}
    />
  );
}

export function WorkspaceDashboard({
  activeTab = "overview",
  targetDocumentId = null,
}: {
  activeTab?: TabKey;
  targetDocumentId?: string | null;
}) {
  return (
    <WorkspaceProvider activeTab={activeTab} targetDocumentId={targetDocumentId}>
      <WorkspaceDashboardContent />
    </WorkspaceProvider>
  );
}
