import { Client, type SetActivity } from "@xhayper/discord-rpc";

// T9 — Discord Rich Presence. Contract: rpc:set {title, details?, startedAt?}
// / rpc:clear. B3: app ID from ZENKAI_DISCORD_APP_ID; missing → disabled, log once.
// Connection failure (Discord closed): swallow, retry every 30s, capped.

const RETRY_MS = 30_000;
const MAX_RETRIES = Number(process.env["ZENKAI_RPC_MAX_RETRIES"] ?? 5);

let client: Client | null = null;
let disabledLogged = false;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pending: SetActivity | null = null;

function disabled(): boolean {
  if (process.env["ZENKAI_DISCORD_APP_ID"]) return false;
  if (!disabledLogged) {
    disabledLogged = true;
    console.warn(
      "[rpc] ZENKAI_DISCORD_APP_ID not set — Discord Rich Presence disabled",
    );
  }
  return true;
}

function ensureClient(): void {
  if (client || disabled()) return;
  client = new Client({ clientId: process.env["ZENKAI_DISCORD_APP_ID"]! });
  client.on("connected", () => {
    void applyPending(); // apply the latest activity once Discord is reachable
  });
  void connectWithRetry();
}

async function connectWithRetry(): Promise<void> {
  if (!client) return;
  try {
    await client.connect();
    retries = 0;
    console.log("[rpc] connected to Discord");
  } catch {
    // Discord not running → swallow (spec: no crash, no uncaught error)
    if (retries < MAX_RETRIES) {
      retries++;
      console.warn(
        `[rpc] Discord unavailable, retry ${retries}/${MAX_RETRIES} in ${RETRY_MS / 1000}s`,
      );
      retryTimer ??= setTimeout(() => {
        retryTimer = null;
        void connectWithRetry();
      }, RETRY_MS);
    } else {
      console.warn(
        "[rpc] max connection retries reached — presence updates ignored until Discord is reachable",
      );
    }
  }
}

async function applyPending(): Promise<void> {
  const user = client?.user;
  if (!client?.isConnected || !user) return; // 'connected' handler re-applies later
  try {
    if (pending) await user.setActivity(pending);
    else await user.clearActivity();
  } catch {
    // race with Discord closing → swallow, retry happens on next set/clear
  }
}

export function setRpcActivity(p: {
  title: string;
  details?: string;
  startedAt?: number;
}): void {
  if (disabled()) return;
  pending = {
    state: p.title,
    ...(p.details ? { details: p.details } : {}),
    startTimestamp: p.startedAt ?? Date.now(),
  };
  ensureClient();
  void applyPending();
}

export function clearRpcActivity(): void {
  if (disabled()) return;
  pending = null;
  ensureClient();
  void applyPending();
}
