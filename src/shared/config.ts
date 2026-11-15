export const WEB_URL =
  process.env.ZENKAI_WEB_URL ?? "https://zenkai-web.pages.dev/";

export const ALLOWED_ORIGINS = [
  "https://zenkai-web.pages.dev",
  "https://zenkaii.pages.dev",
] as const;

export const API_BASE =
  process.env.ZENKAI_API_BASE ?? WEB_URL.replace(/\/+$/, "");

export const API_FALLBACK_BASE =
  process.env.ZENKAI_API_FALLBACK_BASE ?? "https://zenkaii.pages.dev";

export const BARRIER_TOKEN =
  process.env.ZENKAI_BARRIER ?? "zenkai-barrier-apk-2026-v1";

export const DISCORD_APP_ID = process.env.ZENKAI_DISCORD_APP_ID ?? "";
