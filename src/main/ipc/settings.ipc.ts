import { ipcMain } from "electron";
import { z } from "zod";
import { SettingsSchema, type Settings } from "../../shared/settings.schema";
import { getSettings, updateSettings } from "../settings";

const GetInput = z.undefined();

// Patch schema: validate ONLY the keys the caller sent, key by key.
// (zod v4's SettingsSchema.partial() fills absent keys with defaults, which
// would silently reset untouched settings on every set — validated per key and
// passed through raw instead.)
const shape = SettingsSchema.shape as Record<string, z.ZodType>;
const SetInput = z
  .record(z.string(), z.unknown())
  .superRefine((record, ctx) => {
    for (const [key, value] of Object.entries(record)) {
      const field = shape[key];
      if (!field) {
        ctx.addIssue({
          code: "custom",
          message: `unknown settings key: ${key}`,
          path: [key],
        });
        continue;
      }
      const r = field.safeParse(value);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `${key}: ${r.error.issues[0]?.message ?? "invalid"}`,
          path: [key],
        });
      }
    }
  });

function reject(channel: string, issues: unknown): never {
  console.error(`[ipc] invalid payload for ${channel}`, issues);
  throw new Error(`invalid payload for ${channel}`);
}

ipcMain.handle("settings:get", async (_e, raw: unknown) => {
  const parsed = GetInput.safeParse(raw);
  if (!parsed.success) reject("settings:get", parsed.error.issues);
  return getSettings();
});

ipcMain.handle("settings:set", async (_e, raw: unknown) => {
  const parsed = SetInput.safeParse(raw);
  if (!parsed.success) reject("settings:set", parsed.error.issues);
  // validated per key → merge only the sent keys
  return updateSettings(parsed.data as Partial<Settings>);
});
