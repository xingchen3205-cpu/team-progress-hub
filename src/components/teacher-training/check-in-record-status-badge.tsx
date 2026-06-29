export const getTeacherTrainingCheckInRecordStatusMeta = (status: string) =>
  status === "manual"
    ? {
        label: "人工确认",
        className: "border-blue-200 bg-blue-50 text-blue-700",
      }
    : {
        label: "已签到",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };

export function TeacherTrainingCheckInRecordStatusBadge({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const meta = getTeacherTrainingCheckInRecordStatusMeta(status);

  return (
    <span className={`rounded-full border px-2 py-0.5 font-semibold ${meta.className} ${className}`}>
      {meta.label}
    </span>
  );
}
