import { toIsoDateKey } from "@/lib/date";

type BuildReportDateOptionsInput = {
  reportDates: string[];
  selectedDate: string;
  todayDateKey: string;
  daysBack?: number;
};

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

export const isReportDateKey = (value: string) => dateKeyPattern.test(value);

const shiftDateKey = (dateKey: string, offsetDays: number) => {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return toIsoDateKey(date);
};

export const buildReportDateOptions = ({
  reportDates,
  selectedDate,
  todayDateKey,
  daysBack = 7,
}: BuildReportDateOptionsInput) => {
  const dateSet = new Set<string>();

  for (let index = 0; index <= daysBack; index += 1) {
    dateSet.add(shiftDateKey(todayDateKey, -index));
  }

  for (const date of reportDates) {
    if (isReportDateKey(date)) {
      dateSet.add(date);
    }
  }

  if (isReportDateKey(selectedDate)) {
    dateSet.add(selectedDate);
  }

  return Array.from(dateSet).sort((left, right) => (left < right ? 1 : -1));
};
