# ADR-0003: Safe In-Memory AES-128 HLS Stream Decryption

- **Status**: ACCEPTED
- **Date**: 2026-11-15
- **Commit**: `50ffa5f`
- **Deciders**: Media & Security Engineering Team

---

## Context

Many streaming providers encrypt HLS media segments using AES-128 CBC encryption with rotating key URIs (`#EXT-X-KEY:METHOD=AES-128,URI="...",IV=...`).
When implementing the desktop offline download engine (`src/main/downloads/hls-download.ts`), media segments must be downloaded and decrypted to produce valid, playable `.ts` or `.mp4` video files for offline storage.

Naive implementations often download the cryptographic key files to temporary folders on the user's hard drive before feeding them into decryption tools (such as external ffmpeg processes). This introduces:
1. Security risk: Secret keys remain accessible in plaintext on the file system or in crash dumps.
2. Performance bottleneck: Disk I/O churn from creating and deleting thousands of temporary 16-byte key files.
3. Disk forensics leakage.

## Decision

We designed an **In-Memory Cryptographic Pipeline**:

1. Segment keys are fetched into volatile Node.js `Buffer` objects in RAM via authenticated secure HTTP fetchers.
2. Decryption is performed in-memory using Node.js `crypto.createDecipheriv('aes-128-cbc', keyBuffer, ivBuffer)`.
3. The decrypted bytes are piped directly into the output stream assembler.
4. Cryptographic keys and initialization vectors are immediately dereferenced and overwritten in memory after segment decryption.
5. Under no circumstances are encryption keys, IVs, or unencrypted segment chunks written to temporary files on disk.

## Alternatives Considered

- **External CLI Decryption (`ffmpeg -decryption_key ...`)**: Rejected because command-line arguments expose keys in process listing tables (`/proc/PID/cmdline` or Process Explorer) and require temporary key files on disk for complex manifests.

## Consequences

### Positive
- Zero cryptographic key leakage to disk or process tables.
- Substantially higher download throughput due to elimination of disk round-trips for keys.
- Safe for multi-connection concurrent segment downloading (up to 6 parallel workers).

### Negative / Trade-offs
- RAM consumption is slightly higher during high-concurrency downloads (buffered chunks in memory).
- Requires custom TypeScript stream pipe implementation rather than delegating to generic CLI tools.

