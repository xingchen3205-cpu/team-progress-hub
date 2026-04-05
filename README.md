# 中国国际大学生创新大赛备赛管理系统

基于 Next.js App Router 的备赛协作系统，当前已经接入：

- Next.js API Routes
- Prisma Schema
- SQLite 本地数据库
- JWT + HttpOnly Cookie 登录态
- 角色权限控制（指导教师 / 项目负责人 / 团队成员）

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 初始化环境变量

```bash
cp .env.example .env
```

开发环境至少需要配置：

- `DATABASE_URL`
- `JWT_SECRET`

3. 初始化数据库并写入种子数据

```bash
npm run db:setup
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
- `GET/POST /api/documents`
- `POST /api/documents/[id]/version`
- `PATCH /api/documents/[id]/review`
- `GET/POST /api/team`
- `PATCH/DELETE /api/team/[id]`

## 数据说明

- 任务、公告、汇报、专家意见、文档、团队成员信息现在都会持久化到 `prisma/dev.db`
- 登录态使用 JWT，并写入 HttpOnly Cookie，不再通过 URL 或 localStorage 传角色
- 页面刷新后数据不会丢失

## 生产环境注意

- 当前数据库使用 SQLite，适合本地开发和原型阶段
- 如果继续部署到 Vercel，`prisma/dev.db` 不能作为稳定的生产持久化方案
- 生产部署前必须显式设置 `JWT_SECRET`，不要使用占位值，也不要把真实密钥提交到仓库
- 下一步建议迁移到 PostgreSQL / Neon / Supabase / Turso 这类外部数据库
