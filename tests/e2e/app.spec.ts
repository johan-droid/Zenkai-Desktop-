import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";
import { fetchViaProxy, unwrapProxyUrl } from "../../src/main/api/proxy";
import { resolveStream } from "../../src/main/api/stream";

test.describe("E2E: Zenkai Desktop Application", () => {
  test("launch electron app, verify preload bridge and settings IPC", async () => {
    const launchEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ZENKAI_WEB_URL:
        "data:text/html,<html><head><title>Zenkai Test</title></head><body><h1>Zenkai Test</h1></body></html>",
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;

    const app = await electron.launch({
      args: [path.join(__dirname, "../../out/main/index.js")],
      env: launchEnv,
    });

    try {
      const window = await app.firstWindow();
      expect(window).toBeDefined();

      await window.waitForLoadState("domcontentloaded");

      // Verify preload bridge is present and hardened
      const isDesktop = await window.evaluate(
        () => (window as any).zenkai?.isDesktop,
      );
      expect(isDesktop).toBe(true);

      const hasRequire = await window.evaluate(
        () => typeof (window as any).require,
      );
      expect(hasRequire).toBe("undefined");

      const hasProcess = await window.evaluate(
        () => typeof (window as any).process,
      );
      expect(hasProcess).toBe("undefined");

      // Test settings IPC
      const settings = await window.evaluate(
        () => (window as any).zenkai?.settings.get(),
      );
      expect(settings).toBeDefined();
      expect(typeof settings.pauseOnClose).toBe("boolean");
      expect(typeof settings.rpcEnabled).toBe("boolean");

      // Test app version IPC
      const version = await window.evaluate(
        () => (window as any).zenkai?.app.version(),
      );
      expect(typeof version).toBe("string");
      expect(version).toMatch(/^\d+\.\d+\.\d+/);

      // Test downloads list IPC
      const downloads = await window.evaluate(
        () => (window as any).zenkai?.downloads.list(),
      );
      expect(Array.isArray(downloads)).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("v3 delta e2e: resolve stream for known id, fetch segment via proxy, verify MPEG-TS", async () => {
    const stream = await resolveStream({
      anilistId: 21,
      episode: 1,
      audio: "sub",
      server: "megaplay",
      title: "One Piece",
    });

    expect(stream).toBeDefined();
    expect(stream.m3uUrl).toMatch(/\.m3u8/);
    expect(stream.allowedHosts.length).toBeGreaterThan(0);

    const allowed = [...stream.allowedHosts];
    const parsedM3u = new URL(stream.m3uUrl);
    if (!allowed.includes(parsedM3u.hostname)) allowed.push(parsedM3u.hostname);

    const masterRes = await fetchViaProxy(
      stream.m3uUrl,
      allowed,
      stream.referer,
    );
    expect(masterRes.status).toBe(200);
    const masterText = await masterRes.text();
    expect(masterText).toContain("#EXTM3U");

    // Extract variant
    const lines = masterText.split("\n").map((l) => l.trim());
    let variantUrl = lines.find(
      (l) => l && !l.startsWith("#") && l.includes(".m3u8"),
    );
    if (variantUrl && !variantUrl.startsWith("http")) {
      variantUrl = new URL(variantUrl, stream.m3uUrl).href;
    }

    if (variantUrl) {
      const unwrappedVariant = unwrapProxyUrl(variantUrl).url;
      const varHost = new URL(unwrappedVariant).hostname;
      if (!allowed.includes(varHost)) allowed.push(varHost);

      const varRes = await fetchViaProxy(
        unwrappedVariant,
        allowed,
        stream.referer,
      );
      expect(varRes.status).toBe(200);
      const varText = await varRes.text();
      const varLines = varText.split("\n").map((l) => l.trim());
      let segUrl = varLines.find((l) => l && !l.startsWith("#"));
      if (segUrl && !segUrl.startsWith("http")) {
        segUrl = new URL(segUrl, variantUrl).href;
      }

      if (segUrl) {
        const unwrappedSeg = unwrapProxyUrl(segUrl).url;
        const segHost = new URL(unwrappedSeg).hostname;
        if (!allowed.includes(segHost)) allowed.push(segHost);

        const segRes = await fetchViaProxy(
          unwrappedSeg,
          allowed,
          stream.referer,
        );
        expect(segRes.status).toBe(200);
        const buf = Buffer.from(await segRes.arrayBuffer());
        expect(buf.length).toBeGreaterThan(0);
        expect(buf[0]).toBe(0x47); // MPEG-TS sync byte
      }
    }
  });
});
