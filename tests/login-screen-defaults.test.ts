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
    assert.match(loginScreenSource, /大赛管理系统/);
    assert.match(loginScreenSource, /以赛促学 · 以赛促教 · 以赛促创 · 以赛促用/);
    assert.match(loginScreenSource, /USER LOGIN/);
    assert.match(loginScreenSource, /© 2026 中国国际大学生创新大赛管理系统/);
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
    assert.match(loginScreenSource, /login-visual-panel relative min-h-\[46vh\]/);
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

  it("reduces aggressive letter-spacing on mobile", () => {
    assert.match(loginScreenSource, /tracking-normal/);
    assert.match(loginScreenSource, /sm:tracking-/);
  });

  it("keeps desktop title on two fixed lines with no-wrap", () => {
    assert.match(loginScreenSource, /南京铁道职业技术学院/);
    assert.match(loginScreenSource, /大赛管理系统/);
    assert.match(loginScreenSource, /whitespace-nowrap/);
  });

  it("prevents desktop slogan from wrapping to multiple lines", () => {
    assert.match(loginScreenSource, /lg:flex-nowrap/);
    assert.match(loginScreenSource, /lg:whitespace-nowrap/);
  });

  it("sets a minimum desktop shell width to prevent layout crush", () => {
    assert.match(loginScreenSource, /lg:min-w-\[1200px\]/);
  });

  it("does not expose employeeId field or 工号 label in registration form", () => {
    assert.doesNotMatch(loginScreenSource, /employeeId/);
    assert.doesNotMatch(loginScreenSource, /工号/);
    assert.doesNotMatch(loginScreenSource, /如无统一工号可不填/);
  });

  it("keeps student role validations for className and studentId", () => {
    assert.match(loginScreenSource, /className.*studentRole/);
    assert.match(loginScreenSource, /studentId.*studentRole/);
  });

  it("does not send employeeId in registration request body", () => {
    assert.doesNotMatch(loginScreenSource, /employeeId:\s*registerValues\.employeeId/);
  });
});
