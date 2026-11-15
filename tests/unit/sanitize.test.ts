import path from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "../../src/main/downloads/sanitize";

const DIR = "/tmp/dl";

describe("filename sanitizer (T8)", () => {
  it("strips every illegal character", () => {
    const out = sanitizeFilename('a/b\\c:d*e?f"g<h>i|j');
    expect(out).toBe("a_b_c_d_e_f_g_h_i_j");
    expect(out).not.toMatch(/[\/\\:*?"<>|]/);
  });

  it("path traversal: ../../etc/passwd stays inside the download dir", () => {
    const out = sanitizeFilename("../../etc/passwd");
    expect(out).not.toContain("/");
    expect(out).not.toContain("..");
    const resolved = path.resolve(DIR, out);
    expect(resolved.startsWith(`${path.resolve(DIR)}${path.sep}`)).toBe(true);
    expect(path.dirname(resolved)).toBe(path.resolve(DIR)); // flat file, no traversal
  });

  it("path traversal: backslash variant (Windows) neutralized", () => {
    const out = sanitizeFilename("..\\..\\windows\\system32\\evil.dll");
    expect(out).not.toMatch(/[\\]/);
    expect(out).not.toContain("..");
  });

  it("rejects all-dots names (would resolve to a directory)", () => {
    expect(sanitizeFilename(".")).toBe("download");
    expect(sanitizeFilename("..")).toBe("download");
    expect(sanitizeFilename("....")).toBe("download");
  });

  it("caps length at 200 chars", () => {
    const out = sanitizeFilename(`${"x".repeat(500)}.mp4`);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("removes control/null bytes", () => {
    const out = sanitizeFilename("ep\u0000isode\u007f");
    expect(out).toBe("episode");
  });

  it("empty / whitespace → fallback", () => {
    expect(sanitizeFilename("")).toBe("download");
    expect(sanitizeFilename("   ")).toBe("download");
  });

  it("normal filename passes through unchanged", () => {
    expect(sanitizeFilename("Attack on Titan - S01E03 (1080p).mkv")).toBe(
      "Attack on Titan - S01E03 (1080p).mkv",
    );
  });
});
