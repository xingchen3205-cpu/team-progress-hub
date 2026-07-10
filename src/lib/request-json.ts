const pendingJsonRequests = new Map<string, Promise<unknown>>();
const completedJsonResponses = new Map<string, { expiresAt: number; payload: unknown }>();
const defaultGetCacheTtlMs = 10_000;
const defaultRequestTimeoutMs = 15_000;
const defaultGetRetryCount = 1;

const jsonMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RequestJsonOptions = {
  cacheTtlMs?: number;
  force?: boolean;
  retryCount?: number;
  retryMutation?: boolean;
  timeoutMs?: number;
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

function createRequestError(kind: "timeout" | "network", fallbackMessage: string) {
  const error = new Error(fallbackMessage);
  error.name = kind === "timeout" ? "RequestTimeoutError" : "NetworkError";
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /Failed to fetch|NetworkError/i.test(error.message));
}

async function executeJsonRequestAttempt<T>(input: string, init?: RequestInit, options?: RequestJsonOptions) {
  const method = (init?.method ?? "GET").toUpperCase();
  const timeoutMs = options?.timeoutMs ?? defaultRequestTimeoutMs;
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let didTimeout = false;

  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  const timeoutId =
    timeoutMs > 0
      ? setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      credentials: "same-origin",
      headers: buildHeaders(init),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout || isAbortError(error)) {
      throw createRequestError("timeout", "请求超时，请检查网络后重试。");
    }
    if (isNetworkError(error)) {
      throw createRequestError("network", "网络连接失败，请稍后重试。");
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }

  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.message || "请求失败");
  }

  if (jsonMethods.has(method)) {
    completedJsonResponses.clear();
  }

  return payload as T;
}

async function executeJsonRequest<T>(input: string, init?: RequestInit, options?: RequestJsonOptions) {
  const method = (init?.method ?? "GET").toUpperCase();
  const canRetry = method === "GET" || method === "HEAD" || options?.retryMutation === true;
  const retryCount = canRetry ? (options?.retryCount ?? defaultGetRetryCount) : 0;
  let lastError: unknown;

  for (let attemptIndex = 0; attemptIndex <= retryCount; attemptIndex += 1) {
    try {
      return await executeJsonRequestAttempt<T>(input, init, options);
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || error.name !== "NetworkError" || attemptIndex >= retryCount) {
        throw error;
      }
    }
  }

  throw lastError;
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
    return executeJsonRequest<T>(input, init, options);
  }

  const cachedResponse = completedJsonResponses.get(requestKey);
  if (!options?.force && cachedResponse && cachedResponse.expiresAt > Date.now()) {
    return cachedResponse.payload as T;
  }

  const existingRequest = pendingJsonRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const request = executeJsonRequest<T>(input, init, options)
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
