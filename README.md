# 中国国际大学生创新大赛备赛管理系统

基于 Next.js 的比赛备赛管理原型，包含登录页、角色权限工作台、时间进度、任务看板、日程汇报、专家意见、文档中心和团队管理。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看页面。

## 测试账号

仅用于本地演示和开发调试，不要用于生产环境。

- 指导教师：`teacher@competition.cn / teacher123`
- 项目负责人：`captain@competition.cn / leader123`
- 团队成员：`member@competition.cn / member123`

## 当前说明

- 登录成功后会把演示角色信息保存到浏览器 `localStorage`，工作台会从本地读取登录态。
- 所有任务、公告、汇报、文档与团队数据当前都是演示模式，刷新页面后会重置。
- 项目已部署到 Vercel，可继续接入真实登录、数据库和文件存储。
