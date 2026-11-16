# Zenkai Desktop — GitHub Actions CI Architecture & Enforcement Guide

This document describes the remote repository-level CI/CD architecture, automated workflow triggers, branch protection rules, and artifact management for Zenkai Desktop.

---

## 1. Dual-Track Workflow Architecture

```text
               +-------------------------------------------+
               |        PULL REQUEST / GIT PUSH            |
               +-------------------------------------------+
                                     |
               +---------------------+---------------------+
               |                                           |
         [Pull Request]                              [Push to Main]
               |                                           |
     qa-pr.yml (Ubuntu 22.04)                   qa-main.yml (Linux + Matrix)
       - Doctor & Traceability                    - Full QA Suite (qa:all)
       - TypeScript & ESLint                      - Windows Build Test
       - Security & Secret Scan                   - macOS Build Test
       - Vitest Unit & Integration                - Release Readiness Report
       - Electron E2E (Xvfb)                      - 30-Day Artifact Retention
       - Upload PR Report                                  |
                                              +------------+------------+
                                              |                         |
                                         [Nightly Cron]         [Release Dispatch]
                                              |                         |
                                       qa-nightly.yml             qa-release.yml
                                       - Deep Regression          - Zero-Mock Verify
                                       - Performance Probes       - Linux Packaging
                                       - Security Audit           - Artifact Hashes
                                       - Extended E2E             - NO Auto-Publish
```

---

## 2. Workflows Specification

### 1. `qa-pr.yml` — Pull Request Quality Gate
- **Trigger**: Pull requests targeting `main` containing modifications in `src/**`, `tests/**`, `qa/**`, `scripts/**`, `package.json`.
- **Concurrency**: `qa-pr-${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`.
- **Mandatory Gates**:
  1. `qa:doctor`
  2. `qa:registry` (Traceability validation)
  3. `typecheck` (`tsc --noEmit`)
  4. `lint` (`eslint .`)
  5. `qa:security` (SSRF Shield & Secret scan)
  6. `qa:unit` (Vitest suites)
  7. `build` (Electron bundle compilation)
  8. `qa:electron` (Playwright Electron workflows under Xvfb)
  9. `qa:report` (Release readiness generation)
- **Artifacts**: Uploads `qa-pr-report-<sha>` retaining report markdown and traces for 14 days.

### 2. `qa-main.yml` — Main Branch Integration
- **Trigger**: Pushes to `main`.
- **Jobs**:
  - `main-gate-linux`: Executes `pnpm qa:all` on Linux.
  - `main-build-cross-platform`: Matrix builds on `windows-latest` and `macos-latest` verifying cross-platform bundle compilation.

### 3. `qa-nightly.yml` — Nightly Deep Regression
- **Trigger**: Scheduled at `02:00 UTC` daily or manual `workflow_dispatch`.
- **Scope**: Extended performance probes, dependency security review (`pnpm audit`), visual regression checks.

### 4. `qa-release.yml` — Release Gate Enforcement
- **Trigger**: Manual `workflow_dispatch` with semantic version input.
- **Scope**: Zero-mock verification, production AppImage packaging, SHA-256 blockmap validation, release audit report generation.
- **Safety**: **DOES NOT** publish to GitHub Releases or deploy to users without separate authorization.

---

## 3. Security & Fork Safety Rules

1. **Token Protection**: No GitHub tokens, API keys, or private signing certificates are injected into pull request workflows from untrusted forks.
2. **Permission Boundary**: All workflows declare explicit `permissions: contents: read` to follow the principle of least privilege.
3. **Secret Masking**: Secret scanning step inspects commits for accidental private key or API token commits before running tests.

---

## 4. Recommended GitHub Branch Protection Settings

To ensure no unverified code enters the main branch, configure the following branch protection rules for `main`:

```text
Branch name pattern: main
[✓] Require a pull request before merging
    - Required approvals: 1
    - Dismiss stale pull request approvals when new commits are pushed
[✓] Require status checks to pass before merging
    - Require branches to be up to date before merging
    - Status checks required:
        * Mandatory QA Gate (Linux) (pr-gate-linux)
[✓] Require conversation resolution before merging
[✓] Do not allow bypassing the above settings
```

