import { app, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ALLOWED_ORIGINS } from "../shared/config";
import { getActiveRendererPath } from "./renderer-updater";

// §6.4: only these three permissions may be granted (T3 step 3).
const ALLOWED_PERMISSIONS = new Set(["notifications", "fullscreen", "media"]);

// §6.3 CSP — change only after review; never add 'unsafe-eval'.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; media-src 'self' blob: https:; " +
  "connect-src 'self' https:; font-src 'self' data:; " +
  "frame-src 'self' blob: https:; object-src 'none'; base-uri 'none';";

function isAllowedOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:" || parsed.protocol === "data:") return true;
    return (ALLOWED_ORIGINS as readonly string[]).includes(parsed.origin);
  } catch {
    return false;
  }
}

// §6.4: openExternal only for https: (and zenkai:, which routes back to our own
// protocol handler). file:, javascript:, and other schemes are rejected.
function openExternalSafe(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "zenkai:") {
      console.log(`[security] rejected external scheme: ${u.protocol}`);
      return;
    }
    void shell.openExternal(u.href);
    console.log(`[security] opened external: ${u.origin}`);
  } catch {
    console.log("[security] rejected malformed url");
  }
}

export function registerSecurity(): void {
  // Navigation lockdown (§6.4): allowlisted origins load in-app, everything
  // else goes to the system browser and never loads in the app.
  app.on("web-contents-created", (_event, wc) => {
    wc.on("will-navigate", (details) => {
      if (isAllowedOrigin(details.url)) return;
      details.preventDefault();
      openExternalSafe(details.url);
    });

    wc.setWindowOpenHandler((details) => {
      if (isAllowedOrigin(details.url)) return { action: "allow" };
      openExternalSafe(details.url);
      return { action: "deny" };
    });
  });

  // Permission lockdown: deny-by-default, three allowed (T3 step 3).
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      const allowed = ALLOWED_PERMISSIONS.has(permission);
      if (!allowed) console.log(`[security] permission denied: ${permission}`);
      callback(allowed);
    },
  );

  // Redirect root file:// asset requests to active renderer directory
  session.defaultSession.webRequest.onBeforeRequest(
    {
      urls: [
        "file:///logo.png",
        "file:///characters/*",
        "file:///frames/*",
        "file:///winter/*",
        "file:///og-image.jpg",
      ],
    },
    (details, callback) => {
      try {
        const u = new URL(details.url);
        const rendererDir = path.dirname(getActiveRendererPath());
        const subPath = u.pathname.replace(/^\/+/, "");
        const localFile = path.join(rendererDir, subPath);
        if (fs.existsSync(localFile)) {
          callback({ redirectURL: pathToFileURL(localFile).href });
          return;
        }
      } catch {}
      callback({});
    },
  );

  // Normalize outbound headers for public media APIs to prevent Cloudflare 403 access denial.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "*://*.pages.dev/*",
        "*://zenkaii.pages.dev/*",
        "*://zenkai-web.pages.dev/*",
        "*://graphql.anilist.co/*",
        "*://*.anilist.co/*",
        "*://api.jikan.moe/*",
        "*://kitsu.io/*",
        "*://*.kitsu.io/*",
        "*://aniversee.vercel.app/*",
        "*://anibridge.eliasbenb.dev/*",
        "*://arm.haglund.dev/*",
        "*://api.themoviedb.org/*",
      ],
    },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      requestHeaders["Origin"] = "https://zenkaii.pages.dev";
      requestHeaders["Referer"] = "https://zenkaii.pages.dev/";
      requestHeaders["X-Zenkai-Barrier"] = "zenkai-barrier-apk-2026-v1";
      requestHeaders["User-Agent"] =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
      callback({ requestHeaders });
    },
  );

  // CSP header on app-origin document responses (§6.3) and frame header normalization for embeds.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    let changed = false;

    const isAppOrigin =
      details.url.startsWith("file:") ||
      (ALLOWED_ORIGINS as readonly string[]).some((o) =>
        details.url.startsWith(o),
      );

    if (
      isAppOrigin &&
      (details.resourceType === "mainFrame" ||
        details.resourceType === "subFrame")
    ) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "content-security-policy")
          delete headers[key];
      }
      headers["Content-Security-Policy"] = [CSP];
      changed = true;
    }

    // Allow iframes (trailers, embed players) to render without being blocked by X-Frame-Options or frame-ancestors
    if (details.resourceType === "subFrame") {
      for (const key of Object.keys(headers)) {
        const lk = key.toLowerCase();
        if (lk === "x-frame-options") {
          delete headers[key];
          changed = true;
        } else if (lk === "content-security-policy") {
          const modified = headers[key].map((v) =>
            v.replace(/frame-ancestors[^;]+;?/gi, ""),
          );
          if (JSON.stringify(modified) !== JSON.stringify(headers[key])) {
            headers[key] = modified;
            changed = true;
          }
        }
      }
    }

    callback(changed ? { responseHeaders: headers } : {});
  });
}
