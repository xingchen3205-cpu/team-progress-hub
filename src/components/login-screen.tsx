"use client";

import Image from "next/image";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Loader2,
  ShieldUser,
  User,
  UserPlus,
} from "lucide-react";

import { EMAIL_RULE_HINT, USERNAME_RULE_HINT, validateRequiredEmail, validateUsername } from "@/lib/account-policy";

type FormMode = "login" | "register" | "forgot" | "reset";

const registerRoleOptions = ["指导教师", "项目负责人", "团队成员"] as const;

const initialLoginValues = {
  username: "",
  password: "",
  captcha: "",
  remember: true,
};

const initialRegisterValues = {
  role: "团队成员" as (typeof registerRoleOptions)[number],
  name: "",
  username: "",
  email: "",
  emailCode: "",
  password: "",
  college: "",
  className: "",
  studentId: "",
};

const initialForgotValues = {
  account: "",
};

const initialResetValues = {
  password: "",
  confirmPassword: "",
};

const modeCopy: Record<FormMode, { title: string; subtitle: string; lead: string }> = {
  login: {
    title: "用户登录",
    subtitle: "USER LOGIN",
    lead: "请输入账号信息进入管理系统",
  },
  register: {
    title: "注册账号",
    subtitle: "ACCOUNT REGISTRATION",
    lead: "提交申请后由上一级账号审核",
  },
  forgot: {
    title: "找回密码",
    subtitle: "PASSWORD RECOVERY",
    lead: "通过注册邮箱获取重置入口",
  },
  reset: {
    title: "重置密码",
    subtitle: "PASSWORD RESET",
    lead: "请设置新的登录密码",
  },
};

const getInitialMobileLoginViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    window.requestAnimationFrame(() => resolve());
  });

export function LoginScreen({ initialResetToken = "" }: { initialResetToken?: string }) {
  const router = useRouter();
  const resetToken = initialResetToken.trim();
  const [mode, setMode] = useState<FormMode>("login");
  const [loginValues, setLoginValues] = useState(initialLoginValues);
  const [registerValues, setRegisterValues] = useState(initialRegisterValues);
  const [forgotValues, setForgotValues] = useState(initialForgotValues);
  const [resetValues, setResetValues] = useState(initialResetValues);
  const [sessionCheckPending, setSessionCheckPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isMobileLoginViewport, setIsMobileLoginViewport] = useState(getInitialMobileLoginViewport);
  const [captchaVersion, setCaptchaVersion] = useState(() => Date.now());
  const [captchaError, setCaptchaError] = useState(false);
  const [loginErrors, setLoginErrors] = useState<{
    username?: string;
    password?: string;
    captcha?: string;
    submit?: string;
  }>({});
  const [registerErrors, setRegisterErrors] = useState<{
    role?: string;
    name?: string;
    username?: string;
    email?: string;
    emailCode?: string;
    password?: string;
    college?: string;
    className?: string;
    studentId?: string;
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
  const [isSendingRegisterEmailCode, setIsSendingRegisterEmailCode] = useState(false);

  const isStudentRegisterRole = registerValues.role === "项目负责人" || registerValues.role === "团队成员";
  const captchaRequired = !isMobileLoginViewport;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rememberedAccount = window.localStorage.getItem("team-progress-login-account");
    if (!rememberedAccount) {
      return;
    }

    setLoginValues((current) => ({
      ...current,
      username: rememberedAccount,
      remember: true,
    }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const syncMobileViewport = () => {
      setIsMobileLoginViewport(mediaQuery.matches);
    };

    syncMobileViewport();
    mediaQuery.addEventListener("change", syncMobileViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncMobileViewport);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkSession = async () => {
      if (!isMounted) return;
      setSessionCheckPending(true);

      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 1200);

        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok && isMounted) {
          router.replace("/workspace");
          return;
        }
      } catch {
        // Ignore bootstrap check failures and keep user on login page.
      } finally {
        if (isMounted) {
          setSessionCheckPending(false);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    void checkSession();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
    setShowPassword(false);

    if (resetToken && nextMode !== "reset") {
      router.replace("/login");
    }
  };

  const refreshCaptcha = () => {
    setCaptchaVersion(Date.now());
    setCaptchaError(false);
    setLoginValues((current) => ({ ...current, captcha: "" }));
  };

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = {
      username: loginValues.username.trim() ? undefined : "请输入账号",
      password: loginValues.password.trim() ? undefined : "请输入密码",
      captcha: loginValues.captcha.trim() ? undefined : captchaRequired ? "请输入验证码" : undefined,
      submit: undefined,
    };

    setLoginErrors(nextErrors);

    if (nextErrors.username || nextErrors.password || nextErrors.captcha) {
      return;
    }

    setIsSubmitting(true);
    try {
      await waitForNextPaint();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginValues.username.trim(),
          username: loginValues.username.trim(),
          password: loginValues.password.trim(),
          captcha: captchaRequired ? loginValues.captcha.trim() : undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        setLoginErrors((current) => ({
          ...current,
          submit: payload?.message || "登录失败，请稍后重试。",
        }));
        if (captchaRequired) {
          refreshCaptcha();
        }
        return;
      }

      if (typeof window !== "undefined") {
        if (loginValues.remember) {
          window.localStorage.setItem("team-progress-login-account", loginValues.username.trim());
        } else {
          window.localStorage.removeItem("team-progress-login-account");
        }
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
      if (captchaRequired) {
        refreshCaptcha();
      }
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

  const sendRegisterEmailCode = async () => {
    const email = registerValues.email.trim();
    const emailError = validateRequiredEmail(email) ?? undefined;
    if (emailError) {
      setRegisterErrors((current) => ({ ...current, email: emailError, submit: undefined }));
      return;
    }

    setIsSendingRegisterEmailCode(true);
    setRegisterErrors((current) => ({ ...current, email: undefined, submit: undefined }));
    try {
      const response = await fetch("/api/auth/register/email-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setRegisterErrors((current) => ({
          ...current,
          email: payload?.message || "验证码发送失败，请稍后重试。",
        }));
        return;
      }

      setSuccessMessage(payload?.message || "验证码已发送，请前往邮箱查收。");
    } catch {
      setRegisterErrors((current) => ({
        ...current,
        email: "验证码发送失败，请稍后重试。",
      }));
    } finally {
      setIsSendingRegisterEmailCode(false);
    }
  };

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const studentRole = registerValues.role === "项目负责人" || registerValues.role === "团队成员";

    const nextErrors = {
      role: registerValues.role ? undefined : "请选择身份",
      name: registerValues.name.trim() ? undefined : "请输入姓名",
      username: validateUsername(registerValues.username.trim()) ?? undefined,
      email: validateRequiredEmail(registerValues.email.trim()) ?? undefined,
      emailCode: registerValues.emailCode.trim() ? undefined : "请输入邮箱验证码",
      password: registerValues.password.trim()
        ? registerValues.password.trim().length >= 6
          ? undefined
          : "密码至少需要 6 位"
        : "请输入密码",
      college: registerValues.college.trim() ? undefined : "请输入所属学院或部门",
      className: studentRole && !registerValues.className.trim() ? "请输入专业班级" : undefined,
      studentId: studentRole && !registerValues.studentId.trim() ? "请输入学号" : undefined,
      submit: undefined,
    };

    setRegisterErrors(nextErrors);

    if (
      nextErrors.role ||
      nextErrors.name ||
      nextErrors.username ||
      nextErrors.email ||
      nextErrors.emailCode ||
      nextErrors.password ||
      nextErrors.college ||
      nextErrors.className ||
      nextErrors.studentId
    ) {
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
          emailCode: registerValues.emailCode.trim(),
          password: registerValues.password.trim(),
          college: registerValues.college.trim(),
          className: registerValues.className.trim(),
          studentId: registerValues.studentId.trim(),
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

  const currentCopy = modeCopy[mode];

  return (
    <main className="min-h-screen bg-white text-[#16305c]">
      <div className="login-shell min-h-screen overflow-hidden bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] lg:grid lg:min-w-[1200px] lg:grid-cols-[55fr_45fr]">
        <section className="login-visual-panel relative min-h-[46vh] overflow-hidden lg:min-h-screen">
          <Image
            alt="南京铁道职业技术学院校园背景"
            className="object-cover object-center"
            fill
            sizes="(min-width: 1024px) 55vw, 100vw"
            src="/login-campus.jpg"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,49,135,.78)_0%,rgba(6,39,112,.72)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(88,166,255,0.22),transparent_30%),radial-gradient(circle_at_76%_86%,rgba(29,92,255,0.18),transparent_36%)]" />
          <div className="absolute inset-x-0 bottom-0 h-[26%] bg-[radial-gradient(ellipse_at_50%_100%,rgba(28,111,255,0.24),transparent_68%)]" />
          <div className="absolute left-[26%] bottom-[-16%] h-56 w-[62rem] rotate-[-8deg] rounded-[50%] border border-cyan-100/26" />
          <div className="absolute left-[42%] bottom-[-22%] h-72 w-[70rem] rotate-[-10deg] rounded-[50%] border border-blue-100/16" />
          <div className="absolute inset-x-0 bottom-[9%] h-px bg-[linear-gradient(100deg,transparent_0%,rgba(255,255,255,0.16)_24%,rgba(125,211,252,0.56)_52%,transparent_78%)]" />
          <div className="absolute inset-x-0 bottom-[14%] h-px rotate-[-8deg] bg-[linear-gradient(100deg,transparent_0%,rgba(255,255,255,0.14)_36%,rgba(96,211,255,0.46)_55%,transparent_76%)]" />
          <div className="absolute right-[17%] bottom-[10%] h-2 w-2 rounded-full bg-cyan-100 shadow-[0_0_30px_12px_rgba(96,211,255,0.46)]" />

          <div className="relative z-10 flex min-h-[46vh] flex-col px-5 py-8 sm:px-12 lg:min-h-screen lg:px-16 lg:py-12 xl:px-20">
            <div className="flex items-center">
              <Image
                alt="南京铁道职业技术学院"
                className="h-[58px] w-auto object-contain brightness-0 invert drop-shadow-[0_10px_24px_rgba(0,0,0,0.24)] sm:h-[68px]"
                height={77}
                priority
                src="/official-logo.png"
                width={430}
              />
              <span className="sr-only">
                南京铁道职业技术学院 NANJING VOCATIONAL INSTITUTE OF RAILWAY TECHNOLOGY
              </span>
            </div>

            <div className="flex flex-1 items-center justify-center text-center">
              <div className="mx-auto max-w-[48rem] pb-8 pt-12 lg:min-w-[540px] lg:max-w-none lg:pb-0 lg:pt-0">
                <h1 className="text-[1.9rem] font-extrabold leading-[1.18] tracking-normal text-white drop-shadow-[0_16px_34px_rgba(0,0,0,0.34)] sm:text-[3.25rem] sm:tracking-[0.025em] lg:text-[3.2rem] xl:text-[3.8rem] 2xl:text-[4.1rem]">
                  <span className="block whitespace-nowrap">南京铁道职业技术学院</span>
                  <span className="mt-2 block whitespace-nowrap">大赛管理系统</span>
                </h1>
                <div className="mx-auto mt-7 h-px w-[28rem] max-w-full bg-gradient-to-r from-transparent via-white/75 to-transparent" />
                <p
                  aria-label="以赛促学 · 以赛促教 · 以赛促创 · 以赛促用"
                  className="mx-auto mt-6 grid max-w-[18rem] grid-cols-2 items-center justify-items-center gap-x-9 gap-y-3 text-[0.98rem] font-semibold tracking-[0.08em] text-white sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-x-7 sm:gap-y-2 sm:text-xl sm:tracking-[0.18em] lg:flex-nowrap lg:whitespace-nowrap"
                >
                  <span>以赛促学</span>
                  <span className="hidden text-white/70 sm:inline">·</span>
                  <span>以赛促教</span>
                  <span className="hidden text-white/70 sm:inline">·</span>
                  <span>以赛促创</span>
                  <span className="hidden text-white/70 sm:inline">·</span>
                  <span>以赛促用</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="login-function-panel flex min-h-screen flex-col bg-[#f3f6fb] px-6 py-8 sm:px-10 lg:px-12 xl:px-16">
          {sessionCheckPending ? (
            <div className="mx-auto mb-3 flex w-full max-w-[560px] items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-medium text-[#1d5cff] shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在检查登录状态…
            </div>
          ) : null}

          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-[560px]">
              <div className="rounded-[24px] bg-white px-7 py-8 shadow-[0_10px_30px_rgba(20,55,120,0.08)] sm:px-9 sm:py-10">
                <div className="text-center">
                  <div className="flex flex-col items-center justify-center gap-3 sm:inline-flex sm:flex-row sm:gap-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#2F74FF_0%,#1857F2_100%)] text-white shadow-[0_12px_26px_rgba(29,92,255,0.22)]">
                      <ShieldUser className="h-6 w-6" />
                    </div>
                    <h2 className="text-center text-[2rem] font-extrabold tracking-normal text-[#16305c] sm:tracking-[0.04em]">
                      {currentCopy.title}
                    </h2>
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-4 text-xs font-semibold tracking-[0.2em] text-[#8a96a8] sm:tracking-[0.48em]">
                    <span className="h-px w-12 bg-[#e6ebf2] sm:w-16" />
                    <span>{currentCopy.subtitle}</span>
                    <span className="h-px w-12 bg-[#e6ebf2] sm:w-16" />
                  </div>
                  {mode !== "login" ? (
                    <p className="mt-3 text-sm leading-6 text-[#8a96a8]">{currentCopy.lead}</p>
                  ) : null}
                </div>

                {successMessage ? (
                  <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#d8e7ff] bg-[#f2f7ff] px-4 py-3 text-sm leading-6 text-[#1d5cff]">
                    <div className="relative mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1d5cff] shadow-[0_12px_24px_rgba(29,92,255,0.16)]">
                      <span className="absolute inset-0 animate-ping rounded-full bg-[#1d5cff]/15" />
                      <CheckCircle2 className="relative h-4 w-4" />
                    </div>
                    <p>{successMessage}</p>
                  </div>
                ) : null}

                <div className="mt-8">
                  {mode === "login" ? (
                    <form className="space-y-0" noValidate onSubmit={handleLoginSubmit}>
                      <div
                        className={`group relative rounded-[14px] border bg-white px-4 transition duration-200 ${
                          loginErrors.username
                            ? "border-[#ef4444] ring-4 ring-[#ef4444]/10"
                            : "border-[#e6ebf2] focus-within:border-[#1d5cff] focus-within:ring-4 focus-within:ring-[#1d5cff]/10"
                        }`}
                      >
                        <User className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#b7c1d0] transition group-focus-within:text-[#1d5cff]" />
                        <input
                          className="h-[58px] w-full border-0 bg-transparent pl-10 pr-0 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6]"
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
                        <p className="mt-2 mb-5 text-sm leading-6 text-[#ef4444]">{loginErrors.username}</p>
                      ) : (
                        <div className="mb-7" />
                      )}

                      <div
                        className={`group relative rounded-[14px] border bg-white px-4 transition duration-200 ${
                          loginErrors.password
                            ? "border-[#ef4444] ring-4 ring-[#ef4444]/10"
                            : "border-[#e6ebf2] focus-within:border-[#1d5cff] focus-within:ring-4 focus-within:ring-[#1d5cff]/10"
                        }`}
                      >
                        <LockKeyhole className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#b7c1d0] transition group-focus-within:text-[#1d5cff]" />
                        <input
                          className="h-[58px] w-full border-0 bg-transparent pl-10 pr-12 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6]"
                          placeholder="请输入密码"
                          type={showPassword ? "text" : "password"}
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
                        <button
                          aria-label={showPassword ? "隐藏密码" : "显示密码"}
                          className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#b7c1d0] transition hover:bg-[#f3f6fb] hover:text-[#1d5cff]"
                          onClick={() => setShowPassword((current) => !current)}
                          type="button"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {loginErrors.password ? (
                        <p className="mt-2 mb-5 text-sm leading-6 text-[#ef4444]">{loginErrors.password}</p>
                      ) : (
                        <div className="mb-5" />
                      )}

                      <div className="mb-2 hidden gap-3 sm:grid sm:grid-cols-[1fr_auto]">
                        <div
                          className={`group relative rounded-[14px] border bg-white px-4 transition duration-200 ${
                            captchaRequired && loginErrors.captcha
                              ? "border-[#ef4444] ring-4 ring-[#ef4444]/10"
                              : "border-[#e6ebf2] focus-within:border-[#1d5cff] focus-within:ring-4 focus-within:ring-[#1d5cff]/10"
                          }`}
                        >
                          <ShieldUser className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#b7c1d0] transition group-focus-within:text-[#1d5cff]" />
                          <input
                            autoComplete="off"
                            className="h-[54px] w-full border-0 bg-transparent pl-10 pr-0 text-base tracking-[0.18em] text-[#16305c] outline-none placeholder:tracking-normal placeholder:text-[#9aa6b6]"
                            inputMode="text"
                            maxLength={4}
                            placeholder="请输入验证码"
                            type="text"
                            value={loginValues.captcha}
                            onChange={(event) => {
                              setLoginValues((current) => ({
                                ...current,
                                captcha: event.target.value.toUpperCase(),
                              }));
                              setLoginErrors((current) => ({
                                ...current,
                                captcha: undefined,
                                submit: undefined,
                              }));
                              setSuccessMessage(null);
                            }}
                          />
                        </div>
                        <button
                          aria-label="刷新验证码"
                          className="relative flex h-[54px] w-[140px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-[#d8e2f1] bg-[#f8fbff] transition hover:border-[#1d5cff] hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1d5cff]/10"
                          onClick={refreshCaptcha}
                          type="button"
                        >
                          {captchaError ? (
                            <span className="px-2 text-xs font-medium text-[#ef4444]">
                              验证码加载失败，点击刷新
                            </span>
                          ) : (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                alt="验证码"
                                className="h-11 w-[132px] rounded-[12px] object-cover"
                                draggable={false}
                                height={44}
                                loading="eager"
                                src={`/api/auth/captcha?v=${captchaVersion}`}
                                width={132}
                                onError={() => setCaptchaError(true)}
                              />
                            </>
                          )}
                        </button>
                      </div>
                      {captchaRequired && loginErrors.captcha ? (
                        <p className="mt-2 mb-5 text-sm leading-6 text-[#ef4444]">{loginErrors.captcha}</p>
                      ) : captchaRequired ? (
                        <p className="mt-2 mb-5 text-xs leading-5 text-[#8a96a8]">看不清可点击图片刷新验证码。</p>
                      ) : (
                        <div className="mb-5" />
                      )}

                      <div className="mb-6 flex items-center justify-between gap-3 text-sm leading-6 text-[#6b7280]">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            checked={loginValues.remember}
                            className="h-4 w-4 rounded border-[#d7dee9] text-[#1d5cff] accent-[#1d5cff]"
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
                          className="text-sm text-[#6b7280] transition hover:text-[#1d5cff]"
                          onClick={() => switchMode("forgot")}
                          type="button"
                        >
                          忘记密码?
                        </button>
                      </div>

                      {loginErrors.submit ? (
                        <p className="mb-4 rounded-xl bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                          {loginErrors.submit}
                        </p>
                      ) : null}

                      <button
                        className="inline-flex h-[58px] w-full items-center justify-center rounded-[14px] bg-[linear-gradient(180deg,#2F74FF_0%,#1857F2_100%)] text-lg font-semibold tracking-normal text-white shadow-[0_16px_28px_rgba(29,92,255,0.22)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(29,92,255,0.28)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1d5cff]/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:tracking-[0.04em]"
                        disabled={isSubmitting}
                        type="submit"
                      >
                        {isSubmitting ? (
                          <span className="inline-flex items-center justify-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            正在登录...
                          </span>
                        ) : (
                          "登录"
                        )}
                      </button>
                    </form>
                  ) : mode === "forgot" ? (
                    <form className="space-y-5" noValidate onSubmit={handleForgotSubmit}>
                      <label className="block text-sm leading-6 text-[#6b7280]">
                        账号名或邮箱
                        <input
                          className={`mt-2 h-[54px] w-full rounded-[14px] border bg-white px-4 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            forgotErrors.account ? "border-[#ef4444]" : "border-[#e6ebf2]"
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
                          <span className="mt-1 block text-sm text-[#ef4444]">{forgotErrors.account}</span>
                        ) : (
                          <span className="mt-1 block text-xs leading-6 text-[#8a96a8]">
                            系统会将密码重置入口发送到注册时绑定的邮箱。
                          </span>
                        )}
                      </label>

                      {forgotErrors.submit ? (
                        <p className="rounded-xl bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                          {forgotErrors.submit}
                        </p>
                      ) : null}

                      <button
                        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,#2F74FF_0%,#1857F2_100%)] text-base font-semibold text-white shadow-[0_14px_24px_rgba(29,92,255,0.2)] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={isSubmitting}
                        type="submit"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            发送中...
                          </>
                        ) : (
                          "发送重置邮件"
                        )}
                      </button>
                    </form>
                  ) : mode === "reset" ? (
                    <form className="space-y-5" noValidate onSubmit={handleResetSubmit}>
                      <label className="block text-sm leading-6 text-[#6b7280]">
                        新密码
                        <input
                          className={`mt-2 h-[54px] w-full rounded-[14px] border bg-white px-4 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            resetErrors.password ? "border-[#ef4444]" : "border-[#e6ebf2]"
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
                          <span className="mt-1 block text-sm text-[#ef4444]">{resetErrors.password}</span>
                        ) : null}
                      </label>

                      <label className="block text-sm leading-6 text-[#6b7280]">
                        确认密码
                        <input
                          className={`mt-2 h-[54px] w-full rounded-[14px] border bg-white px-4 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            resetErrors.confirmPassword ? "border-[#ef4444]" : "border-[#e6ebf2]"
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
                          <span className="mt-1 block text-sm text-[#ef4444]">{resetErrors.confirmPassword}</span>
                        ) : null}
                      </label>

                      {resetErrors.submit ? (
                        <p className="rounded-xl bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                          {resetErrors.submit}
                        </p>
                      ) : null}

                      <button
                        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,#2F74FF_0%,#1857F2_100%)] text-base font-semibold text-white shadow-[0_14px_24px_rgba(29,92,255,0.2)] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={isSubmitting}
                        type="submit"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            提交中...
                          </>
                        ) : (
                          "重置密码"
                        )}
                      </button>
                    </form>
                  ) : (
                    <form className="space-y-4" noValidate onSubmit={handleRegisterSubmit}>
                      <label className="block text-sm leading-6 text-[#6b7280]">
                        选择身份
                        <select
                          className={`mt-1 h-12 w-full rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            registerErrors.role ? "border-[#ef4444]" : "border-[#e6ebf2]"
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

                      <label className="block text-sm leading-6 text-[#6b7280]">
                        姓名 <span className="text-[#ef4444]">*</span>
                        <input
                          className={`mt-1 h-12 w-full rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            registerErrors.name ? "border-[#ef4444]" : "border-[#e6ebf2]"
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
                          <span className="mt-1 block text-sm text-[#ef4444]">{registerErrors.name}</span>
                        ) : null}
                      </label>

                      <label className="block text-sm leading-6 text-[#6b7280]">
                        账号名 <span className="text-[#ef4444]">*</span>
                        <input
                          className={`mt-1 h-12 w-full rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            registerErrors.username ? "border-[#ef4444]" : "border-[#e6ebf2]"
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
                          <span className="mt-1 block text-sm text-[#ef4444]">{registerErrors.username}</span>
                        ) : (
                          <span className="mt-1 block text-xs leading-6 text-[#8a96a8]">{USERNAME_RULE_HINT}</span>
                        )}
                      </label>

                      <label className="block text-sm leading-6 text-[#6b7280]">
                        邮箱 <span className="text-[#ef4444]">*</span>
                        <input
                          className={`mt-1 h-12 w-full rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            registerErrors.email ? "border-[#ef4444]" : "border-[#e6ebf2]"
                          }`}
                          placeholder="用于接收任务和日程提醒"
                          type="email"
                          value={registerValues.email}
                          onChange={(event) => {
                            setRegisterValues((current) => ({
                              ...current,
                              email: event.target.value,
                              emailCode: "",
                            }));
                            setRegisterErrors((current) => ({
                              ...current,
                              email: undefined,
                              emailCode: undefined,
                              submit: undefined,
                            }));
                          }}
                        />
                        {registerErrors.email ? (
                          <span className="mt-1 block text-sm text-[#ef4444]">{registerErrors.email}</span>
                        ) : (
                          <span className="mt-1 block text-xs leading-6 text-[#8a96a8]">{EMAIL_RULE_HINT}</span>
                        )}
                      </label>

                      <label className="block text-sm leading-6 text-[#6b7280]">
                        邮箱验证码 <span className="text-[#ef4444]">*</span>
                        <div className="mt-1 flex gap-2">
                          <input
                            className={`h-12 min-w-0 flex-1 rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                              registerErrors.emailCode ? "border-[#ef4444]" : "border-[#e6ebf2]"
                            }`}
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="请输入验证码"
                            type="text"
                            value={registerValues.emailCode}
                            onChange={(event) => {
                              setRegisterValues((current) => ({
                                ...current,
                                emailCode: event.target.value.replace(/\D/g, "").slice(0, 6),
                              }));
                              setRegisterErrors((current) => ({
                                ...current,
                                emailCode: undefined,
                                submit: undefined,
                              }));
                            }}
                          />
                          <button
                            className="h-12 shrink-0 rounded-[14px] border border-[#bfdbfe] bg-[#eff6ff] px-4 text-sm font-semibold text-[#1d5cff] transition hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSendingRegisterEmailCode}
                            onClick={sendRegisterEmailCode}
                            type="button"
                          >
                            {isSendingRegisterEmailCode ? "发送中" : "获取验证码"}
                          </button>
                        </div>
                        {registerErrors.emailCode ? (
                          <span className="mt-1 block text-sm text-[#ef4444]">{registerErrors.emailCode}</span>
                        ) : (
                          <span className="mt-1 block text-xs leading-6 text-[#8a96a8]">验证码 10 分钟内有效。</span>
                        )}
                      </label>

                      <label className="block text-sm leading-6 text-[#6b7280]">
                        {registerValues.role === "指导教师" ? "所属学院 / 部门" : "所属学院 / 院系"}{" "}
                        <span className="text-[#ef4444]">*</span>
                        <input
                          className={`mt-1 h-12 w-full rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            registerErrors.college ? "border-[#ef4444]" : "border-[#e6ebf2]"
                          }`}
                          placeholder={registerValues.role === "指导教师" ? "请输入所属学院或部门" : "请输入所属学院或院系"}
                          type="text"
                          value={registerValues.college}
                          onChange={(event) => {
                            setRegisterValues((current) => ({ ...current, college: event.target.value }));
                            setRegisterErrors((current) => ({
                              ...current,
                              college: undefined,
                              submit: undefined,
                            }));
                          }}
                        />
                        {registerErrors.college ? (
                          <span className="mt-1 block text-sm text-[#ef4444]">{registerErrors.college}</span>
                        ) : null}
                      </label>

                      {isStudentRegisterRole && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block text-sm leading-6 text-[#6b7280]">
                            专业班级 <span className="text-[#ef4444]">*</span>
                            <input
                              className={`mt-1 h-12 w-full rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                                registerErrors.className ? "border-[#ef4444]" : "border-[#e6ebf2]"
                              }`}
                              placeholder="例如：23软件1班"
                              type="text"
                              value={registerValues.className}
                              onChange={(event) => {
                                setRegisterValues((current) => ({ ...current, className: event.target.value }));
                                setRegisterErrors((current) => ({
                                  ...current,
                                  className: undefined,
                                  submit: undefined,
                                }));
                              }}
                            />
                            {registerErrors.className ? (
                              <span className="mt-1 block text-sm text-[#ef4444]">{registerErrors.className}</span>
                            ) : null}
                          </label>
                          <label className="block text-sm leading-6 text-[#6b7280]">
                            学号 <span className="text-[#ef4444]">*</span>
                            <input
                              className={`mt-1 h-12 w-full rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                                registerErrors.studentId ? "border-[#ef4444]" : "border-[#e6ebf2]"
                              }`}
                              placeholder="请输入学号"
                              type="text"
                              value={registerValues.studentId}
                              onChange={(event) => {
                                setRegisterValues((current) => ({ ...current, studentId: event.target.value }));
                                setRegisterErrors((current) => ({
                                  ...current,
                                  studentId: undefined,
                                  submit: undefined,
                                }));
                              }}
                            />
                            {registerErrors.studentId ? (
                              <span className="mt-1 block text-sm text-[#ef4444]">{registerErrors.studentId}</span>
                            ) : null}
                          </label>
                        </div>
                      )}

                      <label className="block text-sm leading-6 text-[#6b7280]">
                        密码 <span className="text-[#ef4444]">*</span>
                        <input
                          className={`mt-1 h-12 w-full rounded-[14px] border bg-white px-3 text-base text-[#16305c] outline-none placeholder:text-[#9aa6b6] focus:border-[#1d5cff] focus:ring-4 focus:ring-[#1d5cff]/10 ${
                            registerErrors.password ? "border-[#ef4444]" : "border-[#e6ebf2]"
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
                          <span className="mt-1 block text-sm text-[#ef4444]">{registerErrors.password}</span>
                        ) : null}
                      </label>

                      {registerErrors.submit ? (
                        <p className="rounded-xl bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                          {registerErrors.submit}
                        </p>
                      ) : null}

                      <button
                        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,#2F74FF_0%,#1857F2_100%)] text-base font-semibold text-white shadow-[0_14px_24px_rgba(29,92,255,0.2)] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={isSubmitting}
                        type="submit"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            提交中...
                          </>
                        ) : (
                          "提交注册"
                        )}
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-5 rounded-[20px] bg-white px-7 py-6 shadow-[0_10px_30px_rgba(20,55,120,0.08)]">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#edf4ff] text-[#1d5cff]">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base leading-7 text-[#6b7280]">
                    {mode === "login"
                      ? "没有账号可先注册，审核通过后即可登录系统。"
                      : mode === "register"
                        ? "提交注册后请等待上一级账号审核通过。"
                        : mode === "forgot"
                          ? "如未收到重置邮件，请确认邮箱是否填写正确并检查垃圾邮件。"
                          : "重置完成后，可返回登录并使用新密码进入系统。"}
                  </p>
                  <button
                    className="mt-1 inline-flex items-center gap-2 text-base font-semibold text-[#1d5cff] transition hover:gap-3"
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
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <footer className="border-t border-[#e6ebf2] px-4 pt-6 text-center text-[13px] leading-6 text-[#8a96a8]">
            <p>© 2026 中国国际大学生创新大赛管理系统</p>
            <p>
              用户单位：南京铁道职业技术学院
              <span className="mx-3 text-[#c4ccd8]">|</span>
              支持单位：南京君如玉科技有限公司
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}
