"use client";

import dynamic from "next/dynamic";
import type { TabKey } from "@/components/workspace-context";

import TabSkeleton from "@/components/tab-skeleton";
import { WorkspaceProvider, useWorkspaceContext } from "@/components/workspace-context";
import { WorkspaceShell } from "@/components/workspace-shell";

const OverviewTab = dynamic(() => import("@/components/tabs/overview-tab"), {
  loading: () => <TabSkeleton />,
});
const TimelineTab = dynamic(() => import("@/components/tabs/timeline-tab"), {
  loading: () => <TabSkeleton />,
});
const TasksTab = dynamic(() => import("@/components/tabs/tasks-tab"), {
  loading: () => <TabSkeleton />,
});
const TrainingTab = dynamic(() => import("@/components/tabs/training-tab"), {
  loading: () => <TabSkeleton />,
});
const ScheduleTab = dynamic(() => import("@/components/tabs/schedule-tab"), {
  loading: () => <TabSkeleton />,
});
const ExpertOpinionTab = dynamic(() => import("@/components/tabs/expert-opinion-tab"), {
  loading: () => <TabSkeleton />,
});
const ExpertReviewTab = dynamic(() => import("@/components/tabs/expert-review-tab"), {
  loading: () => <TabSkeleton />,
});
const DocumentsTab = dynamic(() => import("@/components/tabs/documents-tab"), {
  loading: () => <TabSkeleton />,
});
const ProjectTab = dynamic(() => import("@/components/tabs/project-tab"), {
  loading: () => <TabSkeleton />,
});
const TeamTab = dynamic(() => import("@/components/tabs/team-tab"), {
  loading: () => <TabSkeleton />,
});
const AssistantTab = dynamic(() => import("@/components/tabs/assistant-tab"), {
  loading: () => <TabSkeleton />,
});
const ProfileTab = dynamic(() => import("@/components/tabs/profile-tab"), {
  loading: () => <TabSkeleton />,
});

function WorkspaceDashboardContent() {
  const { safeActiveTab } = useWorkspaceContext();

  return (
    <WorkspaceShell
      tabContent={
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
      }
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
