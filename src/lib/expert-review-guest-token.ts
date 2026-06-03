import { createHash, randomBytes } from "node:crypto";

export const createExpertReviewGuestToken = () => {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashExpertReviewGuestToken(token),
  };
};

export const hashExpertReviewGuestToken = (token: string) =>
  createHash("sha256").update(token.trim()).digest("hex");

export const getDefaultExpertReviewGuestTokenExpiresAt = (deadline?: Date | string | null) => {
  const now = new Date();
  const fallback = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);
  if (!deadline) return fallback;

  const deadlineDate = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= now.getTime()) {
    return fallback;
  }

  return deadlineDate;
};
