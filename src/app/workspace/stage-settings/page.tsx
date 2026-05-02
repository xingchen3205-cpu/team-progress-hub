import Link from "next/link";
import { toIsoDateKey } from "@/lib/date";

export default function StageSettingsPage() {
  const today = toIsoDateKey(new Date());

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ebf0f6_0%,#f5f8fb_24%,#eef3f8_100%)] px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="glass-panel p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-eyebrow">管理员设置</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                当前阶段时间修改
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">
                管理员账号可以手动修改当前所处阶段、开始时间和结束时间，工作台会同步显示最新阶段。
              </p>
            </div>
            <Link className="button-secondary min-h-11" href="/workspace">
              返回工作台
            </Link>
          </div>
        </header>

        <section className="glass-panel p-6">
          <form className="grid gap-5">
            <label className="block">
              <span className="text-sm font-medium text-[var(--color-muted)]">当前阶段名称</span>
              <input
                className="mt-2 h-13 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 outline-none"
                defaultValue="决赛路演材料冲刺"
                readOnly
              />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-[var(--color-muted)]">开始时间</span>
                <input
                  className="mt-2 h-13 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 outline-none"
                  defaultValue={today}
                  min={today}
                  type="date"
                  readOnly
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[var(--color-muted)]">结束时间</span>
                <input
                  className="mt-2 h-13 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 outline-none"
                  defaultValue={today}
                  min={today}
                  type="date"
                  readOnly
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-[var(--color-muted)]">阶段说明</span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 py-4 outline-none"
                defaultValue="当前阶段重点是完成决赛 PPT、答辩稿、视频和申报材料的最后打磨。"
                readOnly
              />
            </label>

            <div className="rounded-[22px] bg-[var(--color-panel)] p-5">
              <p className="text-sm font-medium text-[var(--color-ink)]">管理员说明</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                阶段时间由管理员统一维护，普通成员仅查看当前阶段安排。
              </p>
            </div>

            <button className="button-primary w-fit cursor-default" type="button">
              保存阶段设置
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
