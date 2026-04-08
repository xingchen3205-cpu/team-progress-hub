import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultEmailReminderSettings,
  getEmailReminderCategoryForNotificationType,
  isEmailReminderEnabled,
  isDailyReportReminderDue,
} from "../src/lib/email-settings";

describe("email reminder settings", () => {
  it("maps notification types to admin configurable categories", () => {
    assert.equal(getEmailReminderCategoryForNotificationType("task_assign"), "taskAssignment");
    assert.equal(getEmailReminderCategoryForNotificationType("task_submit"), "taskReview");
    assert.equal(getEmailReminderCategoryForNotificationType("task_reject"), "taskReview");
    assert.equal(getEmailReminderCategoryForNotificationType("announcement"), "announcement");
    assert.equal(getEmailReminderCategoryForNotificationType("directive"), "directReminder");
    assert.equal(getEmailReminderCategoryForNotificationType("document_review"), "documentReview");
    assert.equal(getEmailReminderCategoryForNotificationType("document_review_result"), "documentReview");
    assert.equal(getEmailReminderCategoryForNotificationType("report_submit"), "reportSubmit");
    assert.equal(getEmailReminderCategoryForNotificationType("report_daily_missing"), "dailyReportMissing");
  });

  it("keeps current email reminder behavior enabled by default", () => {
    assert.equal(isEmailReminderEnabled(defaultEmailReminderSettings, "task_assign"), true);
    assert.equal(isEmailReminderEnabled(defaultEmailReminderSettings, "announcement"), true);
    assert.equal(isEmailReminderEnabled(defaultEmailReminderSettings, "report_daily_missing"), true);
  });

  it("allows admins to disable individual email reminder categories", () => {
    assert.equal(
      isEmailReminderEnabled(
        {
          ...defaultEmailReminderSettings,
          taskAssignmentEnabled: false,
        },
        "task_assign",
      ),
      false,
    );
    assert.equal(isEmailReminderEnabled(defaultEmailReminderSettings, "unknown_custom_type"), true);
  });

  it("runs daily report reminders only when enabled and the configured hour arrives", () => {
    assert.equal(
      isDailyReportReminderDue(defaultEmailReminderSettings, new Date("2026-04-08T12:10:00.000Z")),
      true,
    );
    assert.equal(
      isDailyReportReminderDue(defaultEmailReminderSettings, new Date("2026-04-08T11:10:00.000Z")),
      false,
    );
    assert.equal(
      isDailyReportReminderDue(
        {
          ...defaultEmailReminderSettings,
          dailyReportMissingEnabled: false,
        },
        new Date("2026-04-08T12:10:00.000Z"),
      ),
      false,
    );
  });
});
