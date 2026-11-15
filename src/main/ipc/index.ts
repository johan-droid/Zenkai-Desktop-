// Side-effect registration of all IPC handlers. Add one import per *.ipc.ts file.
import "./app.ipc";
import "./downloads.ipc";
import "./rpc.ipc";
import "./settings.ipc";
import "./updater.ipc";
import "./playback.ipc";
import "./open-file.ipc";
import "./vision.ipc";
import { registerWindowIpc } from "./window.ipc";

registerWindowIpc();
