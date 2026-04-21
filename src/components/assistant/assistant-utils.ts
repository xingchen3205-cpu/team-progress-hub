const ASSISTANT_CONVERSATION_TITLE_MAX = 20;
const ASSISTANT_DATE_DIVIDER_MS = 5 * 60 * 1000;

export type AssistantConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type AssistantConversationGroup = {
  label: "今天" | "昨天" | "更早";
  items: AssistantConversationSummary[];
};

type AssistantKeydownLike = {
  key: string;
  shiftKey?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  } | null;
};

function trimAssistantTitleWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toBeijingDayKey(dateValue: string | Date) {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toBeijingDate(dateValue: string | Date) {
  return typeof dateValue === "string" ? new Date(dateValue) : dateValue;
}

export function buildAssistantConversationTitle(value: string) {
  const normalized = trimAssistantTitleWhitespace(value);
  if (normalized.length <= ASSISTANT_CONVERSATION_TITLE_MAX) {
    return normalized;
  }

  return `${normalized.slice(0, ASSISTANT_CONVERSATION_TITLE_MAX)}...`;
}

export function groupAssistantConversationsByDate(
  items: AssistantConversationSummary[],
  now = new Date(),
): AssistantConversationGroup[] {
  const todayKey = toBeijingDayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = toBeijingDayKey(yesterdayDate);

  const buckets: AssistantConversationGroup[] = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "更早", items: [] },
  ];

  [...items]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .forEach((item) => {
      const dayKey = toBeijingDayKey(item.updatedAt);
      if (dayKey === todayKey) {
        buckets[0].items.push(item);
        return;
      }

      if (dayKey === yesterdayKey) {
        buckets[1].items.push(item);
        return;
      }

      buckets[2].items.push(item);
    });

  return buckets.filter((group) => group.items.length > 0);
}

export function shouldShowAssistantDateDivider(previousAt: string | null | undefined, nextAt: string) {
  if (!previousAt) {
    return true;
  }

  return new Date(nextAt).getTime() - new Date(previousAt).getTime() > ASSISTANT_DATE_DIVIDER_MS;
}

export function shouldSendAssistantMessageOnKeydown(event: AssistantKeydownLike) {
  return event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing;
}

export function formatAssistantMessageTime(dateValue: string | Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(toBeijingDate(dateValue));
}

export function formatAssistantDateDivider(dateValue: string | Date, now = new Date()) {
  const date = toBeijingDate(dateValue);
  const dayKey = toBeijingDayKey(date);
  const todayKey = toBeijingDayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toBeijingDayKey(yesterday);
  const timeLabel = formatAssistantMessageTime(date);

  if (dayKey === todayKey) {
    return `今天 ${timeLabel}`;
  }

  if (dayKey === yesterdayKey) {
    return `昨天 ${timeLabel}`;
  }

  return `${new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)} ${timeLabel}`;
}
