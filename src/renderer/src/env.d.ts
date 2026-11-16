import type { IpcContract, IpcEvents } from "../../shared/ipc-contract";

declare global {
  interface Window {
    zenkai: {
      isDesktop: true;
      platform: NodeJS.Platform;
      settings: {
        get: () => Promise<import("../../shared/settings.schema").Settings>;
        set: (patch: Partial<import("../../shared/settings.schema").Settings>) => Promise<import("../../shared/settings.schema").Settings>;
      };
      downloads: {
        start: IpcContract["downloads:start"];
        resolve: IpcContract["downloads:resolve"];
        list: IpcContract["downloads:list"];
        remove: IpcContract["downloads:remove"];
      };
      rpc: {
        set: IpcContract["rpc:set"];
        clear: IpcContract["rpc:clear"];
      };
      app: {
        version: IpcContract["app:version"];
        checkUpdate: IpcContract["updater:check"];
        startUpdateDownload: IpcContract["updater:start-download"];
        installUpdate: IpcContract["updater:install"];
        diagnostics?: IpcContract["app:updateDiagnostics"];
        openFile?: (path: string) => Promise<void>;
        loadWebPortal?: () => void;
        onStatus: (cb: (p: IpcEvents["updater:status"]) => void) => () => void;
      };
      vision: {
        getHardwareProfile: IpcContract["vision:getHardwareProfile"];
        runDiagnostics: IpcContract["vision:runDiagnostics"];
        getWorkerStatus: IpcContract["vision:getWorkerStatus"];
        startWorker: IpcContract["vision:startWorker"];
        stopWorker: IpcContract["vision:stopWorker"];
        getModels: IpcContract["vision:getModels"];
        verifyModel: IpcContract["vision:verifyModel"];
        runBenchmark: IpcContract["vision:runBenchmark"];
        probeVideo: IpcContract["vision:probeVideo"];
        getJobs: IpcContract["vision:getJobs"];
        createJob: IpcContract["vision:createJob"];
        pauseJob: IpcContract["vision:pauseJob"];
        resumeJob: IpcContract["vision:resumeJob"];
        cancelJob: IpcContract["vision:cancelJob"];
        deleteJob: IpcContract["vision:deleteJob"];
        clearCompletedJobs: IpcContract["vision:clearCompletedJobs"];
        onWorkerStatusChanged: (cb: (p: IpcEvents["vision:workerStatusChanged"]) => void) => () => void;
        onJobProgress: (cb: (p: IpcEvents["vision:jobProgress"]) => void) => () => void;
        onJobListChanged: (cb: (p: IpcEvents["vision:jobListChanged"]) => void) => () => void;
      };
      gpu: {
        getDiagnostics: IpcContract["gpu:getDiagnostics"];
      };
      onPlaybackPause: (cb: () => void) => () => void;
      onNotifyClick: (cb: (p: IpcEvents["notify:click"]) => void) => () => void;
      onAuthCallback: (cb: (p: IpcEvents["auth:callback"]) => void) => () => void;
    };
  }
}

