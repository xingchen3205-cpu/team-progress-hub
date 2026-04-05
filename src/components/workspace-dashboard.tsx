"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BellPlus,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  FileCheck,
  FolderOpen,
  GripVertical,
  Home,
  KanbanSquare,
  LogOut,
  MessageSquareText,
  Plus,
  Timer,
  Upload,
  Users,
} from "lucide-react";

import type {
  Announcement,
  BoardTask,
  DocumentItem,
  EventItem,
  ExpertItem,
  ReportEntry,
  RoleKey,
  TeamMember,
  TeamRoleLabel,
} from "@/data/demo-data";
import {
  boardColumns,
  documentCategories,
  roleLabels,
} from "@/data/demo-data";
import { toIsoDateKey } from "@/lib/date";
import {
  documentAcceptAttribute,
  validateUploadMeta,
} from "@/lib/file-policy";

type BoardStatus = (typeof boardColumns)[number]["id"];

type TabKey =
  | "overview"
  | "timeline"
  | "board"
  | "reports"
  | "experts"
  | "documents"
  | "team";

type TabItem = {
  key: TabKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

type TaskDraft = {
  title: string;
  assigneeId: string;
  dueDate: string;
  priority: "高优先级" | "中优先级" | "低优先级";
};

type EventDraft = {
  title: string;
  dateTime: string;
  type: string;
  description: string;
};

type ExpertDraft = {
  date: string;
  expert: string;
  topic: string;
  format: string;
  summary: string;
  nextAction: string;
};

type AnnouncementDraft = {
  title: string;
  detail: string;
};

type TeamDraft = {
  name: string;
  account: string;
  role: TeamRoleLabel;
  responsibility: string;
};

type ReportDraft = {
  summary: string;
  nextPlan: string;
  attachment: string;
};

type DocumentDraft = {
  name: string;
  category: (typeof documentCategories)[number];
  note: string;
  file: File | null;
};

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  avatar: string;
  responsibility: string;
  roleLabel: TeamRoleLabel;
  profile: {
    name: string;
    avatar: string;
    roleLabel: TeamRoleLabel;
  };
};

type ReportEntryWithDate = ReportEntry & {
  date: string;
};

const allTabs: TabItem[] = [
  {
    key: "overview",
    label: "首页概览",
    description: "查看倒计时、今日任务摘要、最新公告和关键统计数据。",
    icon: Home,
  },
  {
    key: "timeline",
    label: "时间进度",
    description: "集中查看比赛、答辩、提交等关键时间节点。",
    icon: Timer,
  },
  {
    key: "board",
    label: "任务看板",
    description: "在待办、进行中、已完成三列之间拖拽调整任务状态。",
    icon: KanbanSquare,
  },
  {
    key: "reports",
    label: "日程汇报",
    description: "按成员与日期查看工作汇报，支持历史记录切换。",
    icon: CalendarDays,
  },
  {
    key: "experts",
    label: "专家意见",
    description: "按时间倒序查看专家反馈与后续落实动作。",
    icon: MessageSquareText,
  },
  {
    key: "documents",
    label: "文档中心",
    description: "分类管理计划书、PPT、答辩材料和证明附件。",
    icon: FolderOpen,
  },
  {
    key: "team",
    label: "团队管理",
    description: "查看成员分工、账号信息和角色配置。",
    icon: Users,
  },
];

const boardColumnStyles: Record<BoardStatus, string> = {
  todo: "border-[#ead7bf] bg-[#fbf7f2]",
  doing: "border-[#d8e6f5] bg-[#f7fbff]",
  done: "border-[#d6e7dc] bg-[#f7fbf8]",
};

const boardBadgeStyles: Record<BoardStatus, string> = {
  todo: "bg-[#f5ead9] text-[#9f6222]",
  doing: "bg-[#e9f2fb] text-[#125e9a]",
  done: "bg-[#e7f4eb] text-[#32734c]",
};

const docStatusStyles: Record<DocumentItem["status"], string> = {
  待审核: "bg-[#fef3c7] text-[#9a6700]",
  已审核: "bg-[#e7f4eb] text-[#32734c]",
  需修改: "bg-[#fee2e2] text-[#b91c1c]",
};

const taskPriorityStyles: Record<TaskDraft["priority"], string> = {
  高优先级: "bg-[#fee2e2] text-[#b91c1c]",
  中优先级: "bg-[#fef3c7] text-[#9a6700]",
  低优先级: "bg-[#e5e7eb] text-[#4b5563]",
};

const rolePermissions = {
  teacher: {
    visibleTabs: ["overview", "timeline", "board", "reports", "experts", "documents", "team"] as TabKey[],
    canPublishAnnouncement: true,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: true,
    canMoveAnyTask: true,
    canSubmitReport: false,
    canViewAllReports: true,
    canUploadExpert: true,
    canUploadDocument: true,
    canReviewDocument: true,
    canManageTeam: true,
    canManageTeacherAccount: true,
    canEditTimeline: true,
  },
  leader: {
    visibleTabs: ["overview", "timeline", "board", "reports", "experts", "documents", "team"] as TabKey[],
    canPublishAnnouncement: true,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: false,
    canMoveAnyTask: true,
    canSubmitReport: true,
    canViewAllReports: true,
    canUploadExpert: true,
    canUploadDocument: true,
    canReviewDocument: false,
    canManageTeam: true,
    canManageTeacherAccount: false,
    canEditTimeline: false,
  },
  member: {
    visibleTabs: ["overview", "timeline", "board", "reports", "experts", "documents"] as TabKey[],
    canPublishAnnouncement: false,
    canCreateTask: false,
    canEditTask: false,
    canDeleteTask: false,
    canMoveAnyTask: false,
    canSubmitReport: true,
    canViewAllReports: false,
    canUploadExpert: false,
    canUploadDocument: true,
    canReviewDocument: false,
    canManageTeam: false,
    canManageTeacherAccount: false,
    canEditTimeline: false,
  },
} as const;

const formatDateTime = (value: string) => {
  const date = new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${month}/${day} ${hours}:${minutes}`;
};

const formatShortDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
};

const getCountdown = (target: string) => {
  const difference = Math.max(new Date(target).getTime() - Date.now(), 0);
  const totalSeconds = Math.floor(difference / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

const getNearestUpcomingIndex = (events: EventItem[]) => {
  const now = Date.now();
  const nextIndex = events.findIndex((item) => new Date(item.dateTime).getTime() >= now);
  return nextIndex === -1 ? events.length - 1 : nextIndex;
};

const defaultTaskDraft = (assigneeId: string): TaskDraft => ({
  title: "",
  assigneeId,
  dueDate: "2026-04-08 18:00",
  priority: "高优先级",
});

const defaultAnnouncementDraft: AnnouncementDraft = {
  title: "",
  detail: "",
};

const defaultEventDraft: EventDraft = {
  title: "",
  dateTime: "2026-04-15T18:00:00+08:00",
  type: "节点",
  description: "",
};

const defaultExpertDraft: ExpertDraft = {
  date: "2026-04-05",
  expert: "",
  topic: "",
  format: "线上点评",
  summary: "",
  nextAction: "",
};

const defaultTeamDraft: TeamDraft = {
  name: "",
  account: "",
  role: "团队成员",
  responsibility: "",
};

const defaultReportDraft: ReportDraft = {
  summary: "",
  nextPlan: "",
  attachment: "",
};

const defaultDocumentDraft: DocumentDraft = {
  name: "",
  category: "计划书",
  note: "",
  file: null,
};

const getDefaultDateKey = () => toIsoDateKey(new Date());

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.message || "请求失败");
  }

  return payload as T;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold text-[#111827]">{title}</h2>
      <p className="text-sm leading-7 text-[#6b7280]">{description}</p>
    </div>
  );
}

function DemoResetNote() {
  return <p className="text-xs leading-6 text-[#94a3b8]">当前数据已保存到本地 SQLite 数据库</p>;
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.35)] p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-[#111827]">{title}</h3>
          <button className="text-sm text-[#6b7280]" onClick={onClose} type="button">
            关闭
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  title,
  variant = "secondary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const className =
    variant === "primary"
      ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
      : variant === "danger"
        ? "bg-[#fee2e2] text-[#b91c1c] hover:bg-[#fecaca]"
        : "bg-[#f8fafc] text-[#4b5563] hover:bg-[#eef2f7]";

  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm transition ${className} ${
        disabled ? "cursor-not-allowed bg-[#e5e7eb] text-[#9ca3af] hover:bg-[#e5e7eb]" : ""
      }`}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? title ?? "无权限" : undefined}
      type="button"
    >
      {children}
    </button>
  );
}

export function WorkspaceDashboard({
  activeTab = "overview",
}: {
  activeTab?: TabKey;
}) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [experts, setExperts] = useState<ExpertItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [reportEntriesByDay, setReportEntriesByDay] = useState<Record<string, ReportEntryWithDate[]>>({});
  const [reportDates, setReportDates] = useState<string[]>([getDefaultDateKey()]);
  const [selectedDate, setSelectedDate] = useState(getDefaultDateKey());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<string[]>([]);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(defaultTaskDraft("leader-1"));

  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraft>(defaultAnnouncementDraft);

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft>(defaultEventDraft);

  const [expertModalOpen, setExpertModalOpen] = useState(false);
  const [expertDraft, setExpertDraft] = useState<ExpertDraft>(defaultExpertDraft);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamDraft, setTeamDraft] = useState<TeamDraft>(defaultTeamDraft);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportDraft, setReportDraft] = useState<ReportDraft>(defaultReportDraft);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(defaultDocumentDraft);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionTargetDocId, setVersionTargetDocId] = useState<string | null>(null);
  const [versionUploadNote, setVersionUploadNote] = useState("");
  const [versionUploadFile, setVersionUploadFile] = useState<File | null>(null);

  const role = currentUser?.role ?? null;
  const currentRole = role ?? "member";
  const currentMemberId = currentUser?.id ?? "";
  const permissions = rolePermissions[currentRole];
  const visibleTabs = allTabs.filter((item) => permissions.visibleTabs.includes(item.key));
  const safeActiveTab =
    visibleTabs.length > 0 && permissions.visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0]?.key ?? "overview";
  const nearestUpcomingIndex = events.length > 0 ? getNearestUpcomingIndex(events) : 0;
  const nearestEvent = events[nearestUpcomingIndex];

  useEffect(() => {
    let isMounted = true;

    const loadWorkspaceData = async () => {
      setLoadError(null);

      try {
        const [mePayload, announcementsPayload, eventsPayload, tasksPayload, reportsPayload, expertsPayload, documentsPayload, teamPayload] =
          await Promise.all([
            requestJson<{ user: CurrentUser }>("/api/auth/me"),
            requestJson<{ announcements: Announcement[] }>("/api/announcements"),
            requestJson<{ events: EventItem[] }>("/api/events"),
            requestJson<{ tasks: BoardTask[] }>("/api/tasks"),
            requestJson<{ dates: string[]; reports: ReportEntryWithDate[] }>("/api/reports"),
            requestJson<{ experts: ExpertItem[] }>("/api/experts"),
            requestJson<{ documents: DocumentItem[] }>("/api/documents"),
            requestJson<{ members: TeamMember[] }>("/api/team"),
          ]);

        if (!isMounted) {
          return;
        }

        const groupedReports = reportsPayload.reports.reduce<Record<string, ReportEntryWithDate[]>>(
          (accumulator, item) => {
            const list = accumulator[item.date] ?? [];
            accumulator[item.date] = [...list, item];
            return accumulator;
          },
          {},
        );

        const nextDates = reportsPayload.dates.length > 0 ? reportsPayload.dates : [getDefaultDateKey()];

        setCurrentUser(mePayload.user);
        setAnnouncements(announcementsPayload.announcements);
        setEvents(eventsPayload.events);
        setTasks(tasksPayload.tasks);
        setExperts(expertsPayload.experts);
        setDocuments(documentsPayload.documents);
        setMembers(teamPayload.members);
        setReportEntriesByDay(groupedReports);
        setReportDates(nextDates);
        setSelectedDate((current) => (nextDates.includes(current) ? current : nextDates[0]));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : "数据加载失败";
        if (message === "未登录") {
          router.replace("/login");
          return;
        }

        setLoadError(message);
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    };

    void loadWorkspaceData();

    return () => {
      isMounted = false;
    };
  }, [reloadToken, router]);

  useEffect(() => {
    if (!nearestEvent) {
      setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCountdown(getCountdown(events[getNearestUpcomingIndex(events)].dateTime));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [events, nearestEvent]);

  const membersMap = useMemo(
    () => Object.fromEntries(members.map((item) => [item.id, item])),
    [members],
  );

  const reportEntries = reportEntriesByDay[selectedDate] ?? [];
  const reportEntryMap = new Map<string, ReportEntry>(reportEntries.map((item) => [item.memberId, item]));
  const firstAssignableMemberId =
    members.find((item) => item.systemRole !== "指导教师")?.id ?? currentMemberId;

  const visibleReportMembers = permissions.canViewAllReports
    ? members.filter((item) => item.systemRole !== "指导教师")
    : members.filter((item) => item.id === currentMemberId);

  const filteredDocuments = selectedCategory
    ? documents.filter((item) => item.category === selectedCategory)
    : documents;

  const getMemberName = (memberId: string) => membersMap[memberId]?.name ?? memberId;

  const dashboardHighlights = [
    {
      label: "团队成员",
      value: `${members.length} 人`,
      description: "覆盖教师、队长及核心团队成员。",
    },
    {
      label: "今日待处理",
      value: `${tasks.filter((item) => item.status !== "done").length} 项`,
      description: "根据当前真实任务状态动态汇总。",
    },
    {
      label: "本日汇报",
      value: `${(reportEntriesByDay[reportDates[0]] ?? []).length} / ${members.filter((item) => item.systemRole !== "指导教师").length}`,
      description: "按当前日期统计已提交的成员汇报数。",
    },
    {
      label: "文档版本",
      value: `${documents.reduce((sum, item) => sum + item.versions.length, 0)} 份`,
      description: "计划书、PPT、答辩材料与证明附件持续迭代中。",
    },
  ];

  const todayTaskSummary = tasks
    .filter((item) => item.status !== "done")
    .slice(0, 3)
    .map((item) => `${item.title} · ${getMemberName(item.assigneeId)}`);

  const canManageMember = (member: TeamMember) => {
    if (!permissions.canManageTeam) {
      return false;
    }
    if (currentRole === "teacher") {
      return true;
    }
    if (currentRole === "leader") {
      return member.canBeManagedByLeader;
    }
    return false;
  };

  const canMoveTask = (task: BoardTask) =>
    permissions.canMoveAnyTask || (currentRole === "member" && task.assigneeId === currentMemberId);

  const refreshWorkspace = () => {
    setReloadToken((current) => current + 1);
  };

  const validateClientFile = (file: File | null) => {
    if (!file) {
      return "请先选择文件";
    }

    return validateUploadMeta({
      fileName: file.name,
      fileSize: file.size,
    });
  };

  const handleDownload = (downloadUrl?: string | null) => {
    if (!downloadUrl) {
      setLoadError("当前文件尚未生成下载链接");
      return;
    }

    window.location.href = downloadUrl;
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    router.push("/login");
    router.refresh();
  };

  const openCreateTaskModal = () => {
    setEditingTaskId(null);
    setTaskDraft(defaultTaskDraft(firstAssignableMemberId));
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (task: BoardTask) => {
    setEditingTaskId(task.id);
    setTaskDraft({
      title: task.title,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate,
      priority:
        task.priority === "进行中" || task.priority === "已完成" ? "高优先级" : task.priority,
    });
    setTaskModalOpen(true);
  };

  const saveTask = async () => {
    if (!taskDraft.title.trim()) {
      return;
    }

    try {
      if (editingTaskId) {
        await requestJson(`/api/tasks/${editingTaskId}`, {
          method: "PATCH",
          body: JSON.stringify(taskDraft),
        });
      } else {
        await requestJson("/api/tasks", {
          method: "POST",
          body: JSON.stringify(taskDraft),
        });
      }

      setTaskDraft(defaultTaskDraft(firstAssignableMemberId));
      setTaskModalOpen(false);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "任务保存失败");
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await requestJson(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "任务删除失败");
    }
  };

  const handleDrop = async (status: BoardStatus) => {
    if (!draggingTaskId) {
      return;
    }

    const task = tasks.find((item) => item.id === draggingTaskId);
    if (!task || !canMoveTask(task)) {
      setDraggingTaskId(null);
      return;
    }

    try {
      await requestJson(`/api/tasks/${draggingTaskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "任务状态更新失败");
    } finally {
      setDraggingTaskId(null);
    }
  };

  const publishAnnouncement = async () => {
    if (!announcementDraft.title.trim() || !announcementDraft.detail.trim()) {
      return;
    }

    try {
      await requestJson("/api/announcements", {
        method: "POST",
        body: JSON.stringify(announcementDraft),
      });
      setAnnouncementDraft(defaultAnnouncementDraft);
      setAnnouncementModalOpen(false);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "公告发布失败");
    }
  };

  const saveReport = async () => {
    if (!reportDraft.summary.trim() || !reportDraft.nextPlan.trim()) {
      return;
    }

    try {
      await requestJson("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          date: selectedDate,
          ...reportDraft,
        }),
      });
      setReportDraft(defaultReportDraft);
      setReportModalOpen(false);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "汇报保存失败");
    }
  };

  const saveEvent = async () => {
    if (!eventDraft.title.trim() || !eventDraft.description.trim()) {
      return;
    }

    try {
      if (editingEventId) {
        await requestJson(`/api/events/${editingEventId}`, {
          method: "PATCH",
          body: JSON.stringify(eventDraft),
        });
      } else {
        await requestJson("/api/events", {
          method: "POST",
          body: JSON.stringify(eventDraft),
        });
      }

      setEventDraft(defaultEventDraft);
      setEditingEventId(null);
      setEventModalOpen(false);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "节点保存失败");
    }
  };

  const openEventModal = (event?: EventItem) => {
    if (event) {
      setEditingEventId(event.id);
      setEventDraft({
        title: event.title,
        dateTime: event.dateTime,
        type: event.type,
        description: event.description,
      });
    } else {
      setEditingEventId(null);
      setEventDraft(defaultEventDraft);
    }
    setEventModalOpen(true);
  };

  const saveExpert = async () => {
    if (!expertDraft.expert.trim() || !expertDraft.topic.trim()) {
      return;
    }

    try {
      await requestJson("/api/experts", {
        method: "POST",
        body: JSON.stringify({
          ...expertDraft,
          attachments: ["纪要附件.pdf"],
        }),
      });
      setExpertDraft(defaultExpertDraft);
      setExpertModalOpen(false);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "专家意见保存失败");
    }
  };

  const toggleDocExpand = (docId: string) => {
    setExpandedDocs((current) =>
      current.includes(docId) ? current.filter((item) => item !== docId) : [...current, docId],
    );
  };

  const openDocumentModal = () => {
    setDocumentDraft(defaultDocumentDraft);
    setDocumentModalOpen(true);
  };

  const saveDocument = async () => {
    const validationError = validateClientFile(documentDraft.file);
    if (validationError) {
      setLoadError(validationError);
      return;
    }

    if (!documentDraft.name.trim()) {
      setLoadError("请填写文档名称");
      return;
    }

    const formData = new FormData();
    formData.set("name", documentDraft.name.trim());
    formData.set("category", documentDraft.category);
    formData.set("note", documentDraft.note.trim());
    formData.set("file", documentDraft.file as File);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message || "文件上传失败");
      }

      setDocumentDraft(defaultDocumentDraft);
      setDocumentModalOpen(false);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "文件上传失败");
    }
  };

  const openVersionUploadModal = (docId: string) => {
    setVersionTargetDocId(docId);
    setVersionUploadFile(null);
    setVersionUploadNote("");
    setVersionModalOpen(true);
  };

  const uploadNewDocumentVersion = async () => {
    if (!permissions.canUploadDocument) {
      return;
    }

    const validationError = validateClientFile(versionUploadFile);
    if (validationError) {
      setLoadError(validationError);
      return;
    }

    if (!versionTargetDocId) {
      setLoadError("未找到需要上传版本的文档");
      return;
    }

    const formData = new FormData();
    formData.set("note", versionUploadNote.trim());
    formData.set("file", versionUploadFile as File);

    try {
      const response = await fetch(`/api/documents/${versionTargetDocId}/version`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message || "文档版本上传失败");
      }

      setVersionUploadFile(null);
      setVersionUploadNote("");
      setVersionTargetDocId(null);
      setVersionModalOpen(false);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "文档版本上传失败");
    }
  };

  const reviewDocument = async (docId: string, status: DocumentItem["status"]) => {
    if (!permissions.canReviewDocument) {
      return;
    }

    try {
      await requestJson(`/api/documents/${docId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "文档审核失败");
    }
  };

  const saveTeamMember = async () => {
    if (!teamDraft.name.trim() || !teamDraft.account.trim()) {
      return;
    }

    try {
      await requestJson("/api/team", {
        method: "POST",
        body: JSON.stringify(teamDraft),
      });
      setTeamDraft(defaultTeamDraft);
      setTeamModalOpen(false);
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "成员创建失败");
    }
  };

  const updateMemberRole = async (memberId: string, roleLabel: TeamRoleLabel) => {
    try {
      await requestJson(`/api/team/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: roleLabel }),
      });
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "角色更新失败");
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      await requestJson(`/api/team/${memberId}`, {
        method: "DELETE",
      });
      refreshWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "成员删除失败");
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="聚焦最近关键节点、今日任务重点、最新公告和核心统计。"
          title="首页概览"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canPublishAnnouncement}
            onClick={() => setAnnouncementModalOpen(true)}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <BellPlus className="h-4 w-4" />
              <span>发布公告</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="rounded-[28px] border border-[#d9e8f8] bg-white p-8 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
        <p className="text-center text-sm font-medium tracking-[0.18em] text-[#2563eb]">最近关键节点</p>
        <h3 className="mt-3 text-center text-[30px] font-bold tracking-[-0.03em] text-[#111827]">
          {nearestEvent?.title ?? "暂未设置关键节点"}
        </h3>
        <p className="mt-3 text-center text-sm text-[#6b7280]">
          {nearestEvent
            ? `${formatDateTime(nearestEvent.dateTime)} · ${nearestEvent.description}`
            : "请先在时间进度中创建比赛关键节点。"}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {[
            { label: "天", value: countdown.days },
            { label: "时", value: countdown.hours },
            { label: "分", value: countdown.minutes },
            { label: "秒", value: countdown.seconds },
          ].map((item) => (
            <article
              key={item.label}
              className="min-w-[104px] rounded-[24px] border border-[#dbeafe] bg-[#eff6ff] px-5 py-5 text-center"
            >
              <p className="text-[32px] font-bold text-[#2563eb] tabular-nums">
                {`${item.value}`.padStart(2, "0")}
              </p>
              <p className="mt-2 text-sm text-[#5f6b7b]">{item.label}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <h3 className="text-base font-semibold text-[#111827]">今日任务摘要</h3>
          <div className="mt-4 space-y-4">
            {todayTaskSummary.length > 0 ? (
              todayTaskSummary.slice(0, 3).map((item, index) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#2563eb] text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-7 text-[#4b5563]">{item}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-[#6b7280]">当前暂无待处理任务。</p>
            )}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <h3 className="text-base font-semibold text-[#111827]">最新公告</h3>
          <div className="mt-4 space-y-4">
            {announcements.slice(0, 2).map((item) => (
              <article key={item.id} className="rounded-[18px] bg-[#f8fafc] p-4">
                <p className="text-sm font-medium text-[#111827]">{item.title}</p>
                <p className="mt-2 text-sm leading-7 text-[#6b7280]">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {dashboardHighlights.map((item) => (
          <article
            key={item.label}
            className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]"
          >
            <h3 className="text-base font-semibold text-[#111827]">{item.label}</h3>
            <p className="mt-4 text-[30px] font-bold tracking-[-0.03em] text-[#111827]">{item.value}</p>
            <p className="mt-3 text-sm leading-7 text-[#6b7280]">{item.description}</p>
          </article>
        ))}
      </section>
    </div>
  );

  const renderTimeline = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="用横向时间轴统一查看比赛节点推进情况，关键节点会被重点高亮。"
          title="时间进度"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canEditTimeline}
            onClick={() => openEventModal()}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>新增节点</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="overflow-x-auto rounded-[28px] border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
        {events.length === 0 ? (
          <p className="text-sm leading-7 text-[#6b7280]">当前还没有时间节点，请先新增比赛关键节点。</p>
        ) : null}
        <div className="min-w-[860px]">
          <div className="relative px-6 pt-8">
            <div className="absolute top-[44px] left-6 right-6 h-[2px] bg-[#d7dee7]" />
            <div className="relative grid grid-cols-4 gap-6">
              {events.map((item, index) => {
                const isPast = index < nearestUpcomingIndex;
                const isCurrent = index === nearestUpcomingIndex;
                const dotClass = isPast
                  ? "bg-[#94a3b8] border-[#94a3b8]"
                  : isCurrent
                    ? "border-[#2563eb] bg-[#2563eb] shadow-[0_0_0_8px_rgba(37,99,235,0.16)]"
                    : "border-[#94a3b8] bg-white";

                return (
                  <div key={item.id} className="relative">
                    <div className="flex flex-col items-center">
                      <div className={`h-5 w-5 rounded-full border-2 ${dotClass}`}>
                        {isCurrent ? (
                          <span className="block h-full w-full animate-ping rounded-full bg-[#2563eb]/40" />
                        ) : null}
                      </div>
                      <p className="mt-4 text-center text-sm font-medium text-[#111827]">{item.title}</p>
                      <p className="mt-2 text-center text-sm text-[#6b7280]">{formatDateTime(item.dateTime)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-4 gap-6">
            {events.map((item) => (
              <article key={item.id} className="rounded-[24px] bg-[#f8fafc] p-5">
                <div className="flex items-start justify-between gap-4">
                  <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm text-[#2563eb]">
                    {item.type}
                  </span>
                  <ActionButton
                    disabled={!permissions.canEditTimeline}
                    onClick={() => openEventModal(item)}
                    title="无权限"
                  >
                    编辑
                  </ActionButton>
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#111827]">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#6b7280]">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  const renderBoard = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="拖拽任务卡片切换状态，任务创建、编辑和删除会依据角色权限开放。"
          title="任务看板"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canCreateTask}
            onClick={openCreateTaskModal}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>新建任务</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="grid items-stretch gap-6 xl:grid-cols-3">
        {boardColumns.map((column) => (
          <div
            key={column.id}
            className={`flex min-h-[560px] flex-col rounded-[24px] border p-5 ${boardColumnStyles[column.id]}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(column.id)}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#111827]">{column.title}</h3>
              <span className="rounded-full bg-white px-3 py-1 text-sm text-[#6b7280]">
                {tasks.filter((task) => task.status === column.id).length}
              </span>
            </div>

            <div className="mt-4 flex-1 space-y-4">
              {tasks
                .filter((task) => task.status === column.id)
                .map((task) => {
                  const assignee = membersMap[task.assigneeId];
                  const canMove = canMoveTask(task);

                  return (
                    <article
                      key={task.id}
                      draggable={canMove}
                      className={`rounded-[20px] border border-[#eef2f7] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${
                        canMove ? "cursor-grab hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]" : ""
                      }`}
                      onDragStart={() => setDraggingTaskId(canMove ? task.id : null)}
                      onDragEnd={() => setDraggingTaskId(null)}
                      title={canMove ? "拖拽可调整状态" : "无权限拖拽该任务"}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-[#94a3b8]" />
                            <h4 className="text-base font-semibold leading-6 text-[#111827]">{task.title}</h4>
                          </div>
                          <p className="mt-2 text-sm text-[#6b7280]">负责人：{assignee?.name}</p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${
                            task.priority in taskPriorityStyles
                              ? taskPriorityStyles[task.priority as TaskDraft["priority"]]
                              : boardBadgeStyles[task.status]
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm text-[#6b7280]">
                        <span>{task.dueDate}</span>
                        <div className="flex items-center gap-2">
                          <ActionButton
                            disabled={!permissions.canEditTask}
                            onClick={() => openEditTaskModal(task)}
                            title="无权限"
                          >
                            编辑
                          </ActionButton>
                          <ActionButton
                            disabled={!permissions.canDeleteTask}
                            onClick={() => deleteTask(task.id)}
                            title="无权限"
                            variant="danger"
                          >
                            删除
                          </ActionButton>
                        </div>
                      </div>
                    </article>
                  );
                })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description={
            permissions.canViewAllReports
              ? "教师和项目负责人可以查看全部成员汇报，未提交成员会被明确标记。"
              : "团队成员只能查看自己的历史汇报，并需按日提交。"
          }
          title="日程汇报"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <label className="text-sm text-[#6b7280]">
            日期：
            <select
              className="ml-2 rounded-full border border-[#d1d9e6] bg-white px-4 py-2 text-sm text-[#111827]"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            >
              {reportDates.map((date) => (
                <option key={date} value={date}>
                  {formatShortDate(date)}
                </option>
              ))}
            </select>
          </label>
          <ActionButton
            disabled={!permissions.canSubmitReport}
            onClick={() => setReportModalOpen(true)}
            title="无权限"
            variant="primary"
          >
            <span>提交汇报</span>
          </ActionButton>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        {visibleReportMembers.map((member) => {
          const report = reportEntryMap.get(member.id);

          return (
            <article
              key={member.id}
              className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-[#111827]">{member.name}</h3>
                  <p className="mt-2 text-sm text-[#6b7280]">{member.systemRole}</p>
                </div>
                {report ? (
                  <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm text-[#2563eb]">
                    已提交 {report.submittedAt}
                  </span>
                ) : (
                  <span className="rounded-full bg-[#fee2e2] px-3 py-1 text-sm text-[#b91c1c]">
                    未提交
                  </span>
                )}
              </div>

              {report ? (
                <>
                  <p className="mt-4 text-sm leading-7 text-[#4b5563]">今日完成：{report.summary}</p>
                  <p className="mt-2 text-sm leading-7 text-[#4b5563]">明日计划：{report.nextPlan}</p>
                  <p className="mt-4 text-sm text-[#94a3b8]">附件：{report.attachment}</p>
                </>
              ) : (
                <p className="mt-4 text-sm leading-7 text-[#6b7280]">
                  该成员在 {formatShortDate(selectedDate)} 尚未提交当日汇报，请及时提醒。
                </p>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );

  const renderExperts = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="按时间倒序沉淀每次专家辅导意见与后续落地动作。"
          title="专家意见"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canUploadExpert}
            onClick={() => setExpertModalOpen(true)}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span>上传专家意见</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="space-y-6">
        {experts.map((session) => (
          <article
            key={session.id}
            className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-[#2563eb]">
                  {session.date} · {session.format}
                </p>
                <h3 className="mt-3 text-base font-semibold text-[#111827]">
                  {session.expert} · {session.topic}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {session.attachments.map((attachment) => (
                  <span
                    key={attachment}
                    className="rounded-full bg-[#f8fafc] px-3 py-1 text-sm text-[#6b7280]"
                  >
                    {attachment}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-[#4b5563]">反馈摘要：{session.summary}</p>
            <p className="mt-2 text-sm leading-7 text-[#4b5563]">落实动作：{session.nextAction}</p>
          </article>
        ))}
      </section>
    </div>
  );

  const renderDocuments = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="点击分类卡片筛选文档，并可查看历史版本、上传新版本和执行审核。"
          title="文档中心"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canUploadDocument}
            onClick={openDocumentModal}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span>上传文档</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {documentCategories.map((category) => {
          const count = documents.filter((item) => item.category === category).length;
          const isActive = selectedCategory === category;

          return (
            <button
              key={category}
              className={`rounded-[24px] border p-6 text-left shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition ${
                isActive
                  ? "border-[#bfdbfe] bg-[#eff6ff]"
                  : "border-[#e5e7eb] bg-white hover:border-[#dbeafe]"
              }`}
              onClick={() => setSelectedCategory((current) => (current === category ? null : category))}
              type="button"
            >
              <h3 className="text-base font-semibold text-[#111827]">{category}</h3>
              <p className="mt-4 text-[28px] font-bold text-[#111827]">{count}</p>
              <p className="mt-3 text-sm leading-7 text-[#6b7280]">点击筛选该分类文档</p>
            </button>
          );
        })}
      </section>

      <section className="space-y-4">
        {filteredDocuments.map((doc) => (
          <article
            key={doc.id}
            className="rounded-[24px] border border-[#e5e7eb] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">{doc.name}</h3>
                <p className="mt-2 text-sm text-[#6b7280]">
                  {doc.category} · 当前版本 {doc.currentVersion} · 上传人 {getMemberName(doc.ownerId)}
                </p>
                <p className="mt-2 text-sm leading-7 text-[#6b7280]">批注：{doc.comment}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-sm ${docStatusStyles[doc.status]}`}>
                  {doc.status}
                </span>
                <ActionButton
                  onClick={() => openVersionUploadModal(doc.id)}
                  disabled={!permissions.canUploadDocument}
                  title="无权限"
                >
                  <span className="inline-flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    <span>上传新版本</span>
                  </span>
                </ActionButton>
                <ActionButton onClick={() => handleDownload(doc.downloadUrl)}>
                  <span className="inline-flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    <span>下载</span>
                  </span>
                </ActionButton>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <ActionButton
                disabled={!permissions.canReviewDocument}
                onClick={() => reviewDocument(doc.id, "已审核")}
                title="无权限"
              >
                <span className="inline-flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  <span>标记已审核</span>
                </span>
              </ActionButton>
              <ActionButton
                disabled={!permissions.canReviewDocument}
                onClick={() => reviewDocument(doc.id, "需修改")}
                title="无权限"
                variant="danger"
              >
                标记需修改
              </ActionButton>
              <button
                className="inline-flex items-center gap-2 text-sm text-[#2563eb]"
                onClick={() => toggleDocExpand(doc.id)}
                type="button"
              >
                {expandedDocs.includes(doc.id) ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    <span>收起历史版本</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span>展开历史版本</span>
                  </>
                )}
              </button>
            </div>

            {expandedDocs.includes(doc.id) ? (
              <div className="mt-4 space-y-3 rounded-[20px] bg-[#f8fafc] p-4">
                {doc.versions.map((version) => (
                  <div
                    key={`${doc.id}-${version.version}`}
                    className="flex flex-col gap-2 rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#111827]">{version.version}</p>
                      <p className="mt-1 text-sm text-[#6b7280]">
                        {version.uploadedAt} · {version.uploader}
                      </p>
                      <p className="mt-1 text-sm text-[#94a3b8]">
                        {version.fileName || "未记录文件名"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-[#6b7280]">{version.note}</p>
                      <ActionButton onClick={() => handleDownload(version.downloadUrl)}>
                        <span className="inline-flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          <span>下载版本</span>
                        </span>
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );

  const renderTeam = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="通过角色下拉框管理团队成员权限，并按当前角色限制操作范围。"
          title="团队管理"
        />
        <div className="flex flex-wrap items-center gap-3">
          <DemoResetNote />
          <ActionButton
            disabled={!permissions.canManageTeam}
            onClick={() => setTeamModalOpen(true)}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>新增成员</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        {members.map((member) => {
          const editable = canManageMember(member);
          const roleDisabled = currentRole !== "teacher" || !editable;

          return (
            <article
              key={member.id}
              className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2563eb] text-base font-semibold text-white">
                  {member.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-[#111827]">{member.name}</h3>
                      <p className="mt-2 text-sm text-[#6b7280]">账号：{member.account}</p>
                    </div>
                    <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm text-[#2563eb]">
                      当前进度 {member.progress}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-[#4b5563]">负责内容：{member.responsibility}</p>

                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                    <label className="text-sm text-[#6b7280]">
                      角色
                      <select
                        className="mt-2 block w-full rounded-xl border border-[#d1d9e6] bg-white px-4 py-2 text-sm text-[#111827] disabled:cursor-not-allowed disabled:bg-[#f3f4f6] disabled:text-[#9ca3af]"
                        disabled={roleDisabled}
                        title={roleDisabled ? "无权限" : undefined}
                        value={member.systemRole}
                        onChange={(event) =>
                          updateMemberRole(member.id, event.target.value as TeamRoleLabel)
                        }
                      >
                        {currentRole === "teacher" ? <option value="指导教师">指导教师</option> : null}
                        {currentRole === "teacher" ? <option value="项目负责人">项目负责人</option> : null}
                        <option value="团队成员">团队成员</option>
                      </select>
                    </label>

                    <ActionButton
                      disabled={!editable}
                      onClick={() => removeMember(member.id)}
                      title="无权限"
                      variant="danger"
                    >
                      删除账号
                    </ActionButton>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );

  const renderContent = () => {
    switch (safeActiveTab) {
      case "overview":
        return renderOverview();
      case "timeline":
        return renderTimeline();
      case "board":
        return renderBoard();
      case "reports":
        return renderReports();
      case "experts":
        return renderExperts();
      case "documents":
        return renderDocuments();
      case "team":
        return renderTeam();
      default:
        return renderOverview();
    }
  };

  if (isBooting) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6fa]">
        <p className="text-sm text-[#6b7280]">正在加载工作台数据...</p>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6fa]">
        <p className="text-sm text-[#6b7280]">登录状态已失效，正在返回登录页...</p>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[#f3f6fa] p-4 md:p-6">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-6 xl:flex-row">
          <aside className="xl:w-[280px] xl:flex-none">
            <div className="rounded-[28px] border border-[#d9e2ec] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
              <div className="pb-2">
                <h1 className="text-[24px] font-bold text-[#111827]">备赛管理中心</h1>
              </div>

              <nav className="mt-5 space-y-2">
                {visibleTabs.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === safeActiveTab;
                  const href =
                    item.key === "overview" ? "/workspace" : `/workspace?tab=${item.key}`;

                  return (
                    <Link
                      key={item.key}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm no-underline transition ${
                        isActive
                          ? "bg-[#2563eb] text-white shadow-[0_10px_20px_rgba(37,99,235,0.22)]"
                          : "text-[#4b5563] hover:bg-[#f8fafc]"
                      }`}
                      href={href}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          <section className="min-w-0 flex-1">
            <header className="border-b border-[#e5e7eb] bg-white px-5 py-4">
              <div className="mx-auto flex max-w-[1200px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-lg font-semibold text-[#111827]">中国国际大学生创新大赛备赛管理系统</p>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3 rounded-full bg-[#f8fafc] px-3 py-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563eb] text-sm font-semibold text-white">
                      {currentUser.profile.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#111827]">{currentUser.profile.name}</p>
                        <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs text-[#2563eb]">
                          {roleLabels[currentRole]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#d1d9e6] px-4 text-sm text-[#4b5563] no-underline hover:bg-[#f8fafc]"
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
            </header>

            <div className="mx-auto mt-6 flex max-w-[1200px] flex-col gap-6">
              {loadError ? (
                <div className="rounded-[20px] border border-[#fecaca] bg-[#fff1f2] px-5 py-4 text-sm text-[#b91c1c]">
                  {loadError}
                </div>
              ) : null}
              {renderContent()}
            </div>
          </section>
        </div>
      </main>

      {taskModalOpen ? (
        <Modal title={editingTaskId ? "编辑任务" : "新建任务"} onClose={() => setTaskModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-[#6b7280]">
              任务名称
              <input
                className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={taskDraft.title}
                onChange={(event) =>
                  setTaskDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-[#6b7280]">
              负责人
              <select
                className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={taskDraft.assigneeId}
                onChange={(event) =>
                  setTaskDraft((current) => ({ ...current, assigneeId: event.target.value }))
                }
              >
                {members
                  .filter((item) => item.systemRole !== "指导教师")
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-[#6b7280]">
                截止时间
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={taskDraft.dueDate}
                  onChange={(event) =>
                    setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-[#6b7280]">
                优先级
                <select
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={taskDraft.priority}
                  onChange={(event) =>
                    setTaskDraft((current) => ({
                      ...current,
                      priority: event.target.value as TaskDraft["priority"],
                    }))
                  }
                >
                  <option value="高优先级">高优先级</option>
                  <option value="中优先级">中优先级</option>
                  <option value="低优先级">低优先级</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <ActionButton onClick={() => setTaskModalOpen(false)}>取消</ActionButton>
              <ActionButton onClick={saveTask} variant="primary">
                保存任务
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {reportModalOpen ? (
        <Modal title="提交日程汇报" onClose={() => setReportModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-[#6b7280]">
              提交日期：{formatShortDate(selectedDate)} · 提交人：{currentUser.profile.name}
            </p>
            <label className="block text-sm text-[#6b7280]">
              今日完成
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={reportDraft.summary}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-[#6b7280]">
              明日计划
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={reportDraft.nextPlan}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, nextPlan: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-[#6b7280]">
              附件
              <input
                className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                placeholder="例如：日报截图.png / 无"
                value={reportDraft.attachment}
                onChange={(event) =>
                  setReportDraft((current) => ({ ...current, attachment: event.target.value }))
                }
              />
            </label>
            <div className="flex justify-end gap-3">
              <ActionButton onClick={() => setReportModalOpen(false)}>取消</ActionButton>
              <ActionButton onClick={saveReport} variant="primary">
                保存汇报
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {announcementModalOpen ? (
        <Modal title="发布公告" onClose={() => setAnnouncementModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-[#6b7280]">
              公告标题
              <input
                className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={announcementDraft.title}
                onChange={(event) =>
                  setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-[#6b7280]">
              公告内容
              <textarea
                className="mt-2 min-h-32 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={announcementDraft.detail}
                onChange={(event) =>
                  setAnnouncementDraft((current) => ({ ...current, detail: event.target.value }))
                }
              />
            </label>
            <div className="flex justify-end gap-3">
              <ActionButton onClick={() => setAnnouncementModalOpen(false)}>取消</ActionButton>
              <ActionButton onClick={publishAnnouncement} variant="primary">
                发布公告
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {eventModalOpen ? (
        <Modal title={editingEventId ? "编辑时间节点" : "新增时间节点"} onClose={() => setEventModalOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm text-[#6b7280]">
              节点标题
              <input
                className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={eventDraft.title}
                onChange={(event) => setEventDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-[#6b7280]">
                时间
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={eventDraft.dateTime}
                  onChange={(event) =>
                    setEventDraft((current) => ({ ...current, dateTime: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-[#6b7280]">
                节点类型
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={eventDraft.type}
                  onChange={(event) => setEventDraft((current) => ({ ...current, type: event.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm text-[#6b7280]">
              节点说明
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={eventDraft.description}
                onChange={(event) =>
                  setEventDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <div className="flex justify-end gap-3">
              <ActionButton onClick={() => setEventModalOpen(false)}>取消</ActionButton>
              <ActionButton onClick={saveEvent} variant="primary">
                保存节点
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {expertModalOpen ? (
        <Modal title="上传专家意见" onClose={() => setExpertModalOpen(false)}>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-[#6b7280]">
                日期
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={expertDraft.date}
                  onChange={(event) => setExpertDraft((current) => ({ ...current, date: event.target.value }))}
                />
              </label>
              <label className="block text-sm text-[#6b7280]">
                形式
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={expertDraft.format}
                  onChange={(event) => setExpertDraft((current) => ({ ...current, format: event.target.value }))}
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-[#6b7280]">
                专家姓名
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={expertDraft.expert}
                  onChange={(event) => setExpertDraft((current) => ({ ...current, expert: event.target.value }))}
                />
              </label>
              <label className="block text-sm text-[#6b7280]">
                主题
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={expertDraft.topic}
                  onChange={(event) => setExpertDraft((current) => ({ ...current, topic: event.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm text-[#6b7280]">
              反馈摘要
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={expertDraft.summary}
                onChange={(event) =>
                  setExpertDraft((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-[#6b7280]">
              后续动作
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={expertDraft.nextAction}
                onChange={(event) =>
                  setExpertDraft((current) => ({ ...current, nextAction: event.target.value }))
                }
              />
            </label>
            <div className="flex justify-end gap-3">
              <ActionButton onClick={() => setExpertModalOpen(false)}>取消</ActionButton>
              <ActionButton onClick={saveExpert} variant="primary">
                保存意见
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {documentModalOpen ? (
        <Modal title="上传文档" onClose={() => setDocumentModalOpen(false)}>
          <div className="space-y-4">
            <p className="rounded-[18px] bg-[#f8fafc] px-4 py-3 text-sm leading-7 text-[#6b7280]">
              仅支持 `.doc`、`.docx`、`.pdf`、`.xls`、`.xlsx`、`.txt`、`.jpg`、`.jpeg`、`.png`，
              单文件最大 20MB；不支持视频、压缩包和 PPT 文件。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-[#6b7280]">
                文档名称
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={documentDraft.name}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-[#6b7280]">
                文档分类
                <select
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={documentDraft.category}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({
                      ...current,
                      category: event.target.value as DocumentDraft["category"],
                    }))
                  }
                >
                  {documentCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm text-[#6b7280]">
              版本说明
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={documentDraft.note}
                onChange={(event) =>
                  setDocumentDraft((current) => ({ ...current, note: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-[#6b7280]">
              选择文件
              <input
                accept={documentAcceptAttribute}
                className="mt-2 block w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const validationError = validateClientFile(file);
                  if (validationError && file) {
                    setLoadError(validationError);
                    event.target.value = "";
                    setDocumentDraft((current) => ({ ...current, file: null }));
                    return;
                  }
                  setDocumentDraft((current) => ({ ...current, file }));
                }}
              />
            </label>
            <div className="flex justify-end gap-3">
              <ActionButton onClick={() => setDocumentModalOpen(false)}>取消</ActionButton>
              <ActionButton onClick={() => void saveDocument()} variant="primary">
                上传文档
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {versionModalOpen ? (
        <Modal title="上传文档新版本" onClose={() => setVersionModalOpen(false)}>
          <div className="space-y-4">
            <p className="rounded-[18px] bg-[#f8fafc] px-4 py-3 text-sm leading-7 text-[#6b7280]">
              仅支持 `.doc`、`.docx`、`.pdf`、`.xls`、`.xlsx`、`.txt`、`.jpg`、`.jpeg`、`.png`，
              单文件最大 20MB；不支持视频、压缩包和 PPT 文件。
            </p>
            <label className="block text-sm text-[#6b7280]">
              版本说明
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={versionUploadNote}
                onChange={(event) => setVersionUploadNote(event.target.value)}
              />
            </label>
            <label className="block text-sm text-[#6b7280]">
              选择文件
              <input
                accept={documentAcceptAttribute}
                className="mt-2 block w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const validationError = validateClientFile(file);
                  if (validationError && file) {
                    setLoadError(validationError);
                    event.target.value = "";
                    setVersionUploadFile(null);
                    return;
                  }
                  setVersionUploadFile(file);
                }}
              />
            </label>
            <div className="flex justify-end gap-3">
              <ActionButton onClick={() => setVersionModalOpen(false)}>取消</ActionButton>
              <ActionButton onClick={() => void uploadNewDocumentVersion()} variant="primary">
                上传新版本
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {teamModalOpen ? (
        <Modal title="新增团队成员" onClose={() => setTeamModalOpen(false)}>
          <div className="space-y-4">
            <p className="rounded-[18px] bg-[#f8fafc] px-4 py-3 text-sm leading-7 text-[#6b7280]">
              新建账号默认初始密码为 `123456`，请成员首次登录后尽快修改。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-[#6b7280]">
                姓名
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={teamDraft.name}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="block text-sm text-[#6b7280]">
                账号
                <input
                  className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                  value={teamDraft.account}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, account: event.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm text-[#6b7280]">
              角色
              <select
                className="mt-2 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                disabled={currentRole !== "teacher"}
                value={teamDraft.role}
                onChange={(event) =>
                  setTeamDraft((current) => ({ ...current, role: event.target.value as TeamRoleLabel }))
                }
              >
                {currentRole === "teacher" ? <option value="指导教师">指导教师</option> : null}
                {currentRole === "teacher" ? <option value="项目负责人">项目负责人</option> : null}
                <option value="团队成员">团队成员</option>
              </select>
            </label>
            <label className="block text-sm text-[#6b7280]">
              负责内容
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d1d9e6] px-4 py-3 text-sm text-[#111827]"
                value={teamDraft.responsibility}
                onChange={(event) =>
                  setTeamDraft((current) => ({ ...current, responsibility: event.target.value }))
                }
              />
            </label>
            <div className="flex justify-end gap-3">
              <ActionButton onClick={() => setTeamModalOpen(false)}>取消</ActionButton>
              <ActionButton onClick={saveTeamMember} variant="primary">
                保存成员
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
