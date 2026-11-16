# Zenkai Desktop — Electron Architecture & Process Isolation

**Document Version:** 1.0.0  
**Scope:** Main process, preload context bridge, IPC contracts, and security boundaries.

---

## 1. Process Separation & Security Parameters

All `BrowserWindow` instances in Zenkai Desktop enforce strict security parameters:

```typescript
// BrowserWindow options configuration in src/main/index.ts
webPreferences: {
  preload: path.join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  navigateOnDragDrop: false,
  spellcheck: false
}
```

### Defense-in-Depth Measures
1. **Sandboxing (`sandbox: true`)**: The Chromium renderer process executes within an OS-level unprivileged sandbox.
2. **Context Isolation (`contextIsolation: true`)**: Preload scripts execute in an isolated JavaScript context from the website/renderer DOM.
3. **No Direct Node.js APIs (`nodeIntegration: false`)**: The renderer cannot import `fs`, `child_process`, `net`, or native C++ modules.
4. **Navigation Lock**: Window navigation is locked to the local bundled application scheme (`zenkai://` or `file://`). External link clicks are intercepted and passed to the OS default browser via `shell.openExternal()`.

---

## 2. Preload Context Bridge (`src/preload/index.ts`)

The preload bridge defines the single official interface between the renderer and the operating system:

```typescript
contextBridge.exposeInMainWorld('zenkai', {
  app: { ... },        // Version, platform, paths, window controls
  auth: { ... },       // Secure token storage, callback listeners
  playback: { ... },   // Stream proxy resolution, playback state sync
  downloads: { ... },  // Queue management, resume, pause, cancel, disk status
  discord: { ... },    // Rich Presence activity updates
  system: { ... },     // Power monitor, clipboard, shell integration
  settings: { ... },   // Persistent desktop settings (Zod validated)
  vision: { ... },     // Offline AI upscaling jobs, model manifests
  updater: { ... },    // Update status, check, download, install triggers
  gpu: { ... }         // Multi-GPU query and hardware diagnostics
});
```

---

## 3. Guarded IPC Handlers (`src/main/ipc/`)

IPC channels follow strict conventions:
- Communication occurs via `ipcRenderer.invoke(channel, payload)` matching `ipcMain.handle(channel, async (event, payload) => ...)`.
- Every incoming payload is validated against a Zod schema defined in `src/shared/ipc-contract.ts` or `src/shared/settings.schema.ts`.
- Malformed payloads are rejected immediately with typed errors; no raw exceptions or internal stack traces are passed back to the renderer.

```typescript
// Example from src/main/ipc/gpu.ipc.ts
ipcMain.handle('gpu:getDiagnostics', async () => {
  return getGpuDiagnostics();
});

ipcMain.handle('gpu:setPreference', async (_event, pref) => {
  const parsed = z.enum(['auto', 'high-performance', 'power-saving']).safeParse(pref);
  if (!parsed.success) throw new Error('Invalid GPU preference');
  await saveGpuPreference(parsed.data);
  return { success: true };
});
```

