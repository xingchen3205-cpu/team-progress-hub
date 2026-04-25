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
});
