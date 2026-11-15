# Zenkai Desktop — DevDoc v3: Player Tech & API Architecture Delta

This document specifies the core player architecture, provider registry, unified subtitle engine, GPU-based anime upscaling, and episode metadata merging based on real upstream architecture analysis.

---

## 1. Provider Registry Architecture (T-API7)

### Upstream Insight
The web app maintains a heterogeneous provider registry rather than a hardcoded 3-way switch. Providers vary by:
- **Kind**: `direct` (HLS media stream), `embed` (third-party iframe or webview), or `animesalt` (multi-audio server-resolved)
- **ID Type**: AniList ID, MyAnimeList ID, or TMDB ID + Season
- **Audio Switchability**: Whether Japanese (sub) and English (dub) require separate stream fetches or if one multi-track stream carries both
- **Embed URL Builder**: Custom embed URL generator for iframe-based providers

### Registry Schema (`src/shared/servers.ts`)

```typescript
export interface ServerDef {
  id: string;
  name: string;
  kind: "direct" | "embed" | "animesalt";
  idType: "anilist" | "mal" | "tmdb";
  audioSwitchable: boolean;
  multiTrack: boolean;
  requiresExtension?: boolean;
  buildEmbedUrl?: (ctx: { id: number; episode: number; audio?: "sub" | "dub"; tmdbId?: number; season?: number }) => string | null;
}
```

---

## 2. Unified Subtitle Engine (T-API8)

### Problem with Native `<track>`
Browsers' native `<track>` element only supports WebVTT and ignores Advanced SubStation Alpha (ASS/SSA) formatting, positioning, and styling tags (`{\pos(x,y)}`, `\N`, `\h`).

### Unified Parser & Cue Engine (`src/shared/subtitles.ts`)
A single parser function `parseSubtitles(content: string)`:
1. Detects ASS/SSA by checking for the literal header `Dialogue:`.
   - Parses timestamp fields 1 (`start`) and 2 (`end`).
   - Re-joins text fields from field 9 onwards.
   - Strips override tags `\{[^}]*\}`.
   - Normalizes `\N` / `\n` to newlines and `\h` to whitespace.
2. Falls through to SRT/WebVTT:
   - Matches timestamp blocks containing `-->`.
   - Normalizes comma decimals (`00:00:12,500`) and dot decimals (`00:00:12.500`) into seconds.
   - Strips HTML inline formatting tags (`<i>`, `<b>`, etc.).
3. Provides linear cue lookup:
   ```typescript
   export function findActiveCue(cues: Cue[], time: number, offsetSeconds = 0): string | null
   ```
4. Rendered directly into `#subtitleOverlay` on `<video>`'s `timeupdate` event.

---

## 3. ACDN Direct Resolution from Electron Main (T-API9)

### Architecture Advantage
- On the web, ACDN issues tokens bound to the requesting client's IP. If resolved on Cloudflare Workers, the token is bound to the worker IP, requiring all media segments to be proxied.
- In **Zenkai Desktop**, the Electron main process runs with the user's stable local IP. Resolution and manifest fetching can occur directly in the main process, avoiding the slow proxy-all fallback required by web browsers.

---

## 4. Real-Time GPU Anime Upscaling via WebGPU (T-API10)

### Technology
- Uses `anime4k-webgpu` (MIT license, 0 external dependencies).
- Leverages Electron 45's Chromium engine which has WebGPU enabled by default.
- Zero-copy external texture sampling from `<video>` into WebGPU shader passes (`ModeA`, `ModeB`, `CNNx2M`).
- Canvas output capped at 2× source resolution and scaled to DPR.
- Driven by `requestVideoFrameCallback` to synchronize precisely with decoded video frames.
- Controlled via `aiUpscale` setting in settings schema, gated by `'gpu' in navigator`.

---

## 5. Episode Metadata Merge (T-API11)

### Merge Rule
Combines AniList `streamingEpisodes` with TMDB structured episode data:
**TMDB wins whenever a field is present; AniList fills in any missing properties.**

---

## 6. Implementation Task Graph

| Task | Component | Description | Dependencies |
|---|---|---|---|
| **T-API7** | `src/shared/servers.ts` | Data-driven provider registry replacing hardcoded server switch | None |
| **T-API8** | `src/shared/subtitles.ts` | Unified ASS/SRT/VTT parser & custom overlay cue renderer | None |
| **T-API9** | `src/main/api/stream.ts` | Direct ACDN resolution from Electron main process | T-API7 |
| **T-API10** | `src/renderer/src/upscale.ts` | Anime4K WebGPU real-time upscaler & Settings toggle | None |
| **T-API11** | `src/shared/episodes.ts` | Episode metadata merge engine (TMDB-priority) | None |
