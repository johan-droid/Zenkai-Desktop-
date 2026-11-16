# ADR-0005: Zero-Mock Production Data Integrity & Authentic Fallbacks

- **Status**: ACCEPTED
- **Date**: 2026-11-15
- **Commit**: `50ffa5f`
- **Deciders**: Release & Product Engineering Team

---

## Context

During early desktop migration, several pages and diagnostic components used synthetic placeholders, simulated progress bars, or fake hardware strings (e.g. mock GPU names or simulated upscale metrics) when network requests failed.
In production software, simulated metrics mislead users, conceal real infrastructure regressions, and violate engineering trust.

## Decision

We instituted an unbreakable **Zero-Mock Production Policy**:

1. **No Synthetic Mock APIs in Production**:
   - Every API request connects to authentic endpoints (`https://zenkaii.pages.dev`, AniList GraphQL, TMDB, Jikan).
   - Mock data generators are restricted strictly to unit testing suites (`tests/unit/`).
2. **Authentic Bundled Fallback Baseline**:
   - To guarantee full offline functionality without synthetic data, the application bundles real, pre-scraped catalog snapshots (`public/anime-mapping.json`, `public/home-data.json`) captured from live production servers.
   - If an external network request fails or times out, the application falls back to this authentic offline dataset and indicates offline status to the user.
3. **Automated Zero-Mock Enforcement Gate**:
   - `scripts/verify-zero-mock.mjs` is executed during CI and release workflows.
   - It scans all production source code (`src/main/`, `src/preload/`, `src/renderer/src/`, `server/`) for fake delay loops, synthetic adapters, or mock return objects. If any are detected, the build is aborted.

## Alternatives Considered

- **Allowing Placeholder Stubs in Offline Mode**: Rejected because users cannot distinguish between broken live features and static placeholder mocks.

## Consequences

### Positive
- Production builds provide 100% genuine data and honest diagnostic feedback.
- Automated quality gate prevents accidental merge of development placeholders.
- Offline navigation works reliably with authentic metadata and art.

### Negative / Trade-offs
- Offline datasets must be periodically refreshed (`scripts/scrape-zenkai-home.mjs`) to stay current with seasonal anime airings.

