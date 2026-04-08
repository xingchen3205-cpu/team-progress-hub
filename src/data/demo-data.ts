export type RoleKey = "admin" | "teacher" | "leader" | "member" | "expert";

export type ApprovalStatusKey = "pending" | "approved";

export type TeamRoleLabel = "系统管理员" | "指导教师" | "项目负责人" | "团队成员" | "评审专家";

export type TeamMember = {
  id: string;
  slug: string;
  name: string;
  account: string;
  accountHidden?: boolean;
  avatar: string;
  avatarUrl?: string | null;
  teamGroupId?: string | null;
  teamGroupName?: string | null;
  systemRole: TeamRoleLabel;
  role: string;
  responsibility: string;
  progress: string;
  approvalStatus?: ApprovalStatusKey;
  approvalStatusLabel?: "待审核" | "已通过";
  pendingApproverLabel?: string | null;
  canBeManagedByLeader: boolean;
  todayFocus: string;
  completed: string;
  blockers: string;
};

export type TeamGroupItem = {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
  createdAt: string;
};

export type BoardTask = {
  id: string;
  title: string;
  status: "todo" | "doing" | "review" | "archived";
  statusKey?: "todo" | "doing" | "review" | "archived" | "done";
  assigneeId?: string | null;
  creatorId?: string;
  reviewerId?: string | null;
  teamGroupId?: string | null;
  teamGroupName?: string | null;
  assignee?: {
    id: string;
    name: string;
    avatar: string;
    roleLabel: TeamRoleLabel;
  } | null;
  creator?: {
    id: string;
    name: string;
    avatar: string;
    roleLabel: TeamRoleLabel;
  } | null;
  reviewer?: {
    id: string;
    name: string;
    avatar: string;
    roleLabel: TeamRoleLabel;
  } | null;
  dueDate: string;
  priority: "高优先级" | "中优先级" | "低优先级" | "进行中" | "待验收" | "已归档";
  completionNote?: string;
  rejectionReason?: string;
  acceptedAt?: string | null;
  submittedAt?: string | null;
  archivedAt?: string | null;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: string;
    uploaderId: string;
    uploaderName: string;
    downloadUrl: string;
  }>;
};

export type ReportEntry = {
  memberId: string;
  date?: string;
  submittedAt: string;
  summary: string;
  nextPlan: string;
  attachment: string;
};

export type DocumentVersion = {
  id?: string;
  version: string;
  uploadedAt: string;
  uploader: string;
  uploaderId?: string;
  note: string;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  downloadUrl?: string;
};

export type DocumentItem = {
  id: string;
  name: string;
  category: string;
  ownerId: string;
  status:
    | "待负责人审批"
    | "待教师终审"
    | "终审通过"
    | "负责人打回"
    | "教师打回";
  statusKey?: "pending" | "leader_approved" | "approved" | "leader_revision" | "revision";
  comment: string;
  currentVersion: string;
  currentFileName?: string;
  currentFilePath?: string;
  currentFileSize?: number;
  currentMimeType?: string;
  downloadUrl?: string;
  versions: DocumentVersion[];
};

export type NotificationItem = {
  id: string;
  documentId?: string | null;
  title: string;
  detail: string;
  type: string;
  targetTab?: string | null;
  relatedId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  recipient?: {
    id: string;
    name: string;
    avatar: string;
    avatarUrl?: string | null;
    roleLabel: TeamRoleLabel;
  } | null;
  sender?: {
    id: string;
    name: string;
    avatar: string;
    avatarUrl?: string | null;
    roleLabel: TeamRoleLabel;
  } | null;
};

export type Announcement = {
  id: string;
  title: string;
  detail: string;
};

export type EventItem = {
  id: string;
  title: string;
  dateTime: string;
  type: string;
  description: string;
};

export type ExpertItem = {
  id: string;
  date: string;
  expert: string;
  topic: string;
  format: string;
  summary: string;
  nextAction: string;
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    downloadUrl?: string | null;
  }>;
};

export type ExpertReviewAssignmentItem = {
  id: string;
  packageId: string;
  targetName: string;
  roundLabel: string;
  overview: string;
  deadline: string | null;
  status: "待评审" | "已提交" | "已锁定";
  statusKey: "pending" | "completed" | "locked";
  canEdit: boolean;
  expert: {
    id: string;
    name: string;
    avatar: string;
    avatarUrl?: string | null;
    roleLabel: TeamRoleLabel;
  };
  materials: {
    plan: {
      id: string;
      name: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      previewUrl: string;
    } | null;
    ppt: {
      id: string;
      name: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      previewUrl: string;
    } | null;
    video: {
      id: string;
      name: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      previewUrl: string;
    } | null;
  };
  score: {
    id: string;
    scorePersonalGrowth: number;
    scoreInnovation: number;
    scoreIndustry: number;
    scoreTeamwork: number;
    totalScore: number;
    commentTotal: string;
    submittedAt: string;
    updatedAt: string;
    lockedAt: string | null;
  } | null;
};

export type TrainingQuestionItem = {
  id: string;
  category: string;
  question: string;
  answerPoints: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type TrainingSessionItem = {
  id: string;
  title: string;
  durationSeconds: number;
  overtimeSeconds: number;
  qaTotal: number;
  qaHit: number;
  qaHitRate: number;
  notes: string;
  createdByName: string;
  createdAt: string;
};

export type TrainingStats = {
  questionCount: number;
  sessionCount: number;
  averageOvertimeSeconds: number;
  qaHitRate: number;
};

export const roleLabels: Record<RoleKey, TeamRoleLabel> = {
  admin: "系统管理员",
  teacher: "指导教师",
  leader: "项目负责人",
  member: "团队成员",
  expert: "评审专家",
};

export const dashboardHighlights = [
  {
    label: "团队成员",
    value: "7 人",
    description: "覆盖教师、队长及 5 名核心团队成员。",
  },
  {
    label: "今日待处理",
    value: "11 项",
    description: "集中在答辩打磨、文档修订和节点彩排准备。",
  },
  {
    label: "本周汇报",
    value: "5 / 7",
    description: "已有 5 名成员提交当日汇报，2 名成员待提交。",
  },
  {
    label: "文档版本",
    value: "31 份",
    description: "计划书、PPT、答辩材料和证明附件持续迭代中。",
  },
];

export const initialAnnouncements: Announcement[] = [
  {
    id: "notice-1",
    title: "4 月 8 日进行校内终审彩排",
    detail: "请所有成员于 2026 年 4 月 7 日 20:00 前完成最终版材料上传。",
  },
  {
    id: "notice-2",
    title: "专家复盘纪要已更新",
    detail: "市场规模表达和商业模式页需要统一口径，请任务负责人今晚同步改版。",
  },
  {
    id: "notice-3",
    title: "答辩视频素材补采安排",
    detail: "技术演示镜头将于 2026 年 4 月 6 日 15:00 在实验室集中补录。",
  },
];

export const todayTaskSummary = [
  "完成路演 PPT 第 7-12 页重构并过一轮审核",
  "将专家反馈拆解为可执行任务并同步到负责人",
  "整理答辩视频素材与最新证明材料到文档中心",
];

export const initialEvents: EventItem[] = [
  {
    id: "event-1",
    title: "校内终审彩排",
    dateTime: "2026-04-08T18:00:00+08:00",
    type: "彩排",
    description: "全队按照正式答辩流程完成一轮演练，重点检查时间节奏与问答分工。",
  },
  {
    id: "event-2",
    title: "终版材料提交",
    dateTime: "2026-04-12T12:00:00+08:00",
    type: "提交",
    description: "上传计划书、PPT、答辩视频、附件证明和签字盖章材料。",
  },
  {
    id: "event-3",
    title: "省赛线上答辩",
    dateTime: "2026-04-20T14:30:00+08:00",
    type: "答辩",
    description: "项目进行 8 分钟路演展示和 7 分钟专家问答。",
  },
  {
    id: "event-4",
    title: "全国赛冲刺周启动",
    dateTime: "2026-05-06T10:00:00+08:00",
    type: "冲刺",
    description: "同步结果复盘、材料更新和下一轮集训安排。",
  },
];

export const boardColumns = [
  { id: "todo", title: "待分配 / 待接取" },
  { id: "doing", title: "进行中" },
  { id: "review", title: "待验收" },
  { id: "archived", title: "已归档" },
] as const;

export const teamMembers: TeamMember[] = [
  {
    id: "teacher-1",
    slug: "li-teacher",
    name: "李老师",
    account: "teacher@competition.cn",
    avatar: "李",
    systemRole: "指导教师",
    role: "指导教师",
    responsibility: "把关方向、审核文档、发布公告和校内资源协调",
    progress: "总览",
    canBeManagedByLeader: false,
    todayFocus: "审核终版材料并发布节点提醒",
    completed: "完成本周关键节点梳理和任务优先级确认。",
    blockers: "等待学生团队上传最新盖章材料。",
  },
  {
    id: "leader-1",
    slug: "chen-siyuan",
    name: "陈思远",
    account: "captain@competition.cn",
    avatar: "陈",
    systemRole: "项目负责人",
    role: "队长 / 项目负责人",
    responsibility: "整体统筹、路演主线、答辩分工、任务推进",
    progress: "90%",
    canBeManagedByLeader: false,
    todayFocus: "梳理最终路演主线与答辩话术",
    completed: "完成路演第 1-8 页重构，统一商业故事线。",
    blockers: "等待财务模型和市场数据口径最终确认。",
  },
  {
    id: "member-1",
    slug: "lin-muqing",
    name: "林沐晴",
    account: "member@competition.cn",
    avatar: "林",
    systemRole: "团队成员",
    role: "市场研究",
    responsibility: "市场规模、用户访谈、竞品分析",
    progress: "82%",
    canBeManagedByLeader: true,
    todayFocus: "补充竞品对比与用户访谈证据",
    completed: "新增 12 份访谈摘要，优化竞品对比矩阵。",
    blockers: "还缺一个 B 端客户试点反馈截图。",
  },
  {
    id: "member-2",
    slug: "zhao-yihang",
    name: "赵一航",
    account: "tech@competition.cn",
    avatar: "赵",
    systemRole: "团队成员",
    role: "技术负责人",
    responsibility: "系统架构、技术 Demo、视频录制",
    progress: "76%",
    canBeManagedByLeader: true,
    todayFocus: "准备技术方案页与演示环境",
    completed: "完成核心流程 Demo 录屏，补充系统架构图。",
    blockers: "演示服务器稳定性需要再压测一次。",
  },
  {
    id: "member-3",
    slug: "zhou-kexin",
    name: "周可欣",
    account: "finance@competition.cn",
    avatar: "周",
    systemRole: "团队成员",
    role: "财务与商业化",
    responsibility: "收入预测、成本结构、融资逻辑",
    progress: "73%",
    canBeManagedByLeader: true,
    todayFocus: "修订三年收入预测与成本结构",
    completed: "重做单位经济模型，增加现金流敏感性分析。",
    blockers: "需要确认第二年渠道费用假设。",
  },
  {
    id: "member-4",
    slug: "fang-zhiyuan",
    name: "方致远",
    account: "coach@competition.cn",
    avatar: "方",
    systemRole: "团队成员",
    role: "答辩教练",
    responsibility: "问题题库、演练安排、纪要跟进",
    progress: "69%",
    canBeManagedByLeader: true,
    todayFocus: "整理模拟答辩题库并分配演练角色",
    completed: "汇总 32 个高频评委提问并分类。",
    blockers: "等待专家补充更尖锐的追问样例。",
  },
  {
    id: "member-5",
    slug: "liu-jianing",
    name: "刘嘉宁",
    account: "docs@competition.cn",
    avatar: "刘",
    systemRole: "团队成员",
    role: "材料管理员",
    responsibility: "文件归档、版本控制、证明材料汇总",
    progress: "84%",
    canBeManagedByLeader: true,
    todayFocus: "归档计划书和证明材料终版",
    completed: "更新命名规范并补录版本变化说明。",
    blockers: "等待老师签字扫描件。",
  },
];

export const initialBoardTasks: BoardTask[] = [
  {
    id: "task-1",
    title: "补全市场规模测算页",
    status: "todo",
    assigneeId: "member-1",
    dueDate: "2026-04-06 21:00",
    priority: "高优先级",
  },
  {
    id: "task-2",
    title: "整理校内终审讲稿提词版",
    status: "todo",
    assigneeId: "leader-1",
    dueDate: "2026-04-07 18:00",
    priority: "高优先级",
  },
  {
    id: "task-3",
    title: "更新系统架构图和性能数据",
    status: "doing",
    assigneeId: "member-2",
    dueDate: "2026-04-06 23:00",
    priority: "进行中",
  },
  {
    id: "task-4",
    title: "财务模型保守版测算",
    status: "doing",
    assigneeId: "member-3",
    dueDate: "2026-04-07 12:00",
    priority: "进行中",
  },
  {
    id: "task-5",
    title: "合并专家反馈清单",
    status: "archived",
    assigneeId: "member-4",
    dueDate: "2026-04-05 17:00",
    priority: "已归档",
  },
  {
    id: "task-6",
    title: "上传演示录屏 v3",
    status: "archived",
    assigneeId: "member-2",
    dueDate: "2026-04-05 15:30",
    priority: "已归档",
  },
];

export const reportDates = ["2026-04-05", "2026-04-04", "2026-04-03"];

export const reportEntriesByDate: Record<string, ReportEntry[]> = {
  "2026-04-05": [
    {
      memberId: "leader-1",
      submittedAt: "09:20",
      summary: "完成路演前 8 页重构，重新梳理开场叙事和价值主张。",
      nextPlan: "晚上带队进行一轮 8 分钟压缩演练。",
      attachment: "路演讲稿-v4.docx",
    },
    {
      memberId: "member-1",
      submittedAt: "10:05",
      summary: "补充用户画像和竞品矩阵，准备市场规模测算新版本。",
      nextPlan: "补录 2 个客户访谈截图并同步到 PPT。",
      attachment: "用户访谈摘要.pdf",
    },
    {
      memberId: "member-2",
      submittedAt: "11:10",
      summary: "完成核心流程录屏并补了技术架构图关键节点说明。",
      nextPlan: "继续压测演示环境，确保答辩现场稳定运行。",
      attachment: "demo-recording-v3.mp4",
    },
    {
      memberId: "member-3",
      submittedAt: "13:40",
      summary: "重算三年收入预测与成本结构，准备保守版财务模型。",
      nextPlan: "与队长确认最终财务话术和数据边界。",
      attachment: "finance-model-v6.xlsx",
    },
    {
      memberId: "member-5",
      submittedAt: "15:15",
      summary: "归档计划书终版与证明材料，补充版本命名说明。",
      nextPlan: "继续补录签字扫描件并上传新版本。",
      attachment: "材料归档说明.md",
    },
  ],
  "2026-04-04": [
    {
      memberId: "leader-1",
      submittedAt: "18:20",
      summary: "完成专家反馈拆解，确认第二轮修改优先级。",
      nextPlan: "推动路演故事线集中优化。",
      attachment: "任务拆解清单.xlsx",
    },
    {
      memberId: "member-1",
      submittedAt: "17:50",
      summary: "整理客户访谈证据并输出竞品矩阵对照版。",
      nextPlan: "补齐市场规模图表。",
      attachment: "竞品矩阵-v3.pdf",
    },
    {
      memberId: "member-4",
      submittedAt: "20:10",
      summary: "汇总 32 个高频问题并整理答辩角色分工。",
      nextPlan: "组织一轮模拟问答演练。",
      attachment: "答辩题库.xlsx",
    },
  ],
  "2026-04-03": [
    {
      memberId: "leader-1",
      submittedAt: "19:00",
      summary: "与老师开会确认材料提交节奏和时间节点。",
      nextPlan: "同步全队更新后的冲刺安排。",
      attachment: "会议纪要.docx",
    },
    {
      memberId: "member-2",
      submittedAt: "18:40",
      summary: "完成系统核心链路演示，输出录屏脚本。",
      nextPlan: "继续打磨技术图页。",
      attachment: "录屏脚本.md",
    },
  ],
};

export const initialExpertSessions: ExpertItem[] = [
  {
    id: "expert-1",
    date: "2026-04-04",
    expert: "王教授",
    topic: "商业模式与竞争壁垒",
    format: "线下辅导",
    summary: "建议不要平铺讲功能，要更突出单点场景切入和不可替代性。",
    nextAction: "重写第 3 页价值主张和第 6 页商业闭环示意图。",
    attachments: [
      { id: "expert-1-attachment-1", fileName: "批注版PPT.pdf" },
      { id: "expert-1-attachment-2", fileName: "会议照片.jpg" },
    ],
  },
  {
    id: "expert-2",
    date: "2026-04-03",
    expert: "刘总",
    topic: "融资逻辑与财务模型",
    format: "腾讯会议",
    summary: "收入预测需要和获客方式一一对应，避免跳跃式增长。",
    nextAction: "补充渠道转化率假设说明，并准备更保守的备用版本。",
    attachments: [{ id: "expert-2-attachment-1", fileName: "财务建议清单.docx" }],
  },
  {
    id: "expert-3",
    date: "2026-04-01",
    expert: "张老师",
    topic: "答辩节奏与评委视角",
    format: "线上点评",
    summary: "技术亮点需要提前，让评委在 90 秒内理解核心创新点。",
    nextAction: "压缩团队介绍篇幅，将技术优势提前到开篇部分。",
    attachments: [
      { id: "expert-3-attachment-1", fileName: "答辩问题库.xlsx" },
      { id: "expert-3-attachment-2", fileName: "录屏回放链接" },
    ],
  },
];

export const documentCategories = ["计划书", "PPT", "答辩材料", "证明附件"] as const;

export const initialDocuments: DocumentItem[] = [
  {
    id: "doc-1",
    name: "商业计划书",
    category: "计划书",
    ownerId: "leader-1",
    status: "待教师终审",
    statusKey: "leader_approved",
    comment: "项目负责人已完成初审，等待老师确认市场规模表达和商业闭环页。",
    currentVersion: "v5.2",
    versions: [
      {
        version: "v5.2",
        uploadedAt: "2026-04-05 14:20",
        uploader: "陈思远",
        note: "合并专家反馈后的终审版。",
      },
      {
        version: "v5.1",
        uploadedAt: "2026-04-04 19:00",
        uploader: "陈思远",
        note: "补充市场规模与商业闭环。",
      },
    ],
  },
  {
    id: "doc-2",
    name: "决赛路演 PPT",
    category: "PPT",
    ownerId: "member-2",
    status: "教师打回",
    statusKey: "revision",
    comment: "教师建议前置技术亮点页，并统一字体层级后重新提交。",
    currentVersion: "v7.0",
    versions: [
      {
        version: "v7.0",
        uploadedAt: "2026-04-05 16:30",
        uploader: "赵一航",
        note: "加入性能测试图和录屏封面。",
      },
      {
        version: "v6.5",
        uploadedAt: "2026-04-04 22:05",
        uploader: "赵一航",
        note: "调整路演结构并压缩页面数量。",
      },
    ],
  },
  {
    id: "doc-3",
    name: "答辩题库与回答稿",
    category: "答辩材料",
    ownerId: "member-4",
    status: "终审通过",
    statusKey: "approved",
    comment: "问题分类清晰，可继续迭代老师追问版本。",
    currentVersion: "v3.1",
    versions: [
      {
        version: "v3.1",
        uploadedAt: "2026-04-04 21:10",
        uploader: "方致远",
        note: "新增市场、技术、财务三类追问。",
      },
      {
        version: "v3.0",
        uploadedAt: "2026-04-03 20:40",
        uploader: "方致远",
        note: "整理第一版高频问题库。",
      },
    ],
  },
  {
    id: "doc-4",
    name: "专利与证明附件包",
    category: "证明附件",
    ownerId: "member-5",
    status: "负责人打回",
    statusKey: "leader_revision",
    comment: "负责人要求补充签字版扫描件后再提交教师终审。",
    currentVersion: "v2.4",
    versions: [
      {
        version: "v2.4",
        uploadedAt: "2026-04-05 09:45",
        uploader: "刘嘉宁",
        note: "新增专利授权通知与校级奖项证明。",
      },
      {
        version: "v2.2",
        uploadedAt: "2026-04-03 17:20",
        uploader: "刘嘉宁",
        note: "整理现有附件并统一命名。",
      },
    ],
  },
];
