import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readProjectFile = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("next config applies baseline browser security headers", () => {
  const nextConfigSource = readProjectFile("next.config.ts");
  const securitySource = readProjectFile("src/lib/security.ts");

  assert.match(nextConfigSource, /securityHeaders/);
  assert.match(nextConfigSource, /async headers\(\)/);
  assert.match(securitySource, /Strict-Transport-Security/);
  assert.match(securitySource, /X-Content-Type-Options/);
  assert.match(securitySource, /X-Frame-Options/);
  assert.match(securitySource, /Referrer-Policy/);
  assert.match(securitySource, /Permissions-Policy/);
  assert.match(securitySource, /Content-Security-Policy/);
  assert.match(securitySource, /frame-ancestors 'none'/);
});

test("auth write endpoints are protected by rate limiting", () => {
  const securitySource = readProjectFile("src/lib/security.ts");
  const loginSource = readProjectFile("src/app/api/auth/login/route.ts");
  const registerSource = readProjectFile("src/app/api/auth/register/route.ts");
  const forgotSource = readProjectFile("src/app/api/auth/forgot-password/route.ts");
  const resetSource = readProjectFile("src/app/api/auth/reset-password/route.ts");

  assert.match(securitySource, /checkRateLimit/);
  assert.match(securitySource, /applyRateLimitHeaders/);
  assert.match(securitySource, /429/);
  assert.match(loginSource, /checkRateLimit/);
  assert.match(registerSource, /checkRateLimit/);
  assert.match(forgotSource, /checkRateLimit/);
  assert.match(resetSource, /checkRateLimit/);
});

test("state changing api requests are guarded against cross-site origins", () => {
  const middlewareSource = readProjectFile("middleware.ts");
  const securitySource = readProjectFile("src/lib/security.ts");

  assert.match(middlewareSource, /enforceSameOriginApiRequest/);
  assert.match(middlewareSource, /\/api\/:path\*/);
  assert.match(securitySource, /STATE_CHANGING_METHODS/);
  assert.match(securitySource, /origin/);
  assert.match(securitySource, /referer/);
  assert.match(securitySource, /跨站请求已被拦截/);
});

test("rate limiter blocks requests after the configured limit", async () => {
  const { checkRateLimit } = await import("../src/lib/security");
  const request = new Request("https://xingchencxcy.com/api/auth/login", {
    headers: {
      "x-forwarded-for": "203.0.113.10",
    },
  });
  const options = {
    namespace: `security-test:${Date.now()}`,
    windowMs: 60_000,
    max: 2,
  };

  assert.equal(checkRateLimit(request, options).allowed, true);
  assert.equal(checkRateLimit(request, options).allowed, true);

  const blocked = checkRateLimit(request, options);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds > 0, true);
});

test("same origin guard allows local requests and blocks cross-site writes", async () => {
  const { NextRequest } = await import("next/server");
  const { enforceSameOriginApiRequest } = await import("../src/lib/security");

  const allowedRequest = new NextRequest("https://xingchencxcy.com/api/tasks", {
    method: "POST",
    headers: {
      origin: "https://xingchencxcy.com",
    },
  });
  const blockedRequest = new NextRequest("https://xingchencxcy.com/api/tasks", {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
    },
  });
  const readRequest = new NextRequest("https://xingchencxcy.com/api/tasks", {
    method: "GET",
    headers: {
      origin: "https://attacker.example",
    },
  });

  assert.equal(enforceSameOriginApiRequest(allowedRequest), null);
  assert.equal(enforceSameOriginApiRequest(readRequest), null);
  assert.equal(enforceSameOriginApiRequest(blockedRequest)?.status, 403);
});
