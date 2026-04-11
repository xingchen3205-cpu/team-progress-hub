import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAllowedDevOrigins } from "../src/lib/dev-origin-config";

describe("next dev origin allowlist", () => {
  it("allows the public app domain and local access aliases for HMR", () => {
    const origins = getAllowedDevOrigins({
      appUrl: "https://xingchencxcy.com/workspace",
      hostname: "dududeMacBook-Air.local",
      networkInterfaces: {
        en0: [
          {
            address: "192.168.3.139",
            family: "IPv4",
            internal: false,
          },
          {
            address: "fe80::1",
            family: "IPv6",
            internal: false,
          },
        ],
        lo0: [
          {
            address: "127.0.0.1",
            family: "IPv4",
            internal: true,
          },
        ],
      },
    });

    assert.equal(origins.includes("xingchencxcy.com"), true);
    assert.equal(origins.includes("www.xingchencxcy.com"), true);
    assert.equal(origins.includes("dududemacbook-air.local"), true);
    assert.equal(origins.includes("192.168.3.139"), true);
    assert.equal(origins.includes("127.0.0.1"), false);
    assert.equal(origins.includes("fe80::1"), false);
  });
});
