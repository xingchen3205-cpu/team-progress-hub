import Link from "next/link";

import { teamMembers } from "@/data/demo-data";

type SearchParams = Promise<{
  member?: string;
}>;

export default async function MemberInputPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentMember =
    teamMembers.find((member) => member.slug === params.member) ?? teamMembers[0];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ebf0f6_0%,#f5f8fb_24%,#eef3f8_100%)] px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="glass-panel p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-eyebrow">个人填写</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                成员每日内容录入
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">
                这里用于查看成员当日填报样例；正式汇报请在“日程汇报”中提交。
              </p>
            </div>
            <div className="flex gap-3">
              <Link className="button-secondary min-h-11" href="/workspace">
                返回工作台
              </Link>
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="glass-panel p-5">
            <p className="text-sm font-semibold text-[var(--color-ink)]">选择成员</p>
            <div className="mt-4 space-y-2">
              {teamMembers.map((member) => (
                <Link
                  key={member.slug}
                  href={`/workspace/input?member=${encodeURIComponent(member.slug)}`}
                  className={`block rounded-[20px] px-4 py-3 text-sm transition hover:bg-white ${
                    currentMember.slug === member.slug
                      ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
                      : "bg-[var(--color-panel)] text-[var(--color-ink)]"
                  }`}
                >
                  {member.name}
                </Link>
              ))}
            </div>
          </aside>

          <section className="glass-panel p-6">
            <div>
              <div>
                <p className="section-eyebrow">当前填写人</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                  {currentMember.name}
                </h2>
                <p className="mt-2 text-sm text-[var(--color-muted)]">{currentMember.role}</p>
              </div>
            </div>

            <form className="mt-8 grid gap-5">
              <label className="block">
                <span className="text-sm font-medium text-[var(--color-muted)]">今日目标</span>
                <input
                  className="mt-2 h-13 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 outline-none"
                  defaultValue={currentMember.todayFocus}
                  readOnly
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-[var(--color-muted)]">今天已完成事项</span>
                <textarea
                  className="mt-2 min-h-28 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 py-4 outline-none"
                  defaultValue={currentMember.completed}
                  readOnly
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-[var(--color-muted)]">当前问题 / 卡点</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-[18px] border border-[var(--color-line)] bg-white px-4 py-4 outline-none"
                  defaultValue={currentMember.blockers}
                  readOnly
                />
              </label>

              <div className="rounded-[22px] border border-dashed border-[var(--color-line)] bg-[var(--color-panel)] p-5">
                <p className="text-sm font-medium text-[var(--color-ink)]">附件上传</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  附件材料请在对应项目阶段或日程汇报中按要求上传。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="button-primary cursor-default"
                  type="button"
                >
                  保存今日内容
                </button>
                <Link className="button-secondary" href="/workspace">
                  返回总工作台
                </Link>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
