import { app, session, shell } from "electron";
import { ALLOWED_ORIGINS } from "../shared/config";

// §6.4: only these three permissions may be granted (T3 step 3).
const ALLOWED_PERMISSIONS = new Set(["notifications", "fullscreen", "media"]);

// §6.3 CSP — change only after review; never add 'unsafe-eval'.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; media-src 'self' blob: https:; " +
  "connect-src 'self' https:; font-src 'self' data:; " +
  "frame-src 'none'; object-src 'none'; base-uri 'none';";

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

  // CSP header on app-origin document responses (§6.3).
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ALLOWED_ORIGINS.map((o) => `${o}/*`) },
    (details, callback) => {
      if (
        details.resourceType !== "mainFrame" &&
        details.resourceType !== "subFrame"
      ) {
        callback({});
        return;
      }
      const headers = { ...details.responseHeaders };
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "content-security-policy")
          delete headers[key];
      }
      headers["Content-Security-Policy"] = [CSP];
      callback({ responseHeaders: headers });
    },
  );
}
