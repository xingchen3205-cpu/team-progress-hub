import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const tab = () => read("src/components/tabs/teacher-training-tab.tsx");

test("发布表单不再渲染已选任务详情卡", () => {
  const source = tab();
  // 不应在发布表单里展示 selectedTask 的说明/状态详情卡。
  assert.doesNotMatch(source, /selectedTask\.releaseStatusLabel[\s\S]{0,200}selectedTask\.description/);
  // 也不应保留“管理者只发布任务”这类废话。
  assert.doesNotMatch(source, /管理者只发布任务/);
});

test("发布表单默认折叠，顶部只显示紧凑操作栏", () => {
  const source = tab();
  assert.match(source, /const \[taskFormOpen, setTaskFormOpen\] = useState\(false\)/);
  // 折叠标题“任务管理”与任务计数、发布入口。
  assert.match(source, />任务管理</);
  assert.match(source, /共 \{selectedCohort\.tasks\.length\} 项任务/);
  // 表单主体包在 taskFormOpen 条件里。
  assert.match(source, /\{taskFormOpen \? \(/);
});

test("点击发布新任务展开空白新建表单", () => {
  const source = tab();
  assert.match(source, /const openNewTaskForm = \(\) => \{[\s\S]{0,160}setTaskDraft\(createDefaultTaskDraft\(\)\)/);
  assert.match(source, /const openNewTaskForm = \(\) => \{[\s\S]{0,160}setTaskFormOpen\(true\)/);
  assert.match(source, /onClick=\{openNewTaskForm\}/);
  // 新建/编辑标题随 taskDraft.id 切换。
  assert.match(source, /\{taskDraft\.id \? "修改任务" : "发布任务"\}/);
});

test("点击修改展开表单、填入数据并平滑滚动", () => {
  const source = tab();
  // editTask 填入现有任务字段并打开表单、滚动。
  assert.match(source, /const editTask = \(task: Workspace\.TeacherTrainingTaskItem\) => \{[\s\S]{0,600}title: task\.title/);
  assert.match(source, /const editTask = \(task: Workspace\.TeacherTrainingTaskItem\) => \{[\s\S]{0,900}setTaskFormOpen\(true\)/);
  assert.match(source, /const editTask = \(task: Workspace\.TeacherTrainingTaskItem\) => \{[\s\S]{0,900}scrollToTaskForm\(\)/);
  assert.match(source, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  // 主按钮在编辑态显示“保存修改”。
  assert.match(source, /\{taskDraft\.id \? "保存修改" : "发布任务"\}/);
});

test("取消新建会清空并收起表单", () => {
  const source = tab();
  assert.match(source, /const cancelTaskForm = \(\) => \{[\s\S]{0,160}setTaskDraft\(createDefaultTaskDraft\(\)\)/);
  assert.match(source, /const cancelTaskForm = \(\) => \{[\s\S]{0,160}setTaskFormOpen\(false\)/);
  assert.match(source, /onClick=\{cancelTaskForm\}/);
  // 取消按钮文案随新建/编辑切换。
  assert.match(source, /\{taskDraft\.id \? "取消修改" : "取消"\}/);
});

test("发布或保存成功后表单清空并收起", () => {
  const source = tab();
  assert.match(
    source,
    /const submitTask = async \(\) => \{[\s\S]{0,400}setTaskDraft\(createDefaultTaskDraft\(\)\);[\s\S]{0,80}setTaskFormOpen\(false\)/,
  );
});

test("发布表单采用横向布局且手机端单列不横向溢出", () => {
  const source = tab();
  // 第一行：名称占两列 + 截止日期；第二行类型 + 开放时间。
  assert.match(source, /grid gap-3 lg:grid-cols-3/);
  assert.match(source, /grid gap-3 lg:grid-cols-2/);
  // 默认单列（无 lg 前缀时堆叠），操作按钮在手机端整行显示。
  assert.match(source, /w-full sm:w-auto/);
});

test("小组任务与截止时间等发布逻辑保持不变", () => {
  const source = tab();
  assert.match(source, /小组任务（每组提交一份）/);
  assert.match(source, /省培任务截止时间/);
  const taskRoute = read("src/app/api/teacher-training/tasks/route.ts");
  // 后端归一化后保存截止时间，小组任务不清空 dueDate。
  assert.match(taskRoute, /dueDate: dueDate \|\| null/);
  assert.doesNotMatch(taskRoute, /taskType === "group"[\s\S]{0,120}dueDate:\s*null/);
});
