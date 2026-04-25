import { createHmac, timingSafeEqual } from "node:crypto";

import type { ProjectMaterialRequirementKey } from "@/lib/project-materials";

export type ProjectMaterialUploadTokenPayload = {
  userId: string;
  teamGroupId: string;
  stageId: string;
  materialKind?: ProjectMaterialRequirementKey;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiresAt: number;
};

type ProjectMaterialUploadTokenInput = Omit<ProjectMaterialUploadTokenPayload, "expiresAt">;

type TokenOptions = {
  now?: number;
  expiresInSeconds?: number;
  secret?: string;
};

const DEFAULT_EXPIRES_IN_SECONDS = 10 * 60;

const getUploadTokenSecret = (secret?: string) => {
  const resolvedSecret = secret ?? process.env.JWT_SECRET?.trim();
  if (!resolvedSecret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return resolvedSecret;
};

const encodeBase64Url = (value: string) => Buffer.from(value, "utf8").toString("base64url");

const decodeBase64Url = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const sign = (payloadPart: string, secret: string) =>
  createHmac("sha256", secret).update(payloadPart).digest("base64url");

const isValidPayload = (payload: unknown): payload is ProjectMaterialUploadTokenPayload => {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.teamGroupId === "string" &&
    typeof candidate.stageId === "string" &&
    (candidate.materialKind === undefined || typeof candidate.materialKind === "string") &&
    typeof candidate.filePath === "string" &&
    typeof candidate.fileName === "string" &&
    typeof candidate.fileSize === "number" &&
    Number.isFinite(candidate.fileSize) &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt)
  );
};

export const createProjectMaterialUploadToken = (
  payload: ProjectMaterialUploadTokenInput,
  options: TokenOptions = {},
) => {
  const now = options.now ?? Date.now();
  const expiresInSeconds = options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
  const tokenPayload: ProjectMaterialUploadTokenPayload = {
    ...payload,
    expiresAt: now + expiresInSeconds * 1000,
  };
  const payloadPart = encodeBase64Url(JSON.stringify(tokenPayload));
  const signature = sign(payloadPart, getUploadTokenSecret(options.secret));
  return `${payloadPart}.${signature}`;
};

export const verifyProjectMaterialUploadToken = (
  token: string,
  options: Pick<TokenOptions, "now" | "secret"> = {},
) => {
  const [payloadPart, signature, extra] = token.split(".");
  if (!payloadPart || !signature || extra) {
    return null;
  }

  const expectedSignature = sign(payloadPart, getUploadTokenSecret(options.secret));
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadPart)) as unknown;
    if (!isValidPayload(payload)) {
      return null;
    }
    if (payload.expiresAt <= (options.now ?? Date.now())) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};
