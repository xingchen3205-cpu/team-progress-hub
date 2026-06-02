import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { isMobileWebUserAgent } from "../src/lib/mobile-web";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("mobile web starts without captcha but can still render risk captcha when the server asks", () => {
  assert.equal(isMobileWebUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148"), true);
  assert.equal(isMobileWebUserAgent("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36"), true);
  assert.equal(isMobileWebUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/537.36 Chrome/125 Safari/537.36"), false);

  const loginScreenSource = read("src/components/login-screen.tsx");
  const loginRouteSource = read("src/app/api/auth/login/route.ts");

  assert.match(loginScreenSource, /loginCaptchaRequired/);
  assert.match(loginScreenSource, /const captchaRequired = loginCaptchaRequired/);
  assert.doesNotMatch(loginScreenSource, /isMobileWebUserAgent\(window\.navigator\.userAgent\)/);
  assert.doesNotMatch(loginScreenSource, /matchMedia\("\(max-width: 639px\)"\)/);
  assert.doesNotMatch(loginScreenSource, /className="mb-2 hidden gap-3 sm:grid/);
  assert.match(loginScreenSource, /\{humanVerificationRequired \? \(/);
  assert.match(loginScreenSource, /\) : localCaptchaRequired \? \(/);
  assert.match(loginScreenSource, /<div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-\[1fr_auto\]">/);
  assert.match(loginScreenSource, /\)\s*:\s*\(\s*<div className="mb-5" \/>/);
  assert.match(loginRouteSource, /isMobileWebUserAgent\(request\.headers\.get\("user-agent"\)\)/);
});
