import Link from "next/link";
import { toIsoDateKey } from "@/lib/date";

export default function MentorNotesPage() {
  const today = toIsoDateKey(new Date());

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ebf0f6_0%,#f5f8fb_24%,#eef3f8_100%)] px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="glass-panel p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-eyebrow">专家辅导</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                会议纪要上传
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">
                每次专家辅导结束后，可以把会议主题、纪要内容、下一步动作和附件统一上传到这里。
              </p>
            </div>
            <Link className="button-secondary min-h-11" href="/workspace">
              返回工作台
            </Link>
          </div>
        </header>

        <section className="glass-panel p-6">
          <form className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-[var(--color-muted)]">会议日期</span>
                <input
                  className="mt-2 h-13 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 outline-none"
                  defaultValue={today}
                  min={today}
                  type="date"
                  readOnly
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[var(--color-muted)]">专家姓名</span>
                <input
                  className="mt-2 h-13 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 outline-none"
                  defaultValue="请输入专家姓名"
                  readOnly
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-[var(--color-muted)]">会议主题</span>
              <input
                className="mt-2 h-13 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 outline-none"
                defaultValue="例如：路演答辩打磨、商业模式修订、财务模型点评"
                readOnly
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[var(--color-muted)]">会议纪要</span>
              <textarea
                className="mt-2 min-h-36 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 py-4 outline-none"
                defaultValue="在这里填写本次专家辅导的核心内容、重点建议和修改方向。"
                readOnly
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[var(--color-muted)]">后续动作</span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 py-4 outline-none"
                defaultValue="把本次建议拆成 3-5 条待办，方便团队后续跟进。"
                readOnly
              />
            </label>

            <div className="rounded-[22px] border border-dashed border-[var(--color-line)] bg-[var(--color-panel)] p-5">
              <p className="text-sm font-medium text-[var(--color-ink)]">附件上传</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                请按会议要求整理录音、截图、批注材料或纪要文件。
              </p>
            </div>

            <button className="button-primary w-fit cursor-default" type="button">
              保存会议纪要
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
