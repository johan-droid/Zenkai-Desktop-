# Zenkai Desktop — Desktop Auto-Update Architecture

**Document Version:** 2.0.0  
**Target Release:** Zenkai Desktop Production Lifecycle  
**Author:** Zenkai Engineering Release Team  
**Status:** Canonical Update Architecture Reference  

---

## 1. Architectural Principles

The Zenkai Desktop auto-update subsystem is engineered to guarantee:
1. **User Autonomy (Notify-First Delivery):** The client never silently downloads megabytes of binaries in the background without user consent (`autoDownload = false`), and never forces a restart while the user is actively working or watching video.
2. **Dual-Track Distribution:**
   - **Track A (Over-The-Air Renderer):** Rapid delivery of HTML/CSS/JS UI improvements via verified manifest with 5-second canary rollback safety.
   - **Track B (Native Electron Runtime):** Full desktop application upgrades (Electron runtime, Node.js, native ONNX Runtime binaries, and system integrations) distributed through GitHub Releases.
3. **Active Playback Protection:** Intrusive notification modals, background bandwidth consumption, and application restarts are strictly deferred while media playback is active (`isPlaybackActive() === true`).
4. **Cryptographic Integrity:** Downloaded binaries are verified via SHA-256 before permissions are applied or execution is triggered.

---

## 2. Update Finite State Machine (Lifecycle)

The client updater transitions through 9 deterministic states:

```
┌──────────────┐
│   CHECKING   │  Checks GitHub Releases API or electron-updater metadata
└──────┬───────┘
       │
┌──────▼───────┐
│  AVAILABLE   │  New version detected, compatible with channel, newer than current
└──────┬───────┘
       │
┌──────▼───────┐
│ USER_DECISION│  User reviews changelog in Settings or toast; chooses 'Update' or 'Later'
└──────┬───────┘
       │
┌──────▼───────┐
│ DOWNLOADING  │  Streams binary to Downloads/ or temp folder with progress events (0-100%)
└──────┬───────┘
       │
┌──────▼───────┐
│  VERIFYING   │  Computes SHA-256 checksum of downloaded stream and matches published digest
└──────┬───────┘
       │
┌──────▼───────┐
│READY_TO_INSTALL User prompted: package verified and staged; ready for restart
└──────┬───────┘
       │
┌──────▼───────┐
│  INSTALLING  │  Prepares launch arguments; ensures media playback is idle
└──────┬───────┘
       │
┌──────▼───────┐
│  RESTARTING  │  Quits running instance and launches new AppImage / NSIS setup
└──────┬───────┘
       │
┌──────▼───────┐
│   UPDATED    │  New application version initializes successfully
└──────────────┘
```

---

## 3. Release Channel Model

Zenkai Desktop provides three strictly isolated release channels configured in **Desktop Settings → Application Updates**:

| Channel | Intended Audience | Pre-release Eligibility | Version Tag Pattern |
|---|---|---|---|
| **`stable`** (Default) | All general users | Rejects pre-releases and tags containing `-beta`, `-alpha`, `-rc`, `-internal` | `v0.0.1`, `v0.1.0`, `v1.0.0` |
| **`beta`** | Opt-in community testers | Accepts both stable releases and pre-releases | `v0.1.0-beta.1`, `v1.0.0-rc.2` |
| **`internal`** | Core developers & QA | Accepts all release builds and automated nightly tags | `v0.1.0-internal.20261116` |

Channel preference is stored in `userData/settings.json` under `channel: "stable" | "beta" | "internal"`.

---

## 4. Cross-Platform Update Implementations

### 4.1 Linux AppImage Updates
- **In-Place Update (`electron-updater`):**
  - When running from a mounted AppImage container (`process.env.APPIMAGE`), `autoUpdater.checkForUpdates()` compares `latest-linux.yml`.
  - Downloads differential blockmaps or in-place replacement.
- **Direct GitHub Binary Fallback:**
  - If `autoUpdater` fails or application runs outside standard AppImage mounts, `checkForUpdatesClient()` queries GitHub Releases API directly.
  - Downloads `Zenkai-Desktop-<version>-x86_64.AppImage` into `~/Downloads/`.
  - Streams chunks through a `crypto.createHash("sha256")` pipeline into a `.part` temporary file.
  - Compares the calculated digest against `SHA256SUMS.txt`.
  - Sets executable permissions (`chmod 0o755`).
  - Launches the updated AppImage and terminates the old instance cleanly.
  - **Failure Preservation:** If download fails or checksum mismatches, the `.part` file is deleted immediately, leaving the user's running AppImage completely untouched.

### 4.2 Windows NSIS Updates
- **Differential Blockmap Updating (`.blockmap`):**
  - `electron-updater` reads `latest.yml` and downloads only modified 64KB blocks, reducing bandwidth by 80–90%.
- **Direct Setup Installer Fallback:**
  - Downloads `Zenkai-Desktop-Setup-<version>-x64.exe` to `Downloads/`.
  - Verifies SHA-256 integrity and PE header.
  - Prompts user to restart.
  - Executes the installer using `shell.openPath()`.
  - Preserves user settings, offline downloads, and preferences in `%APPDATA%\Zenkai`.

---

## 5. Active Playback Invariant Protection

Streaming media playback is sacred in Zenkai Desktop:
1. **Detection:** Preload script hooks HTML5 video events (`play`, `pause`, `ended`) and synchronizes with main process playback state (`src/main/playback.ts`).
2. **Suppression:** When `isPlaybackActive() === true`:
   - Recurring 6-hour background update checks are skipped.
   - Update available desktop notifications are suppressed.
   - Background network downloads are paused or deferred.
   - `applyUpdateAndRestart()` throws an error to prevent accidental video interruption.
