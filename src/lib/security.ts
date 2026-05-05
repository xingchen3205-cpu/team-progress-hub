import type { NextRequest } from "next/server";

export const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=()",
  },
  {
    // Report-only first so we can harden the policy without risking a broken workbench.
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.open-meteo.com https://api.dify.ai https://api.resend.com",
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
    ].join("; "),
  },
] as const;

export const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RateLimitOptions = {
  namespace: string;
  windowMs: number;
  max: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const MAX_RATE_LIMIT_BUCKETS = 5_000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
let lastRateLimitPruneAt = 0;

export const authRateLimits = {
  loginIp: {
    namespace: "auth:login:ip",
    windowMs: 60_000,
    max: 30,
  },
  loginAccount: {
    namespace: "auth:login:account",
    windowMs: 10 * 60_000,
    max: 8,
  },
  registerIp: {
    namespace: "auth:register:ip",
    windowMs: 10 * 60_000,
    max: 8,
  },
  registerEmailCodeIp: {
    namespace: "auth:register-email-code:ip",
    windowMs: 10 * 60_000,
    max: 10,
  },
  registerEmailCodeAddress: {
    namespace: "auth:register-email-code:address",
    windowMs: 60_000,
    max: 1,
  },
  passwordResetIp: {
    namespace: "auth:password-reset:ip",
    windowMs: 10 * 60_000,
    max: 8,
  },
} satisfies Record<string, RateLimitOptions>;

export const expertActionRateLimits = {
  scoreSubmit: {
    namespace: "expert-review:score-submit",
    windowMs: 60_000,
    max: 20,
  },
  materialMaintenance: {
    namespace: "expert-review:material-maintenance",
    windowMs: 10 * 60_000,
    max: 30,
  },
} satisfies Record<string, RateLimitOptions>;

const normalizeRateLimitIdentifier = (identifier?: string) =>
  identifier?.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 128) || "";

const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwardedFor ||
    "unknown"
  );
};

const pruneRateLimitBuckets = (now: number) => {
  if (now - lastRateLimitPruneAt < 60_000 && rateLimitBuckets.size < MAX_RATE_LIMIT_BUCKETS) {
    return;
  }

  lastRateLimitPruneAt = now;

  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now || rateLimitBuckets.size > MAX_RATE_LIMIT_BUCKETS) {
      rateLimitBuckets.delete(key);
    }
  }
};

export const checkRateLimit = (
  request: Request,
  options: RateLimitOptions,
  identifier?: string,
): RateLimitResult => {
  const now = Date.now();
  pruneRateLimitBuckets(now);

  const clientIp = getClientIp(request);
  const normalizedIdentifier = normalizeRateLimitIdentifier(identifier);
  const key = [options.namespace, clientIp, normalizedIdentifier].filter(Boolean).join(":");
  const existingBucket = rateLimitBuckets.get(key);
  const bucket =
    existingBucket && existingBucket.resetAt > now
      ? existingBucket
      : { count: 0, resetAt: now + options.windowMs };

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  const remaining = Math.max(options.max - bucket.count, 0);
  const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);

  return {
    allowed: bucket.count <= options.max,
    limit: options.max,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds,
  };
};

export const applyRateLimitHeaders = <T extends Response>(response: T, result: RateLimitResult) => {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
  }

  return response;
};

export const rateLimitExceededResponse = (result: RateLimitResult, message = "操作过于频繁，请稍后再试") =>
  applyRateLimitHeaders(Response.json({ message }, { status: 429 }), result);

const addOriginFromUrl = (originSet: Set<string>, url?: string) => {
  const normalizedUrl = url?.trim();

  if (!normalizedUrl) {
    return;
  }

  try {
    originSet.add(new URL(normalizedUrl).origin);
  } catch {
    // Ignore invalid operator-provided URLs.
  }
};

const getAllowedRequestOrigins = (request: NextRequest) => {
  const originSet = new Set<string>([request.nextUrl.origin]);

  addOriginFromUrl(originSet, process.env.NEXT_PUBLIC_APP_URL);

  if (process.env.VERCEL_URL) {
    addOriginFromUrl(originSet, `https://${process.env.VERCEL_URL}`);
  }

  if (process.env.NODE_ENV !== "production") {
    originSet.add("http://localhost:3000");
    originSet.add("http://127.0.0.1:3000");
  }

  return originSet;
};

const isAllowedRequestOrigin = (request: NextRequest, value: string) => {
  try {
    return getAllowedRequestOrigins(request).has(new URL(value).origin);
  } catch {
    return false;
  }
};

export const enforceSameOriginApiRequest = (request: NextRequest) => {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const origin = request.headers.get("origin");
  if (origin && !isAllowedRequestOrigin(request, origin)) {
    return Response.json({ message: "跨站请求已被拦截，请刷新页面后重试" }, { status: 403 });
  }

  const referer = request.headers.get("referer");
  if (!origin && referer && !isAllowedRequestOrigin(request, referer)) {
    return Response.json({ message: "跨站请求已被拦截，请刷新页面后重试" }, { status: 403 });
  }

  return null;
};
