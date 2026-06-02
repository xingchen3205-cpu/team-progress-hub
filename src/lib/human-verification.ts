import type { NextRequest } from "next/server";

import { getRequestIp } from "@/lib/request-meta";

export type LoginHumanVerificationProvider = "none" | "captcha" | "turnstile";

type TurnstileVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_VERIFY_TIMEOUT_MS = 4_000;

export const getTurnstileSiteKey = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
const getTurnstileSecretKey = () => process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";

export const getLoginHumanVerificationProvider = (): LoginHumanVerificationProvider =>
  getTurnstileSiteKey() && getTurnstileSecretKey() ? "turnstile" : "captcha";

export const verifyHumanVerificationToken = async ({
  provider,
  request,
  token,
}: {
  provider: LoginHumanVerificationProvider;
  request: NextRequest;
  token?: string | null;
}) => {
  if (provider !== "turnstile") {
    return false;
  }

  const secret = getTurnstileSecretKey();
  const normalizedToken = token?.trim();
  if (!secret || !normalizedToken) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TURNSTILE_VERIFY_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", normalizedToken);
    formData.append("remoteip", getRequestIp(request));

    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as TurnstileVerifyResponse | null;

    return response.ok && payload?.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};
