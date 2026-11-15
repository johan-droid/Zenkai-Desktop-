import { API_BASE, API_FALLBACK_BASE, BARRIER_TOKEN } from "../../shared/config";

export class ProxyHostDenied extends Error {
  constructor(public readonly host: string) {
    super(`Proxy access denied for non-allowlisted host: ${host}`);
    this.name = "ProxyHostDenied";
  }
}

export class ProxyProtocolDenied extends Error {
  constructor(public readonly protocol: string) {
    super(`Proxy access denied: only https protocol is permitted, got ${protocol}`);
    this.name = "ProxyProtocolDenied";
  }
}

export class ProxyFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProxyFetchError";
  }
}

export function unwrapProxyUrl(rawUrl: string): { url: string; referer?: string } {
  try {
    const parsed = new URL(rawUrl, "https://zenkai-web.pages.dev");
    if (parsed.searchParams.has("url")) {
      const unwrapped = parsed.searchParams.get("url");
      if (
        unwrapped &&
        (unwrapped.startsWith("http://") || unwrapped.startsWith("https://"))
      ) {
        const ref = parsed.searchParams.get("referer") || undefined;
        return { url: unwrapped, referer: ref };
      }
    }
  } catch {}
  return { url: rawUrl };
}

/**
 * Fetches an arbitrary resource (m3u8, segment, key) via the Zenkai server /proxy route.
 * Security enforcement (D16):
 * - Target must use HTTPS
 * - Target hostname must be in the current stream's allowedHosts list
 * - Called ONLY from Electron main process; never exposed to renderer
 */
export async function fetchViaProxy(
  rawTargetUrl: string,
  allowedHosts: string[],
  referer?: string,
): Promise<Response> {
  // If rawTargetUrl is already wrapped in a proxy URL, unwrap it to get the real CDN URL
  let targetUrl = rawTargetUrl;
  let effectiveReferer = referer;
  try {
    const parsed = new URL(rawTargetUrl, "https://zenkai-web.pages.dev");
    if (parsed.searchParams.has("url")) {
      const unwrapped = parsed.searchParams.get("url");
      if (unwrapped && (unwrapped.startsWith("http://") || unwrapped.startsWith("https://"))) {
        targetUrl = unwrapped;
        if (!effectiveReferer && parsed.searchParams.has("referer")) {
          effectiveReferer = parsed.searchParams.get("referer") || undefined;
        }
      }
    }
  } catch {}

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch (err) {
    throw new Error(`Invalid target URL: ${targetUrl}`);
  }

  // Reject non-https
  if (parsedTarget.protocol !== "https:") {
    throw new ProxyProtocolDenied(parsedTarget.protocol);
  }

  // Host verification: normalized lowercase hostname
  const targetHost = parsedTarget.hostname.toLowerCase();
  const normalizedAllowed = new Set(
    allowedHosts.map((h) => h.toLowerCase().trim()),
  );

  const isAllowed =
    normalizedAllowed.has(targetHost) ||
    Array.from(normalizedAllowed).some((allowed) =>
      targetHost.endsWith(`.${allowed}`),
    );

  if (!isAllowed) {
    throw new ProxyHostDenied(targetHost);
  }

  // Try primary API base, then fallback if primary returns 5xx/down
  const bases = [API_BASE];
  if (API_FALLBACK_BASE && API_FALLBACK_BASE !== API_BASE) {
    bases.push(API_FALLBACK_BASE);
  }

  let lastError: Error | null = null;
  const retries = 3;

  for (const base of bases) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const proxyEndpoint = `${base.replace(/\/+$/, "")}/proxy`;
        const query = new URLSearchParams({
          url: targetUrl,
        });
        if (effectiveReferer) {
          query.set("referer", effectiveReferer);
        }

        const fullProxyUrl = `${proxyEndpoint}?${query.toString()}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const headers = new Headers({
          "X-Zenkai-Barrier": BARRIER_TOKEN,
          "X-Zenkai-Embed": "1",
          Referer: `${API_BASE.replace(/\/+$/, "")}/`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        });

        const res = await fetch(fullProxyUrl, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok || res.status === 206) {
          return res;
        }

        if (res.status >= 500) {
          lastError = new ProxyFetchError(
            `Proxy upstream 5xx error (${res.status})`,
            res.status,
          );
          if (attempt < retries) {
            await new Promise((r) =>
              setTimeout(r, 500 * Math.pow(2, attempt)),
            );
            continue;
          }
          break; // Try next base
        }

        // Non-5xx client failure (400, 403, 404, etc.)
        const errText = await res.text().catch(() => "");
        throw new ProxyFetchError(
          `Proxy returned ${res.status}: ${errText.slice(0, 100)}`,
          res.status,
        );
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          await new Promise((r) =>
            setTimeout(r, 500 * Math.pow(2, attempt)),
          );
          continue;
        }
      }
    }
  }

  throw lastError ?? new ProxyFetchError("Proxy fetch failed after retries");
}
