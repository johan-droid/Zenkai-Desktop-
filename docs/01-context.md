# 01 — Context: Rules, Facts, Decisions, Blockers, Risks

## 1. Agent rules (read before any task)

1. Do tasks in order of the phase plan ([03-execution-phases.md](03-execution-phases.md)). Do not skip ahead.
2. Stop and ask if a task hits a blocker in §4 (Blockers) below. Do not guess owner-dependent values.
3. Never set: `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false`,
   `webSecurity: false`, `webviewTag: true`.
4. Never expose `ipcRenderer`, `fs`, `shell`, or raw Node APIs to the renderer.
   Only through the typed `contextBridge` API ([02-reference.md](02-reference.md) §7).
5. Never load remote code not in the allowlist ([02-reference.md](02-reference.md) §6.4).
6. Never commit secrets. Signing certs, Apple creds, Discord tokens → CI secrets only.
7. Never invent an API. Before using a library call, read the installed `.d.ts` in
   `node_modules`. Mark any unverified call with `// VERIFY:`.
8. Pin exact versions in `package.json` (no `^`/`~` for `electron`, `electron-builder`,
   `electron-updater`).
9. A task is done only when: typecheck passes, tests pass, acceptance criteria in task
   are met. Report which criteria passed.
10. One PR per task. Branch name: `task/T<n>-<slug>`.
11. Keep the desktop shell free of upstream web code unless blocker B1 resolves to "bundle".

## 2. Facts

| ID | Fact | Tag |
|---|---|---|
| F1 | Upstream repo `Nyyrox/Zenkai` describes itself as Android APK streaming app | [V] |
| F2 | Repo public, 70 stars, 1 fork (43/0 at spec fetch time) | [V] |
| F3 | Repo root visible files: `assets/`, `CHANGELOG.md`, `README.md`. 28 commits | [V] |
| F4 | Latest release: v1.6.6 (as of 2026-11-15; spec saw v1.6.0). README still headlines v1.5.3 | [V] |
| F5 | Features upstream: anime (multi-server, PiP, downloads, caption translation), manga (chapter download, reader modes), novels, watchlist, login, Discord RPC, notifications, auto-pause on close/PiP | [V] |
| F6 | Upstream uses ExoPlayer (Media3) on Android | [U] (inferred from v1.0.0 notes "ExoPlayer") |
| F7 | Web app exists at `https://zenkai-web.pages.dev/` | [V] |
| F8 | Web app source code is not visible in upstream repo listing | [V] |
| F9 | Licence: none found — GitHub API `/license` 404, no LICENSE file (checked 2026-11-15). Do not assume MIT | [V] |
| F10 | Releases scanned on VirusTotal (link in README) | [V] |
| F11 | Upstream disclaimer: hosts zero content, no affiliation with providers | [V] |

## 3. Decisions (locked unless a blocker changes them)

| ID | Decision | Reason |
|---|---|---|
| D1 | Wrap web app; no native port in v1 | Native port = full rewrite |
| D2 | Shell = Electron | Same Chromium on all 3 OS → consistent HLS/MSE/PiP. Tauri/WebKitGTK codec risk on Linux |
| D3 | Package manager = pnpm | Speed, strict deps |
| D4 | Build tool = electron-vite | Standard Electron HMR + bundling |
| D5 | Packager = electron-builder | Mature 3-OS targets + publish |
| D6 | Updater = electron-updater on GitHub Releases | Native fit |
| D7 | Settings = own JSON file in `app.getPath('userData')` | Avoids ESM-only `electron-store` friction |
| D8 | Validation = zod in main process IPC handlers | Untrusted renderer input |
| D9 | Tests: Vitest (unit), Playwright-for-Electron (e2e) | Standard |
| D10 | Language: TypeScript strict mode | Typed IPC contract |
| D11 | Repo name: `zenkai-desktop` | — |
| D12 | App ID: `app.zenkai.desktop` | Reverse-DNS, change only before first public release |

## 4. Target support matrix

| OS | Min version | Arch | Artifacts |
|---|---|---|---|
| Windows | 10 22H2 | x64, arm64 | NSIS installer, portable .exe |
| macOS | 12 Monterey | universal (Intel + Apple Silicon) | .dmg, .zip |
| Linux | Ubuntu 22.04 / Debian 12 / Fedora 39 | x64, arm64 | AppImage, .deb, .rpm |

Flatpak: out of scope for v1 (T18, optional → [04-post-v1.md](04-post-v1.md)).

## 5. Blockers (agent must not resolve by guessing)

| ID | Blocker | Needed for | Stop behavior | Status (Phase 0) |
|---|---|---|---|---|
| B1 | Web app owner permission to wrap; source or stable URL | T2, T5, T13 | Build T1, T3, T4 with `WEB_URL` placeholder; stop before release | ✅ **Resolved (2026-11-15)** — user confirms ownership; wrap target pinned to `https://zenkai-web.pages.dev/` (= §6.1 default). Note: upstream README links `zenkaii.pages.dev` (different site, injects third-party `al5sm.com` script) — not the wrap target, do not load it |
| B2 | Auth redirect scheme and token flow | T11 | Skip T11; keep stub | ⏳ Open |
| B3 | Discord Application ID | T9 | Use env `ZENKAI_DISCORD_APP_ID`; if missing, RPC disabled | ⏳ Open |
| B4 | Code-signing certs: Windows (OV/EV), Apple Developer ID | T13 | Build unsigned artifacts only | ⏳ **No certs — unsigned path chosen (2026-11-15)**. T13: signing criteria deferred; T14: mac update disabled + logged |
| B5 | Brand/licence OK to use name "Zenkai" | T17 release | Stop before public release | ✅ **Resolved (2026-11-15)** — user confirms cleared |
| B6 | Upstream licence (F9) | T17 release | Stop before public release | ❌ **Confirmed open (2026-11-15)** — GitHub API `/license` returns 404, no LICENSE file in `Nyyrox/Zenkai` |

## 6. Risks

| Risk | Mitigation | Owner task |
|---|---|---|
| Upstream streams via third-party providers | Keep zero-hosting stance; include disclaimer in app About | B1, B5 |
| Copyright / DMCA takedown | Origin allowlist; takedown contact in README | B5 |
| Linux codec gaps | Electron chosen | D2 |
| Unsigned installers blocked | Budget certs | B4 |
| Discord API change | RPC behind flag; silent fail | T9 |
| Web app breaking change | Pin `WEB_URL` per release; e2e smoke | T16 |
| Token leak via logs | Redact `token=` in logger | T11 |

## 7. Changes from v1 of the spec

- Removed unverified "MIT" claim (F9 now unverified).
- Removed nonexistent `electron-audit` tool.
- Replaced `electron-store` with own JSON settings (D7) — avoids ESM friction.
- Added task graph with acceptance criteria and blockers.
- Added exact config blocks and IPC contract code.
- Added agent rules (§1 above).
