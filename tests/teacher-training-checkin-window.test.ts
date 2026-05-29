import assert from "node:assert/strict";
import test from "node:test";

import {
  getTeacherTrainingCheckInWindowLabel,
  getTeacherTrainingCheckInWindowState,
} from "../src/lib/teacher-training";

test("teacher training check-in window follows Asia Shanghai date and time", () => {
  const task = {
    signDate: "2026-05-29",
    startTime: "08:30",
    endTime: "09:30",
    isActive: true,
  };

  assert.equal(getTeacherTrainingCheckInWindowState(task, new Date("2026-05-29T00:20:00.000Z")), "not_started");
  assert.equal(getTeacherTrainingCheckInWindowState(task, new Date("2026-05-29T01:00:00.000Z")), "open");
  assert.equal(getTeacherTrainingCheckInWindowState(task, new Date("2026-05-29T02:00:00.000Z")), "ended");
  assert.equal(getTeacherTrainingCheckInWindowLabel("open"), "进行中");
});

test("teacher training check-in without explicit hours stays open for the signed date only", () => {
  const task = {
    signDate: "2026-05-29",
    startTime: "",
    endTime: "",
    isActive: true,
  };

  assert.equal(getTeacherTrainingCheckInWindowState(task, new Date("2026-05-28T15:59:00.000Z")), "not_started");
  assert.equal(getTeacherTrainingCheckInWindowState(task, new Date("2026-05-29T06:00:00.000Z")), "open");
  assert.equal(getTeacherTrainingCheckInWindowState(task, new Date("2026-05-29T16:01:00.000Z")), "ended");
});
