# Zenkai Desktop — Update Security & Cryptographic Integrity

**Document Version:** 1.0.0  
**Target Release:** Zenkai Desktop Production Lifecycle  
**Author:** Zenkai Security & Release Engineering Team  
**Status:** Canonical Security Reference  

---

## 1. Threat Model & Security Objectives

The Zenkai Desktop auto-update subsystem protects against:
- **Man-in-the-Middle (MITM) Attacks:** Tampering with update metadata or binaries in transit.
- **Unauthorized Code Injection:** Substituting malicious binaries for legitimate application packages.
- **Accidental Downgrade Attacks:** Reverting clients to older, vulnerable software versions.
- **Channel Pollution:** Internal development builds leaking into the stable user channel.
- **Local File Corruption:** Interrupted or partial downloads replacing working binaries.

---

## 2. Security Controls & Safeguards

### 2.1 Transport Layer Security (TLS 1.3 / HTTPS)
All communications—including GitHub Releases API checks, manifest downloads, and binary asset streaming—strictly require HTTPS with modern cipher suites. Plain HTTP endpoints are forbidden.

### 2.2 Strict Domain & URL Allowlisting
Update binary URLs must originate from authenticated release hosts:
- `https://github.com/johan-droid/Zenkai-Desktop-/releases/`
- `https://objects.githubusercontent.com/` (Official GitHub release CDN)

Arbitrary external download URLs received from third-party or unverified metadata are rejected immediately.

### 2.3 Strict Downgrade Prevention
The update engine evaluates candidate versions using semantic versioning:
$$\text{Candidate Version} > \text{Current Version}$$
If a candidate release has a version number $\le$ current installed version, `updateAvailable` returns `false`. Clients cannot be downgraded by malicious or stale CDN metadata.

### 2.4 Cryptographic SHA-256 Integrity Verification
When pulling binary assets from GitHub Releases:
1. The update engine fetches the authoritative `SHA256SUMS.txt` published with the release.
2. Assets are streamed into an isolated `.part` temporary file while calculating the SHA-256 digest on the fly via `crypto.createHash("sha256")`.
3. Before moving the file or presenting it to the user, the calculated digest is compared against the published hash.
4. If a single byte differs:
   - The `.part` file is unlinked immediately.
   - An error event is emitted to the user.
   - The diagnostic state records a verification failure.

### 2.5 Atomic Staging & Safe Installation
To prevent destroying an active installation:
- **Linux:** Updates are never written into `/tmp/.mount_*` (the read-only AppImage squashfs mount). Downloaded AppImages are staged in `~/Downloads/`, verified, made executable (`0o755`), and executed only upon explicit user consent.
- **Windows:** NSIS installers run out-of-process and verify target integrity before overwriting program files. User settings in `%APPDATA%\Zenkai` are isolated and preserved.

---

## 3. Platform Code Signing & Integrity

### 3.1 Windows Authenticode Signing
- **Configuration:** When `CSC_LINK` and `CSC_KEY_PASSWORD` secrets are provided in the GitHub Actions environment, `electron-builder` signs the executable and NSIS installer with an Authenticode certificate using SHA-256 hashing (`signtoolOptions: { signingHashAlgorithms: ["sha256"] }`).
- **Unsigned Binaries Disclosure:** When no enterprise certificate is configured, binaries are distributed as clean, unsigned binaries accompanied by SHA-256 cryptographic hashes. Zenkai Desktop never claims an unsigned binary is signed. Windows SmartScreen may present a known-publisher warning on inaugural launches until reputation is established.

### 3.2 Linux AppImage Integrity
- **Squashfs Header & ELF Integrity:** Verified by `scripts/verify-artifacts.mjs` before release publication.
- **Publisher Authentication:** Checksums in `SHA256SUMS.txt` provide transmission and bit-rot integrity. They do not substitute for OS-level GPG package manager trust, which is documented in the Linux installation guide.
