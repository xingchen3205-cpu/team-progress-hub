export const getTeacherTrainingCheckInRecordStatusMeta = (status: string) =>
  status === "manual"
    ? {
        // 人工补签
        label: "人工补签",
        className: "border-blue-200 bg-blue-50 text-blue-700",
      }
    : status === "imported"
      ? {
          // 线上名单导入
          label: "线上名单导入",
          className: "border-indigo-200 bg-indigo-50 text-indigo-700",
        }
      : {
          // 定位签到
          label: "定位签到",
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
