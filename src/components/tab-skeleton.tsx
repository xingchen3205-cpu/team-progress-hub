export default function TabSkeleton({ variant = "compact" }: { variant?: "compact" | "workspace" }) {
  if (variant === "workspace") {
    return (
      <div
        aria-label="正在加载当前页面"
        className="animate-pulse space-y-4 px-1 py-2"
        role="status"
      >
        <div className="rounded-2xl border border-white/75 bg-white/80 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="h-4 w-28 rounded-full bg-slate-200" />
          <div className="mt-4 h-7 w-52 rounded-lg bg-slate-200" />
          <div className="mt-3 h-3 w-full max-w-xl rounded-full bg-slate-100" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <div className="h-9 w-9 rounded-xl bg-slate-200" />
            <div className="mt-5 h-4 w-24 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-32 rounded-full bg-slate-100" />
          </div>
          <div className="h-28 rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <div className="h-9 w-9 rounded-xl bg-slate-200" />
            <div className="mt-5 h-4 w-24 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-32 rounded-full bg-slate-100" />
          </div>
          <div className="h-28 rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <div className="h-9 w-9 rounded-xl bg-slate-200" />
            <div className="mt-5 h-4 w-24 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-32 rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="rounded-2xl border border-white/75 bg-white/80 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="h-5 w-36 rounded-full bg-slate-200" />
          <div className="mt-5 space-y-3">
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 w-1/3 rounded bg-gray-200" />
      <div className="h-4 w-2/3 rounded bg-gray-200" />
      <div className="h-4 w-1/2 rounded bg-gray-200" />
      <div className="h-32 rounded bg-gray-200" />
    </div>
  );
}
