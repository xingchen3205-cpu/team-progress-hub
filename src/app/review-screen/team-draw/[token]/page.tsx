"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, ShieldCheck, Shuffle } from "lucide-react";

type TeamDrawState = {
  sessionId: string;
  packageId: string;
  targetName: string;
  roundLabel: string;
  tokenExpiresAt: string;
  usedAt: string | null;
  expired: boolean;
  canDraw: boolean;
  orderIndex: number | null;
  selfDrawnAt: string | null;
};

type TeamDrawResult = {
  pickedOrderIndex: number;
  remainingCount: number;
  confirmedOrder?: {
    orderIndex: number;
    selfDrawnAt: string | null;
  } | null;
  message?: string;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TeamDrawPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.token ?? "";
  const screenToken = searchParams.get("token") ?? "";
  const [drawState, setDrawState] = useState<TeamDrawState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const currentPath = useMemo(() => {
    if (!sessionId) return "";
    const paramsText = screenToken ? `?token=${encodeURIComponent(screenToken)}` : "";
    return `/review-screen/team-draw/${encodeURIComponent(sessionId)}${paramsText}`;
  }, [screenToken, sessionId]);

  const redirectToLogin = useCallback(() => {
    const nextPath = currentPath || "/workspace";
    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [currentPath, router]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!sessionId || !screenToken) {
        setMessage("团队抽签入口无效");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/review-screen/team-draw/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(screenToken)}`,
          {
            cache: "no-store",
          },
        );
        const data = (await response.json().catch(() => null)) as TeamDrawState | { message?: string } | null;
        if (response.status === 401) {
          redirectToLogin();
          return;
        }
        if (!response.ok) {
          throw new Error(data && "message" in data ? data.message ?? "团队抽签入口无效" : "团队抽签入口无效");
        }
        if (!cancelled) {
          setDrawState(data as TeamDrawState);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "团队抽签链接无效");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [redirectToLogin, screenToken, sessionId]);

  const handleDraw = async () => {
    if (!drawState || submitting || !drawState.canDraw) return;

    setSubmitting(true);
    setMessage("");
    try {
      const sessionId = drawState.sessionId;
      const response = await fetch(
        `/api/review-screen/sessions/${sessionId}/team-draw?token=${encodeURIComponent(screenToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = (await response.json().catch(() => null)) as TeamDrawResult | null;
      if (!response.ok) {
        throw new Error(data?.message ?? "抽签失败，请刷新后重试");
      }
      const orderIndex = data?.confirmedOrder?.orderIndex ?? data?.pickedOrderIndex ?? 0;
      const selfDrawnAt = data?.confirmedOrder?.selfDrawnAt ?? new Date().toISOString();
      setDrawState((current) =>
        current
          ? {
              ...current,
              canDraw: false,
              usedAt: selfDrawnAt,
              selfDrawnAt,
              orderIndex,
            }
          : current,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "抽签失败，请刷新后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const orderNumber = drawState?.orderIndex == null ? null : drawState.orderIndex + 1;
  const canDraw = Boolean(drawState?.canDraw && !submitting);

  return (
    <main className="min-h-screen bg-[#f3f7fb] px-4 py-5 text-slate-950">
      <style>{`
        .team-draw-shell {
          min-height: calc(100vh - 40px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .team-draw-panel {
          width: min(100%, 520px);
          overflow: hidden;
          border: 1px solid #dbe5f2;
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 18px 50px rgba(15, 32, 64, .12);
        }
        .team-draw-header {
          background: linear-gradient(135deg, #1a3a6e, #2856a0 62%, #c22832);
          padding: 22px 22px 24px;
          color: #fff;
        }
        .team-draw-security {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,.16);
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 900;
        }
        .team-draw-title {
          margin-top: 18px;
          font-size: 26px;
          font-weight: 900;
          line-height: 1.12;
        }
        .team-draw-body {
          padding: 22px;
        }
        .team-draw-project {
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: #f8fbff;
          padding: 16px;
        }
        .team-draw-result {
          display: flex;
          min-height: 172px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: 20px;
          background: #eef5ff;
          color: #0f2040;
        }
        .team-draw-number {
          color: #1f4ea7;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 92px;
          font-weight: 900;
          line-height: .95;
          font-variant-numeric: tabular-nums;
        }
        .team-draw-button {
          display: inline-flex;
          width: 100%;
          height: 54px;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 0;
          border-radius: 16px;
          background: #1f4ea7;
          color: #fff;
          font-size: 16px;
          font-weight: 900;
          transition: transform .12s ease, background .2s ease, opacity .2s ease;
        }
        .team-draw-button:active:not(:disabled) {
          transform: scale(.98);
        }
        .team-draw-button:disabled {
          opacity: .42;
        }
      `}</style>
      <div className="team-draw-shell">
        <section className="team-draw-panel">
          <div className="team-draw-header">
            <span className="team-draw-security">
              <ShieldCheck className="h-4 w-4" />
              登录校验抽签
            </span>
            <h1 className="team-draw-title">团队抽签</h1>
            <p className="mt-2 text-sm font-semibold text-white/78">
              登录后系统只开放当前团队的抽签权限，结果实时同步到管理员大屏。
            </p>
          </div>

          <div className="team-draw-body space-y-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-slate-500">
                <Clock3 className="h-4 w-4 animate-spin" />
                正在加载抽签信息
              </div>
            ) : drawState ? (
              <>
                <div className="team-draw-project">
                  <p className="text-xs font-black tracking-[0.16em] text-blue-600">{drawState.roundLabel}</p>
                  <h2 className="mt-2 text-lg font-black leading-snug text-slate-950">{drawState.targetName}</h2>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    链接有效期至 {formatDateTime(drawState.tokenExpiresAt)}
                  </p>
                </div>

                <div className="team-draw-result">
                  {orderNumber ? (
                    <>
                      <CheckCircle2 className="mb-3 h-7 w-7 text-emerald-600" />
                      <p className="text-sm font-black text-slate-500">你的路演顺序</p>
                      <div className="team-draw-number">{orderNumber}</div>
                      <p className="text-xs font-bold text-slate-500">已同步到管理员大屏</p>
                    </>
                  ) : (
                    <>
                      <Shuffle className="mb-4 h-9 w-9 text-blue-700" />
                      <p className="text-base font-black text-slate-800">等待你抽取路演顺序</p>
                      <p className="mt-2 px-8 text-center text-xs font-semibold leading-5 text-slate-500">
                        点击后按先到先得取得隐藏随机队列里的下一个序号。
                      </p>
                    </>
                  )}
                </div>

                <button className="team-draw-button" disabled={!canDraw} onClick={handleDraw} type="button">
                  <Shuffle className="h-5 w-5" />
                  {submitting ? "抽签中" : orderNumber ? "已完成抽签" : drawState.expired ? "链接已过期" : "开始抽签"}
                </button>
              </>
            ) : null}

            {message ? (
              <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-700">
                {message}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
