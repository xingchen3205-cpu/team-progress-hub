import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { clearPendingJsonRequests, requestJson } from "../src/lib/request-json.ts";

const originalFetch = global.fetch;

describe("requestJson", () => {
  beforeEach(() => {
    clearPendingJsonRequests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearPendingJsonRequests();
  });

  it("deduplicates concurrent GET requests for the same url", async () => {
    let callCount = 0;

    global.fetch = (async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        ok: true,
        json: async () => ({ ok: true }),
      } as Response;
    }) as typeof fetch;

    const [first, second] = await Promise.all([
      requestJson<{ ok: boolean }>("/api/tasks"),
      requestJson<{ ok: boolean }>("/api/tasks"),
    ]);

    assert.equal(callCount, 1);
    assert.deepEqual(first, { ok: true });
    assert.deepEqual(second, { ok: true });
  });

  it("does not deduplicate non-GET requests", async () => {
    let callCount = 0;

    global.fetch = (async () => {
      callCount += 1;
      return {
        ok: true,
        json: async () => ({ saved: true }),
      } as Response;
    }) as typeof fetch;

    await Promise.all([
      requestJson<{ saved: boolean }>("/api/tasks", { method: "POST", body: JSON.stringify({ title: "A" }) }),
      requestJson<{ saved: boolean }>("/api/tasks", { method: "POST", body: JSON.stringify({ title: "A" }) }),
    ]);

    assert.equal(callCount, 2);
  });
});
