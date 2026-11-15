# 02 — Reference: Exact Config, IPC Contract, Packaging

> Copy these blocks verbatim. Do not retype from memory. Unverified library calls
> get a `// VERIFY:` comment until the installed `.d.ts` is read (Agent Rule 7).

## 6. Shared config — `src/shared/config.ts`

```ts
export const WEB_URL = process.env.ZENKAI_WEB_URL ?? 'https://zenkai-web.pages.dev/';
export const ALLOWED_ORIGINS = ['https://zenkai-web.pages.dev'] as const;
export const DISCORD_APP_ID = process.env.ZENKAI_DISCORD_APP_ID ?? '';
```

## 6.2 BrowserWindow `webPreferences` (exact)

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
}
```

## 6.3 CSP (applied to app origin)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
media-src 'self' blob: https:;
connect-src 'self' https:;
font-src 'self' data:;
frame-src 'none';
object-src 'none';
base-uri 'none';
```

Note: if the upstream web app needs stricter/looser rules, change only after review.
Do **not** add `unsafe-eval`.

## 6.4 Allowlist

- Navigation/window open: `ALLOWED_ORIGINS` only.
- External links: `shell.openExternal` with `https:` only; reject `file:`,
  `javascript:`, and custom schemes except `zenkai:`.

---

## 7. IPC contract

### 7.1 `src/shared/ipc-contract.ts`

```ts
export type Settings = import('./settings.schema').Settings;
export type DownloadItem = { id: string; name: string; status: 'queued'|'active'|'paused'|'done'|'error'; bytes: number; total: number };

export type IpcContract = {
  'settings:get':     () => Promise<Settings>;
  'settings:set':     (patch: Partial<Settings>) => Promise<Settings>;
  'downloads:start':  (p: { id: string; url: string; name: string }) => Promise<void>;
  'downloads:list':   () => Promise<DownloadItem[]>;
  'downloads:remove': (id: string) => Promise<void>;
  'rpc:set':          (p: { title: string; details?: string; startedAt?: number }) => Promise<void>;
  'rpc:clear':        () => Promise<void>;
  'app:version':      () => Promise<string>;
};

export type IpcEvents = {
  'playback:pause': void;
  'notify:click':   { id: string };
  'auth:callback':  { token: string };
};
```

### 7.2 `src/preload/index.ts`

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcContract, IpcEvents } from '../shared/ipc-contract';

const call = <K extends keyof IpcContract>(ch: K) =>
  (...a: Parameters<IpcContract[K]>) => ipcRenderer.invoke(ch, ...a) as ReturnType<IpcContract[K]>;

const on = <K extends keyof IpcEvents>(ch: K, cb: (p: IpcEvents[K]) => void) => {
  const h = (_: unknown, p: IpcEvents[K]) => cb(p);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.off(ch, h);
};

contextBridge.exposeInMainWorld('zenkai', {
  isDesktop: true as const,
  platform: process.platform,
  settings: { get: call('settings:get'), set: call('settings:set') },
  downloads: { start: call('downloads:start'), list: call('downloads:list'), remove: call('downloads:remove') },
  rpc: { set: call('rpc:set'), clear: call('rpc:clear') },
  app: { version: call('app:version') },
  onPlaybackPause: (cb: () => void) => on('playback:pause', () => cb()),
  onNotifyClick:   (cb: (p: IpcEvents['notify:click']) => void) => on('notify:click', cb),
  onAuthCallback:  (cb: (p: IpcEvents['auth:callback']) => void) => on('auth:callback', cb),
});
```

### 7.3 Handler template — `src/main/ipc/*.ipc.ts`

```ts
import { ipcMain } from 'electron';
import { z } from 'zod';

const Input = z.object({ id: z.string().min(1).max(64) });

ipcMain.handle('downloads:remove', async (_e, raw: unknown) => {
  const { id } = Input.parse(raw);   // throws on bad input → renderer gets error
  // ...act
});
```

**Rule:** every handler parses input with zod on the first line. Unknown channels are
rejected (not registered = not callable).

---

## 8. Reference tables

### 8.1 Feature parity (desktop v1)

| Upstream feature | Desktop task |
|---|---|
| Anime streaming, multi-server | Web (no change) |
| PiP | Web PiP API; T6 pause hook |
| Auto-pause (v1.5.3) | T6 |
| Downloads + storage (v1.5.3) | T8 |
| Discord RPC (v1.5.3) | T9 |
| Notifications (v1.5.3) | T10 |
| Login | T11 |
| Dynamic 60/90/120Hz | Not ported; OS vsync |
| Entry screen animation | Web layer |

### 8.2 Default download dirs

| OS | Path |
|---|---|
| Win | `%USERPROFILE%\Downloads\Zenkai` |
| mac | `~/Downloads/Zenkai` |
| Linux | `$XDG_DOWNLOAD_DIR/Zenkai`, fallback `~/Downloads/Zenkai` |

### 8.3 Shortcuts

| Action | Win/Linux | mac |
|---|---|---|
| Play/Pause | Space | Space |
| Fullscreen | F11 | Ctrl+Cmd+F |
| PiP | Ctrl+Shift+P | Cmd+Shift+P |
| Next ep | Ctrl+Right | Cmd+Right |
| Prev ep | Ctrl+Left | Cmd+Left |
| Settings | Ctrl+, | Cmd+, |
| Reload | Ctrl+R | Cmd+R |
| DevTools (dev) | Ctrl+Shift+I | Cmd+Alt+I |

Handled in the web layer where possible; menu accelerators only where web can't
receive them.

### 8.4 Hardware decode flags

| OS | Flag | Default |
|---|---|---|
| Win/mac | none needed | on |
| Linux Intel/AMD | `--enable-features=VaapiVideoDecoder,VaapiVideoEncoder` | off, opt-in setting |
| Fallback | `--disable-gpu-compositing` if black frames | manual |

Apply with `app.commandLine.appendSwitch` before `app.whenReady()`.

---

## 9. Packaging — `electron-builder.yml`

```yaml
appId: app.zenkai.desktop
productName: Zenkai
directories:
  output: release
  buildResources: resources
files:
  - out/**
  - package.json
asar: true
publish:
  provider: github
  owner: Nyyrox          # VERIFY: owner of published desktop repo
  repo: zenkai-desktop
  releaseType: release
afterSign: scripts/after-sign.mjs

win:
  icon: resources/icon.ico
  target:
    - { target: nsis, arch: [x64, arm64] }
    - { target: portable, arch: [x64] }
  signingHashAlgorithms: [sha256]

mac:
  category: public.app-category.entertainment
  icon: resources/icon.icns
  hardenedRuntime: true
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist
  target:
    - { target: dmg, arch: [universal] }
    - { target: zip, arch: [universal] }

linux:
  icon: resources/icons
  category: AudioVideo
  target:
    - { target: AppImage, arch: [x64, arm64] }
    - { target: deb, arch: [x64, arm64] }
    - { target: rpm, arch: [x64, arm64] }
```

`resources/entitlements.mac.plist` keys: `com.apple.security.cs.allow-jit`,
`com.apple.security.network.client`. Add others only if a task needs them.

---

## 11. Commands — `package.json` scripts

```json
{
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "e2e": "playwright test",
    "dist:linux": "pnpm build && electron-builder --linux",
    "dist:win": "pnpm build && electron-builder --win",
    "dist:mac": "pnpm build && electron-builder --mac"
  }
}
```
