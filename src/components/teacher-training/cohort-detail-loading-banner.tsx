import { Loader2 } from "lucide-react";

export function TeacherTrainingCohortDetailLoadingBanner() {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white/82 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-950">正在加载班次明细</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">已先显示班次摘要，名单、签到、请假和任务数据马上补齐。</p>
        </div>
      </div>
    </div>
  );
}
