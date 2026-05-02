import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const emailVerificationCodeLength = 6;
export const emailVerificationExpiresInMs = 10 * 60 * 1000;
export const emailVerificationMaxAttempts = 5;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getEmailVerificationSecret = () => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
};

export const generateEmailVerificationCode = () =>
  Array.from({ length: emailVerificationCodeLength }, () => randomInt(10)).join("");

export const hashEmailVerificationCode = ({
  email,
  code,
  purpose,
}: {
  email: string;
  code: string;
  purpose: string;
}) =>
  createHmac("sha256", getEmailVerificationSecret())
    .update(`${normalizeEmail(email)}:${purpose}:${code.trim()}`)
    .digest("hex");

export const verifyEmailVerificationCode = ({
  email,
  code,
  purpose,
  codeHash,
}: {
  email: string;
  code: string;
  purpose: string;
  codeHash: string;
}) => {
  const nextHash = hashEmailVerificationCode({ email, code, purpose });
  const left = Buffer.from(nextHash, "hex");
  const right = Buffer.from(codeHash, "hex");

  return left.length === right.length && timingSafeEqual(left, right);
};
