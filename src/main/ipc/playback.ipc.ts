import { ipcMain } from "electron";
import { z } from "zod";
import { setPlaybackState, isPlaybackActive } from "../playback";

const PlaybackStateInput = z.object({
  isPlaying: z.boolean(),
});

ipcMain.on("playback:state", (_e, raw: unknown) => {
  const parsed = PlaybackStateInput.safeParse(raw);
  if (parsed.success) {
    setPlaybackState(parsed.data.isPlaying);
  }
});

ipcMain.handle("playback:isActive", async () => {
  return isPlaybackActive();
});

