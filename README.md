# 中国国际大学生创新大赛备赛管理系统

基于 Next.js App Router 的备赛协作系统，当前已经接入：

- Next.js API Routes
- Prisma Schema
- Turso 数据库
- JWT + HttpOnly Cookie 登录态
- Cloudflare R2 文档存储
- 角色权限控制（系统管理员 / 指导教师 / 项目负责人 / 团队成员 / 评审专家）

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 初始化环境变量

```bash
cp .env.example .env.local
```

开发环境至少需要配置：

- `DATABASE_URL`（保留为 Prisma CLI 的本地占位值，例如 `file:./prisma/dev.db`）
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `JWT_SECRET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

3. 初始化数据库结构并写入种子数据

```bash
npm run db:setup
```

也可以在完成 `prisma db push` 后单独执行：

```bash
npx tsx prisma/seed.ts
```

4. 启动开发环境

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看页面。

## 测试账号

仅用于本地演示和开发调试，不要用于生产环境。

- 指导教师：`teacher@competition.cn / teacher123`
- 项目负责人：`captain@competition.cn / leader123`
- 团队成员：`member@competition.cn / member123`
- 评审专家：`expertjudge@competition.cn / expert123`

## 已实现后端能力

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET/POST /api/tasks`
- `PATCH/DELETE /api/tasks/[id]`
- `GET/POST /api/reports`
- `GET/POST /api/announcements`
- `GET/POST /api/events`
- `PATCH /api/events/[id]`
- `GET/POST /api/experts`
- `GET/POST /api/expert-reviews/assignments`
- `POST /api/expert-reviews/scores`
- `GET/POST /api/documents`
- `POST /api/documents/[id]/version`
- `PATCH /api/documents/[id]/review`
- `GET/POST /api/team`
- `PATCH/DELETE /api/team/[id]`

## 数据说明

- 任务、公告、汇报、专家意见、文档、团队成员信息现在都会持久化到 Turso
- 登录态使用 JWT，并写入 HttpOnly Cookie，不再通过 URL 或 localStorage 传角色
- 页面刷新后数据不会丢失
- 文档文件会保存到 Cloudflare R2，对象 key 按分类目录组织
- 仅支持上传 `.doc`、`.docx`、`.pdf`、`.xls`、`.xlsx`、`.txt`、`.jpg`、`.jpeg`、`.png`，单文件最大 20MB
- 专家评审采用四大类 100 分量表：个人成长 25 / 项目创新 30 / 产业价值 30 / 团队协作 15
- 专家评审当前策略为：截止前可修改，截止后自动锁定
- 专家评审材料与主文档中心完全分离，管理员创建评审包后可由教师 / 项目负责人补充计划书、路演材料和视频
- 专家账号登录后仅可进入「专家评审」板块，只支持在线查看计划书、路演材料和视频，不提供下载

## 生产环境注意

- 当前默认使用 Turso + Cloudflare R2，部署前需要先在平台侧准备数据库和存储桶
- 生产部署前必须显式设置 `JWT_SECRET`，不要使用占位值，也不要把真实密钥提交到仓库
