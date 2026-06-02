export const getTeacherTrainingCheckInRecordStatusMeta = (status: string) =>
  status === "accuracy_review"
    ? {
        label: "精度待复核",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      }
    : {
        label: "范围内",
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
