# Zenkai Desktop — Architecture Decision Records (ADRs)

This directory documents the foundational architectural and engineering decisions made during the design, development, and hardening of Zenkai Desktop.

Each record outlines the context, decision, trade-offs considered, consequences, status, and related commit/tag references.

---

## Index of Decisions

| ADR ID | Title | Status | Date | Area |
|---|---|---|---|---|
| [ADR-0001](0001-decoupled-electron-architecture.md) | Decoupled Electron Shell & Bundled React 19 Frontend | **ACCEPTED** | 2026-11-15 | Architecture |
| [ADR-0002](0002-dual-track-release-and-ota-updates.md) | Dual-Track Release & Over-The-Air Update Engine | **ACCEPTED** | 2026-11-15 | Deployment / Updates |
| [ADR-0003](0003-in-memory-aes128-stream-decryption.md) | Safe In-Memory AES-128 HLS Stream Decryption | **ACCEPTED** | 2026-11-15 | Media & Security |
| [ADR-0004](0004-universal-gpu-webgpu-and-vaapi-decoding.md) | Vendor-Aware GPU Switches & Linux VA-API Decoding | **ACCEPTED** | 2026-11-16 | GPU & Performance |
| [ADR-0005](0005-zero-mock-production-data-integrity.md) | Zero-Mock Production Data Integrity & Authentic Fallbacks | **ACCEPTED** | 2026-11-15 | Data & Reliability |
| [ADR-0006](0006-dual-track-qa-automation-and-acceptance-gates.md) | Dual-Track QA Automation, Registries & Release Gates | **ACCEPTED** | 2026-11-16 | QA & CI/CD |

---

## ADR Template Guidelines

When creating new ADRs:
1. **Title**: Numbered sequence (`000X-<short-slug>.md`).
2. **Status**: PROPOSED, ACCEPTED, SUPERSEDED, or DEPRECATED.
3. **Context**: What problem forced the decision? What constraints existed?
4. **Decision**: What exact approach was chosen?
5. **Consequences**: What benefits were realized? What liabilities or limitations were accepted?

