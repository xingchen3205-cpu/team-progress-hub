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

  it("reuses completed GET responses briefly to avoid immediate refetches", async () => {
    let callCount = 0;

    global.fetch = (async () => {
      callCount += 1;
      return {
        ok: true,
        json: async () => ({ version: callCount }),
      } as Response;
    }) as typeof fetch;

    const first = await requestJson<{ version: number }>("/api/team");
    const second = await requestJson<{ version: number }>("/api/team");

    assert.equal(callCount, 1);
    assert.deepEqual(first, { version: 1 });
    assert.deepEqual(second, { version: 1 });
  });

  it("clears completed GET cache after a successful mutation", async () => {
    let callCount = 0;

    global.fetch = (async () => {
      callCount += 1;
      return {
        ok: true,
        json: async () => ({ version: callCount }),
      } as Response;
    }) as typeof fetch;

    const first = await requestJson<{ version: number }>("/api/team");
    await requestJson<{ version: number }>("/api/team", {
      method: "PATCH",
      body: JSON.stringify({ name: "新名称" }),
    });
    const second = await requestJson<{ version: number }>("/api/team");

    assert.equal(callCount, 3);
    assert.deepEqual(first, { version: 1 });
    assert.deepEqual(second, { version: 3 });
  });

  it("aborts slow JSON requests with a readable timeout message", async () => {
    global.fetch = (async (_input, init) => {
      await new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          return;
        }
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
      return {
        ok: true,
        json: async () => ({ ok: true }),
      } as Response;
    }) as typeof fetch;

    await assert.rejects(
      () => requestJson<{ ok: boolean }>("/api/teacher-training", undefined, { timeoutMs: 5, retryCount: 0 }),
      /请求超时，请检查网络后重试/,
    );
  });

  it("retries transient GET failures once without retrying mutations", async () => {
    let getCallCount = 0;
    let postCallCount = 0;

    global.fetch = (async (_input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        postCallCount += 1;
        throw new TypeError("Failed to fetch");
      }

      getCallCount += 1;
      if (getCallCount === 1) {
        throw new TypeError("Failed to fetch");
      }

      return {
        ok: true,
        json: async () => ({ ok: true }),
      } as Response;
    }) as typeof fetch;

    const payload = await requestJson<{ ok: boolean }>("/api/teacher-training", undefined, {
      retryCount: 1,
      timeoutMs: 1_000,
    });
    assert.deepEqual(payload, { ok: true });
    assert.equal(getCallCount, 2);

    await assert.rejects(
      () =>
        requestJson<{ ok: boolean }>(
          "/api/teacher-training",
          { method: "POST", body: JSON.stringify({ title: "班次" }) },
          { retryCount: 1, timeoutMs: 1_000 },
        ),
      /网络连接失败，请稍后重试/,
    );
    assert.equal(postCallCount, 1);
  });
});
