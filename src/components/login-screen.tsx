"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { USERNAME_RULE_HINT, validateUsername } from "@/lib/account-policy";

type FormMode = "login" | "register";

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
      password: registerValues.password.trim()
        ? registerValues.password.trim().length >= 6
          ? undefined
          : "密码至少需要 6 位"
        : "请输入密码",
      submit: undefined,
    };

    setRegisterErrors(nextErrors);

    if (nextErrors.role || nextErrors.name || nextErrors.username || nextErrors.password) {
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
    <main className="flex min-h-screen items-center justify-center bg-[#f1f8ff] px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-[1080px]">
        <h1 className="mb-8 text-center text-[24px] leading-8 font-bold text-[#13161b] sm:text-[28px] lg:mb-10 lg:text-[32px] lg:leading-9">
          中国国际大学生创新大赛管理系统
        </h1>

        <section className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(36,139,247,0.12)] lg:flex">
          <div
            className="relative hidden min-h-[600px] w-[480px] bg-[#3091f2] bg-cover bg-center bg-no-repeat lg:block"
            style={{
              backgroundImage:
                'url("https://t1.chei.com.cn/passport/assets/images/cyzjk/htgl-bg.png")',
            }}
          />

          <div className="flex flex-1 items-center justify-center bg-[#f5f6f8] px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="w-full max-w-[420px] rounded-xl border border-[#eef1f4] bg-white px-6 py-7 shadow-[0_8px_24px_rgba(19,22,27,0.06)] sm:px-8 sm:py-8">
              <div className="mb-8">
                <h2 className="text-[28px] leading-9 font-bold text-[#13161b]">
                  {mode === "login" ? "用户登录" : "注册账号"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">
                  {mode === "login"
                    ? "请输入账号密码登录管理系统。"
                    : "请先填写基础信息，提交后将进入待审核状态，通过后即可登录。"}
                </p>
              </div>

              {successMessage ? (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#bbf7d0] bg-[#ecfdf5] px-4 py-3 text-sm leading-6 text-[#047857]">
                  <div className="relative mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#d1fae5] text-[#059669]">
                    <span className="absolute inset-0 rounded-full bg-[#6ee7b7]/40 animate-ping" />
                    <CheckCircle2 className="relative h-4 w-4" />
                  </div>
                  <p>{successMessage}</p>
                </div>
              ) : null}

              {mode === "login" ? (
                <form className="relative" noValidate onSubmit={handleLoginSubmit}>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute top-[13px] left-3 h-[18px] w-[18px] bg-contain bg-no-repeat"
                      style={{
                        backgroundImage:
                          'url("https://t2.chei.com.cn/passport/assets/images/yhm.svg")',
                      }}
                    />
                    <input
                      className={`h-11 w-full rounded border bg-white pr-3 pl-[37px] text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#3091f2] ${
                        loginErrors.username ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="用户名/邮箱"
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
                    <p className="mt-1 mb-3 text-sm leading-[22px] text-[#f93b3b]">
                      {loginErrors.username}
                    </p>
                  ) : (
                    <div className="mb-6" />
                  )}

                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute top-[13px] left-3 h-[18px] w-[18px] bg-contain bg-no-repeat"
                      style={{
                        backgroundImage:
                          'url("https://t2.chei.com.cn/passport/assets/images/mm.svg")',
                      }}
                    />
                    <input
                      className={`h-11 w-full rounded border bg-white pr-3 pl-[37px] text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#3091f2] ${
                        loginErrors.password ? "border-[#f93b3b]" : "border-[#d5d7db]"
                      }`}
                      placeholder="密码"
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
                    <p className="mt-1 mb-3 text-sm leading-[22px] text-[#f93b3b]">
                      {loginErrors.password}
                    </p>
                  ) : (
                    <div className="mb-6" />
                  )}

                  <div className="mb-6 flex items-center text-sm leading-[22px] text-[#60656e]">
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
                  </div>

                  {loginErrors.submit ? (
                    <p className="mb-4 rounded-lg bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                      {loginErrors.submit}
                    </p>
                  ) : null}

                  <button
                    className="flex h-11 w-full items-center justify-center gap-2 rounded border border-[#3091f2] bg-[#3091f2] text-base leading-[42px] text-white transition duration-200 hover:-translate-y-px hover:border-[#419df9] hover:bg-[#419df9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3091f2]/20 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7] disabled:hover:translate-y-0 disabled:active:scale-100"
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
                      className={`mt-1 h-11 w-full rounded border bg-white px-3 text-base leading-7 text-[#13161b] outline-none focus:border-[#3091f2] ${
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
                      className={`mt-1 h-11 w-full rounded border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#3091f2] ${
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
                      className={`mt-1 h-11 w-full rounded border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#3091f2] ${
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
                    密码
                    <input
                      className={`mt-1 h-11 w-full rounded border bg-white px-3 text-base leading-7 text-[#13161b] outline-none placeholder:text-[#8d949f] focus:border-[#3091f2] ${
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

                  <div className="rounded-lg bg-[#f8fafc] px-4 py-3 text-sm leading-6 text-[#64748b]">
                    注册后需由可审核的上级账号通过后才能登录：团队成员可由项目负责人 / 指导教师 / 系统管理员审核，项目负责人和评审专家可由指导教师 / 系统管理员审核，指导教师仅可由系统管理员审核。账号名请使用英文字母和数字，不支持中文。
                  </div>

                  {registerErrors.submit ? (
                    <p className="rounded-lg bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                      {registerErrors.submit}
                    </p>
                  ) : null}

                  <button
                    className="flex h-11 w-full items-center justify-center gap-2 rounded border border-[#3091f2] bg-[#3091f2] text-base leading-[42px] text-white transition duration-200 hover:-translate-y-px hover:border-[#419df9] hover:bg-[#419df9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3091f2]/20 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7] disabled:hover:translate-y-0 disabled:active:scale-100"
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

              <div className="mt-6 space-y-2 text-center">
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
        </section>

        <footer className="mt-5 text-center text-xs leading-6 text-[#9ca3af] sm:text-sm">
          © 2026 中国国际大学生创新大赛管理系统
        </footer>
      </div>
    </main>
  );
}
