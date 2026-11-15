// Loads the app in plain Electron (no Playwright automation) via CDP and
// reports what the user would actually see.
import { spawn } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(
  "node_modules/electron/dist/electron",
  [".", "--remote-debugging-port=9334"],
  {
    stdio: ["ignore", "pipe", "pipe"],
  },
);
console.log("spawned", proc.pid);

try {
  await sleep(8000);
  console.log("fetching target list...");
  const listPromise = fetch("http://127.0.0.1:9334/json/list").then((r) =>
    r.json(),
  );
  const targets = await Promise.race([
    listPromise,
    sleep(10000).then(() => {
      throw new Error("json/list timeout");
    }),
  ]);
  console.log("targets:", targets.map((t) => `${t.type}:${t.url}`).join(" | "));
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  console.log("connecting ws...");
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("ws error")), {
      once: true,
    });
  });
  console.log("ws open");

  const evalCdp = (expression) =>
    new Promise((resolve, reject) => {
      const id = 42;
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== id) return;
        ws.removeEventListener("message", onMsg);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result.result.value);
      };
      ws.addEventListener("message", onMsg);
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        }),
      );
    });

  await sleep(5000); // let SPA mount
  const out = await evalCdp(
    `JSON.stringify({ title: document.title, url: location.href, bodyText: (document.body?.innerText ?? "").slice(0, 300), bodyChildren: document.body?.children.length ?? -1 })`,
  );
  console.log("RESULT:", out);
  ws.close();
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  proc.kill("SIGTERM");
}
