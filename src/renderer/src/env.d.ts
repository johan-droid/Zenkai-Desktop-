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
        openFile?: (path: string) => Promise<void>;
        loadWebPortal?: () => void;
        onStatus: (cb: (p: IpcEvents["updater:status"]) => void) => () => void;
      };
      onPlaybackPause: (cb: () => void) => () => void;
      onNotifyClick: (cb: (p: IpcEvents["notify:click"]) => void) => () => void;
      onAuthCallback: (cb: (p: IpcEvents["auth:callback"]) => void) => () => void;
    };
  }
}

