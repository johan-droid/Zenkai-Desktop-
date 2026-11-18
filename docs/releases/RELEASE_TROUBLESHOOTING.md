# Zenkai Desktop — Release & Update Troubleshooting Runbook

**Document Version:** 1.0.0  
**Target Release:** Zenkai Desktop Production Lifecycle  
**Author:** Zenkai Engineering Release Team  
**Status:** Canonical Troubleshooting Runbook  

---

## 1. Troubleshooting CI/CD Pipeline Failures

### 1.1 "Tag does not match package.json version"
- **Symptom:** `determine-version` fails immediately, before any packaging job runs.
- **Cause:** The pushed tag and `package.json.version` disagree (or the tag is not newer than the highest existing tag).
- **Resolution:** Bump `package.json` and `CHANGELOG.md` in the same commit, push to `main`, delete the wrong tag, and re-tag the corrected commit. Never move a published tag.

### 1.2 "Release … already exists — leaving it untouched"
- **Symptom:** The publish job logs the guard message and skips.
- **Cause:** A release for that tag is already published; the pipeline is idempotent by design.
- **Resolution:** Nothing to do. For a follow-up fix, publish a new patch version instead of rewriting the existing release.

### 1.2 "Gate B FAILED: Zero-Mock-Data policy violation detected"
- **Symptom:** CI job `quality-linux` or packaging job fails on `node scripts/verify-zero-mock.mjs`.
- **Cause:** Production source files (`src/`) contain forbidden imports (`mock`, `sinon`, `faker`, `msw`) or fake stream URLs/dummy credentials.
- **Resolution:**
  1. Inspect the terminal log to identify the offending file and line.
  2. If the mock is for testing, move it into `tests/`.
  3. Ensure hardware sensors query genuine OS devices (`src/main/vision/hardware.ts`).
  4. Re-run `node scripts/verify-zero-mock.mjs` locally before pushing.

### 1.3 "Artifact Verification Failed: Suspicously small or header mismatch"
- **Symptom:** Job `verify-artifacts` fails on `node scripts/verify-artifacts.mjs --dir dist`.
- **Cause:** Packaging process produced an incomplete or truncated file, or ELF / PE header is invalid.
- **Resolution:**
  1. Check builder job logs (`build-linux` or `build-windows`) for electron-builder errors.
  2. Verify that native ONNX Runtime binaries were properly extracted to `resources/app.asar.unpacked`.
  3. Test extraction locally using `./release/Zenkai-Desktop-*-x86_64.AppImage --appimage-extract`.

### 1.4 "SHA-256 Checksum Mismatch"
- **Symptom:** `SHA256SUMS.txt` does not match the actual hash of a published binary.
- **Cause:** An artifact was modified or regenerated after `checksums-*.txt` was created.
- **Resolution:** The `release.yml` pipeline strictly regenerates `dist/SHA256SUMS.txt` in the `verify-artifacts` job from the actual files downloaded from CI. Rerun the workflow to ensure deterministic compilation.

---

## 2. Troubleshooting Client In-App Updates

### 2.1 "Update notification not appearing"
- **Check 1: Media Playback Active:** If the user is watching an anime episode or video stream, all update popups are suppressed by design. Once playback pauses or ends, the notification will appear.
- **Check 2: Channel Preference:** If the user is on the `stable` channel and a pre-release (`-beta`) was published, the client will ignore it. Check **Desktop Settings → Application Updates**.
- **Check 3: Downgrade Prevention:** If the candidate version on GitHub is equal to or lower than the current application version, the updater reports "Application is up to date".

### 2.2 "GitHub check returned status 429"
- **Symptom:** Update check reports a GitHub status instead of "up to date".
- **Cause:** Unauthenticated Releases API rate limit.
- **Resolution:** The client already retries via `/releases/latest`; a 429 means both endpoints were limited. Wait a few minutes and check again. The check never reports "up to date" when the API could not be reached.

### 2.3 "Cryptographic SHA-256 integrity check failed. Update aborted."
- **Symptom:** The user clicks download, download reaches 100%, but fails during the verifying state.
- **Cause:** Network corruption during transit or an incomplete file on GitHub Releases CDN.
- **Resolution:**
  1. The client has safely deleted the `.part` file; the running application is completely unharmed.
  2. The user can retry the download from **Desktop Settings**.
  3. Inspect local diagnostics via DevTools or inspect `userData/update-diagnostics.json`.

---

## 3. Emergency Release Rollback Runbook

If a critical regression is discovered in a published release:

### Step 1: Immediate Update Suppression
1. If using the update-control microservice (`services/update-control/`):
   ```bash
   # Withdraw release from eligibility
   curl -X POST https://<update-service-domain>/admin/withdraw \
     -H "Authorization: Bearer $ADMIN_SECRET" \
     -d '{"version": "0.1.0"}'
   ```
2. On GitHub Releases:
   - Navigate to `https://github.com/johan-droid/Zenkai-Desktop-/releases/tag/v0.1.0`.
   - Edit release → check **This is a pre-release** (immediately stops stable clients from pulling it) or delete the release tag.

### Step 2: Publish Corrected Hotfix
1. Create a hotfix branch from `main`:
   ```bash
   git checkout -b fix/emergency-hotfix main
   ```
2. Commit the fix with a conventional commit:
   ```bash
   git commit -m "fix(critical): resolve regression in video compositor"
   ```
3. Open and merge PR to `main`.
4. The automated release pipeline will analyze the commit, bump the patch version (e.g. `v0.1.1`), verify all gates, and publish the hotfix automatically.
