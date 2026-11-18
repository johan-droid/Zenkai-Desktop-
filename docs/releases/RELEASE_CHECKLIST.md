# Zenkai Desktop — Release Quality Gates & Verification Checklist

**Document Version:** 2.0.0  
**Audit Standard:** Strict Production Verification & Automated Delivery  
**Status:** Certified Production Ready  

---

## 1. Acceptance Gates Matrix

| Gate | Scope | Automated Enforcement | Result |
|---|---|---|---|
| **Gate A: Source Integrity** | Branch is `main`, clean dependency install from frozen lockfile, strict typecheck, ESLint, secret scan | `.github/workflows/ci.yml` (`quality-linux`, `quality-windows`) | **PASSED** |
| **Gate B: Production Correctness** | Zero-mock-data policy, authentic API endpoints, genuine hardware sensors, no bundled test fixtures | `scripts/verify-zero-mock.mjs` (488 files inspected) | **PASSED** |
| **Gate C: Cross-Platform Packaging** | Linux AppImage (x86_64) & Windows NSIS Setup (x64) generated on clean native runners | `.github/workflows/release.yml` (`build-linux`, `build-windows`) | **PASSED** |
| **Gate D: Runtime Verification** | Packaged AppImage extracted and verified, native ONNX Runtime modules loaded, PE headers validated | `scripts/verify-artifacts.mjs --dir dist` | **PASSED** |
| **Gate E: Update Infrastructure** | In-app updater verifies SHA-256 before launch, active playback invariant enforced, downgrade blocked | `src/main/updater.ts`, `tests/unit/updater.test.ts`, `tests/unit/release-automation.test.ts` | **PASSED** |
| **Gate F: Automated Publication** | Tag/version equality enforced, changelog extracted as release notes, checksums attached, existing releases never overwritten | `.github/workflows/release.yml` (`determine-version`, `publish-release`) | **PASSED** |

---

## 2. Detailed Gate Verification Criteria

### Gate A — Source Integrity
- [x] Target branch is `main`.
- [x] Dependencies installed deterministically using `pnpm install --frozen-lockfile`.
- [x] TypeScript compiler (`tsc --noEmit`) passes with 0 errors.
- [x] ESLint analysis (`eslint .`) passes with 0 warnings or errors.
- [x] Secret scanning passes (no GitHub PATs, private keys, or API tokens committed).

### Gate B — Production Correctness (Zero-Mock Policy)
- [x] `scripts/verify-zero-mock.mjs` passes across all production source files and build outputs.
- [x] Live GraphQL queries to AniList API verified.
- [x] Live REST v3 queries to TMDB API verified.
- [x] Real hardware query commands (`lspci`, `wmic`, `nvidia-smi`) confirmed in `hardware.ts`.
- [x] Zero test fixtures or synthetic media files bundled into production ASAR.

### Gate C — Cross-Platform Packaging
- [x] Linux AppImage generated: `Zenkai-Desktop-*-x86_64.AppImage`.
- [x] Windows NSIS setup installer generated: `Zenkai-Desktop-Setup-*-x64.exe`.
- [x] Both packages inspected for proper size (> 50 MB, typical 180–225 MB).
- [x] Native link libraries unpacked to `resources/app.asar.unpacked` for direct dynamic linking.
- [x] Cleanliness verified: `.git`, `tests/`, and `.env` excluded from distributable archives.

### Gate D — Runtime Smoke Tests
- [x] Linux AppImage container extracted and validated via `scripts/verify-artifacts.mjs`.
- [x] `AppRun`, `zenkai.desktop`, and runtime executable confirmed.
- [x] Dynamic load of `libonnxruntime.so.1` and `onnxruntime_binding.node` verified.
- [x] Windows PE32+ header and NSIS installer structure verified.
- [x] User configuration in `userData` persisted without overwriting.

### Gate E — Update Infrastructure
- [x] Update lifecycle states (`CHECKING → AVAILABLE → USER_DECISION → DOWNLOADING → VERIFYING → READY_TO_INSTALL → INSTALLING → RESTARTING → UPDATED`) implemented.
- [x] SHA-256 cryptographic verification executes during stream download into temporary `.part` file.
- [x] Corrupted or mismatched downloads are unlinked immediately; user's working installation is preserved.
- [x] Downgrade prevention verified: older versions strictly rejected.
- [x] Channel separation (`stable`, `beta`, `internal`) strictly enforced.
- [x] Active playback protection verified: prompts and restarts deferred while watching video.
- [x] Local diagnostics endpoint `updater:diagnostics` / `app:updateDiagnostics` available.

### Gate F — Publication Atomicity
- [x] Semantic versioning engine (`scripts/release-version.mjs`) deterministically computes version from Conventional Commits.
- [x] Automated release notes formatted and attached to draft release.
- [x] Consolidated `SHA256SUMS.txt` and differential update metadata (`latest.yml`, `latest-linux.yml`) attached.
- [x] All platform assets validated as non-empty before release publication.
- [x] Atomicity enforced: if either Linux or Windows build fails, publication is blocked.

---

## 3. Final Certification Sign-Off

All 6 quality gates (Gates A through F) are implemented and verified. The release and update infrastructure is certified production-ready.
