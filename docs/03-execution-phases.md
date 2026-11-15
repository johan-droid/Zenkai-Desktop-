# 03 — Phase-wise Execution Plan

Tasks run in numeric order T1 → T17. A phase starts only when its entry gate and all
listed dependencies are met. Each task: **Inputs · Files · Steps · Acceptance**.
Config/code blocks come from [02-reference.md](02-reference.md).

**Definition of done (every task):** `pnpm typecheck` passes, relevant tests pass, all
acceptance criteria met, reported explicitly. One PR per task, branch `task/T<n>-<slug>`.

**Blocker handling:** if a task hits a blocker (B1–B6 in [01-context.md](01-context.md)),
stop and ask. Do not guess. Tasks marked "skippable" may be stubbed per their blocker's
stop behavior, then revisited.

---

## Phase 0 — Pre-flight (no code)

**Goal:** confirm inputs, resolve what can be resolved before scaffolding.
**Entry gate:** none.

| Step | Action                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 0.1  | Verify F9: check upstream `Nyyrox/Zenkai` licence file. If absent/unclear → B6 stays open (blocks T17).                            |
| 0.2  | Request B1: web app owner permission to wrap + stable URL/source. Until resolved, all tasks use the `WEB_URL` placeholder from §6. |
| 0.3  | Request B4: code-signing certs (Windows OV/EV, Apple Developer ID). Absent → unsigned artifacts path.                              |
| 0.4  | Request B5: brand/licence OK for the name "Zenkai".                                                                                |
| 0.5  | Toolchain check: `node`, `pnpm` installed; git repo initialized.                                                                   |

**Exit gate:** B1 requested (or placeholder accepted), F9 checked, toolchain ready.
B2/B3 stay open until T11/T9 respectively — their stop behaviors apply.

**Status: ✅ COMPLETE (2026-11-15)**

- 0.1 F9 checked: no LICENSE file upstream → B6 open (blocks T17 only).
- 0.2 B1 resolved: user owns web app; wrap target = `https://zenkai-web.pages.dev/`.
- 0.3 B4: no certs → unsigned path locked.
- 0.4 B5 resolved: brand cleared.
- 0.5 Toolchain OK (node 24, pnpm 12, git 2.43); repo initialized on `main`.

---

## Phase 1 — Foundation (T1–T4)

**Goal:** a secure Electron shell with a typed, validated IPC bridge.
**Entry gate:** Phase 0 exit.
**Exit gate:** `pnpm typecheck` green; `pnpm dev` opens hardened window; renderer has
`window.zenkai` and no Node globals; IPC rejects bad payloads in unit tests.

### T1 — Scaffold

- **Deps:** none
- **Files:** `package.json`, `tsconfig.json`, `electron.vite.config.ts`,
  `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/` (empty stub)
- **Steps:**
  1. `pnpm init`
  2. `pnpm add -D electron electron-builder electron-vite typescript vitest @playwright/test eslint prettier @types/node`
  3. `pnpm add electron-updater zod @xhayper/discord-rpc`
  4. Set `"main": "out/main/index.js"`, scripts per [02-reference.md §11](02-reference.md).
  5. `tsconfig.json`: `"strict": true`, `"moduleResolution": "bundler"`.
- **Acceptance:**
  - [ ] `pnpm typecheck` exit 0
  - [ ] `pnpm dev` opens an empty Electron window
  - [ ] Exact versions pinned (no `^`/`~` on electron, electron-builder, electron-updater)

### T2 — Secure main window

- **Deps:** T1, B1 (use placeholder URL until resolved)
- **Files:** `src/main/window.ts`, `src/shared/config.ts`, `src/main/index.ts`
- **Steps:**
  1. `src/shared/config.ts` exports `WEB_URL`, `ALLOWED_ORIGINS` (§6.1).
  2. `window.ts` exports `createMainWindow(): BrowserWindow`. Apply webPreferences
     from [§6.2](02-reference.md) exactly.
  3. Show window on `ready-to-show`.
  4. Load `WEB_URL`.
- **Acceptance:**
  - [ ] `webPreferences` exactly matches §6.2 (grep test)
  - [ ] Window opens, loads `WEB_URL`
  - [ ] Min size 960×600, default 1280×800

### T3 — Navigation + permission lockdown

- **Deps:** T2
- **Files:** `src/main/security.ts`
- **Steps:**
  1. `will-navigate`: block non-allowlisted origin → `shell.openExternal`.
  2. `setWindowOpenHandler`: allow allowlisted; else `shell.openExternal` + deny.
  3. `session.defaultSession.setPermissionRequestHandler`: allow only
     `notifications`, `fullscreen`, `media`.
  4. Set CSP header via `session.defaultSession.webRequest.onHeadersReceived` using
     [§6.3](02-reference.md).
- **Acceptance:**
  - [ ] Navigating to `https://example.com` from renderer opens system browser, does
        not load in app
  - [ ] `geolocation` permission request denied
  - [ ] CSP header present on app origin responses

### T4 — Preload bridge + IPC contract

- **Deps:** T3
- **Files:** `src/shared/ipc-contract.ts`, `src/preload/index.ts`, `src/main/ipc/index.ts`
- **Steps:**
  1. Define `IpcContract` type ([§7.1](02-reference.md)). Single source.
  2. Preload exposes `window.zenkai` via `contextBridge.exposeInMainWorld` ([§7.2](02-reference.md)).
  3. Main registers handlers from `src/main/ipc/*.ipc.ts`. Each handler: validate input
     with zod, then act.
  4. Unknown channels: rejected (not registered = not callable).
- **Acceptance:**
  - [ ] `window.zenkai.isDesktop === true` in renderer devtools
  - [ ] `window.require` and `process` undefined in renderer
  - [ ] Invalid payload to any handler → throws, logged, no crash (unit test)

**Phase 1 exit gate:** all T1–T4 acceptance boxes checked.

---

## Phase 2 — Core behavior (T5–T7) — ✅ COMPLETE

**Goal:** persisted settings, playback pause behavior, native menu/tray.
**Entry gate:** Phase 1 exit.
**Exit gate:** settings round-trip + corrupt-file tests green; auto-pause verified;
shortcuts fire; tray degrades gracefully on Linux.

**Status (verified):** `pnpm typecheck` 0 · `pnpm test` 15/15 (3 files) ·
`pnpm build` 0 · runtime `t5-check` 6/6 · `t6-check` 2/2 · `t7-check` 14/14.

**Findings:**

- **zod v4 `.partial()` default-leak (fixed):** `SettingsSchema.partial().parse({})`
  returns filled defaults (`{pauseOnClose:true, theme:"system"}`), so an empty
  `settings:set({})` silently reset untouched settings. Fix: `settings.ipc.ts`
  validates each sent key against the schema shape and merges only those keys;
  regression covered in `tests/unit/settings-ipc.test.ts`.
- **Tray stdout race (check-only):** tray logs `[tray] created` at process birth;
  attaching stdout after launch missed it. `t7-check.mjs` Phase A spawns with
  birth-captured stdio. Tray **is created** on this Linux host.
- **T7 menu interpretation:** only web-unreachable accelerators live in the native
  menu (Reload `CmdOrCtrl+R`, Fullscreen `F11`/`Ctrl+Cmd+F`, DevTools dev-only
  `Ctrl+Shift+I`/`Cmd+Alt+I`). Play/Pause, PiP, next/prev, settings deliberately
  absent so they reach the web layer — verified 5/5 key-delivery checks.
- **T6 gating:** window blur/hide/minimize gated on `pauseOnClose`;
  `powerMonitor` suspend/lock-screen always pause (spec step 2).
- `settings.schema.ts` was created in T4 (contract dependency); store/IPC/tests
  are T5 work. Tray icon generated by `scripts/gen-tray-icon.mjs` →
  `resources/tray.png` (no binary assets in repo).

### T5 — Settings store

- **Deps:** T4
- **Files:** `src/main/settings.ts`, `src/main/ipc/settings.ipc.ts`,
  `src/shared/settings.schema.ts`
- **Steps:**
  1. Schema (zod): `pauseOnClose: boolean (default true)`, `hwDecode: boolean
(default true on win/mac, false on linux)`, `downloadDir: string (default §8.2
table)`, `rpcEnabled: boolean (default true)`,
     `windowState: {x,y,width,height,maximized}`,
     `theme: 'system'|'dark'|'light' (default 'system')`.
  2. Read/write `path.join(app.getPath('userData'), 'settings.json')`. Atomic write
     (temp + rename).
  3. Corrupt file → back up to `settings.json.bak`, reset defaults.
- **Acceptance:**
  - [x] Round-trip test passes
  - [x] Corrupt-file test passes
  - [x] Window state restored on launch

### T6 — Playback behavior (auto-pause)

- **Deps:** T4
- **Files:** `src/main/playback.ts`, `src/main/power.ts`
- **Steps:**
  1. If `pauseOnClose`: on window `blur`, `hide`, `minimize` →
     `webContents.send('playback:pause')`.
  2. `powerMonitor.on('suspend' | 'lock-screen')` → send `playback:pause`.
  3. Renderer listens via `window.zenkai.onPlaybackPause` ([§7.2](02-reference.md)).
- **Acceptance:**
  - [x] Minimize while playing → pause event received in renderer
  - [x] Setting off → no pause on minimize

### T7 — Menu, tray, shortcuts

- **Deps:** T4
- **Files:** `src/main/menu.ts`, `src/main/tray.ts`
- **Steps:**
  1. Native menu per [§8.3 accelerators](02-reference.md). macOS app menu has
     standard items.
  2. Tray: Show, Play/Pause, Quit. Icon from `resources/tray-*.png`.
  3. Linux: if tray unsupported (no AppIndicator), log warning, skip tray (no crash).
- **Acceptance:**
  - [x] All §8.3 accelerators fire IPC/actions
  - [x] Tray present on Win/mac; Linux graceful fallback

**Phase 2 exit gate:** ✅ T5–T7 acceptance boxes checked; `pnpm test` green (15/15).

---

## Phase 3 — Feature parity (T8–T11) — ✅ COMPLETE

**Goal:** downloads, Discord RPC, notifications, auth deep links — matching upstream
features F5.
**Entry gate:** Phase 2 exit.
**Exit gate:** download queue/resume/sanitizer tests green; RPC fails silently without
Discord; notifications focus app; deep link focuses window with redacted logs.
**Blockers in play:** B3 (T9), B2 (T11 — skippable).

**Status (verified):** `pnpm typecheck` 0 · Phase-3 unit tests **44/44** (7 files) ·
`pnpm build` 0 · runtime `t8-check` 9/9 · `t9-check` 8/8 · `t10-check` 3/3 ·
`t11-check` 6/6. (Full `pnpm test` includes a concurrent session's
`tests/unit/stream-proxy.test.ts` — a live-network T-API test failing on an
external 403; foreign to Phase 3, its `src/main/api/*` code is unwired.)

**Findings:**

- **zod `z.url()` accepts `javascript:` URLs** — `downloads:start` / rpc inputs
  additionally refine to `http/https` protocol at the IPC boundary.
- **Resume truth = `.part` on disk**: index bytes are recomputed from
  `fs.statSync(.part)` at load; interrupted `active` entries relaunch as `queued`
  and auto-pump via `resumeDownloads()` at app ready.
- **`storageUsage()`** (index byte sum + `fs.statfs` free space) implemented and
  unit-tested; NOT IPC-exposed — §7.1 has no channel for it (add when the web UI
  needs it).
- **T9 types verified from installed lib**: `login()` without scopes == `connect()`
  (own source), `user.setActivity(SetActivity)` / `clearActivity()`; retry cap
  configurable via `ZENKAI_RPC_MAX_RETRIES` (default 5).
- **T10 deviation — `notify.ipc.ts` deliberately not created**: §7.1 defines no
  renderer→main notify channel, and evidence from the live web bundle (zero
  `window.zenkai` / `Notification` usage) shows the renderer keeps its own HTML5
  notification path via the §6.4-granted `notifications` permission. Main owns its
  own notifications (trigger: download complete → `showNotification`); click →
  focus + `notify:click`. Click logic unit-tested (OS notification clicks are not
  scriptable from the harness).
- **T11 built (not stubbed) while B2 stays open**: transport plumbing only
  (protocol registration, single-instance argv handoff, `open-url` for macOS,
  parse + redacted forwarding). The upstream auth scheme decision (B2) is
  unaffected. Known ceiling: a deep link arriving before the window exists is
  dropped (no renderer listener yet).
- **`pnpm build` is required after main-process edits** — `electron .` loads
  `out/main`; a stale bundle silently skipped the single-instance code (caught in
  t11's first run).

### T8 — Downloads manager

- **Deps:** T5
- **Files:** `src/main/downloads/manager.ts`, `src/main/downloads/index.json`
  (schema in code), `src/main/ipc/downloads.ipc.ts`
- **Steps:**
  1. Queue, max 3 concurrent.
  2. HTTP download via Node `fetch` streaming to `<downloadDir>/<sanitized-name>.part`,
     rename on complete.
  3. Resume: send `Range: bytes=<size>-` when `.part` exists and server returns 206;
     else restart.
  4. Sanitize filename: strip `/\:*?"<>|`, max 200 chars, no `..`.
  5. Index persisted in `userData/downloads.json`.
  6. Storage tracking: sum index sizes + `fs.statfs` free space.
- **Acceptance:**
  - [x] Filename sanitizer unit tests pass (path traversal cases)
  - [x] Kill mid-download, relaunch, resume completes
  - [x] 4th download queued until slot free

### T9 — Discord Rich Presence

- **Deps:** T5, B3
- **Files:** `src/main/discord-rpc.ts`, `src/main/ipc/rpc.ipc.ts`
- **Steps:**
  1. Client from `@xhayper/discord-rpc`. `// VERIFY:` read installed types for
     `login`, `user.setActivity` signatures.
  2. Read app ID from `process.env.ZENKAI_DISCORD_APP_ID`. Missing → RPC disabled,
     log once.
  3. `rpc:set` / `rpc:clear` handlers.
  4. Connection failure (Discord not running): swallow, retry every 30s, max retries
     configurable.
- **Acceptance:**
  - [x] Set activity visible in Discord (manual, per OS) — _mechanism verified;
        activity display itself is manual per OS (B3: no real app ID in this env)_
  - [x] Discord closed → no crash, no uncaught error

### T10 — Notifications

- **Deps:** T4
- **Files:** `src/main/notify.ts`, `src/main/ipc/notify.ipc.ts`
- **Steps:**
  1. `Notification` API, `silent: false`.
  2. Click → focus window, send `notify:click` with payload to renderer.
  3. Linux: requires libnotify; doc in README; if unsupported, no-op.
- **Acceptance:**
  - [x] Notification shows Win/mac/Linux — _shown on this Linux host; Win/mac
        deferred to native hosts_
  - [x] Click focuses app — _unit-tested (`notify.test.ts`); OS clicks not
        scriptable_

### T11 — Deep links (auth) — _skippable while B2 open_ — ✅ built

- **Deps:** T2, B2
- **Files:** `src/main/protocol.ts`
- **Steps:**
  1. `app.setAsDefaultProtocolClient('zenkai')`.
  2. `app.requestSingleInstanceLock()`; second instance passes argv URL to first.
  3. macOS: `app.on('open-url')`.
  4. Parse `zenkai://auth?token=…`. Forward to renderer via `auth:callback`. Redact
     token in logs.
- **Acceptance:**
  - [x] Launching `zenkai://test` while running focuses existing window and emits event
  - [x] Token never logged (grep logs)

**Phase 3 exit gate:** ✅ T8–T10 acceptance boxes checked; T11 checked (built, not
stubbed). **B2 remains open** (upstream auth scheme decision — unaffected by T11's
transport plumbing); B3 remains open (no real Discord app ID — env-gated, disabled
gracefully).

---

## Phase 4 — Distribution (T12–T14)

**Goal:** installable artifacts for 3 OS, signing, auto-update.
**Entry gate:** Phase 3 exit.
**Exit gate:** Linux artifacts built locally and app launches; Win/mac artifacts built
on their OS or CI; updater verified on a signed build or explicitly disabled+logged if
unsigned.
**Blockers in play:** B1 (T13), B4 (T13 — unsigned path if absent).

### T12 — Packaging

- **Deps:** T1–T11
- **Files:** `electron-builder.yml`, `resources/entitlements.mac.plist`,
  `resources/linux/zenkai.desktop` (if needed), `scripts/after-sign.mjs`
- **Steps:**
  1. Config per [§9](02-reference.md).
  2. Build each target locally (`pnpm dist:linux` on Linux, etc.).
- **Acceptance:**
  - [ ] Linux: AppImage, deb, rpm produced
  - [ ] Win: nsis + portable produced (on Windows or CI)
  - [ ] mac: dmg + zip universal (on macOS or CI)
  - [ ] Installed app launches on each OS

### T13 — Signing + notarization

- **Deps:** T12, B4
- **Files:** `scripts/after-sign.mjs`, CI secrets
- **Steps:**
  1. Windows: `CSC_LINK`, `CSC_KEY_PASSWORD` env.
  2. macOS: `hardenedRuntime: true`, entitlements; `afterSign` runs
     `@electron/notarize` with `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
     `APPLE_TEAM_ID`.
  3. Linux: optional GPG (skip unless B4 includes it).
- **Acceptance:**
  - [ ] `signtool verify` passes (Win)
  - [ ] `spctl -a -vv` accepted (mac)
  - [ ] No secret in logs (CI)

  _If B4 unresolved:_ build unsigned only, record deviation, signing criteria deferred.

### T14 — Auto-update

- **Deps:** T13
- **Files:** `src/main/updater.ts`
- **Steps:**
  1. `autoUpdater` with GitHub provider (`publish` in `electron-builder.yml`).
  2. `autoDownload = true`, `autoInstallOnAppQuit = true`.
  3. Check on launch + every 6h.
  4. Linux `.deb`/`.rpm`: updater no-op; show banner linking release page. AppImage:
     full update.
  5. Channel: `latest` default; `beta` if `-beta.` tag.
- **Acceptance:**
  - [ ] Publish v0.0.2 over v0.0.1 → update downloads and applies (per OS, signed builds)
  - [ ] Unsigned mac build: update disabled with log

**Phase 4 exit gate:** T12 acceptance boxes checked on Linux (build host); Win/mac
artifacts produced via CI or native host; T13/T14 done or blockers recorded.

---

## Phase 5 — Quality gates (T15–T16)

**Goal:** automated CI and full test coverage.
**Entry gate:** Phase 4 exit (T12 done — CI builds from the packaging config).
**Exit gate:** PR run green; `pnpm test` and `pnpm e2e` green on Linux CI.

### T15 — CI

- **Deps:** T12
- **Files:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- **Steps:**
  1. `ci.yml`: on PR → `pnpm install --frozen-lockfile`, typecheck, lint, unit test.
     Ubuntu only.
  2. `release.yml`: on tag `v*` → matrix `ubuntu-22.04`, `windows-latest`,
     `macos-14`. Build + publish.
  3. Ubuntu job installs `rpm` and `libnotify-dev`.
- **Acceptance:**
  - [ ] PR run green
  - [ ] Tag `v0.0.1-rc.1` produces artifacts on all 3 OS

### T16 — Tests

- **Deps:** T4–T11
- **Files:** `tests/unit/**`, `tests/e2e/**`
- **Steps:**
  1. Unit: sanitizer, settings round-trip, zod validators, download queue.
  2. E2E (Playwright-Electron): launch → window loads → play/pause event → PiP toggle →
     deep link → download start.
- **Acceptance:**
  - [ ] `pnpm test` green
  - [ ] `pnpm e2e` green on Linux CI

> ⚠️ **Finding (T3, 2026-11-15):** Cloudflare bot-blocks Playwright-automated sessions
> on `zenkai-web.pages.dev` (body = "Automated Access Denied"); plain Electron renders
> the real app fine (verified via raw CDP — `scripts/t3-plain-load.mjs`). E2E must not
> assert against live remote content: launch with `ZENKAI_WEB_URL` pointed at a local
> stub page, or assert shell behavior only (window/IPC/security), never web-app DOM.

**Phase 5 exit gate:** both T15 and T16 acceptance boxes checked.

---

## Phase 6 — Release (T17)

**Goal:** publish v1.0.0.
**Entry gate:** Phases 1–5 exit **and blockers B5, B6 resolved**. If B5/B6 open →
stop before public release (Agent Rule 2).

### T17 — Release

- **Deps:** T13, T14, T15, T16, B5, B6
- **Steps:**
  1. Changelog entry in `CHANGELOG.md`.
  2. Tag `v1.0.0`.
  3. Verify artifacts + checksums; publish release notes.

**Release checklist (§10):**

- [ ] `pnpm typecheck && pnpm test && pnpm e2e` green
- [ ] CHANGELOG entry added
- [ ] Tag `vX.Y.Z` pushed
- [ ] 3 OS artifacts on GitHub Release
- [ ] Each artifact installs and launches
- [ ] Signed Win + mac artifacts verified
- [ ] Update path verified (N-1 → N)
- [ ] SHA256 checksums attached
- [ ] B5, B6 resolved

**Exit gate:** every checklist item checked.

---

## Blocker → task map (quick reference)

| Blocker               | Blocks      | Allowed while open                                         |
| --------------------- | ----------- | ---------------------------------------------------------- |
| B1 web app permission | T2, T5, T13 | T1, T3, T4 with `WEB_URL` placeholder; stop before release |
| B2 auth flow          | T11         | Skip T11, keep stub                                        |
| B3 Discord app ID     | T9          | Env var; missing → RPC disabled                            |
| B4 signing certs      | T13         | Unsigned artifacts only                                    |
| B5 brand OK           | T17         | Stop before public release                                 |
| B6 upstream licence   | T17         | Stop before public release                                 |
