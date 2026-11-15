import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultDownloadDir } from "../../src/shared/settings.schema";
import { readSettings, writeSettings } from "../../src/main/settings";

const dir = (() => {
  const base = path.join(os.tmpdir(), "opencode");
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, "zenkai-settings-"));
})();
const file = path.join(dir, "settings.json");

describe("settings store (T5)", () => {
  it("round-trip: write → read equals", () => {
    const settings = readSettings(path.join(dir, "missing.json")); // defaults
    writeSettings(file, settings);
    expect(readSettings(file)).toEqual(settings);
  });

  it("defaults: no file → schema defaults", () => {
    const s = readSettings(path.join(dir, "definitely-missing.json"));
    expect(s.pauseOnClose).toBe(true);
    expect(s.rpcEnabled).toBe(true);
    expect(s.theme).toBe("system");
    expect(s.hwDecode).toBe(process.platform !== "linux");
    expect(s.downloadDir).toBe(defaultDownloadDir());
    expect(s.windowState).toBeUndefined();
  });

  it("corrupt file → defaults + backed up to .bak", () => {
    fs.writeFileSync(file, "not json{{{");
    expect(readSettings(file)).toEqual(
      readSettings(path.join(dir, "missing.json")),
    );
    expect(fs.existsSync(`${file}.bak`)).toBe(true);
    expect(fs.readFileSync(`${file}.bak`, "utf8")).toBe("not json{{{");
    expect(fs.existsSync(file)).toBe(false); // renamed away
  });

  it("schema-invalid file → defaults + backed up", () => {
    fs.writeFileSync(file, JSON.stringify({ theme: "neon" }));
    const s = readSettings(file);
    expect(s.theme).toBe("system");
    expect(fs.existsSync(`${file}.bak`)).toBe(true);
  });

  it("unknown keys are stripped, valid keys kept", () => {
    fs.writeFileSync(file, JSON.stringify({ theme: "light", evil: "x" }));
    const s = readSettings(file);
    expect(s.theme).toBe("light");
    expect("evil" in s).toBe(false);
  });

  it("write is atomic (no .tmp left behind)", () => {
    const s = readSettings(path.join(dir, "missing.json"));
    writeSettings(file, s);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });
});
