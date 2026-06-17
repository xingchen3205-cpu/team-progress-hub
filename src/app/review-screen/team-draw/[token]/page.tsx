"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole, ShieldCheck, Shuffle, UserCheck } from "lucide-react";

type TeamDrawProjectOption = {
  packageId: string;
  targetName: string;
  roundLabel: string;
  registered: boolean;
  drawn: boolean;
};

type TeamDrawClaimState = {
  mode: "claim";
  sessionId: string;
  roundLabel: string;
  tokenExpiresAt: string;
  expired: boolean;
  canRegister: boolean;
  projects: TeamDrawProjectOption[];
};

type TeamDrawState = {
  mode?: "draw";
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

type RegistrationDraft = {
  name: string;
  phone: string;
  email: string;
  college: string;
  className: string;
  studentId: string;
  password: string;
  confirmPassword: string;
};

const initialRegistrationDraft: RegistrationDraft = {
  name: "",
  phone: "",
  email: "",
  college: "",
  className: "",
  studentId: "",
  password: "",
  confirmPassword: "",
};

const teamDrawSteps = [
  { key: "project", label: "选择项目" },
  { key: "register", label: "负责人注册" },
  { key: "draw", label: "线上抽签" },
] as const;

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
  const [claimState, setClaimState] = useState<TeamDrawClaimState | null>(null);
  const [drawState, setDrawState] = useState<TeamDrawState | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [confirmStep, setConfirmStep] = useState<"first" | "second" | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft>(initialRegistrationDraft);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const currentPath = useMemo(() => {
    if (!sessionId) return "";
    const paramsText = screenToken ? `?token=${encodeURIComponent(screenToken)}` : "";
    return `/review-screen/team-draw/${encodeURIComponent(sessionId)}${paramsText}`;
  }, [screenToken, sessionId]);

  const selectedProject = useMemo(
    () => claimState?.projects.find((project) => project.packageId === selectedPackageId) ?? null,
    [claimState?.projects, selectedPackageId],
  );
  const registrationLocked = claimState ? !claimState.canRegister || claimState.expired : false;

  const loadDrawState = useCallback(async () => {
    if (!sessionId || !screenToken) {
      setMessage("团队抽签入口无效");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/review-screen/team-draw/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(screenToken)}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as TeamDrawClaimState | TeamDrawState | { message?: string } | null;
      if (!response.ok) {
        throw new Error(data && "message" in data ? data.message ?? "团队抽签入口无效" : "团队抽签入口无效");
      }
      if (data && "mode" in data && data.mode === "claim") {
        setClaimState(data);
        setDrawState(null);
        setSelectedPackageId((current) => current || data.projects.find((project) => !project.registered && !project.drawn)?.packageId || data.projects[0]?.packageId || "");
      } else {
        setDrawState(data as TeamDrawState);
        setClaimState(null);
        setRegistrationOpen(false);
        setConfirmStep(null);
      }
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "团队抽签链接无效");
    } finally {
      setLoading(false);
    }
  }, [screenToken, sessionId]);

  useEffect(() => {
    void loadDrawState();
  }, [loadDrawState]);

  const startProjectClaim = () => {
    if (!claimState || !selectedProject) {
      setMessage("请先选择自己的项目");
      return;
    }
    if (!claimState.canRegister || claimState.expired) {
      setMessage("当前抽签入口不可注册，请联系管理员");
      return;
    }
    if (selectedProject.drawn) {
      setMessage("该项目已完成抽签，不能重复注册");
      return;
    }
    if (selectedProject.registered) {
      setMessage("该项目已注册团队账号，请使用已注册账号进入抽签");
      return;
    }
    setMessage("");
    setConfirmStep("first");
  };

  const continueConfirmation = () => {
    if (confirmStep === "first") {
      setConfirmStep("second");
      return;
    }
    setConfirmStep(null);
    setRegistrationOpen(true);
  };

  const submitRegistration = async () => {
    if (!selectedProject || submitting) return;

    const phone = registrationDraft.phone.replace(/\D/g, "");
    if (!registrationDraft.name.trim()) {
      setMessage("请填写项目负责人姓名");
      return;
    }
    if (!phone) {
      setMessage("请填写项目负责人手机号");
      return;
    }
    if (!registrationDraft.email.trim()) {
      setMessage("请填写邮箱");
      return;
    }
    if (!registrationDraft.college.trim()) {
      setMessage("请填写所属学院");
      return;
    }
    if (!registrationDraft.className.trim()) {
      setMessage("请填写专业班级");
      return;
    }
    if (!registrationDraft.studentId.trim()) {
      setMessage("请填写学号");
      return;
    }
    if (registrationDraft.password.trim().length < 6) {
      setMessage("密码至少需要 6 位");
      return;
    }
    if (registrationDraft.password.trim() !== registrationDraft.confirmPassword.trim()) {
      setMessage("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/review-screen/team-draw/${encodeURIComponent(sessionId)}/register?token=${encodeURIComponent(screenToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: selectedProject.packageId,
            name: registrationDraft.name.trim(),
            phone,
            email: registrationDraft.email.trim(),
            college: registrationDraft.college.trim(),
            className: registrationDraft.className.trim(),
            studentId: registrationDraft.studentId.trim(),
            password: registrationDraft.password.trim(),
            confirmProjectSelection: true,
            confirmRegistrationFinal: true,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(data?.message ?? "注册失败，请刷新后重试");
      }
      setRegistrationDraft(initialRegistrationDraft);
      await loadDrawState();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "注册失败，请刷新后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDraw = async () => {
    if (!drawState || submitting || !drawState.canDraw) return;

    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/review-screen/sessions/${drawState.sessionId}/team-draw?token=${encodeURIComponent(screenToken)}`,
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
  const activeStepKey = drawState ? "draw" : registrationOpen ? "register" : "project";
  const activeStepIndex = teamDrawSteps.findIndex((step) => step.key === activeStepKey);

  return (
    <main className="team-draw-page min-h-screen px-4 py-5 text-slate-950">
      <style>{`
        .team-draw-page {
          background:
            linear-gradient(180deg, rgba(16, 36, 66, .06), rgba(244, 247, 251, 0) 310px),
            repeating-linear-gradient(90deg, rgba(15, 23, 42, .035) 0, rgba(15, 23, 42, .035) 1px, transparent 1px, transparent 44px),
            #f4f7fb;
          font-family: "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;
        }
        .team-draw-shell {
          min-height: calc(100vh - 40px);
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: teamDrawEnter .42s ease both;
        }
        .team-draw-panel {
          width: 100%;
          max-width: 620px;
          overflow: hidden;
          border: 1px solid #d6e1ef;
          border-radius: 28px;
          background: #fff;
          box-shadow: 0 26px 78px rgba(12, 31, 61, .16);
        }
        .team-draw-header {
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(135deg, rgba(8, 28, 58, .96), rgba(20, 70, 128, .94) 62%, rgba(135, 35, 48, .92)),
            #102442;
          padding: 24px 24px 26px;
          color: #fff;
        }
        .team-draw-logo img {
          height: auto;
          max-height: 38px;
          width: 118px;
          object-fit: contain;
          filter: brightness(0) invert(1) drop-shadow(0 8px 18px rgba(0,0,0,.22));
        }
        .team-draw-security {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.12);
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
          padding: 24px;
        }
        .team-draw-steps {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          border: 1px solid #dbe5f0;
          border-radius: 18px;
          background: #f8fbff;
          padding: 8px;
        }
        .team-draw-step {
          display: inline-flex;
          min-height: 38px;
          min-width: 0;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border-radius: 12px;
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          transition: background .18s ease, color .18s ease, box-shadow .18s ease;
        }
        .team-draw-step-index {
          display: inline-flex;
          height: 18px;
          width: 18px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #e2e8f0;
          color: #475569;
          font-size: 11px;
          font-variant-numeric: tabular-nums;
        }
        .team-draw-step-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .team-draw-step-done {
          color: #0f766e;
        }
        .team-draw-step-done .team-draw-step-index {
          background: #ccfbf1;
          color: #0f766e;
        }
        .team-draw-step-active {
          background: linear-gradient(135deg, #1d4ed8, #153e75);
          color: #fff;
          box-shadow: 0 10px 24px rgba(29, 78, 216, .18);
        }
        .team-draw-step-active .team-draw-step-index {
          background: rgba(255,255,255,.2);
          color: #fff;
        }
        .team-draw-project {
          border: 1px solid #dbe5f0;
          border-radius: 20px;
          background: linear-gradient(180deg, #f8fbff, #fff);
          padding: 16px;
          box-shadow: 0 10px 30px rgba(15, 35, 65, .06);
        }
        .team-draw-option {
          width: 100%;
          border: 1px solid #dbe5f0;
          border-radius: 16px;
          background: #fff;
          padding: 13px 14px;
          text-align: left;
          transition: border-color .18s ease, box-shadow .18s ease, transform .14s ease;
        }
        .team-draw-option-active {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, .1);
        }
        .team-draw-option:active {
          transform: scale(.99);
        }
        .team-draw-option:disabled {
          cursor: not-allowed;
          border-color: #e5e7eb;
          background: #f8fafc;
          opacity: .72;
          box-shadow: none;
        }
        .team-draw-option:disabled:active {
          transform: none;
        }
        .team-draw-input {
          height: 48px;
          width: 100%;
          border: 1px solid #d8e1ee;
          border-radius: 14px;
          padding: 0 14px;
          font-size: 14px;
          font-weight: 700;
          outline: none;
          transition: border-color .18s ease, box-shadow .18s ease;
        }
        .team-draw-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, .1);
        }
        .team-draw-result {
          display: flex;
          min-height: 184px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid #dbe7f6;
          border-radius: 24px;
          background: linear-gradient(180deg, #edf5ff, #f8fbff);
          color: #0f2040;
        }
        .team-draw-number {
          color: #173f88;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 96px;
          font-weight: 900;
          line-height: .95;
          font-variant-numeric: tabular-nums;
          text-shadow: 0 12px 28px rgba(23, 63, 136, .14);
          animation: teamDrawNumber .38s ease both;
        }
        .team-draw-button {
          display: inline-flex;
          width: 100%;
          min-height: 52px;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 0;
          border-radius: 16px;
          background: linear-gradient(135deg, #1d4ed8, #153e75);
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          box-shadow: 0 16px 34px rgba(29, 78, 216, .22);
          transition: transform .14s ease, box-shadow .18s ease, opacity .18s ease;
        }
        .team-draw-button:active:not(:disabled) {
          transform: scale(.985);
        }
        .team-draw-button:disabled {
          opacity: .42;
          box-shadow: none;
        }
        .team-draw-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, .48);
          padding: 18px;
          backdrop-filter: blur(8px);
        }
        .team-draw-confirm-panel {
          width: min(100%, 440px);
          border: 1px solid rgba(226, 232, 240, .9);
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 28px 80px rgba(15, 23, 42, .28);
          animation: teamDrawEnter .2s ease both;
        }
        @keyframes teamDrawEnter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes teamDrawNumber {
          from {
            opacity: 0;
            transform: scale(.92) translateY(6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
      <div className="team-draw-shell">
        <section className="team-draw-panel">
          <div className="team-draw-header">
            <div className="team-draw-logo">
              <Image alt="南京铁道职业技术学院" height={77} priority src="/official-logo.png" width={430} />
            </div>
            <span className="team-draw-security mt-5">
              <ShieldCheck className="h-4 w-4" />
              创新创业大赛抽签
            </span>
            <h1 className="team-draw-title">团队线上抽签</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/78">
              本入口适用于本轮全部项目。请选择本团队项目并完成负责人注册；每个项目仅允许首次注册一次。
            </p>
          </div>

          <div className="team-draw-body space-y-4">
            <div className="team-draw-steps" aria-label="抽签流程">
              {teamDrawSteps.map((step, index) => {
                const done = index < activeStepIndex;
                const active = index === activeStepIndex;
                return (
                  <div
                    aria-current={active ? "step" : undefined}
                    className={`team-draw-step ${done ? "team-draw-step-done" : ""} ${
                      active ? "team-draw-step-active" : ""
                    }`}
                    key={step.key}
                  >
                    <span className="team-draw-step-index">{index + 1}</span>
                    <span className="team-draw-step-label">{step.label}</span>
                  </div>
                );
              })}
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-slate-500">
                <Clock3 className="h-4 w-4 animate-spin" />
                正在加载抽签信息
              </div>
            ) : drawState ? (
              <>
                <div className="team-draw-project">
                  <p className="text-xs font-black text-blue-600">{drawState.roundLabel}</p>
                  <h2 className="mt-2 text-lg font-black leading-snug text-slate-950">{drawState.targetName}</h2>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    链接有效期至 {formatDateTime(drawState.tokenExpiresAt)}
                  </p>
                </div>

                <div className="team-draw-result">
                  {orderNumber ? (
                    <>
                      <CheckCircle2 className="mb-3 h-7 w-7 text-emerald-600" />
                      <p className="text-sm font-black text-slate-500">本团队路演顺序</p>
                      <div className="team-draw-number">{orderNumber}</div>
                      <p className="text-xs font-bold text-slate-500">已同步到管理员后台</p>
                    </>
                  ) : (
                    <>
                      <Shuffle className="mb-4 h-9 w-9 text-blue-700" />
                      <p className="text-base font-black text-slate-800">等待抽取路演顺序</p>
                      <p className="mt-2 px-8 text-center text-xs font-semibold leading-5 text-slate-500">
                        点击后从系统随机队列中确认本团队路演顺序。
                      </p>
                    </>
                  )}
                </div>

                <button className="team-draw-button" disabled={!canDraw} onClick={handleDraw} type="button">
                  <Shuffle className="h-5 w-5" />
                  {submitting ? "抽签中" : orderNumber ? "已完成抽签，可关闭页面" : drawState.expired ? "链接已过期" : "开始抽签"}
                </button>
              </>
            ) : claimState && registrationOpen && selectedProject ? (
              <>
                <div className="team-draw-project">
                  <p className="text-xs font-black text-blue-600">已选择项目</p>
                  <h2 className="mt-2 text-lg font-black leading-snug text-slate-950">{selectedProject.targetName}</h2>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                    项目名由系统带入，请填写项目负责人信息。手机号将作为登录账号。
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-black text-slate-600">
                    负责人姓名
                    <input
                      className="team-draw-input mt-1"
                      onChange={(event) => setRegistrationDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="请输入姓名"
                      value={registrationDraft.name}
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-600">
                    手机号
                    <input
                      className="team-draw-input mt-1"
                      inputMode="tel"
                      onChange={(event) => setRegistrationDraft((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="作为登录账号"
                      value={registrationDraft.phone}
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-600">
                    邮箱
                    <input
                      className="team-draw-input mt-1"
                      inputMode="email"
                      onChange={(event) => setRegistrationDraft((current) => ({ ...current, email: event.target.value }))}
                      placeholder="请输入邮箱"
                      value={registrationDraft.email}
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-600">
                    学院
                    <input
                      className="team-draw-input mt-1"
                      onChange={(event) => setRegistrationDraft((current) => ({ ...current, college: event.target.value }))}
                      placeholder="请输入所属学院"
                      value={registrationDraft.college}
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-600">
                    专业班级
                    <input
                      className="team-draw-input mt-1"
                      onChange={(event) => setRegistrationDraft((current) => ({ ...current, className: event.target.value }))}
                      placeholder="请输入专业班级"
                      value={registrationDraft.className}
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-600">
                    学号
                    <input
                      className="team-draw-input mt-1"
                      onChange={(event) => setRegistrationDraft((current) => ({ ...current, studentId: event.target.value }))}
                      placeholder="请输入学号"
                      value={registrationDraft.studentId}
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-600">
                    设置密码
                    <input
                      className="team-draw-input mt-1"
                      onChange={(event) => setRegistrationDraft((current) => ({ ...current, password: event.target.value }))}
                      placeholder="至少 6 位"
                      type="password"
                      value={registrationDraft.password}
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-600">
                    确认密码
                    <input
                      className="team-draw-input mt-1"
                      onChange={(event) => setRegistrationDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                      placeholder="再次输入密码"
                      type="password"
                      value={registrationDraft.confirmPassword}
                    />
                  </label>
                </div>
                <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
                  注册成功后，本项目不能再次注册负责人账号；请确认项目和负责人信息准确。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600"
                    disabled={submitting}
                    onClick={() => setRegistrationOpen(false)}
                    type="button"
                  >
                    返回选项目
                  </button>
                  <button className="team-draw-button" disabled={submitting} onClick={submitRegistration} type="button">
                    <UserCheck className="h-5 w-5" />
                    {submitting ? "注册中" : "注册并进入抽签"}
                  </button>
                </div>
              </>
            ) : claimState ? (
              <>
                <div className="team-draw-project">
                  <p className="text-xs font-black text-blue-600">{claimState.roundLabel}</p>
                  <h2 className="mt-2 text-lg font-black leading-snug text-slate-950">选择本团队项目</h2>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                    请只选择本团队所属项目。项目选择错误将影响抽签顺序、专家评分和后续统计。
                  </p>
                </div>
                {registrationLocked ? (
                  <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
                    当前抽签入口暂不开放项目注册，请联系管理员核验抽签时间或入口状态。
                  </p>
                ) : null}
                <div className="max-h-[44vh] space-y-2 overflow-y-auto pr-1">
                  {claimState.projects.map((project) => {
                    const active = project.packageId === selectedPackageId;
                    const locked = project.registered || project.drawn;
                    const lockedReason = project.drawn
                      ? "该项目已完成抽签，不能再次选择。"
                      : project.registered
                        ? "该项目已注册负责人账号，不能再次选择。"
                        : "";
                    return (
                      <button
                        className={`team-draw-option ${active ? "team-draw-option-active" : ""}`}
                        disabled={registrationLocked || locked}
                        key={project.packageId}
                        onClick={() => setSelectedPackageId(project.packageId)}
                        title={lockedReason || undefined}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-blue-600">{project.roundLabel}</p>
                            <p className="mt-1 text-sm font-black leading-6 text-slate-900">{project.targetName}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${
                            project.drawn || project.registered ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"
                          }`}>
                            {project.drawn ? "已抽签" : project.registered ? "已注册" : "可注册"}
                          </span>
                        </div>
                        {lockedReason ? (
                          <p className="mt-2 text-xs font-bold leading-5 text-slate-400">{lockedReason}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="team-draw-button"
                  disabled={!selectedProject || registrationLocked || selectedProject.registered || selectedProject.drawn}
                  onClick={startProjectClaim}
                  type="button"
                >
                  <LockKeyhole className="h-5 w-5" />
                  确认项目并注册
                </button>
                <button
                  className="w-full text-center text-xs font-bold text-blue-700"
                  onClick={() => router.push(`/login?next=${encodeURIComponent(currentPath)}`)}
                  type="button"
                >
                  已注册项目账号，直接登录抽签
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

      {confirmStep && selectedProject ? (
        <div className="team-draw-confirm-overlay" role="dialog" aria-modal="true">
          <section className="team-draw-confirm-panel p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {confirmStep === "first" ? "确认项目归属" : "再次确认"}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {confirmStep === "first"
                    ? `请确认“${selectedProject.targetName}”为本团队所属项目。确认后进入负责人注册。`
                    : "本项目首次注册成功后不能重复注册；项目选择错误将影响抽签和后续评审安排。"}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600 transition hover:bg-slate-50"
                onClick={() => setConfirmStep(null)}
                type="button"
              >
                返回
              </button>
              <button className="team-draw-button min-h-11" onClick={continueConfirmation} type="button">
                {confirmStep === "first" ? "确认项目归属" : "再次确认并注册"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
