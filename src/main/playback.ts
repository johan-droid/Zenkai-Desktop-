import type { BrowserWindow } from "electron";
import { getSettings } from "./settings";
import { log } from "./logger";

let isCurrentlyPlaying = false;

export function setPlaybackState(playing: boolean): void {
  if (isCurrentlyPlaying !== playing) {
    log.playback.info(`Playback state: ${playing ? "PLAYING" : "PAUSED"}`);
  }
  isCurrentlyPlaying = playing;
}

export function isPlaybackActive(): boolean {
  return isCurrentlyPlaying;
}

export function sendPlaybackPause(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  log.playback.info("Triggering playback pause on window event");
  win.webContents.send("playback:pause");
}

// Dispatch a synthetic keydown into the page's main world so the (upstream,
// unmodified) web layer's own key handlers receive it — used where no native
// accelerator exists (tray Play/Pause).
export function dispatchWebKey(
  win: BrowserWindow,
  key: {
    key: string;
    code: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
  },
): void {
  if (win.isDestroyed()) return;
  const init = JSON.stringify({ bubbles: true, ...key });
  win.webContents
    .executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", ${init}))`,
    )
    .catch((err) => console.warn("[playback] web key dispatch failed:", err));
}

// T6 step 1: window events pause only when pauseOnClose is enabled.
export function registerPlayback(win: BrowserWindow): void {
  const pauseIfEnabled = () => {
    if (getSettings().pauseOnClose) sendPlaybackPause(win);
  };
  win.on("blur", pauseIfEnabled);
  win.on("hide", pauseIfEnabled);
  win.on("minimize", pauseIfEnabled);
}
