import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const CAPTCHA_COOKIE_NAME = "captcha_challenge";
export const CAPTCHA_TTL_SECONDS = 5 * 60;

const captchaAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const getCaptchaSecret = () => {
  const secret = process.env.CAPTCHA_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("CAPTCHA_SECRET or JWT_SECRET is not configured");
  }

  return secret;
};

const normalizeCaptchaCode = (value: string) => value.trim().toUpperCase();

const signPayload = (code: string, expiresAt: number, nonce: string) =>
  createHmac("sha256", getCaptchaSecret())
    .update(`${nonce}.${expiresAt}.${normalizeCaptchaCode(code)}`)
    .digest("base64url");

export const generateCaptchaCode = (length = 4) =>
  Array.from({ length }, () => captchaAlphabet[randomInt(captchaAlphabet.length)]).join("");

export const createCaptchaChallenge = (
  code: string,
  options: { now?: number; nonce?: string } = {},
) => {
  const now = options.now ?? Date.now();
  const expiresAt = now + CAPTCHA_TTL_SECONDS * 1000;
  const nonce = options.nonce ?? randomBytes(16).toString("base64url");
  const signature = signPayload(code, expiresAt, nonce);

  return `${expiresAt}.${nonce}.${signature}`;
};

export const verifyCaptchaChallenge = (
  challenge: string | undefined | null,
  input: string | undefined | null,
  options: { now?: number } = {},
) => {
  if (!challenge || !input?.trim()) {
    return false;
  }

  const [expiresAtRaw, nonce, signature] = challenge.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || !nonce || !signature) {
    return false;
  }

  const now = options.now ?? Date.now();
  if (expiresAt < now) {
    return false;
  }

  const expected = signPayload(input, expiresAt, nonce);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
};

export const captchaCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: CAPTCHA_TTL_SECONDS,
};

export const setCaptchaCookie = (response: NextResponse, challenge: string) => {
  response.cookies.set(CAPTCHA_COOKIE_NAME, challenge, captchaCookieOptions);
};

export const clearCaptchaCookie = (response: NextResponse) => {
  response.cookies.set(CAPTCHA_COOKIE_NAME, "", { ...captchaCookieOptions, maxAge: 0 });
};

export const renderCaptchaSvg = (code: string) => {
  const chars = normalizeCaptchaCode(code).split("");
  const charNodes = chars
    .map((char, index) => {
      const x = 24 + index * 25;
      const y = 39 + (index % 2 === 0 ? -2 : 3);
      const rotate = [-8, 6, -4, 8][index % 4];
      return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})" fill="#12376f" font-size="24" font-weight="800" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${char}</text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="132" height="48" viewBox="0 0 132 48" role="img" aria-label="验证码">
  <rect width="132" height="48" rx="14" fill="#eef5ff"/>
  <path d="M8 36 C28 18, 44 46, 68 24 S102 14, 124 30" fill="none" stroke="#94b9ff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <path d="M10 14 C33 22, 56 6, 82 16 S110 34, 126 18" fill="none" stroke="#c5d7f7" stroke-width="1.5" stroke-linecap="round" opacity="0.95"/>
  <g>${charNodes}</g>
  <circle cx="18" cy="18" r="1.8" fill="#2563eb" opacity="0.45"/>
  <circle cx="108" cy="38" r="1.6" fill="#2563eb" opacity="0.45"/>
  <circle cx="74" cy="8" r="1.4" fill="#2563eb" opacity="0.35"/>
</svg>`;
};
