import http from "node:http";
import { URL } from "node:url";
import { UpdateRegistry } from "./updates.js";
import { verifyGitHubWebhookSignature, parseAndValidateReleaseWebhook, type GitHubWebhookReleasePayload } from "./webhook.js";
import type { ReleaseChannel } from "./types.js";

export interface ServerConfig {
  port?: number;
  webhookSecret?: string;
  expectedRepo?: string;
  initialRegistry?: UpdateRegistry;
}

export function createUpdateServer(config: ServerConfig = {}): {
  server: http.Server;
  registry: UpdateRegistry;
  listen: (port?: number) => Promise<number>;
  close: () => Promise<void>;
} {
  const registry = config.initialRegistry || new UpdateRegistry();
  const webhookSecret = config.webhookSecret || process.env.GITHUB_WEBHOOK_SECRET || "development-secret";
  const expectedRepo = config.expectedRepo || process.env.GITHUB_REPOSITORY || "johan-droid/Zenkai-Desktop-";

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    // CORS & Common Headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // 1. Health check
    if (pathname === "/health" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          activeReleasesCount: registry.getAllReleases().length,
        }),
      );
      return;
    }

    // 2. Client update check: GET /desktop/v1/updates/latest
    if (pathname === "/desktop/v1/updates/latest" && method === "GET") {
      const platform = parsedUrl.searchParams.get("platform") || "linux";
      const arch = parsedUrl.searchParams.get("arch") || "x64";
      const channel = (parsedUrl.searchParams.get("channel") as ReleaseChannel) || "stable";
      const version = parsedUrl.searchParams.get("version") || "0.0.0";
      const installationId = parsedUrl.searchParams.get("installationId") || undefined;

      const result = registry.checkForUpdates({
        platform,
        arch,
        channel,
        version,
        installationId,
      });

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      });
      res.end(JSON.stringify(result));
      return;
    }

    // 3. Client version lookup: GET /desktop/v1/updates/:version
    if (pathname.startsWith("/desktop/v1/updates/") && method === "GET") {
      const versionParam = pathname.replace("/desktop/v1/updates/", "");
      const release = registry.getReleaseByVersion(versionParam) || registry.getRelease(`v${versionParam}`);

      if (!release) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Version not found" }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      });
      res.end(JSON.stringify(release));
      return;
    }

    // 4. GitHub Releases Webhook: POST /webhooks/github/releases
    if (pathname === "/webhooks/github/releases" && method === "POST") {
      const signatureHeader = req.headers["x-hub-signature-256"] as string | undefined;
      const deliveryId = req.headers["x-github-delivery"] as string | undefined;

      // Idempotency check
      if (deliveryId && registry.isDeliveryProcessed(deliveryId)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ignored", reason: "duplicate delivery" }));
        return;
      }

      // Collect raw body
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks);

        // Security check: constant-time HMAC signature verification
        if (!verifyGitHubWebhookSignature(webhookSecret, rawBody, signatureHeader)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid signature" }));
          return;
        }

        try {
          const payload = JSON.parse(rawBody.toString("utf8")) as GitHubWebhookReleasePayload;
          const record = parseAndValidateReleaseWebhook(payload, expectedRepo);

          if (!record) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                status: "ignored",
                reason: "Action is not published, release is draft, or repository mismatch",
              }),
            );
            return;
          }

          registry.registerRelease(record);
          if (deliveryId) registry.markDeliveryProcessed(deliveryId);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "success", tag: record.tag, version: record.version }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Malformed JSON payload" }));
        }
      });
      return;
    }

    // 404 for unknown endpoints
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return {
    server,
    registry,
    listen: (port = config.port || 3000) =>
      new Promise<number>((resolve) => {
        server.listen(port, () => {
          const addr = server.address();
          const actualPort = typeof addr === "object" && addr ? addr.port : port;
          resolve(actualPort);
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// Start standalone server if invoked directly
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const port = parseInt(process.env.PORT || "3000", 10);
  const { listen } = createUpdateServer({ port });
  listen(port).then((p) => {
    console.log(`[update-control] server listening on port ${p}`);
  });
}

