"use client";

import Image from "next/image";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { EMAIL_RULE_HINT, USERNAME_RULE_HINT, validateRequiredEmail, validateUsername } from "@/lib/account-policy";

type FormMode = "login" | "register";

const registerRoleOptions = ["指导教师", "项目负责人", "团队成员", "评审专家"] as const;

const initialLoginValues = {
  username: "724000296@qq.com",
  password: "",
  remember: true,
};

const initialRegisterValues = {
  role: "团队成员" as (typeof registerRoleOptions)[number],
  name: "",
  username: "",
  email: "",
  password: "",
};

export function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<FormMode>("login");
  const [loginValues, setLoginValues] = useState(initialLoginValues);
  const [registerValues, setRegisterValues] = useState(initialRegisterValues);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loginErrors, setLoginErrors] = useState<{
    username?: string;
    password?: string;
    submit?: string;
  }>({});
  const [registerErrors, setRegisterErrors] = useState<{
    role?: string;
    name?: string;
    username?: string;
    email?: string;
    password?: string;
    submit?: string;
  }>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (response.ok && isMounted) {
          router.replace("/workspace");
          return;
        }
      } catch {
        // Ignore bootstrap check failures and keep user on login page.
      } finally {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    };

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const switchMode = (nextMode: FormMode) => {
    setMode(nextMode);
    setLoginErrors({});
    setRegisterErrors({});
    setSuccessMessage(null);
  };

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = {
      username: loginValues.username.trim() ? undefined : "请输入账号",
      password: loginValues.password.trim() ? undefined : "请输入密码",
      submit: undefined,
    };

    setLoginErrors(nextErrors);

    if (nextErrors.username || nextErrors.password) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginValues.username.trim(),
          username: loginValues.username.trim(),
          password: loginValues.password.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        setLoginErrors((current) => ({
          ...current,
          submit: payload?.message || "登录失败，请稍后重试。",
        }));
        return;
      }

      startTransition(() => {
        router.push("/workspace");
      });
    } catch {
      setLoginErrors((current) => ({
        ...current,
        submit: "登录请求失败，请稍后重试。",
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = {
      role: registerValues.role ? undefined : "请选择身份",
      name: registerValues.name.trim() ? undefined : "请输入姓名",
      username: validateUsername(registerValues.username.trim()) ?? undefined,
      email: validateRequiredEmail(registerValues.email.trim()) ?? undefined,
      password: registerValues.password.trim()
        ? registerValues.password.trim().length >= 6
          ? undefined
          : "密码至少需要 6 位"
        : "请输入密码",
      submit: undefined,
    };

    setRegisterErrors(nextErrors);

    if (nextErrors.role || nextErrors.name || nextErrors.username || nextErrors.email || nextErrors.password) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: registerValues.role,
          name: registerValues.name.trim(),
          username: registerValues.username.trim(),
          email: registerValues.email.trim(),
          password: registerValues.password.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        setRegisterErrors((current) => ({
          ...current,
          submit: payload?.message || "注册失败，请稍后重试。",
        }));
        return;
      }

      setSuccessMessage(payload?.message || "注册申请已提交，请等待上一级审核通过后再登录系统。");
      setLoginValues((current) => ({
        ...current,
        username: registerValues.username.trim(),
        password: "",
      }));
      setRegisterValues(initialRegisterValues);
      setRegisterErrors({});
      setMode("login");
    } catch {
      setRegisterErrors((current) => ({
        ...current,
        submit: "注册请求失败，请稍后重试。",
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f1f8ff] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#dbeafe] bg-white/95 px-6 py-7 text-center shadow-[0_12px_36px_rgba(48,145,242,0.10)] backdrop-blur">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9f3ff] text-[#3091f2]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <p className="mt-4 text-base font-semibold text-[#13161b]">正在进入系统</p>
          <p className="mt-2 text-sm leading-6 text-[#6b7280]">正在检查登录状态，请稍候片刻。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="min-h-screen lg:grid lg:grid-cols-[11fr_9fr]">
        <section className="relative min-h-[42vh] overflow-hidden lg:min-h-screen">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: 'url("/login-campus.jpg")',
              backgroundPosition: "center center",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/38 via-blue-800/16 to-slate-900/48" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.09),transparent_40%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,transparent_22%,transparent_52%,rgba(125,211,252,0.08)_78%,transparent_100%)] opacity-70" />
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(135deg,rgba(255,255,255,0.07)_0,rgba(255,255,255,0.07)_1px,transparent_1px,transparent_24px)] [background-size:28px_28px]" />
          <div className="relative flex h-full flex-col justify-between px-8 py-8 lg:px-14 lg:py-10">
            <div className="mx-auto w-full max-w-3xl">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/18 bg-white/11 px-3.5 py-2 text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                <Image
                  alt="南京铁道职业技术学院官方标识"
                  className="h-8 w-auto object-contain"
                  height={77}
                  priority
                  src="/official-logo.png"
                  width={430}
                />
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center px-4">
              <div className="max-w-3xl text-center">
                <div className="flex flex-col items-center">
                  <h1 className="text-4xl font-extrabold leading-[1.08] tracking-[0.045em] text-white drop-shadow-[0_10px_28px_rgba(15,23,42,0.42)] sm:text-5xl lg:text-[4.1rem]">
                    <span className="block whitespace-nowrap">南京铁道职业技术学院</span>
                    <span className="mt-1 block whitespace-nowrap">大赛管理系统</span>
                  </h1>
                  <div className="mt-7 h-px w-24 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                </div>
              </div>
            </div>

            <div className="mx-auto h-16 w-full max-w-3xl lg:h-20" />
          </div>
        </section>

        <section className="flex min-h-screen flex-col bg-slate-50">
          <div className="flex-1 px-6 py-10 sm:px-10 lg:px-14">
            <div className="mx-auto flex min-h-full w-full max-w-[27rem] flex-col justify-center">
              <div className="mb-10">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                  {mode === "login" ? "用户登录" : "注册账号"}
                  <span className="mt-2 block text-sm font-medium tracking-[0.28em] text-slate-400 uppercase">
                    {mode === "login" ? "User Login" : "Account Registration"}
                  </span>
                </h2>
              </div>

              {successMessage ? (
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#bbf7d0] bg-[#ecfdf5] px-4 py-3 text-sm leading-6 text-[#047857]">
                  <div className="relative mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#d1fae5] text-[#059669]">
                    <span className="absolute inset-0 animate-ping rounded-full bg-[#6ee7b7]/40" />
                    <CheckCircle2 className="relative h-4 w-4" />
                  </div>
                  <p>{successMessage}</p>
                </div>
              ) : null}

              {mode === "login" ? (
                <form className="relative" noValidate onSubmit={handleLoginSubmit}>
                  <div
                    className={`group relative rounded-2xl border px-4 transition-all duration-300 ${
                      loginErrors.username
                        ? "border-[#f93b3b] bg-white ring-4 ring-[#f93b3b]/10"
                        : "border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-600/10"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-[1.05rem] left-4 h-[18px] w-[18px] bg-contain bg-no-repeat opacity-65 transition-colors group-focus-within:opacity-100"
                      style={{
                        backgroundImage:
                          'url("https://t2.chei.com.cn/passport/assets/images/yhm.svg")',
                      }}
                    />
                    <input
                      className="h-14 w-full border-0 bg-transparent pr-0 pl-8 text-base leading-7 text-[#13161b] outline-none placeholder:text-slate-500"
                      placeholder="请输入系统账号"
                      type="text"
                      value={loginValues.username}
                      onChange={(event) => {
                        setLoginValues((current) => ({ ...current, username: event.target.value }));
                        setLoginErrors((current) => ({
                          ...current,
                          username: undefined,
                          submit: undefined,
                        }));
                        setSuccessMessage(null);
                      }}
                    />
                  </div>
                  {loginErrors.username ? (
                    <p className="mt-2 mb-5 text-sm leading-[22px] text-[#f93b3b]">
                      {loginErrors.username}
                    </p>
                  ) : (
                    <div className="mb-7" />
                  )}

                  <div
                    className={`group relative rounded-2xl border px-4 transition-all duration-300 ${
                      loginErrors.password
                        ? "border-[#f93b3b] bg-white ring-4 ring-[#f93b3b]/10"
                        : "border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-600/10"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-[1.05rem] left-4 h-[18px] w-[18px] bg-contain bg-no-repeat opacity-65 transition-colors group-focus-within:opacity-100"
                      style={{
                        backgroundImage:
                          'url("https://t2.chei.com.cn/passport/assets/images/mm.svg")',
                      }}
                    />
                    <input
                      className="h-14 w-full border-0 bg-transparent pr-0 pl-8 text-base leading-7 text-[#13161b] outline-none placeholder:text-slate-500"
                      placeholder="请输入密码"
                      type="password"
                      value={loginValues.password}
                      onChange={(event) => {
                        setLoginValues((current) => ({ ...current, password: event.target.value }));
                        setLoginErrors((current) => ({
                          ...current,
                          password: undefined,
                          submit: undefined,
                        }));
                        setSuccessMessage(null);
                      }}
                    />
                  </div>
                  {loginErrors.password ? (
                    <p className="mt-2 mb-5 text-sm leading-[22px] text-[#f93b3b]">
                      {loginErrors.password}
                    </p>
                  ) : (
                    <div className="mb-7" />
                  )}

                  <div className="mb-6 flex items-center justify-between gap-3 text-sm leading-[22px] text-[#60656e]">
                    <label className="flex items-center gap-2">
                      <input
                        checked={loginValues.remember}
                        type="checkbox"
                        onChange={(event) =>
                          setLoginValues((current) => ({
                            ...current,
                            remember: event.target.checked,
                          }))
                        }
                      />
                      <span>记住密码</span>
                    </label>
                    <button
                      className="text-sm text-slate-500 transition hover:text-blue-900 hover:underline"
                      onClick={() => setLoginErrors((current) => ({ ...current, submit: "请联系系统管理员重置密码。" }))}
                      type="button"
                    >
                      忘记密码？
                    </button>
                  </div>

                  {loginErrors.submit ? (
                    <p className="mb-4 rounded-xl bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                      {loginErrors.submit}
                    </p>
                  ) : null}

                  <button
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#172554] bg-[#172554] text-base font-medium text-white transition duration-300 hover:bg-[#1e3a8a] hover:shadow-lg hover:shadow-[#172554]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172554]/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7] disabled:hover:translate-y-0 disabled:active:scale-100"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>登录中...</span>
                      </>
                    ) : (
                      "登录"
                    )}
                  </button>
                </form>
              ) : (
                <form className="relative space-y-4" noValidate onSubmit={handleRegisterSubmit}>
                  <label className="block text-sm leading-6 text-[#60656e]">
                    选择身份
                    <select
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none focus:border-[#172554] focus:bg-white focus:ring-4 focus:ring-[#172554]/10 ${
                        registerErrors.role ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      value={registerValues.role}
                      onChange={(event) => {
                        setRegisterValues((current) => ({
                          ...current,
                          role: event.target.value as (typeof registerRoleOptions)[number],
                        }));
                        setRegisterErrors((current) => ({
                          ...current,
                          role: undefined,
                          submit: undefined,
                        }));
                      }}
                    >
                      {registerRoleOptions.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {roleOption}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm leading-6 text-[#60656e]">
                    姓名
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#172554] focus:bg-white focus:ring-4 focus:ring-[#172554]/10 ${
                        registerErrors.name ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="请输入真实姓名"
                      type="text"
                      value={registerValues.name}
                      onChange={(event) => {
                        setRegisterValues((current) => ({ ...current, name: event.target.value }));
                        setRegisterErrors((current) => ({
                          ...current,
                          name: undefined,
                          submit: undefined,
                        }));
                      }}
                    />
                    {registerErrors.name ? (
                      <span className="mt-1 block text-sm text-[#f93b3b]">{registerErrors.name}</span>
                    ) : null}
                  </label>

                  <label className="block text-sm leading-6 text-[#60656e]">
                    账号名
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#172554] focus:bg-white focus:ring-4 focus:ring-[#172554]/10 ${
                        registerErrors.username ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="请输入登录账号名"
                      type="text"
                      value={registerValues.username}
                      onChange={(event) => {
                        setRegisterValues((current) => ({ ...current, username: event.target.value }));
                        setRegisterErrors((current) => ({
                          ...current,
                          username: undefined,
                          submit: undefined,
                        }));
                      }}
                    />
                    {registerErrors.username ? (
                      <span className="mt-1 block text-sm text-[#f93b3b]">{registerErrors.username}</span>
                    ) : (
                      <span className="mt-1 block text-xs leading-6 text-[#94a3b8]">{USERNAME_RULE_HINT}</span>
                    )}
                  </label>

                  <label className="block text-sm leading-6 text-[#60656e]">
                    邮箱 <span className="text-[#f93b3b]">*</span>
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#172554] focus:bg-white focus:ring-4 focus:ring-[#172554]/10 ${
                        registerErrors.email ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="用于接收任务和日程提醒"
                      type="email"
                      value={registerValues.email}
                      onChange={(event) => {
                        setRegisterValues((current) => ({ ...current, email: event.target.value }));
                        setRegisterErrors((current) => ({
                          ...current,
                          email: undefined,
                          submit: undefined,
                        }));
                      }}
                    />
                    {registerErrors.email ? (
                      <span className="mt-1 block text-sm text-[#f93b3b]">{registerErrors.email}</span>
                    ) : (
                      <span className="mt-1 block text-xs leading-6 text-[#94a3b8]">{EMAIL_RULE_HINT}</span>
                    )}
                  </label>

                  <label className="block text-sm leading-6 text-[#60656e]">
                    密码
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#172554] focus:bg-white focus:ring-4 focus:ring-[#172554]/10 ${
                        registerErrors.password ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="请设置登录密码"
                      type="password"
                      value={registerValues.password}
                      onChange={(event) => {
                        setRegisterValues((current) => ({ ...current, password: event.target.value }));
                        setRegisterErrors((current) => ({
                          ...current,
                          password: undefined,
                          submit: undefined,
                        }));
                      }}
                    />
                    {registerErrors.password ? (
                      <span className="mt-1 block text-sm text-[#f93b3b]">{registerErrors.password}</span>
                    ) : null}
                  </label>

                  {registerErrors.submit ? (
                    <p className="rounded-lg bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                      {registerErrors.submit}
                    </p>
                  ) : null}

                  <button
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#172554] bg-[#172554] text-base leading-[42px] text-white transition duration-300 hover:bg-[#1e3a8a] hover:shadow-lg hover:shadow-[#172554]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172554]/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7] disabled:hover:translate-y-0 disabled:active:scale-100"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>提交中...</span>
                      </>
                    ) : (
                      "提交注册"
                    )}
                  </button>
                </form>
              )}

              <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm">
                <p className="text-sm leading-7 text-[#6b7280]">
                  {mode === "login"
                    ? "没有账号可先注册，审核通过后即可登录系统。"
                    : "提交注册后请等待上一级账号审核通过。"}
                </p>
                <button
                  className="text-sm font-medium text-[#326ca6] transition hover:text-[#255686] hover:underline"
                  onClick={() => switchMode(mode === "login" ? "register" : "login")}
                  type="button"
                >
                  {mode === "login" ? "注册账号" : "返回登录"}
                </button>
              </div>
            </div>
          </div>
          <footer className="border-t border-slate-100 px-6 py-5 text-center text-xs leading-6 text-slate-400 sm:px-10 lg:px-14">
            © 2026 中国国际大学生创新大赛管理系统 - 南京铁道职业技术学院
          </footer>
        </section>
      </div>
    </main>
  );
}
