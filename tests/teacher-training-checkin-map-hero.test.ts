import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildTeacherTrainingLocationFields,
  clampTeacherTrainingRadiusMeters,
  formatTeacherTrainingLocationSummary,
  hasValidTeacherTrainingCoordinateStrings,
} from "../src/lib/teacher-training-location";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// ---------- 一、地图选点纯逻辑 ----------

test("从 POI 生成地点名称、详细地址、经纬度", () => {
  const fields = buildTeacherTrainingLocationFields({
    name: "明发珍珠泉大酒店",
    district: "南京市浦口区",
    address: "珍珠泉路8号",
    location: { lng: 118.62345, lat: 32.12345 },
  });
  assert.equal(fields.locationName, "明发珍珠泉大酒店");
  assert.equal(fields.address, "南京市浦口区珍珠泉路8号");
  assert.equal(fields.latitude, "32.123450");
  assert.equal(fields.longitude, "118.623450");
});

test("有效范围裁剪到 50-5000 并与后端一致", () => {
  assert.equal(clampTeacherTrainingRadiusMeters(10), 50);
  assert.equal(clampTeacherTrainingRadiusMeters(999999), 5000);
  assert.equal(clampTeacherTrainingRadiusMeters("300"), 300);
  assert.equal(clampTeacherTrainingRadiusMeters("abc"), 500);
});

test("已选地点摘要包含地点、地址与有效范围", () => {
  const summary = formatTeacherTrainingLocationSummary({
    locationName: "明发珍珠泉大酒店",
    address: "南京市浦口区珍珠泉路8号",
    radiusMeters: "300",
  });
  assert.match(summary, /已选择：明发珍珠泉大酒店/);
  assert.match(summary, /珍珠泉路8号/);
  assert.match(summary, /有效范围 300 米/);
  assert.equal(formatTeacherTrainingLocationSummary({}), "尚未选择签到地点");
});

test("坐标字符串有效性判断，排除 0,0 与超范围", () => {
  assert.equal(hasValidTeacherTrainingCoordinateStrings("32.1", "118.6"), true);
  assert.equal(hasValidTeacherTrainingCoordinateStrings("0", "0"), false);
  assert.equal(hasValidTeacherTrainingCoordinateStrings("", ""), false);
  assert.equal(hasValidTeacherTrainingCoordinateStrings("200", "118"), false);
});

// ---------- 一、地图选点组件源码保障 ----------

test("地图选点组件使用环境变量密钥，缺密钥不崩溃且保留当前位置", () => {
  const picker = read("src/components/teacher-training/location-picker.tsx");
  assert.match(picker, /process\.env\.NEXT_PUBLIC_AMAP_KEY/);
  // 密钥不写死。
  assert.doesNotMatch(picker, /key=[0-9a-f]{20,}/i);
  // 缺密钥降级提示与当前位置辅助入口。
  assert.match(picker, /地图服务暂未配置/);
  assert.match(picker, /使用当前位置/);
  // 搜索候选显示名称与地址。
  assert.match(picker, /placeSearchRef/);
  // 支持点击地图与拖动标记选点。
  assert.match(picker, /map\.on\("click"/);
  assert.match(picker, /marker\.on\("dragend"/);
  // 复用系统既有的高精度失败后低精度重试与权限诊断，避免已授权设备误报失败。
  assert.match(picker, /getReliableBrowserPosition/);
  assert.match(picker, /getBrowserGeolocationPermissionState/);
  assert.match(picker, /getBrowserLocationErrorMessage/);
  // 点击地图或使用当前位置时至少保存一个可识别名称，反向地理编码成功后再写回完整地址。
  assert.match(picker, /locationName:\s*fallbackName/);
  assert.match(picker, /locationName:\s*formattedAddress/);
});

test("修改有效范围时地图覆盖圆同步", () => {
  const picker = read("src/components/teacher-training/location-picker.tsx");
  assert.match(picker, /circleRef\.current\?\.setRadius\(radiusMeters\)/);
  assert.match(picker, /\[radiusMeters\]/);
});

test("签到发布表单改用地图选点，不再手填经纬度输入框", () => {
  const tab = read("src/components/tabs/teacher-training-tab.tsx");
  assert.match(tab, /TeacherTrainingLocationPicker/);
  assert.doesNotMatch(tab, /签到地点纬度/);
  assert.doesNotMatch(tab, /签到地点经度/);
});

// ---------- 二、已结束任务补导入 ----------

test("已结束签到任务仍提供导入线上名单入口", () => {
  const tab = read("src/components/tabs/teacher-training-tab.tsx");
  // 每个任务详情都有导入按钮（不按窗口状态隐藏）。
  assert.match(tab, /openExistingCheckInImport\(task\)/);
  assert.match(tab, /导入线上名单/);
});

test("导入预览与写入接口对已结束任务不因窗口关闭返回 403，但校验班次管理权限", () => {
  const preview = read("src/app/api/teacher-training/check-ins/import-preview/route.ts");
  const importRoute = read("src/app/api/teacher-training/check-ins/import/route.ts");
  assert.match(preview, /hasTeacherTrainingCohortManageAccess/);
  assert.match(importRoute, /hasTeacherTrainingCohortManageAccess/);
  // 不因 isActive/窗口状态阻止导入。
  assert.doesNotMatch(preview, /isActive/);
  assert.doesNotMatch(importRoute, /isActive:\s*false/);
});

test("导入不改动已有任务的时间与启用状态，只补 imported 记录", () => {
  const importRoute = read("src/app/api/teacher-training/check-ins/import/route.ts");
  // 已有任务分支不 update 任务本身。
  assert.doesNotMatch(importRoute, /teacherTrainingCheckInTask\.update/);
  assert.match(importRoute, /status:\s*"imported"/);
  // 只对无记录的教师 createMany，保证不覆盖、幂等。
  assert.match(importRoute, /existingParticipantIds\.has\(participantId\)/);
  assert.match(importRoute, /createMany/);
  assert.doesNotMatch(importRoute, /teacherTrainingCheckInRecord\.(update|delete)/);
});

test("纯线上标记任务教师端不显示定位入口，无中心坐标任务仍要求定位", () => {
  const tab = read("src/components/tabs/teacher-training-tab.tsx");
  // 教师端可见签到任务过滤掉纯线上标记任务（isImportOnly），而不是按有无坐标。
  assert.match(tab, /filter\(\(task\) => !task\.isImportOnly\)/);
  assert.doesNotMatch(tab, /task\.latitude !== null && task\.longitude !== null/);
});

// ---------- 三、Hero 布局 ----------

test("Hero 标题垂直居中、宽度受限，删除装饰小标题", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.tt-portal-hero-copy\s*{[\s\S]*?top:\s*48%/);
  assert.match(css, /translateY\(-50%\)/);
  assert.match(css, /width:\s*clamp\(320px,\s*58%/);
  // 不再有装饰性 kicker 小标题。
  assert.doesNotMatch(css, /\.tt-portal-kicker/);
  const tab = read("src/components/tabs/teacher-training-tab.tsx");
  assert.doesNotMatch(tab, /tt-portal-kicker/);
  assert.doesNotMatch(tab, /江苏省职业院校教师培训服务系统/);
});

test("Hero 溢出隐藏，避免横向滚动；手机端标题字号单独设定", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.tt-portal-hero\s*{[\s\S]*?overflow:\s*hidden/);
  // 手机端标题字号单独（clamp 且带换行保护）。
  assert.match(css, /overflow-wrap:\s*anywhere/);
});
