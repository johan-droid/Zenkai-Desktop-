import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { SettingsSchema, type Settings } from "../shared/settings.schema";

export function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function readSettings(file: string): Settings {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return SettingsSchema.parse({}); // no file yet → defaults
  }
  try {
    return SettingsSchema.parse(JSON.parse(raw));
  } catch {
    // corrupt or schema-invalid → back up + reset defaults
    try {
      fs.renameSync(file, `${file}.bak`);
      console.warn(
        `[settings] corrupt file backed up to ${file}.bak, reset to defaults`,
      );
    } catch (backupErr) {
      console.warn(`[settings] backup failed, resetting defaults:`, backupErr);
    }
    return SettingsSchema.parse({});
  }
}

export function writeSettings(file: string, settings: Settings): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, file); // atomic on same filesystem
}

let cache: Settings | undefined;

export function getSettings(): Settings {
  cache ??= readSettings(settingsFile());
  return cache;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = SettingsSchema.parse({ ...getSettings(), ...patch });
  writeSettings(settingsFile(), next);
  cache = next;
  return next;
}
