const pendingJsonRequests = new Map<string, Promise<unknown>>();
const completedJsonResponses = new Map<string, { expiresAt: number; payload: unknown }>();
const defaultGetCacheTtlMs = 10_000;

const jsonMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RequestJsonOptions = {
  cacheTtlMs?: number;
  force?: boolean;
};

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has("Content-Type") && (init?.body || jsonMethods.has((init?.method ?? "GET").toUpperCase()))) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function getPendingRequestKey(input: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return null;
  }

  return `${method}:${input}`;
}

async function executeJsonRequest<T>(input: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: buildHeaders(init),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.message || "请求失败");
  }

  if (jsonMethods.has(method)) {
    completedJsonResponses.clear();
  }

  return payload as T;
}

export function clearPendingJsonRequests() {
  pendingJsonRequests.clear();
  completedJsonResponses.clear();
}

export function invalidateJsonCache(input?: string) {
  if (!input) {
    completedJsonResponses.clear();
    return;
  }

  completedJsonResponses.delete(`GET:${input}`);
  completedJsonResponses.delete(`HEAD:${input}`);
}

export async function requestJson<T>(input: string, init?: RequestInit, options?: RequestJsonOptions) {
  const requestKey = getPendingRequestKey(input, init);
  if (!requestKey) {
    return executeJsonRequest<T>(input, init);
  }

  const cachedResponse = completedJsonResponses.get(requestKey);
  if (!options?.force && cachedResponse && cachedResponse.expiresAt > Date.now()) {
    return cachedResponse.payload as T;
  }

  const existingRequest = pendingJsonRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const request = executeJsonRequest<T>(input, init)
    .then((payload) => {
      const cacheTtlMs = options?.cacheTtlMs ?? defaultGetCacheTtlMs;
      if (cacheTtlMs > 0) {
        completedJsonResponses.set(requestKey, {
          expiresAt: Date.now() + cacheTtlMs,
          payload,
        });
      }
      return payload;
    })
    .finally(() => {
      pendingJsonRequests.delete(requestKey);
    });

  pendingJsonRequests.set(requestKey, request);
  return request;
}
