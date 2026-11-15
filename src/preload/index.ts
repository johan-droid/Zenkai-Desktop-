import { contextBridge, ipcRenderer } from "electron";
import type { IpcContract, IpcEvents } from "../shared/ipc-contract";

const call =
  <K extends keyof IpcContract>(ch: K) =>
  (...a: Parameters<IpcContract[K]>) =>
    ipcRenderer.invoke(ch, ...a) as ReturnType<IpcContract[K]>;

const on = <K extends keyof IpcEvents>(
  ch: K,
  cb: (p: IpcEvents[K]) => void,
) => {
  const h = (_: unknown, p: IpcEvents[K]) => cb(p);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.off(ch, h);
};

contextBridge.exposeInMainWorld("zenkai", {
  isDesktop: true as const,
  platform: process.platform,
  settings: { get: call("settings:get"), set: call("settings:set") },
  downloads: {
    start: call("downloads:start"),
    resolve: call("downloads:resolve"),
    list: call("downloads:list"),
    remove: call("downloads:remove"),
  },
  rpc: { set: call("rpc:set"), clear: call("rpc:clear") },
  app: {
    version: call("app:version"),
    checkUpdate: call("app:checkUpdate"),
    startUpdateDownload: call("app:startUpdateDownload"),
    installUpdate: call("app:installUpdate"),
    openFile: call("app:openFile"),
    loadWebPortal: () => ipcRenderer.send("window:loadWebPortal"),
    onStatus: (cb: (p: IpcEvents["updater:status"]) => void) =>
      on("updater:status", cb),
  },
  vision: {
    getHardwareProfile: call("vision:getHardwareProfile"),
    runDiagnostics: call("vision:runDiagnostics"),
    getWorkerStatus: call("vision:getWorkerStatus"),
    startWorker: call("vision:startWorker"),
    stopWorker: call("vision:stopWorker"),
    getModels: call("vision:getModels"),
    verifyModel: call("vision:verifyModel"),
    runBenchmark: call("vision:runBenchmark"),
    probeVideo: call("vision:probeVideo"),
    getJobs: call("vision:getJobs"),
    createJob: call("vision:createJob"),
    pauseJob: call("vision:pauseJob"),
    resumeJob: call("vision:resumeJob"),
    cancelJob: call("vision:cancelJob"),
    deleteJob: call("vision:deleteJob"),
    clearCompletedJobs: call("vision:clearCompletedJobs"),
    onWorkerStatusChanged: (cb: (p: IpcEvents["vision:workerStatusChanged"]) => void) =>
      on("vision:workerStatusChanged", cb),
    onJobProgress: (cb: (p: IpcEvents["vision:jobProgress"]) => void) =>
      on("vision:jobProgress", cb),
    onJobListChanged: (cb: (p: IpcEvents["vision:jobListChanged"]) => void) =>
      on("vision:jobListChanged", cb),
  },
  onPlaybackPause: (cb: () => void) => on("playback:pause", () => cb()),
  onNotifyClick: (cb: (p: IpcEvents["notify:click"]) => void) =>
    on("notify:click", cb),
  onAuthCallback: (cb: (p: IpcEvents["auth:callback"]) => void) =>
    on("auth:callback", cb),
});

// Auto-pause and banner cleanup when viewing the remote web portal
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    const mobileBanner = document.getElementById("mobileAppBanner");
    if (mobileBanner) {
      mobileBanner.style.display = "none";
    }

    ipcRenderer.on("playback:pause", () => {
      const v = (document.getElementById("zenkaiVideo") ||
        document.querySelector("video.zp-v") ||
        document.querySelector("video")) as HTMLVideoElement | null;
      if (v && !v.paused) v.pause();
    });

    // Capture media play/pause/ended globally to inform main process of playback state
    const notifyPlayback = (isPlaying: boolean) => {
      try {
        ipcRenderer.send("playback:state", { isPlaying });
      } catch {
        // ignore if ipc is tearing down
      }
    };

    document.addEventListener(
      "play",
      (e) => {
        if (e.target instanceof HTMLMediaElement) notifyPlayback(true);
      },
      true,
    );

    document.addEventListener(
      "pause",
      (e) => {
        if (e.target instanceof HTMLMediaElement) notifyPlayback(false);
      },
      true,
    );

    document.addEventListener(
      "ended",
      (e) => {
        if (e.target instanceof HTMLMediaElement) notifyPlayback(false);
      },
      true,
    );
  });
}
