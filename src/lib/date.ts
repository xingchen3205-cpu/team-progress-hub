export const toIsoDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const parseLocalDateTime = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  if (value.includes("T")) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = value.replace(" ", "T");
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const parsed = new Date(`${withSeconds}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const beijingDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const beijingDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const beijingFriendlyDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const beijingTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const getBeijingParts = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = beijingDateTimeFormatter.formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
};

export const formatBeijingDateTime = (value: Date | string) => {
  const { year, month, day, hour, minute } = getBeijingParts(value);
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

export const formatBeijingDateTimeShort = (value: Date | string) => {
  const { month, day, hour, minute } = getBeijingParts(value);
  return `${month}/${day} ${hour}:${minute}`;
};

export const formatBeijingFriendlyDate = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return beijingFriendlyDateFormatter.format(date);
};

export const formatBeijingTimeOnly = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return beijingTimeFormatter.format(date);
};

export const formatBeijingDateOnly = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return beijingDateFormatter.format(date).replaceAll("/", "-");
};

export const getBeijingHour = (value: Date | string) => {
  const { hour } = getBeijingParts(value);
  return Number(hour);
};
