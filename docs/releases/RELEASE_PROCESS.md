# Zenkai Desktop — Fully Automated Production Release Process

**Document Version:** 2.0.0  
**Target Release:** Zenkai Desktop Production Lifecycle  
**Author:** Zenkai Release Engineering Team  
**Status:** Canonical Release Process Reference  

---

## 1. Automated Release Philosophy

Zenkai Desktop employs a **hands-free, fully automated continuous delivery system** built on strict quality gates:

> **"Automate delivery, never bypass quality gates."**

Releases are never assembled manually or published by clicking arbitrary web UI buttons without CI verification. Code merges to the protected `main` branch trigger automated commit analysis, semantic version calculation, cross-platform compilation, independent artifact verification, and GitHub Releases distribution.

---

## 2. Commit Conventions & Automated Versioning

Zenkai Desktop strictly enforces [Conventional Commits v1.0.0](https://www.conventionalcommits.org/):

| Commit Prefix | SemVer Release Impact | Example | Trigger Action |
|---|---|---|---|
| `fix:` / `fix(...):` | **Patch Release** (`X.Y.Z+1`) | `fix(updater): prevent duplicate notification toasts` | Releases new patch version |
| `perf:` / `perf(...):` | **Patch Release** (`X.Y.Z+1`) | `perf(vision): optimize tensor tiling allocation` | Releases new patch version |
| `feat:` / `feat(...):` | **Minor Release** (`X.Y+1.0`) | `feat(player): add dual audio track selector` | Releases new minor version |
| `BREAKING CHANGE:` or `type!:` | **Major Release** (`X+1.0.0`) | `feat(ipc)!: redesign vision hardware schema` | Releases new major version |
| `docs:`, `test:`, `chore:`, `style:`, `refactor:` | **No Release** (Internal) | `docs: update troubleshooting guide` | CI runs, no release triggered |

### Automated Versioning Engine (`scripts/release-version.mjs`)
When code lands on `main`:
1. Discovers the highest existing Git tag (e.g. `v0.0.2`).
2. Extracts all commits in the range `<latest-tag>..HEAD`.
3. Evaluates conventional commit types and detects highest required bump (`major` > `minor` > `patch`).
4. Calculates next semver and guarantees it is strictly greater than any existing Git tag or package version.
5. Formats structured release notes grouped into Features, Fixes, and Performance.
6. Synchronizes `package.json` with the authoritative version.

---

## 3. GitHub Actions CI/CD Architecture

The release automation is divided into modular, least-privilege workflows:

```
.github/workflows/
├── ci.yml                 # Runs on PRs and pushes to main (Quality & Zero-Mock Gates)
├── release.yml            # Main release orchestrator (Runs on main push or v* tag)
├── release-linux.yml      # Modular builder for Linux AppImage, deb, rpm
├── release-windows.yml    # Modular builder for Windows NSIS Setup & Portable Zip
└── release-verify.yml     # Independent artifact verification & smoke tests
```

### 3.1 Pipeline Sequence

1. **Job 1: `determine-version` (Ubuntu 22.04)**
   - Runs `node scripts/release-version.mjs --apply`.
   - If no release-worthy commits exist, exits cleanly (`should_release=false`).
   - If release-worthy, sets outputs: `version=X.Y.Z`, `tag=vX.Y.Z`, `should_release=true`.

2. **Job 2: `build-linux` (Ubuntu 22.04)**
   - Executes `node scripts/verify-zero-mock.mjs`.
   - Compiles application bundle (`pnpm build`).
   - Builds Linux AppImage, deb, and rpm packages (`pnpm exec electron-builder --linux`).
   - Generates `checksums-linux.txt` and `latest-linux.yml`.
   - Uploads artifact `linux-artifacts`.

3. **Job 3: `build-windows` (Windows Latest)**
   - Executes `node scripts/verify-zero-mock.mjs`.
   - Compiles application bundle (`pnpm build`).
   - Builds Windows NSIS setup installer and portable zip (`pnpm exec electron-builder --win`).
   - Generates `checksums-windows.txt`, `latest.yml`, and `.blockmap`.
   - Uploads artifact `windows-artifacts`.

4. **Job 4: `verify-artifacts` (Ubuntu 22.04)**
   - Downloads all platform artifacts.
   - Combines checksums into authoritative `dist/SHA256SUMS.txt`.
   - Runs `node scripts/verify-artifacts.mjs --dir dist`.
   - Validates ELF x86-64 binary headers, PE32+ signatures, AppImage filesystem extraction, unpacked native ONNX Runtime modules, package cleanliness, and cryptographic checksum consistency.
   - Uploads `verified-dist-bundle`.

5. **Job 5: `publish-release` (Ubuntu 22.04)**
   - Pre-publish validation: asserts both Linux AppImage and Windows NSIS executable exist and are non-empty.
   - Creates GitHub Release using `softprops/action-gh-release@v2`.
   - Attaches all distributables, metadata YAMLs, blockmaps, and `SHA256SUMS.txt`.
   - Marks release published automatically.

---

## 4. Protected Secrets & Signing Configuration

| Secret Name | Purpose | Scope | Required / Optional |
|---|---|---|---|
| `GITHUB_TOKEN` | Automatic GitHub Releases creation & asset upload | Automated repository workflow permission | Required |
| `CSC_LINK` | Base64-encoded Windows Authenticode PFX Certificate | Windows package signing (`signtool.exe`) | Optional (Unsigned mode active if unset) |
| `CSC_KEY_PASSWORD` | Password for Authenticode certificate | Windows package signing | Optional |

Workflows enforce least privilege:
- `ci.yml` has `permissions: { contents: read }`.
- Release secrets are never exposed to pull-request workflows.

---

## 5. Unbreakable Quality Gates

A release is published **only** if all gates pass:
- **Gate A (Source Integrity):** Clean pnpm install with frozen lockfile, TypeScript check, ESLint check, secret scan clean.
- **Gate B (Production Zero-Mock):** Verified by `scripts/verify-zero-mock.mjs`; zero mock APIs, fake credentials, or synthetic fixtures.
- **Gate C (Packaging Cleanliness):** Native build runners produce valid AppImage and NSIS packages; development files and test suites excluded.
- **Gate D (Runtime Verification):** Packaged AppImage extracted and verified; native ONNX binaries load; clean exit.
- **Gate E (Update Metadata):** `latest.yml`, `latest-linux.yml`, and `SHA256SUMS.txt` cryptographic digests match packages.
- **Gate F (Atomicity):** Both Linux and Windows packages must succeed; partial releases are prohibited.
