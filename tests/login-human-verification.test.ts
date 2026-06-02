import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

test("login human verification is risk-triggered and falls back to local captcha when unconfigured", () => {
  const loginRouteSource = read("src/app/api/auth/login/route.ts");
  const humanVerificationSource = read("src/lib/human-verification.ts");
  const loginScreenSource = read("src/components/login-screen.tsx");

  assert.match(humanVerificationSource, /TURNSTILE_SECRET_KEY/);
  assert.match(humanVerificationSource, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(humanVerificationSource, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(humanVerificationSource, /getLoginHumanVerificationProvider/);
  assert.match(humanVerificationSource, /\? "turnstile" : "captcha"/);
  assert.match(loginRouteSource, /humanVerificationToken\?:\s*string/);
  assert.match(loginRouteSource, /const humanVerificationProvider = captchaRequired \? getLoginHumanVerificationProvider\(\) : "none"/);
  assert.match(loginRouteSource, /verifyHumanVerificationToken/);
  assert.match(loginRouteSource, /请完成人机验证/);
  assert.match(loginRouteSource, /人机验证失败，请重试/);
  assert.match(loginRouteSource, /humanVerificationProvider/);
  assert.match(loginRouteSource, /humanVerificationRequired/);
  assert.match(loginScreenSource, /turnstileSiteKey/);
  assert.match(loginScreenSource, /humanVerificationProvider/);
  assert.match(loginScreenSource, /humanVerificationToken/);
  assert.match(loginScreenSource, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(loginScreenSource, /window\.turnstile\.render/);
  assert.match(loginScreenSource, /humanVerificationProvider === "turnstile"/);
  assert.match(loginScreenSource, /captchaRequired && humanVerificationProvider === "captcha"/);
  assert.match(loginScreenSource, /humanVerificationToken: humanVerificationRequired \? humanVerificationToken : undefined/);
});
