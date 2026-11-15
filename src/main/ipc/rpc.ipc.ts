import { ipcMain } from "electron";
import { z } from "zod";
import { clearRpcActivity, setRpcActivity } from "../discord-rpc";

const SetInput = z.object({
  title: z.string().min(1).max(128),
  details: z.string().max(128).optional(),
  startedAt: z.number().int().nonnegative().optional(),
});
const NoInput = z.undefined();

function reject(channel: string, issues: unknown): never {
  console.error(`[ipc] invalid payload for ${channel}`, issues);
  throw new Error(`invalid payload for ${channel}`);
}

ipcMain.handle("rpc:set", async (_e, raw: unknown) => {
  const parsed = SetInput.safeParse(raw);
  if (!parsed.success) reject("rpc:set", parsed.error.issues);
  setRpcActivity(parsed.data);
});

ipcMain.handle("rpc:clear", async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) reject("rpc:clear", parsed.error.issues);
  clearRpcActivity();
});
