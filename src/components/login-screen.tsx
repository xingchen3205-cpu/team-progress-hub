"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const initialValues = {
  username: "",
  password: "",
  remember: true,
};

export function LoginScreen() {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
    submit?: string;
  }>({});
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = {
      username: values.username.trim() ? undefined : "请输入账号",
      password: values.password.trim() ? undefined : "请输入密码",
      submit: undefined,
    };

    setErrors(nextErrors);

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
          email: values.username.trim(),
          username: values.username.trim(),
          password: values.password.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          submit: payload?.message || "账号或密码不正确，请联系管理员获取测试账号信息。",
        }));
        return;
      }

      startTransition(() => {
        router.push("/workspace");
      });
    } catch {
      setErrors((current) => ({
        ...current,
        submit: "登录请求失败，请稍后重试。",
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f1f8ff]">
        <p className="text-sm text-[#6b7280]">正在检查登录状态...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f1f8ff] px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-[1080px]">
        <h1 className="mb-8 text-center text-[24px] leading-8 font-bold text-[#13161b] sm:text-[28px] lg:mb-10 lg:text-[32px] lg:leading-9">
          中国国际大学生创新大赛备赛管理系统
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
              <h2 className="mb-8 text-center text-[28px] leading-9 font-bold text-[#13161b]">
                用户登录
              </h2>

              <form className="relative" noValidate onSubmit={handleSubmit}>
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
                      errors.username ? "border-[#f93b3b]" : "border-[#d5d7db]"
                    }`}
                    placeholder="用户名/邮箱"
                    type="text"
                    value={values.username}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, username: event.target.value }));
                      setErrors((current) => ({ ...current, username: undefined, submit: undefined }));
                    }}
                  />
                </div>
                {errors.username ? (
                  <p className="mt-1 mb-3 text-sm leading-[22px] text-[#f93b3b]">
                    {errors.username}
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
                      errors.password ? "border-[#f93b3b]" : "border-[#d5d7db]"
                    }`}
                    placeholder="密码"
                    type="password"
                    value={values.password}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, password: event.target.value }));
                      setErrors((current) => ({ ...current, password: undefined, submit: undefined }));
                    }}
                  />
                </div>
                {errors.password ? (
                  <p className="mt-1 mb-3 text-sm leading-[22px] text-[#f93b3b]">
                    {errors.password}
                  </p>
                ) : (
                  <div className="mb-6" />
                )}

                <div className="mb-6 flex items-center justify-between text-sm leading-[22px] text-[#60656e]">
                  <label className="flex items-center gap-2">
                    <input
                      checked={values.remember}
                      type="checkbox"
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          remember: event.target.checked,
                        }))
                      }
                    />
                    <span>记住密码</span>
                  </label>
                  <a className="text-[#60656e] no-underline hover:text-[#326ca6] hover:underline" href="#">
                    找回密码
                  </a>
                </div>

                {errors.submit ? (
                  <p className="mb-4 rounded-lg bg-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#e11d48]">
                    {errors.submit}
                  </p>
                ) : null}

                <button
                  className="flex h-11 w-full items-center justify-center rounded border border-[#3091f2] bg-[#3091f2] text-base leading-[42px] text-white transition hover:border-[#419df9] hover:bg-[#419df9] disabled:cursor-not-allowed disabled:border-[#86c0f7] disabled:bg-[#86c0f7]"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "登录中..." : "登录"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm leading-7 text-[#6b7280]">
                测试账号信息请联系管理员获取
              </p>
            </div>
          </div>
        </section>

        <footer className="mt-5 text-center text-xs leading-6 text-[#9ca3af] sm:text-sm">
          © 2025 中国国际大学生创新大赛备赛管理系统
        </footer>
      </div>
    </main>
  );
}
