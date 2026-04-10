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
});
