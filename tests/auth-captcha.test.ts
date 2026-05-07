import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("captcha helper signs and verifies challenges without storing plaintext code", async () => {
  process.env.CAPTCHA_SECRET = "unit-test-captcha-secret";
  const captcha = await import("../src/lib/captcha");

  const challenge = captcha.createCaptchaChallenge("A7K2", {
    now: 1_000,
    nonce: "nonce-for-test",
  });

  assert.doesNotMatch(challenge, /A7K2/i);
  assert.equal(captcha.verifyCaptchaChallenge(challenge, "a7k2", { now: 1_000 }), true);
  assert.equal(captcha.verifyCaptchaChallenge(challenge, "0000", { now: 1_000 }), false);
  assert.equal(captcha.verifyCaptchaChallenge(challenge, "A7K2", { now: 1_000 + captcha.CAPTCHA_TTL_SECONDS * 1000 + 1 }), false);
});

test("captcha api route returns svg and sets an HttpOnly challenge cookie", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/auth/captcha/route.ts"),
    "utf8",
  );
  const helperSource = readFileSync(
    path.join(process.cwd(), "src/lib/captcha.ts"),
    "utf8",
  );

  assert.match(source, /image\/svg\+xml/);
  assert.match(source, /setCaptchaCookie/);
  assert.match(helperSource, /CAPTCHA_COOKIE_NAME/);
  assert.match(helperSource, /httpOnly:\s*true/);
  assert.match(source, /no-store/);
});

test("desktop login requires captcha while mobile web login can skip it", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/auth/login/route.ts"),
    "utf8",
  );

  assert.match(source, /captcha\?:\s*string/);
  assert.match(source, /isMobileWebRequest/);
  assert.match(source, /Mobile\|Android\|iPhone\|iPad\|iPod\|Windows Phone\|MicroMessenger\|Mobi/);
  assert.match(source, /const captchaRequired = !isMobileWebRequest/);
  assert.match(source, /verifyCaptchaChallenge/);
  assert.match(source, /clearCaptchaCookie/);
  assert.match(source, /请输入验证码/);
});

test("login screen keeps desktop captcha but hides and skips it on mobile web", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/login-screen.tsx"),
    "utf8",
  );

  assert.match(source, /isMobileLoginViewport/);
  assert.match(source, /const captchaRequired = !isMobileLoginViewport/);
  assert.match(source, /hidden gap-3 sm:grid/);
  assert.match(source, /captchaVersion/);
  assert.match(source, /\/api\/auth\/captcha\?v=/);
  assert.match(source, /请输入验证码/);
  assert.match(source, /刷新验证码/);
});

test("login screen uses native img element for captcha, not next/image", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/login-screen.tsx"),
    "utf8",
  );

  // Must use native img tag for captcha
  assert.match(source, /<img\n?\s+alt="验证码"/);
  assert.match(source, /loading="eager"/);
  assert.match(source, /draggable=\{false\}/);
  // Should not use next/image unoptimized prop in captcha area
  const captchaBlock = source.match(/captchaVersion[\s\S]{0,800}/)?.[0] ?? "";
  assert.doesNotMatch(captchaBlock, /unoptimized/);
});

test("login screen has captcha error fallback and fixed dimensions", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/login-screen.tsx"),
    "utf8",
  );

  assert.match(source, /captchaError/);
  assert.match(source, /setCaptchaError\(true\)/);
  assert.match(source, /验证码加载失败，点击刷新/);
  assert.match(source, /h-\[54px\]/);
  assert.match(source, /w-\[140px\]/);
  assert.match(source, /h-11\s+w-\[132px\]/);
});
