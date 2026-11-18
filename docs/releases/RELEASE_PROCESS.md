# Zenkai Desktop — Production Release Process

**Document Version:** 3.0.0  
**Target Release:** Zenkai Desktop Production Lifecycle  
**Author:** Zenkai Release Engineering Team  
**Status:** Canonical Release Process Reference  

---

## 1. Release Philosophy

Zenkai Desktop has **one authoritative version** and **one automated release path**:

> **"The tag is the release. The pipeline verifies it."**

1. `package.json.version` is the only version source. electron-builder embeds it, and `app.getVersion()` reads it back.
2. Merges to `main` run `CI` and `QA — Main Branch Integration`. Nothing is published from them.
3. An approved `v*` tag starts `.github/workflows/release.yml`:
   - `determine-version` refuses to build unless the tag equals `v<package.json.version>` and is newer than every existing tag.
   - `build-linux` (ubuntu-22.04) builds AppImage, deb, rpm and `latest-linux.yml`.
   - `build-windows` (windows-latest) builds the NSIS setup, portable zip and `latest.yml`.
   - `verify-artifacts` consolidates `SHA256SUMS.txt` and runs `scripts/verify-artifacts.mjs`.
   - `publish-release` refuses to overwrite an existing release and attaches every verified artifact.
4. `workflow_dispatch` runs the same pipeline for one tag; `publish: false` builds and verifies without publishing.

```bash
# Prepare, verify, then release (tag push requires approval)
pnpm typecheck && pnpm lint && pnpm test && pnpm release:check
pnpm build
git tag v<version> && git push origin v<version>
```

The desktop app reads updates straight from these GitHub Releases (`latest-linux.yml` / `latest.yml` for the electron-updater feed and the Releases API for the version and checksum check).

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

### Versioning Engine (`scripts/release-version.mjs`)
The released version is **chosen and committed** before tagging — the workflow never rewrites it.
`pnpm release:version` reports the semver bump implied by the commits since the last tag and previews
the release notes, so the maintainer can edit `package.json` and `CHANGELOG.md` deliberately:

1. Discovers the highest existing Git tag.
2. Extracts commits in `<latest-tag>..HEAD` and evaluates conventional commit types.
3. Reports the required bump (`major` > `minor` > `patch`) and formats notes grouped into Features, Fixes, and Performance.
4. Writes nothing unless invoked with `--apply` (the automated pipeline never does).
5. The release workflow then enforces `tag == v<package.json.version>`, so the artifact version, the tag and the release can never drift.

---

## 3. GitHub Actions CI/CD Architecture

The release automation is a single least-privilege workflow:

```
.github/workflows/
├── ci.yml                 # PRs and pushes to main (typecheck, lint, tests, zero-mock gate)
├── qa-main.yml            # Post-merge integration gate (Linux release gate + Win/macOS builds)
├── qa-pr.yml              # Pull-request gate
├── qa-nightly.yml         # Scheduled deep regression
├── qa-release.yml         # Manual release QA
└── release.yml            # Tag-driven build, verify and publish pipeline
```

### 3.1 Pipeline Sequence

1. **Job 1: `determine-version` (Ubuntu 22.04)**
   - Resolves the tag from `github.ref_name` (or the `tag` input on manual runs).
   - Fails unless the tag equals `v<package.json.version>` and is newer than every existing tag.

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
