# Zenkai Desktop — Documentation

Agent-ready build spec documentation for wrapping the Zenkai web app in a secure,
cross-platform Electron shell.

| | |
|---|---|
| **Targets** | Linux · Windows · macOS |
| **Upstream** | https://github.com/Nyyrox/Zenkai (Android app) |
| **Web app (wrap target)** | https://zenkai-web.pages.dev/ (source not in repo) |
| **Repo name** | `zenkai-desktop` [D] |
| **App ID** | `app.zenkai.desktop` [D] |

## Document map

| Doc | Contents |
|---|---|
| [01-context.md](01-context.md) | Agent rules, verified facts, locked decisions, OS support matrix, blockers, risks |
| [02-reference.md](02-reference.md) | Exact config blocks: shared config, `webPreferences`, CSP, allowlist, IPC contract, feature-parity tables, packaging config, commands |
| [03-execution-phases.md](03-execution-phases.md) | Phase-wise execution plan: Phases 0–6 with tasks T1–T17, inputs, files, steps, acceptance criteria, phase exit gates |
| [04-post-v1.md](04-post-v1.md) | T18 Flatpak (optional, post-v1) |

## How to execute

1. Read [01-context.md](01-context.md) — especially **Agent Rules** and **Blockers**.
2. Work phases in order in [03-execution-phases.md](03-execution-phases.md).
   Tasks within a phase run in numeric order (T1 → T17). Do not skip ahead.
3. Pull exact config/code blocks from [02-reference.md](02-reference.md) — never retype from memory.
4. A task is done only when **typecheck passes, tests pass, and every acceptance
   criterion in the task is met**. Report which criteria passed.
5. On a §4 blocker: stop, do not guess owner-dependent values.

## Status tags

| Tag | Meaning |
|---|---|
| `[V]` | Verified from sources |
| `[U]` | Unverified — check before use |
| `[D]` | Decision, locked unless a blocker changes it |

## Phase overview

| Phase | Tasks | Outcome |
|---|---|---|
| 0 — Pre-flight | (no code) | Blockers tracked, upstream licence checked |
| 1 — Foundation | T1–T4 | Secure Electron shell + typed IPC bridge |
| 2 — Core behavior | T5–T7 | Settings, auto-pause, menu/tray/shortcuts |
| 3 — Feature parity | T8–T11 | Downloads, Discord RPC, notifications, deep links |
| 4 — Distribution | T12–T14 | Packaged installers, signing, auto-update |
| 5 — Quality gates | T15–T16 | CI + unit/e2e suites green |
| 6 — Release | T17 | v1.0.0 published (blockers B5/B6 resolved) |
| 7 — Post-v1 | T18 | Flatpak (optional) |

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev                      # run
pnpm typecheck
pnpm test
pnpm e2e
pnpm build                    # electron-vite build → out/
pnpm dist:linux               # run on Linux
pnpm dist:win                 # run on Windows or CI
pnpm dist:mac                 # run on macOS or CI
```
