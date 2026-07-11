import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getTeacherTrainingCourseWindowState,
  validateTeacherTrainingSessionTimeRange,
} from "../src/lib/teacher-training";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("teacher training course and check-in times require a forward time range", () => {
  assert.equal(validateTeacherTrainingSessionTimeRange("08:30", "09:00"), "");
  assert.equal(validateTeacherTrainingSessionTimeRange("14:00", "12:00"), "结束时间必须晚于开始时间");
  assert.equal(validateTeacherTrainingSessionTimeRange("14:00", "14:00"), "结束时间必须晚于开始时间");
  assert.equal(validateTeacherTrainingSessionTimeRange("", "14:00"), "请同时填写开始时间和结束时间");
});

test("teacher training courses derive ended state from Shanghai date and time", () => {
  assert.equal(
    getTeacherTrainingCourseWindowState(
      { courseDate: "2026-07-10", startTime: "13:30", endTime: "14:30" },
      new Date("2026-07-10T05:00:00.000Z"),
    ),
    "not_started",
  );
  assert.equal(
    getTeacherTrainingCourseWindowState(
      { courseDate: "2026-07-10", startTime: "13:30", endTime: "14:30" },
      new Date("2026-07-10T06:00:00.000Z"),
    ),
    "in_progress",
  );
  assert.equal(
    getTeacherTrainingCourseWindowState(
      { courseDate: "2026-07-10", startTime: "13:30", endTime: "14:30" },
      new Date("2026-07-10T07:00:00.000Z"),
    ),
    "ended",
  );
});

test("teacher task submission identity never falls back to the first cohort participant", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const submissionRoute = read("src/app/api/teacher-training/submissions/route.ts");
  const uploadRoute = read("src/app/api/teacher-training/submissions/upload-url/route.ts");

  assert.doesNotMatch(tabSource, /selectedCohort\?\.participants\[0\]/);
  assert.match(tabSource, /participant\.accountUserId === currentUser\?\.id/);
  assert.match(tabSource, /selectedTask\.description/);
  assert.match(submissionRoute, /accountUserId:\s*user\.id/);
  assert.match(uploadRoute, /accountUserId:\s*user\.id/);
});

test("teacher training report attachments have first-party PDF and DOCX preview", () => {
  const previewRoute = read("src/app/api/teacher-training/submissions/[submissionId]/preview/route.ts");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(previewRoute, /mammoth\.convertToHtml/);
  assert.match(previewRoute, /application\/pdf/);
  assert.match(previewRoute, /Content-Disposition/);
  assert.match(previewRoute, /inline/);
  assert.match(tabSource, /handlePreviewDocument/);
  assert.doesNotMatch(tabSource, /Word 文件请下载后查看/);
});

test("check-in management keeps all people reachable and supports lifecycle filters", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.doesNotMatch(tabSource, /records\.slice\(0,\s*checkInSearchKeyword\s*\?\s*8\s*:\s*3\)/);
  assert.doesNotMatch(tabSource, /participants\.slice\(0,\s*checkInSearchKeyword\s*\?\s*8\s*:\s*4\)/);
  assert.match(tabSource, /checkInStatusFilter/);
  assert.match(tabSource, /已签到/);
  assert.match(tabSource, /未签到/);
  assert.match(tabSource, /已结束/);
});

test("a single check-in task can export its roster with login accounts", () => {
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(exportRoute, /checkInTaskId/);
  assert.match(exportRoute, /登录账号/);
  assert.match(exportRoute, /accountUsername/);
  assert.match(tabSource, /导出本场名单/);
});

test("manual check-in gives immediate feedback instead of opening a form below a long roster", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /window\.prompt\(`为“\$\{participant\.name\}”人工补签/);
  assert.match(tabSource, /manualSignTeacherTrainingCheckIn\(\{[\s\S]*checkInTaskId:\s*task\.id/);
});
