import { API_BASE, API_FALLBACK_BASE, BARRIER_TOKEN } from "../../shared/config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Rate limiter: max 4 concurrent in-flight requests per §7 */
class ConcurrencyLimiter {
  private inFlight = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.inFlight++;
  }

  release(): void {
    this.inFlight--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

const limiter = new ConcurrencyLimiter(4);

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  useFallbackOn5xx?: boolean;
}

export async function fetchJson<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    timeoutMs = 15000,
    retries = 2,
    useFallbackOn5xx = true,
    ...fetchInit
  } = options;

  await limiter.acquire();
  try {
    return await executeWithRetry<T>(path, fetchInit, {
      timeoutMs,
      retries,
      useFallbackOn5xx,
    });
  } finally {
    limiter.release();
  }
}

async function executeWithRetry<T>(
  path: string,
  init: RequestInit,
  opts: { timeoutMs: number; retries: number; useFallbackOn5xx: boolean },
): Promise<T> {
  let lastError: Error | null = null;
  const attempts = opts.retries + 1;
  const bases = [API_BASE];
  if (opts.useFallbackOn5xx && API_FALLBACK_BASE && API_FALLBACK_BASE !== API_BASE) {
    bases.push(API_FALLBACK_BASE);
  }

  for (const base of bases) {
    const url = path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

    for (let i = 0; i < attempts; i++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

        const headers = new Headers(init.headers);
        if (!headers.has("X-Zenkai-Barrier")) {
          headers.set("X-Zenkai-Barrier", BARRIER_TOKEN);
        }
        if (!headers.has("X-Zenkai-Embed")) {
          headers.set("X-Zenkai-Embed", "1");
        }
        if (!headers.has("Referer")) {
          headers.set("Referer", `${API_BASE.replace(/\/+$/, "")}/`);
        }
        if (!headers.has("User-Agent")) {
          headers.set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          );
        }

        const res = await fetch(url, {
          ...init,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          return (await res.json()) as T;
        }

        // Retry on 5xx
        if (res.status >= 500) {
          const errText = await res.text().catch(() => "");
          lastError = new ApiError(
            `Server error (${res.status}): ${errText.slice(0, 100)}`,
            res.status,
          );
          if (i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
            continue;
          }
          // Fall through to try fallback base if available
          break;
        }

        // Non-5xx client error
        const errJson = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new ApiError(
          errJson?.error ?? `Request failed with status ${res.status}`,
          res.status,
          errJson,
        );
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
          continue;
        }
      }
    }
  }

  throw lastError ?? new ApiError("Failed to fetch JSON after retries");
}
