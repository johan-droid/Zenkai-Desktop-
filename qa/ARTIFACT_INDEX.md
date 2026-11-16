# Zenkai Desktop — Quality Assurance Artifact & Evidence Index

**Document Version:** 1.0.0  
**Central Index:** Authoritative directory of all current QA specifications, historical verification audits, automated test suites, and photographic visual evidence.

---

## 1. Authoritative Current QA Specifications

| Specification Document | Scope & Contents | Last Updated | Status |
|---|---|---|---|
| [qa/README.md](README.md) | Central QA portal, execution philosophy, and test commands | 2026-11-16 | Canonical |
| [qa/FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) | Catalog of all 38 application feature modules with test coverage | 2026-11-16 | Verified |
| [qa/COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md) | Catalog of all 50 interactive UI controls with selectors and mutations | 2026-11-16 | Verified |
| [qa/ACCEPTANCE_GATES.md](ACCEPTANCE_GATES.md) | Formal specifications for all 20 release acceptance gates | 2026-11-16 | Verified |
| [qa/TEST_STRATEGY.md](TEST_STRATEGY.md) | Multi-layered testing strategy (unit, integration, E2E, screen detectors) | 2026-11-16 | Active |
| [qa/ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md) | Multi-OS hardware compatibility matrix & driver requirements | 2026-11-16 | Active |
| [qa/LOCAL_EXECUTION.md](LOCAL_EXECUTION.md) | Local test execution guide for developers and CI runners | 2026-11-16 | Active |
| [qa/CI_EXECUTION.md](CI_EXECUTION.md) | GitHub Actions CI/CD workflows and automated release gates | 2026-11-16 | Active |
| [qa/RELEASE_READINESS.md](RELEASE_READINESS.md) | Real-time release readiness evaluation report | 2026-11-16 | Active |
| [qa/BUGS_FOUND.md](BUGS_FOUND.md) | Complete defect log with severity classifications and statuses | 2026-11-16 | Resolved |
| [qa/REMEDIATION_LOG.md](REMEDIATION_LOG.md) | Chronological remediation ledger of all QA fixes | 2026-11-16 | Resolved |

---

## 2. Historical Verification Records (`qa/historical/`)

| Report Identifier | Date & Commit | Platform & Hardware | Test Type | Verification Level | Results & Key Findings |
|---|---|---|---|---|---|
| [2026-11-15-product-baseline-audit.md](historical/2026-11-15-product-baseline-audit.md) | 2026-11-15<br>`4bc0ff6` | Linux x64 / Chromium 134 | Product Exploration | **Explored Manually & Verified** | Audited all 36 routes; verified zero blank screens; identified circular dependency in API client. |
| [2026-11-15-packaging-baseline-audit.md](historical/2026-11-15-packaging-baseline-audit.md) | 2026-11-15<br>`50ffa5f` | Linux x86_64 AppImage | Packaging Audit | **Automated & Verified** | Validated native binary packaging, icon embeds, and unpacked ONNX runtime modules. |
| [2026-11-15-production-data-integrity-audit.md](historical/2026-11-15-production-data-integrity-audit.md) | 2026-11-15<br>`50ffa5f` | Node.js / Linux | Data Integrity Audit | **Automated & Verified** | Confirmed 100% genuine data; established `scripts/verify-zero-mock.mjs` quality gate. |
| [2026-11-16-gpu-hardware-verification-audit.md](historical/2026-11-16-gpu-hardware-verification-audit.md) | 2026-11-16<br>`1b28a65` | Pop!_OS 24.04 / AMD Ryzen 7 5700U (`1002:164c`) | Physical Hardware Audit | **Physically Verified on Hardware** | Confirmed `VaapiVideoDecoder` and WebGPU Anime4K compute pipeline (35.6 ms/frame). |
| [2026-11-16-initial-exploratory-qa-audit.md](historical/2026-11-16-initial-exploratory-qa-audit.md) | 2026-11-16<br>`1b28a65` | Linux x64 / Xvfb | Exploratory QA Pass 1 | **Explored & Remediated** | Initial exploration across 38 features and 50 components; cataloged and fixed initial defects. |

---

## 3. Visual Evidence & Screenshots (`qa/screenshots/`)

All screenshots reflect authentic rendering from packaged application runs on Linux (Pop!_OS 24.04):

| File Name | Screen / Module | Captured Component / Workflow | Verification Gate |
|---|---|---|---|
| `01-landing-hub.png` | Landing Hub (`/`) | Hero spotlight, navigation, quick links | `GATE-BOOT` |
| `02-anime-home.png` | Anime Home (`/anime`) | Seasonal anime grid, hero pager, trending shelves | `GATE-ANIME` |
| `03-desktop-settings.png` | Settings (`/settings`) | Universal GPU architecture, hardware decoders, power mode | `GATE-SETTINGS`, `GATE-GPU` |
| `04-search-modal.png` | Omni-Search Modal (`Ctrl+K`) | Search input, quick filter tags, recent history | `GATE-SEARCH` |
| `05-search-results.png` | Omni-Search Results | Debounced live search results list | `GATE-SEARCH` |
| `06-anime-details.png` | Anime Details (`/anime/:id`) | Title banner, synopsis, episode selector, bookmark button | `GATE-ANIME` |
| `07-watch-player.png` | CinePlayer (`/watch/:id/:ep`) | HLS player controls, WebGPU upscaler split slider | `GATE-MEDIA`, `GATE-VISION` |
| `08-downloads-page.png` | Downloads (`/downloads`) | Offline download queue, storage bar, resume/pause | `GATE-DOWNLOAD` |
| `09-ascension-hunter.png` | Ascension (`/ascension`) | Gamification ladder, rank badge progression, stats | `GATE-ASCEND` |
| `10-manga-hub.png` | Manga Hub (`/manga`) | Popular manga catalog, chapter listings | `GATE-MANGA` |
| `11-manga-details.png` | Manga Details (`/manga/:id`) | Chapter selector, author info, cover art | `GATE-MANGA` |
| `12-manga-reader.png` | Manga Reader (`/manga/read`) | Page-by-page reader, zoom controls, navigation | `GATE-MANGA` |
| `13-novel-hub.png` | Light Novel Hub (`/novel`) | Light novel rankings and featured releases | `GATE-NOVEL` |
| `14-novel-details.png` | Light Novel Details (`/novel/:id`) | Volume and chapter index, synopsis | `GATE-NOVEL` |
| `15-novel-error-recovery.png` | Novel Error Recovery | Resilient recovery UI during upstream rate limits | `GATE-RECOVERY` |
| `16-vision-studio.png` | Vision Studio (`/vision`) | Offline AI upscaling queue, model manifests | `GATE-VISION` |
| `17-schedule.png` | Airing Schedule (`/schedule`) | Weekly release calendar, countdown timers | `GATE-NAV` |
| `18-browse-catalog.png` | Catalog Browse (`/browse`) | Multi-genre filter dropdowns, year, format filters | `GATE-NAV` |
| `19-my-list.png` | My Watchlist (`/list`) | Personal watchlist categories (Watching, Plan, Completed) | `GATE-USER` |

---

## 4. Failure Investigation Evidence (`qa/artifacts/failures/`)

- `dead-control-fail-1794848486630.png`: Captured during initial development of `screen-detector.ts` when verifying asynchronous IPC state assertions on the GPU preference button.

---

## 5. Machine-Readable Registries (`qa/registry/`)

- `qa/registry/features.json`: 38 features with status, file mappings, and test coverage.
- `qa/registry/components.json`: 50 interactive UI controls with selectors and actions.
- `qa/registry/gates.json`: 20 acceptance gates indexed with criteria and severities.
- **Validator**: `scripts/validate-qa-registry.mjs` verifies 100% disk integrity of all registered paths.

