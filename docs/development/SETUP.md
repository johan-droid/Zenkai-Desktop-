# Zenkai Desktop — Development Environment Setup

**Document Version:** 1.0.0  
**Target Audience:** Developers, QA Engineers, and Autonomous Coding Agents.

---

## 1. System Prerequisites

Before setting up the repository, ensure the host machine meets these toolchain requirements:

| Tool | Minimum Version | Recommended Version | Purpose |
|---|---|---|---|
| **Node.js** | `>= 20.0.0` | `24.x LTS` | JavaScript / TypeScript runtime |
| **pnpm** | `>= 9.0.0` | `12.x` | Monorepo & package manager |
| **Git** | `>= 2.30.0` | `2.43+` | Version control system |
| **Xvfb** (Linux) | Any modern | Standard distro package | Headless Playwright & Electron testing |
| **vainfo** (Linux) | Any | Mesa VA-API drivers | Hardware video decoding diagnostics |
| **vulkaninfo** (Linux) | Any | Vulkan SDK / Mesa RADV | WebGPU hardware verification |

### Linux Package Installation (Ubuntu / Debian / Pop!_OS)
```bash
sudo apt-get update
sudo apt-get install -y xvfb mesa-va-drivers libva-utils vulkan-tools
```

---

## 2. Step-by-Step Repository Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/johan-droid/Zenkai-Desktop-.git
   cd "Zenkai Desktop"
   ```

2. **Install Dependencies**:
   ```bash
   pnpm install --frozen-lockfile
   ```

3. **Verify Environment Diagnostics (QA Doctor)**:
   ```bash
   pnpm qa:doctor
   ```
   *Confirms Node.js, pnpm, Xvfb, VA-API, and build paths are operational.*

4. **Compile Application Bundle**:
   ```bash
   pnpm build
   ```
   *Compiles Electron main process, preload bridge, and React 19 renderer into `out/`.*

5. **Execute Unit Tests**:
   ```bash
   pnpm test
   ```
   *Runs all 37 Vitest test suites (236 tests).*

