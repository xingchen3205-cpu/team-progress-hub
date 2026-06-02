import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const loginScreenSource = readFileSync(
  path.join(process.cwd(), "src/components/login-screen.tsx"),
  "utf8",
);

describe("login screen defaults", () => {
  it("starts with an empty login account field", () => {
    const initialLoginValues = loginScreenSource.match(
      /const initialLoginValues = \{\s*username: "([^"]*)"/m,
    );

    assert.equal(initialLoginValues?.[1], "");
    assert.equal(loginScreenSource.includes("724000296@qq.com"), false);
  });

  it("uses the required campus login visual structure", () => {
    assert.match(loginScreenSource, /login-visual-panel/);
    assert.match(loginScreenSource, /login-function-panel/);
    assert.match(loginScreenSource, /login-campus\.jpg/);
    assert.match(loginScreenSource, /NANJING VOCATIONAL INSTITUTE OF RAILWAY TECHNOLOGY/);
    assert.match(loginScreenSource, /南京铁道职业技术学院/);
    assert.match(loginScreenSource, /创新创业管理平台/);
    assert.match(loginScreenSource, /以赛促学 · 以赛促教 · 以赛促创 · 以赛促用/);
    assert.match(loginScreenSource, /USER LOGIN/);
    assert.match(loginScreenSource, /© 2026 南京铁道职业技术学院创新创业管理平台/);
    assert.match(loginScreenSource, /用户单位：南京铁道职业技术学院/);
    assert.match(loginScreenSource, /支持单位：南京君如玉科技有限公司/);
  });

  it("keeps login assets and interactions local", () => {
    assert.match(loginScreenSource, /showPassword/);
    assert.match(loginScreenSource, /localStorage\.getItem\("team-progress-login-account"\)/);
    assert.match(loginScreenSource, /localStorage\.setItem\("team-progress-login-account"/);
    assert.match(loginScreenSource, /localStorage\.removeItem\("team-progress-login-account"\)/);
    assert.doesNotMatch(loginScreenSource, /t2\.chei\.com\.cn/);
  });

  it("uses native img for captcha instead of next/image Image", () => {
    assert.match(loginScreenSource, /<img\s/);
    // The captcha area should use native img with src pointing to /api/auth/captcha
    assert.match(loginScreenSource, /src=\{\`\/api\/auth\/captcha\?v=\$\{captchaVersion\}\`\}/);
    // Make sure the captcha is NOT rendered with next/image (no unoptimized prop near captcha)
    const captchaBlock = loginScreenSource.match(
      /captchaVersion[\s\S]{0,600}/,
    )?.[0] ?? "";
    assert.doesNotMatch(captchaBlock, /unoptimized/);
  });

  it("has captcha onError fallback and eager loading", () => {
    assert.match(loginScreenSource, /onError=\{\(\)\s*=>\s*setCaptchaError\(true\)\}/);
    assert.match(loginScreenSource, /loading="eager"/);
    assert.match(loginScreenSource, /draggable=\{false\}/);
  });

  it("shows clickable error message when captcha fails to load", () => {
    assert.match(loginScreenSource, /验证码加载失败，点击刷新/);
    assert.match(loginScreenSource, /captchaError/);
  });

  it("does not block the whole page with isCheckingSession loading", () => {
    assert.doesNotMatch(loginScreenSource, /if\s*\(\s*isCheckingSession\s*\)\s*\{/);
    assert.doesNotMatch(loginScreenSource, /正在检查登录状态，请稍候片刻/);
    assert.doesNotMatch(loginScreenSource, /正在进入系统/);
  });

  it("has a small non-blocking session check indicator", () => {
    assert.match(loginScreenSource, /sessionCheckPending/);
    assert.match(loginScreenSource, /正在检查登录状态/);
  });

  it("keeps the campus hero visible on mobile instead of replacing it with a compact brand header", () => {
    assert.match(loginScreenSource, /login-visual-panel relative min-h-\[34vh\]/);
    assert.match(loginScreenSource, /sm:min-h-\[42vh\]/);
    assert.doesNotMatch(loginScreenSource, /login-visual-panel relative hidden/);
    assert.doesNotMatch(loginScreenSource, /Mobile brand header/);
  });

  it("aligns the mobile slogan as a centered two-by-two block while keeping desktop separators", () => {
    assert.match(loginScreenSource, /grid max-w-\[18rem\] grid-cols-2/);
    assert.doesNotMatch(loginScreenSource, /col-span-3/);
    assert.match(loginScreenSource, /hidden text-white\/70 sm:inline/);
  });

  it("removes priority from campus background image", () => {
    assert.doesNotMatch(loginScreenSource, /priority\s+src="\/login-campus\.jpg"/);
  });

  it("centers title and buttons on mobile", () => {
    assert.match(loginScreenSource, /text-center/);
    assert.match(loginScreenSource, /inline-flex\s+items-center\s+justify-center/);
    assert.match(loginScreenSource, /items-center\s+justify-center/);
  });

  it("uses fixed dimensions for captcha and inputs to avoid layout shift", () => {
    assert.match(loginScreenSource, /h-\[54px\]/);
    assert.match(loginScreenSource, /w-\[140px\]/);
    assert.match(loginScreenSource, /h-11\s+w-\[132px\]/);
  });

  it("uses adaptive captcha that stays hidden until the server asks for it", () => {
    assert.match(loginScreenSource, /loginCaptchaRequired/);
    assert.match(loginScreenSource, /const captchaRequired = loginCaptchaRequired/);
    assert.match(loginScreenSource, /const localCaptchaRequired = captchaRequired && humanVerificationProvider === "captcha"/);
    assert.match(loginScreenSource, /setLoginCaptchaRequired\(true\)/);
    assert.match(loginScreenSource, /requiresCaptcha\?: boolean/);
    assert.doesNotMatch(loginScreenSource, /isMobileWebUserAgent\(window\.navigator\.userAgent\)/);
    assert.doesNotMatch(loginScreenSource, /!hasHydratedLoginUserAgent \|\| !isMobileLoginUserAgent/);
    assert.match(loginScreenSource, /\{humanVerificationRequired \? \(/);
    assert.match(loginScreenSource, /\) : localCaptchaRequired \? \(/);
    assert.match(loginScreenSource, /<div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-\[1fr_auto\]">/);
    assert.doesNotMatch(loginScreenSource, /hidden sm:grid/);
    assert.match(loginScreenSource, /localCaptchaRequired && !loginValues\.captcha\.trim\(\)/);
    assert.match(loginScreenSource, /captchaRequired && loginErrors\.captcha/);
    assert.doesNotMatch(loginScreenSource, /matchMedia\("\(max-width: 639px\)"\)/);
  });

  it("does not render the captcha image at all when mobile web disables captcha", () => {
    assert.match(
      loginScreenSource,
      /\) : localCaptchaRequired \? \(\s*<div[\s\S]*src=\{\`\/api\/auth\/captcha\?v=\$\{captchaVersion\}\`\}[\s\S]*\)\s*:\s*\(/,
    );
  });

  it("shows mobile login submitting feedback before waiting on the network request", () => {
    assert.match(loginScreenSource, /loginCaptchaRequired/);
    assert.match(loginScreenSource, /window\.requestAnimationFrame/);
    assert.match(loginScreenSource, /setIsSubmitting\(true\)[\s\S]*await waitForNextPaint\(\)/);
    assert.match(loginScreenSource, /正在登录\.\.\./);
  });

  it("keeps login navigation responsive without forcing mobile scroll jumps", () => {
    assert.match(loginScreenSource, /prefetchWorkspaces/);
    assert.match(loginScreenSource, /requestIdleCallback/);
    assert.match(loginScreenSource, /router\.prefetch\("\/workspace"\)/);
    assert.match(loginScreenSource, /router\.prefetch\("\/workspace\?tab=teacherTraining"\)/);
    assert.doesNotMatch(loginScreenSource, /useEffect\(\(\)\s*=>\s*\{\s*router\.prefetch\("\/workspace"\)/);
    assert.match(loginScreenSource, /setLoginPhase\("entering"\)/);
    assert.match(loginScreenSource, /正在进入管理中心\.\.\./);
    assert.match(loginScreenSource, /router\.replace\(targetWorkspacePath,\s*\{\s*scroll:\s*false\s*\}\)/);
    assert.doesNotMatch(loginScreenSource, /window\.scrollTo/);
  });

  it("prevents mobile login from staying forever in entering state", () => {
    assert.match(loginScreenSource, /LOGIN_REQUEST_TIMEOUT_MS/);
    assert.match(loginScreenSource, /AbortController/);
    assert.match(loginScreenSource, /signal:\s*controller\.signal/);
    assert.match(loginScreenSource, /登录响应超时，请检查网络后重试。/);
    assert.match(loginScreenSource, /navigationFallbackTimeoutRef/);
    assert.match(loginScreenSource, /window\.location\.assign\(targetWorkspacePath\)/);
  });

  it("reduces aggressive letter-spacing on mobile", () => {
    assert.match(loginScreenSource, /tracking-normal/);
    assert.match(loginScreenSource, /sm:tracking-/);
  });

  it("keeps desktop title on two fixed lines with no-wrap", () => {
    assert.match(loginScreenSource, /南京铁道职业技术学院/);
    assert.match(loginScreenSource, /创新创业管理平台/);
    assert.match(loginScreenSource, /whitespace-nowrap/);
  });

  it("prevents desktop slogan from wrapping to multiple lines", () => {
    assert.match(loginScreenSource, /lg:flex-nowrap/);
    assert.match(loginScreenSource, /lg:whitespace-nowrap/);
  });

  it("does not force horizontal scroll on tablet and narrow desktop login screens", () => {
    assert.match(loginScreenSource, /lg:grid-cols-\[55fr_45fr\]/);
    assert.doesNotMatch(loginScreenSource, /lg:min-w-\[1200px\]/);
    assert.match(loginScreenSource, /login-function-panel flex min-h-\[66vh\]/);
    assert.match(loginScreenSource, /lg:min-h-screen/);
  });

  it("does not expose employeeId field or 工号 label in registration form", () => {
    assert.doesNotMatch(loginScreenSource, /employeeId/);
    assert.doesNotMatch(loginScreenSource, /工号/);
    assert.doesNotMatch(loginScreenSource, /如无统一工号可不填/);
  });

  it("does not expose self registration entry on the login screen", () => {
    assert.match(loginScreenSource, /selfRegistrationEnabled\s*=\s*false/);
    assert.match(loginScreenSource, /账号由系统管理员或校级管理员统一开通/);
    assert.match(loginScreenSource, /请使用管理员分配的账号登录/);
  });

  it("keeps student role validations for className and studentId", () => {
    assert.match(loginScreenSource, /className.*studentRole/);
    assert.match(loginScreenSource, /studentId.*studentRole/);
  });

  it("does not send employeeId in registration request body", () => {
    assert.doesNotMatch(loginScreenSource, /employeeId:\s*registerValues\.employeeId/);
  });
});
