import { getBeijingHour } from "@/lib/date";

export type EmailReminderSettings = {
  taskAssignmentEnabled: boolean;
  taskReviewEnabled: boolean;
  announcementEnabled: boolean;
  directReminderEnabled: boolean;
  documentReviewEnabled: boolean;
  reportSubmitEnabled: boolean;
  dailyReportMissingEnabled: boolean;
  dailyReportHour: number;
};

export type EmailReminderCategory =
  | "taskAssignment"
  | "taskReview"
  | "announcement"
  | "directReminder"
  | "documentReview"
  | "reportSubmit"
  | "dailyReportMissing";

export const EMAIL_REMINDER_SETTING_ID = "global";

export const defaultEmailReminderSettings: EmailReminderSettings = {
  taskAssignmentEnabled: true,
  taskReviewEnabled: true,
  announcementEnabled: true,
  directReminderEnabled: true,
  documentReviewEnabled: true,
  reportSubmitEnabled: true,
  dailyReportMissingEnabled: true,
  dailyReportHour: 20,
};

const categoryByNotificationType: Record<string, EmailReminderCategory> = {
  task_assign: "taskAssignment",
  task_submit: "taskReview",
  task_review: "taskReview",
  task_confirm: "taskReview",
  task_reject: "taskReview",
  document_rework_task: "taskReview",
  announcement: "announcement",
  directive: "directReminder",
  document_review: "documentReview",
  document_review_result: "documentReview",
  report_submit: "reportSubmit",
  report_daily_missing: "dailyReportMissing",
};

const settingKeyByCategory = {
  taskAssignment: "taskAssignmentEnabled",
  taskReview: "taskReviewEnabled",
  announcement: "announcementEnabled",
  directReminder: "directReminderEnabled",
  documentReview: "documentReviewEnabled",
  reportSubmit: "reportSubmitEnabled",
  dailyReportMissing: "dailyReportMissingEnabled",
} as const satisfies Record<EmailReminderCategory, keyof EmailReminderSettings>;

export const getEmailReminderCategoryForNotificationType = (type: string) =>
  categoryByNotificationType[type] ?? null;

export const normalizeEmailReminderSettings = (
  settings?: Partial<EmailReminderSettings> | null,
): EmailReminderSettings => ({
  ...defaultEmailReminderSettings,
  ...settings,
  dailyReportHour:
    typeof settings?.dailyReportHour === "number" && settings.dailyReportHour >= 0 && settings.dailyReportHour <= 23
      ? settings.dailyReportHour
      : defaultEmailReminderSettings.dailyReportHour,
});

export const isEmailReminderEnabled = (settings: EmailReminderSettings, notificationType: string) => {
  const category = getEmailReminderCategoryForNotificationType(notificationType);

  if (!category) {
    return true;
  }

  return Boolean(settings[settingKeyByCategory[category]]);
};

export const isDailyReportReminderDue = (settings: EmailReminderSettings, date: Date) =>
  settings.dailyReportMissingEnabled && getBeijingHour(date) === settings.dailyReportHour;

export const getEmailReminderSettings = async () => {
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.emailReminderSetting.findUnique({
    where: { id: EMAIL_REMINDER_SETTING_ID },
  });

  return normalizeEmailReminderSettings(row);
};

export const saveEmailReminderSettings = async (settings: EmailReminderSettings) => {
  const { prisma } = await import("@/lib/prisma");
  const normalized = normalizeEmailReminderSettings(settings);
  const row = await prisma.emailReminderSetting.upsert({
    where: { id: EMAIL_REMINDER_SETTING_ID },
    update: normalized,
    create: {
      id: EMAIL_REMINDER_SETTING_ID,
      ...normalized,
    },
  });

  return normalizeEmailReminderSettings(row);
};
