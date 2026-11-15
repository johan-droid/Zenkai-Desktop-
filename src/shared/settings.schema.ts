import { z } from "zod";
import { join } from "node:path";

// T5 §8.2 default download dirs. (Schema created in T4 because ipc-contract
// references the Settings type; store/IPC/tests remain T5 work.)
export function defaultDownloadDir(): string {
  const home = process.env["HOME"] ?? "~";
  if (process.platform === "win32") {
    const profile = process.env["USERPROFILE"] ?? "C:\\Users";
    return join(profile, "Downloads", "Zenkai");
  }
  if (process.platform === "darwin") {
    return join(home, "Downloads", "Zenkai");
  }
  const xdg = process.env["XDG_DOWNLOAD_DIR"];
  return join(
    xdg && xdg.length > 0 ? xdg : join(home, "Downloads"),
    "Zenkai",
  );
}

export const SettingsSchema = z.object({
  pauseOnClose: z.boolean().default(true),
  hwDecode: z.boolean().default(() => process.platform !== "linux"),
  aiUpscale: z.boolean().default(false),
  subtitleDelay: z.number().default(0),
  downloadDir: z.string().min(1).default(() => defaultDownloadDir()),
  rpcEnabled: z.boolean().default(true),
  windowState: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      maximized: z.boolean(),
    })
    .optional(),
  theme: z.enum(["system", "dark", "light"]).default("system"),
  channel: z.enum(["stable", "beta"]).default("stable"), // kept explicit so renderer can safely send a channel patch
  installationId: z.string().default("zenkai-client-cohort"),
  updateServerUrl: z.string().default("https://update.zenkai.cfd"),
});

export type Settings = z.infer<typeof SettingsSchema>;
