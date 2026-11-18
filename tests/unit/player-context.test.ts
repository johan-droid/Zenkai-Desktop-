import { describe, expect, it } from "vitest";
import { isPlayerContext } from "../../src/renderer/src/services/api";

const loc = (pathname: string, hash = "") => ({ pathname, hash });

describe("player context detection (X-Zenkai-Embed header)", () => {
  it("treats the packaged desktop shell as a player even on file:// index.html", () => {
    expect(isPlayerContext(loc("/index.html"), false, true)).toBe(true);
  });

  it("detects HashRouter watch/embed routes used by the desktop build", () => {
    expect(
      isPlayerContext(loc("/index.html", "#/watch/21"), false, false),
    ).toBe(true);
    expect(
      isPlayerContext(loc("/index.html", "#/embed/21/1"), false, false),
    ).toBe(true);
  });

  it("detects browser routes and iframes", () => {
    expect(isPlayerContext(loc("/watch/21"), false, false)).toBe(true);
    expect(isPlayerContext(loc("/embed"), false, false)).toBe(true);
    expect(isPlayerContext(loc("/"), true, false)).toBe(true);
  });

  it("stays off for ordinary browsing so non-player requests are not flagged", () => {
    expect(isPlayerContext(loc("/"), false, false)).toBe(false);
    expect(isPlayerContext(loc("/anime/21", "#/anime/21"), false, false)).toBe(
      false,
    );
  });
});
