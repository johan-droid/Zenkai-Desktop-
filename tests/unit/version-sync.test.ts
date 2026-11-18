import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The packaged app's version comes from package.json alone (electron-builder embeds it and
// app.getVersion() reads it back). These guards keep every other copy in step.
const root = process.cwd();
const read = (file: string): string =>
  fs.readFileSync(path.join(root, file), "utf8");

const compare = (a: string, b: string): number => {
  const [am, an, ap] = a.split(".").map(Number);
  const [bm, bn, bp] = b.split(".").map(Number);
  return am - bm || an - bn || ap - bp;
};

describe("single version source", () => {
  it("package.json version is the newest CHANGELOG release", () => {
    const { version } = JSON.parse(read("package.json")) as { version: string };
    const headings = [
      ...read("CHANGELOG.md").matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm),
    ].map((m) => m[1]);
    expect(headings.length).toBeGreaterThan(0);
    const newest = headings.sort(compare).at(-1);
    expect(newest).toBe(version);
  });

  it("has no stale 0.0.1 version fallbacks in the app", () => {
    const files = [
      "src/main/updater.ts",
      "src/main/index.ts",
      "src/main/renderer-updater.ts",
      "src/renderer/src/components/DesktopSettingsCard.tsx",
    ];
    expect(files.filter((file) => /\b0\.0\.1\b/.test(read(file)))).toEqual([]);
  });
});
