import { powerMonitor, type BrowserWindow } from "electron";
import { sendPlaybackPause } from "./playback";

// T6 step 2: system suspend / lock-screen always pause (independent of
// pauseOnClose, per spec T6 step 2). Requires app ready.
export function registerPower(win: BrowserWindow): void {
  powerMonitor.on("suspend", () => sendPlaybackPause(win));
  powerMonitor.on("lock-screen", () => sendPlaybackPause(win));
}
