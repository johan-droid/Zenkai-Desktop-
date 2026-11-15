# Contributing to Zenkai Desktop

Thank you for your interest in contributing to **Zenkai Desktop**!

Zenkai Desktop is an engineering-driven project prioritizing security, rock-solid stability, zero visual regression, and user privacy.

---

## 1. Mandatory Engineering Standard

Before submitting code, all contributors and AI agents must read and strictly follow:

👉 **[`docs/ENGINEERING_QUALITY_GATES.md`](docs/ENGINEERING_QUALITY_GATES.md)**

Every feature, refactor, or bug fix must satisfy:
- The 14-stage development lifecycle.
- Complete 15-state lifecycle testing (initial, loading, active, paused, error, cancellation, recovery, etc.).
- Strict UI consistency: zero visual regression against the authentic React 19 Zenkai design system.
- Zero security degradation: context isolation enabled, sandbox active, zero Node.js leaks to renderer.

---

## 2. Development Setup

### Prerequisites
- **Node.js**: `22.x` (LTS recommended)
- **Package Manager**: `pnpm` (version 12+)
- **Operating System**: Linux (x64/ARM64), Windows 10/11 (x64), or macOS 12+

### Quick Start
```bash
# 1. Clone repository
git clone https://github.com/johan-droid/Zenkai-Desktop-.git
cd Zenkai-Desktop-

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Start development environment
pnpm dev
```

---

## 3. Verification Commands

Before proposing changes or pushing commits, run all verification suites:

```bash
# Run unit & integration tests (Vitest)
pnpm test

# Run End-to-End Playwright suite
pnpm e2e

# Run strict ESLint verification
pnpm lint

# Verify TypeScript types
pnpm typecheck

# Full production build test
pnpm build

# Execute Preload Bridge contract check
node scripts/t4-bridge-check.mjs

# Execute Security Sandbox check
node scripts/t3-security-check.mjs
```

---

## 4. Git & Commit Guidelines

- **Branch Protocol**: Commits are made directly on `main` in verified increments unless explicitly instructed by the repository owner to branch.
- **Commit Messages**: Use [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat(module): description`
  - `fix(module): description`
  - `docs(module): description`
  - `test(module): description`
  - `refactor(module): description`
- **Zero Mock Testing**: Never claim tests passed without executing them and verifying the output.
- **Preserve User Data**: Never perform destructive changes to user configuration or offline media without explicit migration safeguards.
