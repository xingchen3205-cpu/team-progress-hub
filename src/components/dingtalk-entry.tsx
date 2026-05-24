"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

type DingTalkPublicConfig = {
  corpId: string;
  agentId: string;
} | null;

type DingTalkAuthResponse =
  | {
      token: string;
      user: unknown;
    }
  | {
      code: "DINGTALK_ACCOUNT_UNBOUND";
      message: string;
      dingTalkUser?: {
        name?: string;
      };
    }
  | {
      message?: string;
    };

type DingTalkBindResponse =
  | {
      token: string;
      user: unknown;
    }
  | {
      message?: string;
    };

type DingTalkRequestAuthCodeResult = {
  code?: string;
};

type DingTalkJsApi = {
  ready: (callback: () => void) => void;
  error?: (callback: (error: unknown) => void) => void;
  runtime?: {
    permission?: {
      requestAuthCode: (options: {
        corpId: string;
        onSuccess: (result: DingTalkRequestAuthCodeResult) => void;
        onFail: (error: unknown) => void;
      }) => void;
    };
  };
};

declare global {
  interface Window {
    dd?: DingTalkJsApi;
  }
}

const dingTalkScriptSrc = "https://g.alicdn.com/dingding/dingtalk-jsapi/3.0.50/dingtalk.open.js";

const loadDingTalkScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.dd?.runtime?.permission?.requestAuthCode) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${dingTalkScriptSrc}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("钉钉 JSAPI 加载失败")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = dingTalkScriptSrc;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("钉钉 JSAPI 加载失败"));
    document.head.appendChild(script);
  });

const requestAuthCode = (corpId: string) =>
  new Promise<string>((resolve, reject) => {
    const request = window.dd?.runtime?.permission?.requestAuthCode;
    if (!request) {
      reject(new Error("当前环境不支持钉钉免登，请从钉钉工作台打开"));
      return;
    }

    window.dd?.ready(() => {
      request({
        corpId,
        onSuccess: (result) => {
          if (result.code) {
            resolve(result.code);
          } else {
            reject(new Error("钉钉未返回免登授权码"));
          }
        },
        onFail: (error) => {
          reject(new Error(`获取钉钉免登授权失败：${JSON.stringify(error)}`));
        },
      });
    });
  });

const isDingTalkRuntime = () => /DingTalk/i.test(window.navigator.userAgent);

const postJson = async <T,>(url: string, body: Record<string, string>) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T;

  return { response, data };
};

export function DingTalkEntry({ config }: { config: DingTalkPublicConfig }) {
  const router = useRouter();
  const hasStartedRef = useRef(false);
  const [status, setStatus] = useState<"checking" | "unbound" | "error" | "success">("checking");
  const [message, setMessage] = useState("正在连接钉钉工作台...");
  const [authCode, setAuthCode] = useState("");
  const [dingTalkName, setDingTalkName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isBinding, setIsBinding] = useState(false);

  const startDingTalkLogin = useCallback(async () => {
    if (!config?.corpId) {
      setStatus("error");
      setMessage("钉钉应用配置未完成：缺少 CorpId。");
      return;
    }

    if (!isDingTalkRuntime()) {
      setStatus("error");
      setMessage("请从钉钉工作台打开“大赛管理平台”，不要使用普通浏览器访问。");
      return;
    }

    try {
      setStatus("checking");
      setMessage("正在获取钉钉免登授权...");
      await loadDingTalkScript();
      const code = await requestAuthCode(config.corpId);
      setAuthCode(code);

      setMessage("正在进入大赛管理平台...");
      const { response, data } = await postJson<DingTalkAuthResponse>("/api/dingtalk/auth", {
        authCode: code,
      });

      if (response.ok && "token" in data) {
        setStatus("success");
        setMessage("登录成功，正在打开工作台...");
        router.replace("/workspace");
        return;
      }

      if (response.status === 404 && "code" in data && data.code === "DINGTALK_ACCOUNT_UNBOUND") {
        setStatus("unbound");
        setDingTalkName(data.dingTalkUser?.name ?? "");
        setMessage(data.message);
        return;
      }

      setStatus("error");
      setMessage("message" in data && data.message ? data.message : "钉钉免登失败，请稍后再试。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "钉钉免登失败，请稍后再试。");
    }
  }, [config?.corpId, router]);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    void startDingTalkLogin();
  }, [startDingTalkLogin]);

  const bindAccount = async () => {
    const normalizedUsername = username.trim();
    if (!authCode || !normalizedUsername || !password.trim()) {
      setStatus("unbound");
      setMessage("请输入平台账号和密码后再绑定。");
      return;
    }

    setIsBinding(true);
    setMessage("正在绑定平台账号...");
    try {
      const { response, data } = await postJson<DingTalkBindResponse>("/api/dingtalk/bind", {
        authCode,
        username: normalizedUsername,
        password: password.trim(),
      });

      if (response.ok && "token" in data) {
        setStatus("success");
        setMessage("绑定成功，正在进入工作台...");
        router.replace("/workspace");
        return;
      }

      setStatus("unbound");
      setMessage("message" in data && data.message ? data.message : "绑定失败，请检查账号密码。");
    } catch (error) {
      setStatus("unbound");
      setMessage(error instanceof Error ? error.message : "绑定失败，请稍后再试。");
    } finally {
      setIsBinding(false);
    }
  };

  const resetAuth = () => {
    setAuthCode("");
    setPassword("");
    void startDingTalkLogin();
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e7f0ff,transparent_38%),linear-gradient(135deg,#f8fbff_0%,#eef4fb_100%)] px-5 py-8 text-[#10213f]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(37,83,158,0.16)] md:grid-cols-[0.95fr_1.05fr]">
          <div className="relative bg-gradient-to-br from-[#1f4f9a] via-[#2363d8] to-[#1b7fff] p-8 text-white md:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.25),transparent_30%),radial-gradient(circle_at_20%_85%,rgba(255,255,255,0.18),transparent_28%)]" />
            <div className="relative z-[1] flex h-full min-h-[360px] flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-sm font-semibold text-white/90">
                  <ShieldCheck className="h-4 w-4" />
                  钉钉工作台入口
                </div>
                <h1 className="mt-8 text-3xl font-black leading-tight tracking-[-0.02em] sm:text-4xl">
                  南京铁道职业技术学院
                  <span className="mt-2 block">大赛管理平台</span>
                </h1>
                <p className="mt-5 max-w-sm text-sm leading-7 text-white/78">
                  从钉钉工作台进入后，系统会识别当前钉钉账号。首次使用需要绑定一次平台账号，后续可免密进入。
                </p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/12 p-4 text-sm leading-6 text-white/80 backdrop-blur">
                大屏投屏仍使用独立浏览器链接；钉钉入口只负责身份、移动端入口和后续待办通知。
              </div>
            </div>
          </div>

          <div className="p-7 sm:p-9 md:p-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#1f5fe0]">
                {status === "success" ? <CheckCircle2 className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1f5fe0]">DingTalk SSO</p>
                <h2 className="text-2xl font-black tracking-[-0.02em]">钉钉免登</h2>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d8e6fb] bg-[#f6f9ff] p-5">
              <p className="text-sm font-semibold text-[#10213f]">
                {status === "checking"
                  ? "正在校验身份"
                  : status === "unbound"
                    ? "当前钉钉账号尚未绑定"
                    : status === "success"
                      ? "登录成功"
                      : "无法进入平台"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#60708a]">{message}</p>
              {dingTalkName ? <p className="mt-3 text-sm text-[#60708a]">钉钉用户：{dingTalkName}</p> : null}
            </div>

            {status === "unbound" ? (
              <div className="mt-7 space-y-4">
                <label className="block text-sm font-semibold text-[#10213f]">
                  平台账号
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-[#d8e1ef] bg-white px-4 text-base outline-none transition focus:border-[#1f5fe0] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="请输入用户名、邮箱或姓名"
                    value={username}
                  />
                </label>
                <label className="block text-sm font-semibold text-[#10213f]">
                  平台密码
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-[#d8e1ef] bg-white px-4 text-base outline-none transition focus:border-[#1f5fe0] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入平台密码"
                    type="password"
                    value={password}
                  />
                </label>
                <button
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1f5fe0] px-5 text-base font-bold text-white shadow-[0_16px_34px_rgba(31,95,224,0.24)] transition hover:bg-[#174fc1] disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isBinding}
                  onClick={bindAccount}
                  type="button"
                >
                  {isBinding ? "绑定中..." : "绑定并进入平台"}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#d8e1ef] bg-white px-5 text-sm font-semibold text-[#60708a] transition hover:border-[#1f5fe0] hover:text-[#1f5fe0]"
                  onClick={resetAuth}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                  重新获取钉钉授权
                </button>
              </div>
            ) : status === "error" ? (
              <div className="mt-7 space-y-3">
                <button
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1f5fe0] px-5 text-base font-bold text-white shadow-[0_16px_34px_rgba(31,95,224,0.24)] transition hover:bg-[#174fc1]"
                  onClick={resetAuth}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                  重新尝试钉钉免登
                </button>
                <a
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#d8e1ef] bg-white px-5 text-sm font-semibold text-[#60708a]"
                  href="/login"
                >
                  返回普通网页登录
                </a>
              </div>
            ) : (
              <div className="mt-8 h-2 overflow-hidden rounded-full bg-[#edf3fb]">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-[#1f5fe0]" />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
