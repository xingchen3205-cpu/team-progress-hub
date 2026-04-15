"use client";

import Image from "next/image";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { EMAIL_RULE_HINT, USERNAME_RULE_HINT, validateRequiredEmail, validateUsername } from "@/lib/account-policy";

type FormMode = "login" | "register" | "forgot" | "reset";

const registerRoleOptions = ["指导教师", "项目负责人", "团队成员", "评审专家"] as const;

const initialLoginValues = {
  username: "",
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

const initialForgotValues = {
  account: "",
};

const initialResetValues = {
  password: "",
  confirmPassword: "",
};

export function LoginScreen({ initialResetToken = "" }: { initialResetToken?: string }) {
  const router = useRouter();
  const resetToken = initialResetToken.trim();
  const [mode, setMode] = useState<FormMode>("login");
  const [loginValues, setLoginValues] = useState(initialLoginValues);
  const [registerValues, setRegisterValues] = useState(initialRegisterValues);
  const [forgotValues, setForgotValues] = useState(initialForgotValues);
  const [resetValues, setResetValues] = useState(initialResetValues);
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
  const [forgotErrors, setForgotErrors] = useState<{
    account?: string;
    submit?: string;
  }>({});
  const [resetErrors, setResetErrors] = useState<{
    password?: string;
    confirmPassword?: string;
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

  useEffect(() => {
    if (resetToken) {
      setMode("reset");
      setSuccessMessage(null);
    } else if (mode === "reset") {
      setMode("login");
    }
  }, [mode, resetToken]);

  const switchMode = (nextMode: FormMode) => {
    if (mode === "reset" && !resetToken) {
      setMode(nextMode);
      return;
    }

    setMode(nextMode);
    setLoginErrors({});
    setRegisterErrors({});
    setForgotErrors({});
    setResetErrors({});
    setSuccessMessage(null);

    if (resetToken && nextMode !== "reset") {
      router.replace("/login");
    }
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
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
        router.push("/workspace", { scroll: true });
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

  const handleForgotSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const account = forgotValues.account.trim();
    const nextErrors = {
      account: account ? undefined : "请输入账号名或邮箱",
      submit: undefined,
    };

    setForgotErrors(nextErrors);

    if (nextErrors.account) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ account }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        setForgotErrors((current) => ({
          ...current,
          submit: payload?.message || "找回密码失败，请稍后重试。",
        }));
        return;
      }

      setSuccessMessage(payload?.message || "重置邮件已发送，请前往注册邮箱查收。");
      setLoginValues((current) => ({
        ...current,
        username: account,
      }));
      setForgotValues(initialForgotValues);
      setForgotErrors({});
      setMode("login");
    } catch {
      setForgotErrors((current) => ({
        ...current,
        submit: "找回密码请求失败，请稍后重试。",
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

  const handleResetSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const password = resetValues.password.trim();
    const confirmPassword = resetValues.confirmPassword.trim();
    const nextErrors = {
      password: password ? (password.length >= 6 ? undefined : "密码至少需要 6 位") : "请输入新密码",
      confirmPassword: confirmPassword
        ? confirmPassword === password
          ? undefined
          : "两次输入的密码不一致"
        : "请再次输入新密码",
      submit: !resetToken ? "重置链接已失效，请重新申请找回密码" : undefined,
    };

    setResetErrors(nextErrors);

    if (nextErrors.password || nextErrors.confirmPassword || nextErrors.submit) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: resetToken,
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        setResetErrors((current) => ({
          ...current,
          submit: payload?.message || "密码重置失败，请稍后重试。",
        }));
        return;
      }

      setSuccessMessage(payload?.message || "密码已重置，请使用新密码登录。");
      setResetValues(initialResetValues);
      setResetErrors({});
      router.replace("/login");
      setMode("login");
    } catch {
      setResetErrors((current) => ({
        ...current,
        submit: "密码重置请求失败，请稍后重试。",
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="workspace-depth-bg flex min-h-screen items-center justify-center px-4 py-6">
        <div className="depth-card w-full max-w-[calc(100vw-2rem)] rounded-2xl px-5 py-6 text-center sm:max-w-md sm:px-6 sm:py-7">
          <div className="depth-emphasis mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-[#1a6fd4]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <p className="mt-4 text-base font-semibold text-[#13161b]">正在进入系统</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">正在检查登录状态，请稍候片刻。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-depth-bg min-h-screen text-slate-900">
      <div className="min-h-screen lg:grid lg:grid-cols-[11fr_9fr]">
        <section className="relative min-h-[30vh] overflow-hidden sm:min-h-[36vh] lg:min-h-screen">
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
          <div className="relative flex h-full flex-col justify-between px-5 py-5 sm:px-8 sm:py-8 lg:px-14 lg:py-10">
            <div className="mx-auto w-full max-w-3xl">
              <div className="depth-mid inline-flex items-center gap-2 px-3 py-1.5 text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:gap-2.5 sm:px-3.5 sm:py-2">
                <Image
                  alt="南京铁道职业技术学院官方标识"
                  className="h-7 w-auto object-contain sm:h-8"
                  height={77}
                  priority
                  src="/official-logo.png"
                  width={430}
                />
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center px-2 sm:px-4">
              <div className="max-w-3xl text-center">
                <div className="flex flex-col items-center">
                  <h1 className="text-[1.75rem] font-extrabold leading-[1.12] tracking-[0.02em] text-white drop-shadow-[0_10px_28px_rgba(15,23,42,0.42)] sm:text-5xl sm:tracking-[0.045em] lg:text-[4.1rem]">
                    <span className="block text-balance">南京铁道职业技术学院</span>
                    <span className="mt-1 block">大赛管理系统</span>
                  </h1>
                  <div className="mt-4 h-px w-20 bg-gradient-to-r from-transparent via-white/80 to-transparent sm:mt-7 sm:w-24" />
                </div>
              </div>
            </div>

            <div className="mx-auto h-8 w-full max-w-3xl sm:h-12 lg:h-20" />
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-white/18 backdrop-blur-[4px] lg:min-h-screen">
          <div className="flex-1 px-5 py-8 sm:px-10 sm:py-10 lg:px-14">
            <div className="mx-auto flex min-h-full w-full max-w-[27rem] flex-col justify-center">
              <div className="mb-7 sm:mb-10">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                  {mode === "login"
                    ? "用户登录"
                    : mode === "register"
                      ? "注册账号"
                      : mode === "forgot"
                        ? "找回密码"
                        : "重置密码"}
                  <span className="mt-2 block text-sm font-medium tracking-[0.28em] text-slate-400 uppercase">
                    {mode === "login"
                      ? "User Login"
                      : mode === "register"
                        ? "Account Registration"
                        : mode === "forgot"
                          ? "Password Recovery"
                          : "Password Reset"}
                  </span>
                </h2>
              </div>

              {successMessage ? (
                <div className="depth-emphasis mb-4 flex items-start gap-3 px-4 py-3 text-sm leading-6 text-[#1a6fd4]">
                  <div className="relative mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1a6fd4] shadow-[0_12px_24px_rgba(26,111,212,0.18)]">
                    <span className="absolute inset-0 animate-ping rounded-full bg-[#1a6fd4]/16" />
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
                      placeholder="请输入账号名或邮箱"
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
                      onClick={() => switchMode("forgot")}
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
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#1a6fd4] bg-[#1a6fd4] text-base font-medium text-white transition duration-300 hover:bg-[#155cad] hover:shadow-lg hover:shadow-[#1a6fd4]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a6fd4]/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7] disabled:hover:translate-y-0 disabled:active:scale-100"
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
              ) : mode === "forgot" ? (
                <form className="relative space-y-4" noValidate onSubmit={handleForgotSubmit}>
                  <label className="block text-sm leading-6 text-[#60656e]">
                    账号名或邮箱
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#64748b] focus:border-[#1a6fd4] focus:bg-white focus:ring-4 focus:ring-[#1a6fd4]/10 ${
                        forgotErrors.account ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="请输入注册时填写的账号名或邮箱"
                      type="text"
                      value={forgotValues.account}
                      onChange={(event) => {
                        setForgotValues({ account: event.target.value });
                        setForgotErrors((current) => ({
                          ...current,
                          account: undefined,
                          submit: undefined,
                        }));
                      }}
                    />
                    {forgotErrors.account ? (
                      <span className="mt-1 block text-sm text-[#f93b3b]">{forgotErrors.account}</span>
                    ) : (
                      <span className="mt-1 block text-xs leading-6 text-[#94a3b8]">
                        系统会将密码重置入口发送到注册时绑定的邮箱。
                      </span>
                    )}
                  </label>

                  {forgotErrors.submit ? (
                    <p className="rounded-lg bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                      {forgotErrors.submit}
                    </p>
                  ) : null}

                  <button
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#1a6fd4] bg-[#1a6fd4] text-base leading-[42px] text-white transition duration-300 hover:bg-[#155cad] hover:shadow-lg hover:shadow-[#1a6fd4]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a6fd4]/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7] disabled:hover:translate-y-0 disabled:active:scale-100"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>发送中...</span>
                      </>
                    ) : (
                      "发送重置邮件"
                    )}
                  </button>
                </form>
              ) : mode === "reset" ? (
                <form className="relative space-y-4" noValidate onSubmit={handleResetSubmit}>
                  <label className="block text-sm leading-6 text-[#60656e]">
                    新密码
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#64748b] focus:border-[#1a6fd4] focus:bg-white focus:ring-4 focus:ring-[#1a6fd4]/10 ${
                        resetErrors.password ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="请设置新的登录密码"
                      type="password"
                      value={resetValues.password}
                      onChange={(event) => {
                        setResetValues((current) => ({ ...current, password: event.target.value }));
                        setResetErrors((current) => ({
                          ...current,
                          password: undefined,
                          submit: undefined,
                        }));
                      }}
                    />
                    {resetErrors.password ? (
                      <span className="mt-1 block text-sm text-[#f93b3b]">{resetErrors.password}</span>
                    ) : null}
                  </label>

                  <label className="block text-sm leading-6 text-[#60656e]">
                    确认密码
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#64748b] focus:border-[#1a6fd4] focus:bg-white focus:ring-4 focus:ring-[#1a6fd4]/10 ${
                        resetErrors.confirmPassword ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="请再次输入新密码"
                      type="password"
                      value={resetValues.confirmPassword}
                      onChange={(event) => {
                        setResetValues((current) => ({ ...current, confirmPassword: event.target.value }));
                        setResetErrors((current) => ({
                          ...current,
                          confirmPassword: undefined,
                          submit: undefined,
                        }));
                      }}
                    />
                    {resetErrors.confirmPassword ? (
                      <span className="mt-1 block text-sm text-[#f93b3b]">{resetErrors.confirmPassword}</span>
                    ) : null}
                  </label>

                  {resetErrors.submit ? (
                    <p className="rounded-lg bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                      {resetErrors.submit}
                    </p>
                  ) : null}

                  <button
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#1a6fd4] bg-[#1a6fd4] text-base leading-[42px] text-white transition duration-300 hover:bg-[#155cad] hover:shadow-lg hover:shadow-[#1a6fd4]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a6fd4]/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7] disabled:hover:translate-y-0 disabled:active:scale-100"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>提交中...</span>
                      </>
                    ) : (
                      "重置密码"
                    )}
                  </button>
                </form>
              ) : (
                <form className="relative space-y-4" noValidate onSubmit={handleRegisterSubmit}>
                  <label className="block text-sm leading-6 text-[#60656e]">
                    选择身份
                    <select
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none focus:border-[#1a6fd4] focus:bg-white focus:ring-4 focus:ring-[#1a6fd4]/10 ${
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
                    姓名 <span className="text-[#f93b3b]">*</span>
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#1a6fd4] focus:bg-white focus:ring-4 focus:ring-[#1a6fd4]/10 ${
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
                    账号名 <span className="text-[#f93b3b]">*</span>
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#1a6fd4] focus:bg-white focus:ring-4 focus:ring-[#1a6fd4]/10 ${
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
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#1a6fd4] focus:bg-white focus:ring-4 focus:ring-[#1a6fd4]/10 ${
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
                    密码 <span className="text-[#f93b3b]">*</span>
                    <input
                      className={`mt-1 h-12 w-full rounded-2xl border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#1a6fd4] focus:bg-white focus:ring-4 focus:ring-[#1a6fd4]/10 ${
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
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#1a6fd4] bg-[#1a6fd4] text-base leading-[42px] text-white transition duration-300 hover:bg-[#155cad] hover:shadow-lg hover:shadow-[#1a6fd4]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a6fd4]/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7] disabled:hover:translate-y-0 disabled:active:scale-100"
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
                    : mode === "register"
                      ? "提交注册后请等待上一级账号审核通过。"
                      : mode === "forgot"
                        ? "如未收到重置邮件，请确认邮箱是否填写正确并检查垃圾邮件。"
                        : "重置完成后，可返回登录并使用新密码进入系统。"}
                </p>
                <button
                  className="text-sm font-medium text-[#1a6fd4] transition hover:text-[#155cad] hover:underline"
                  onClick={() =>
                    switchMode(
                      mode === "login"
                        ? "register"
                        : mode === "register"
                          ? "login"
                          : "login",
                    )
                  }
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
