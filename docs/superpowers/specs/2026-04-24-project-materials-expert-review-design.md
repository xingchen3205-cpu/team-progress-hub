# 项目管理材料库与专家评审重构设计

日期：2026-04-24

## 目标

把专家评审从“管理员直接创建专家评审包”重构为完整闭环：

1. 管理员先配置项目评审环节。
2. 学生或项目负责人按环节上传本组材料。
3. 本组任意一名指导教师审批通过后，材料进入项目管理材料库。
4. 管理员从材料库选择项目进入网评或路演轮次。
5. 专家按轮次完成一次性锁定评分。
6. 后台和投屏大屏实时展示专家提交状态与分数。

## 核心确认规则

- 项目材料审批：该组任意一名指导教师审批通过即可生效。
- 网评和路演完全分开。
- 管理员可自定义多个评审环节，例如第一轮网络评审、第二轮网络评审、路演答辩。
- 未配置评审环节时，学生端不展示上传入口。
- 网评分数：只打一个总分，范围 0.00 到 100.00，保留两位小数，可选评语。
- 路演分数：只打一个总分，范围 0.00 到 100.00，保留两位小数，不显示评语输入。
- 专家提交评分前必须二次确认。
- 专家确认提交后分数锁定，不能修改、不能撤回。
- 专家端路演界面不展示材料，只展示项目组或项目名称与打分入口。
- 大屏只用于投屏展示当前评审轮次、专家状态和实时分数，不承担编辑操作。

## 角色视图

### 学生 / 项目负责人

入口：新增“项目管理”模块。

能力：

- 只能看到自己所在项目组。
- 只能看到管理员已开放的评审环节。
- 可按环节上传材料。
- 上传后状态为“待指导教师审批”。
- 可查看审批状态、驳回原因和已生效材料。
- 不可查看其他项目组材料。

### 指导教师

入口：项目管理模块。

能力：

- 看到自己绑定项目组的待审批材料。
- 任意一名本组指导教师可审批通过。
- 可驳回并填写原因。
- 审批通过后，材料进入项目组材料库。
- 审批行为记录审批人和时间。

### 管理员 / 校级管理员

入口：项目管理 + 专家评审。

项目管理能力：

- 创建、编辑、关闭评审环节。
- 查看全校项目组材料提交与审批状态。
- 查看每组最终生效材料。

专家评审能力：

- 创建网评或路演轮次。
- 选择参与项目组。
- 网评轮次可从项目管理材料库选择材料。
- 路演轮次只选择项目组，不给专家展示材料。
- 批量选择专家并开放评审权限。
- 设置评审开始时间、截止时间和投屏展示状态。
- 查看专家实时提交状态和分数。
- 锁定或结束当前轮次。

### 专家

入口：专家评审模块。

网评能力：

- 只看到分配给自己的网评任务。
- 可查看项目材料。
- 输入 0.00 到 100.00 的总分。
- 可选写评语。
- 提交前二次确认。
- 提交后锁定。

路演能力：

- 只看到分配给自己的路演任务。
- 不展示计划书、PPT、视频等材料。
- 只展示项目组或项目名称。
- 输入 0.00 到 100.00 的总分。
- 不显示评语输入。
- 提交前二次确认。
- 提交后锁定。

## 数据模型设计

### ProjectReviewStage

表示管理员创建的项目材料提交环节。

字段：

- id
- name：环节名称，如“第一轮网络评审”
- type：online_review | roadshow
- description
- isOpen：是否开放学生上传
- startAt
- deadline
- createdById
- createdAt
- updatedAt

说明：

- type 用于区分该环节未来主要服务于网评还是路演。
- 即使 type 为 roadshow，也允许学生上传路演相关材料供校内归档，但路演专家端不展示材料。

### ProjectMaterialSubmission

表示学生或项目负责人提交的一份材料。

字段：

- id
- stageId
- teamGroupId
- submittedById
- title
- fileName
- filePath
- fileSize
- mimeType
- status：pending | approved | rejected
- approvedById
- approvedAt
- rejectedById
- rejectedAt
- rejectReason
- createdAt
- updatedAt

约束：

- 同一 stageId + teamGroupId 可保留多次提交记录。
- 专家评审选择材料时默认使用该组该环节最新 approved 记录。
- 只有 approved 材料可被选入网评。

### ExpertReviewRound

表示一次正式专家评审轮次。

字段：

- id
- name：如“第一轮网络评审”
- type：online_review | roadshow
- status：draft | active | closed
- startAt
- deadline
- displayEnabled：是否允许大屏展示
- createdById
- createdAt
- updatedAt

说明：

- 替代当前 ExpertReviewPackage 作为轮次维度的上层概念。
- 一个 round 下有多个项目组任务和多个专家分配。

### ExpertReviewRoundProject

表示某个项目组被纳入某一轮评审。

字段：

- id
- roundId
- teamGroupId
- materialSubmissionId：网评必填，路演可为空
- displayOrder
- createdAt

约束：

- roundId + teamGroupId 唯一。
- online_review 类型必须绑定 approved materialSubmissionId。
- roadshow 类型不要求材料。

### ExpertReviewRoundExpert

表示某位专家被分配到某一轮评审。

字段：

- id
- roundId
- expertUserId
- createdAt

约束：

- roundId + expertUserId 唯一。

### ExpertReviewScore

重构评分记录为“专家 + 轮次项目”的一次性总分。

字段：

- id
- roundProjectId
- expertUserId
- scoreCents：整数，保存两位小数。例如 85.50 保存为 8550。
- comment：网评可选，路演为空。
- submittedAt
- lockedAt
- createdAt
- updatedAt

约束：

- roundProjectId + expertUserId 唯一。
- 一旦 submittedAt 或 lockedAt 存在，不允许 update。
- scoreCents 范围 0 到 10000。

## 分数输入规则

前端输入：

- 允许输入整数、一位小数、两位小数。
- 不允许超过两位小数。
- 不允许负数。
- 不允许超过 100。
- 显示时统一格式化为两位小数。

确认弹窗：

- 输入 `85` 时提示：`你输入的分数将按 85.00 提交，请确认小数位为 .00 是否正确。`
- 输入 `85.5` 时提示：`你输入的分数将按 85.50 提交。`
- 输入 `85.50` 时提示：`你输入的分数将按 85.50 提交。`

后端校验：

- 不能只依赖前端。
- 后端必须重新解析并验证小数位。
- 保存为 scoreCents，避免浮点误差。

## API 设计

### 项目管理

- GET /api/project-stages
- POST /api/project-stages
- PUT /api/project-stages/:stageId
- GET /api/project-materials
- POST /api/project-materials
- POST /api/project-materials/:submissionId/approve
- POST /api/project-materials/:submissionId/reject

权限：

- stage 创建/修改：管理员、校级管理员。
- material 上传：项目负责人、团队成员。
- material 审批：本组指导教师、管理员。
- material 查看：本组成员、本组教师、管理员。

### 专家评审

- GET /api/expert-review-rounds
- POST /api/expert-review-rounds
- PUT /api/expert-review-rounds/:roundId
- POST /api/expert-review-rounds/:roundId/projects
- POST /api/expert-review-rounds/:roundId/experts
- GET /api/expert-review-rounds/:roundId/dashboard
- POST /api/expert-review-scores

权限：

- round 管理：管理员、校级管理员。
- score 提交：被分配专家本人。
- dashboard 查看：管理员、校级管理员。
- projection 查看：管理员、校级管理员，可使用只读投屏链接。

## 实时大屏设计

页面：/workspace?tab=review 或独立 /review-screen/:roundId。

显示内容：

- 当前评审轮次名称。
- 当前评审类型：网络评审 / 路演评审。
- 专家头像或编号：专家 1 到专家 N。
- 每位专家提交状态：待评分 / 已提交。
- 当前项目组名称。
- 已提交专家分数。
- 平均分或规则计算后的汇总分。

实时机制：

- 第一版可用轮询，每 3 秒请求 dashboard 接口。
- 后续可升级为 SSE 或 WebSocket。

投屏原则：

- 大屏不显示敏感账号信息。
- 大屏不显示专家评语。
- 大屏不提供编辑操作。
- 大屏布局优先服务 16:9 投影。

## 前端模块拆分

### 项目管理 Tab

组件：

- ProjectStageList
- ProjectMaterialUploader
- ProjectMaterialApprovalQueue
- ProjectMaterialLibrary
- ProjectMaterialStatusBadge

### 专家评审 Tab

管理员组件：

- ExpertReviewRoundList
- ExpertReviewRoundEditor
- RoundProjectPicker
- RoundExpertPicker
- RoundScoreDashboard
- ReviewProjectionLauncher

专家组件：

- ExpertRoundHome
- ExpertOnlineReviewTask
- ExpertRoadshowScoreTask
- ScoreConfirmDialog

投屏组件：

- ReviewProjectionScreen
- ExpertScoreStatusGrid
- ProjectScoreLivePanel

## 迁移策略

现有模型包含 ExpertReviewPackage、ExpertReviewAssignment、ExpertReviewMaterial、ExpertReviewScore。

建议迁移方式：

1. 第一阶段保留旧表，新增项目管理材料表和评审轮次表。
2. 新页面优先使用新模型。
3. 旧 ExpertReviewPackage 只保留兼容读取，不再创建新数据。
4. 数据稳定后再做旧表清理。

这样能降低一次性破坏专家评审现有功能的风险。

## 实施阶段

### 阶段 1：项目管理材料库

交付：

- 数据模型与接口。
- 管理员创建评审环节。
- 学生上传材料。
- 指导教师审批。
- 项目组材料库展示。

验收：

- 未开放环节时学生无法上传。
- 学生只能上传本组材料。
- 任意本组教师审批通过后材料生效。
- 审批通过后材料可在管理员端看到。

### 阶段 2：专家评审轮次重构

交付：

- 网评/路演轮次管理。
- 批量选择项目组。
- 批量选择专家。
- 网评绑定项目材料。
- 路演不展示材料。

验收：

- 专家只看到自己被分配的任务。
- 网评能看材料。
- 路演只看到项目名称和分数输入。

### 阶段 3：评分锁定与分数规则

交付：

- 0.00 到 100.00 总分输入。
- 两位小数格式化。
- 二次确认。
- 提交后锁定。
- 网评可选评语，路演无评语。

验收：

- 85 保存并展示为 85.00。
- 85.555 被拒绝。
- 提交后不能二次提交或修改。

### 阶段 4：实时后台与投屏大屏

交付：

- 管理员实时分数面板。
- 投屏页面。
- 轮询刷新。

验收：

- 专家提交后 3 秒内后台和大屏更新。
- 大屏只读。
- 大屏可清晰显示专家 1 到专家 N 的提交状态。

## 风险与处理

- 风险：一次性改动专家评审表会影响现有登录专家。
  - 处理：新增模型并兼容旧模型，分阶段切换。
- 风险：材料审批和专家评审耦合过深。
  - 处理：通过 approved materialSubmissionId 连接，避免专家评审直接依赖学生提交草稿。
- 风险：实时大屏复杂度高。
  - 处理：第一版用 3 秒轮询，先保证可用。
- 风险：分数浮点误差。
  - 处理：后端保存整数 scoreCents。

## 不做范围

- 不做专家自主注册。
- 不做评分项配置。
- 不做短信提醒。
- 不做 WebSocket 第一版。
- 不做移动端大屏适配。
