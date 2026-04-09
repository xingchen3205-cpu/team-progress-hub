import { createHash, randomBytes } from "node:crypto";

const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 30;

export const hashPasswordResetToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const createPasswordResetToken = () => {
  const token = randomBytes(32).toString("hex");

  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  };
};
