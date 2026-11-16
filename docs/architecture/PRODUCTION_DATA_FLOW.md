# Zenkai Desktop — Production Data Flow

**Document Version:** 1.0.0  
**Scope:** Media discovery, stream resolution, HLS proxying, in-memory decryption, and local library caching.

---

## 1. Media Discovery & Catalog Navigation

```text
User Navigation
     │
     ▼
[Renderer React Router] ──(Online)──► [AniList GraphQL API]
     │                                        │
     │ (Network Timeout / Offline)            │ (200 OK)
     ▼                                        ▼
[Bundled Fallback Snapshot]           [Hydrated Media Grid]
(`public/home-data.json`)
```

- **Online Mode**: The UI queries AniList GraphQL (`https://graphql.anilist.co`) for trending anime, airings, genres, and character details.
- **Resilient Offline Fallback**: If the network times out or drops, `src/renderer/src/services/fallback.ts` loads authentic pre-scraped snapshot data (`public/home-data.json` and `public/anime-mapping.json`), ensuring zero blank screens or crashed routes.

---

## 2. Stream Resolution & Local HLS Proxy

```text
[Watch Page / Player]
     │
     ▼
[Stream Resolver IPC] ──► [src/main/api/proxy.ts]
                                 │
     ┌───────────────────────────┴───────────────────────────┐
     ▼                                                       ▼
[Direct HLS Provider]                               [Multi-Audio Provider]
(`acdn.js` / `megaplay`)                             (`animesalt.js`)
     │                                                       │
     └───────────────────────────┬───────────────────────────┘
                                 ▼
                     [Stream URL Rewriter]
                     (Rewrites segment URLs to loopback proxy)
                                 ▼
                     [Local Loopback Server]
                     (`http://127.0.0.1:<PORT>/segment?url=...`)
                                 ▼
                     [hls.js Video Player in DOM]
```

- **CORS Bypass & Origin Protection**: Remote HLS playlists and media segments are routed through a local HTTP loopback proxy managed by the Electron main process. This prevents cross-origin blocks and masks client browser fingerprints.
- **SSRF Defense**: The proxy evaluates all target URLs against `server/ssrf.js`, rejecting loopback addresses (`127.0.0.1`), link-local IPs, private subnets (`10.0.0.0/8`, `192.168.0.0/16`), and cloud metadata IP ranges (`169.254.169.254`).

---

## 3. In-Memory Decryption & Download Pipeline

```text
[Download Request] (Episode ID, Quality, Subtitles)
     │
     ▼
[HlsDownloadQueue] (`src/main/downloads/hls-download.ts`)
     │
     ├──► 1. Fetch Playlist (.m3u8) & Subtitle tracks (.vtt/.ass)
     │
     ├──► 2. In-Memory Key Acquisition:
     │       Fetch 16-byte AES-128 key into volatile Node.js Buffer in RAM.
     │       (Zero disk writes of keys or IVs).
     │
     ├──► 3. Concurrent Segment Download Workers (up to 6 parallel):
     │       Segment Download ──► Buffer in RAM ──► crypto.createDecipheriv() ──► Decrypted TS Buffer
     │
     ├──► 4. Atomic Stream Writing:
     │       Append decrypted chunks sequentially to destination `.ts` file.
     │
     └──► 5. Subtitle Transcoding:
             Convert downloaded WebVTT/ASS to standard `.srt` beside `.ts` file.
```

