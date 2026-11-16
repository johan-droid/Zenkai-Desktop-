# Zenkai Desktop — Comprehensive QA & Test Automation System

This directory houses the permanent, machine-readable quality assurance system, physical browser automation, component inventory, acceptance gates, and dual-track release enforcement artifacts for **Zenkai Desktop**.

---

## 1. Directory Structure

```text
qa/
├── README.md                  # System overview, test execution guides, reproduction steps
├── LOCAL_EXECUTION.md         # Local QA developer workflow, command reference & troubleshooting
├── CI_EXECUTION.md            # GitHub Actions CI/CD architecture, triggers & branch protection
├── RELEASE_READINESS.md       # Real-time dual-track release readiness dashboard (LOCAL + CI)
├── FEATURE_INVENTORY.md        # Comprehensive catalog of all 38 application feature modules
├── COMPONENT_INVENTORY.md      # Detailed inventory of all 50 interactive UI components & selectors
├── TEST_STRATEGY.md            # 5-layer test pyramid, regression policy, and quality thresholds
├── ACCEPTANCE_GATES.md         # 20 feature-specific acceptance gates and release criteria
├── ENVIRONMENT_MATRIX.md       # Target OS, GPU architecture, display server, and package matrix
├── BUGS_FOUND.md               # Defect ledger tracking severity, reproduction, and resolution status
├── REMEDIATION_LOG.md          # Technical self-remediation journal documenting code fixes & regressions
├── FINAL_AUDIT_REPORT.md       # Executive audit report with physical evidence links and sign-off
├── registry/                   # Machine-readable, strictly validated JSON registries
│   ├── features.json           # 38 features with test mappings & preconditions
│   ├── components.json         # 50 interactive components with selectors & expected changes
│   └── gates.json              # 20 acceptance gates with mandatory criteria & evidence links
├── gates/                      # Dedicated gate verification reports (All 20 Gates)
│   ├── gate-boot.md
│   ├── gate-nav.md
│   ├── gate-hub.md
│   ├── gate-anime.md
│   ├── gate-media.md
│   ├── gate-vision.md
│   ├── gate-manga.md
│   ├── gate-novel.md
│   ├── gate-movies.md
│   ├── gate-search.md
│   ├── gate-downloads.md
│   ├── gate-user.md
│   ├── gate-comm.md
│   ├── gate-ascend.md
│   ├── gate-gpu.md
│   ├── gate-settings.md
│   ├── gate-updater.md
│   ├── gate-theme.md
│   ├── gate-security.md
│   └── gate-recovery.md
└── screenshots/                # 19 physical CDP agent-browser exploration captures
    ├── 01-landing-hub.png
    ├── 02-anime-home.png
    ├── 03-desktop-settings.png
    ├── 04-search-modal.png
    ├── 05-search-results.png
    ├── 06-anime-details.png
    ├── 07-watch-player.png
    ├── 08-downloads-page.png
    ├── 09-ascension-hunter.png
    ├── 10-manga-hub.png
    ├── 11-manga-details.png
    ├── 12-manga-reader.png
    ├── 13-novel-hub.png
    ├── 14-novel-details.png
    ├── 15-novel-error-recovery.png
    ├── 16-vision-studio.png
    ├── 17-schedule.png
    ├── 18-browse-catalog.png
    └── 19-my-list.png
```

---

## 2. Command Reference

The project package scripts provide a comprehensive command interface:

```bash
# Diagnostic & Environment Probe
pnpm qa:doctor

# Machine-Readable Registry Validation (fails if any mapping is invalid)
pnpm qa:registry

# Unit & Subsystem Tests (37 suites, 236 tests)
pnpm qa:unit

# Playwright Electron E2E Tests (20 tests, including Black-Screen & Dead-Control Detector)
pnpm qa:electron

# Full Release Gate (Doctor -> Registry -> Typecheck -> Lint -> Unit -> E2E -> Report)
pnpm qa:all
```

---

## 3. Dual-Track Release Enforcement

Release eligibility requires satisfying both tracks simultaneously:

$$\text{Release Readiness} = \text{LOCAL\_QA\_PASS} \land \text{CI\_PASS} \land \text{NO\_OPEN\_CRITICAL\_DEFECTS}$$

1. **Track A (Local QA)**:
   - Evaluates local physical AMD GPU hardware (Lucienne / Renoir).
   - Validates all 20 acceptance gates with physical screenshots and CDP event logs.
   - Run via `pnpm qa:all`.
2. **Track B (GitHub Actions CI)**:
   - Configured in `.github/workflows/qa-pr.yml`, `qa-main.yml`, `qa-nightly.yml`, `qa-release.yml`.
   - Runs deterministic quality gates across Ubuntu, Windows, and macOS runners.
   - Enforces branch protection on `main`.

---

## 4. Current Quality Status

- **Discovered Features**: 38 cataloged (27 Automated Pass, 8 Manually Verified, 3 Structural Only).
- **Interactive Components**: 50 cataloged (43 Automated Pass, 6 Manually Verified, 1 Structural Only).
- **Dead Controls Found**: 0.
- **Acceptance Gates**: 20/20 Gates Verified.
- **Unit & Integration Suite**: 37 suites, 236 tests, 0 failures.
- **Playwright E2E Suite**: 20 tests, 0 failures.
- **Static Verification**: 0 TypeScript errors, 0 ESLint warnings.
- **Local Release Status**: **PASS (All Mandatory Local Gates Satisfied)**.
- **Remote CI Status**: **NOT RUN (Awaiting Pull Request / Branch Push to Trigger)**.
