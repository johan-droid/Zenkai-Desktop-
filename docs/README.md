# Zenkai Desktop — Engineering Documentation Hub

Welcome to the central technical documentation repository for **Zenkai Desktop**.

This documentation is structured into modular domains to provide immediate clarity for developers, release engineers, security auditors, and autonomous coding agents.

---

## Documentation Sitemap

```text
docs/
├── architecture/          # System topology, Electron process model, and data flow
├── gpu/                   # Universal GPU acceleration & hardware decoding architecture
├── development/           # Developer environment setup, commands, testing, and debugging
├── releases/              # Release engineering, packaging specifications, and checklists
├── operations/            # Update infrastructure operations and incident response
├── decisions/             # Architecture Decision Records (ADRs 0001–0006)
├── repository/            # Cleanup inventories, health audits, and repository status
└── historical/            # Initial development phases (T1–T18) and migration specifications
```

---

## 1. System Architecture

- [Architecture Overview](architecture/OVERVIEW.md) — System topology, Electron process model, and architectural tiers.
- [Electron Architecture](architecture/ELECTRON_ARCHITECTURE.md) — Sandbox security parameters, preload context isolation, and IPC contracts.
- [Production Data Flow](architecture/PRODUCTION_DATA_FLOW.md) — Media discovery, HLS loopback proxying, and in-memory AES-128 decryption.
- [Update Architecture](architecture/UPDATE_ARCHITECTURE.md) — Dual-track OTA renderer updates vs. native desktop runtime releases.

---

## 2. GPU & Hardware Video Decoding

- [Universal GPU Architecture & Diagnostics](gpu/README.md) — Exhaustive reference covering WebGPU flag matrices, Linux VA-API, Windows D3D11, macOS VideoToolbox, capability scaling tiers, and truthful physical vs. structural hardware verification evidence.

---

## 3. Development & Testing

- [Development Setup](development/SETUP.md) — Prerequisites, system dependencies (Xvfb, VA-API, Vulkan), and initial setup steps.
- [Commands Reference](development/COMMANDS.md) — Canonical reference for all `pnpm` and `scripts/` commands.
- [Testing Strategy](development/TESTING.md) — Unit testing with Vitest, E2E testing with Playwright, and automated screen detectors.
- [Debugging Guide](development/DEBUGGING.md) — Main process logging, renderer DevTools, Chromium GPU internals, and Playwright tracing.

---

## 4. Releases & Distribution

- [Production Release Process](releases/RELEASE_PROCESS.md) — Fully automated CI/CD release pipeline, conventional commits, and quality gates.
- [Multi-Platform Packaging](releases/PLATFORM_PACKAGING.md) — AppImage, DEB, RPM, NSIS Setup EXE, Portable ZIP, and macOS packaging specifications.
- [Zero-Mock Production Integrity Audit](releases/PRODUCTION_DATA_INTEGRITY_AUDIT.md) — Production data verification and zero-mock policy.
- [Installation Guide](releases/INSTALLATION_GUIDE.md) — User installation instructions across Linux, Windows, and macOS.
- [Inaugural Release Notes (v0.0.1)](releases/GITHUB_RELEASE_NOTES_v0.0.1.md) — Highlights, release assets, and checksums.

---

## 5. Operations & Incident Response

- [Updater Operations & Rollout Playbook](operations/UPDATER_OPERATIONS.md) — Staged rollouts, canary monitoring, and bad-update rollback procedures.
- [Update Security & Protection](releases/UPDATE_SECURITY.md) — Cryptographic signing, hash validation, and MITM defense.

---

## 6. Architecture Decision Records (ADRs)

- [ADR Index](decisions/README.md)
  - [ADR-0001: Decoupled Electron Shell & Bundled React 19 Frontend](decisions/0001-decoupled-electron-architecture.md)
  - [ADR-0002: Dual-Track Release & Over-The-Air Update Engine](decisions/0002-dual-track-release-and-ota-updates.md)
  - [ADR-0003: Safe In-Memory AES-128 HLS Stream Decryption](decisions/0003-in-memory-aes128-stream-decryption.md)
  - [ADR-0004: Vendor-Aware GPU Switches & Linux VA-API Decoding](decisions/0004-universal-gpu-webgpu-and-vaapi-decoding.md)
  - [ADR-0005: Zero-Mock Production Data Integrity & Authentic Fallbacks](decisions/0005-zero-mock-production-data-integrity.md)
  - [ADR-0006: Dual-Track QA Automation, Registries & Release Gates](decisions/0006-dual-track-qa-automation-and-acceptance-gates.md)

---

## 7. QA Automation & Quality Gates

- [QA Portal & Strategy](../../qa/README.md) — Quality assurance hub and test matrix.
- [Feature Inventory](../../qa/FEATURE_INVENTORY.md) — All 38 cataloged application features.
- [Component Inventory](../../qa/COMPONENT_INVENTORY.md) — All 50 interactive UI controls.
- [Acceptance Gates Index](../../qa/ACCEPTANCE_GATES.md) — All 20 formal release acceptance gates.
- [QA Artifact & Evidence Index](../../qa/ARTIFACT_INDEX.md) — Central directory of reports, logs, and screenshots.

---

## 8. Repository Maintenance & Health

- [Cleanup Inventory](repository/CLEANUP_INVENTORY.md) — Exhaustive classification of all repository paths.
- [Cleanup Report](repository/CLEANUP_REPORT.md) — Before/after metrics and changes made.
- [Repository Health Report](repository/REPOSITORY_HEALTH_REPORT.md) — Security scans, secret audits, and dependency health.
- [Agent Reference Guide](../../AGENTS.md) — Mandatory execution guidelines for autonomous coding agents.
