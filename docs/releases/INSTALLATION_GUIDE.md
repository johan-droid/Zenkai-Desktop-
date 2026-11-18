# Zenkai Desktop — Official Installation & User Guide

**Document Version:** 2.0.0  
**Target Release:** Zenkai Desktop v1.0.4+  
**Status:** Canonical End-User Documentation

---

## 1. System Requirements

### 1.1 Linux Systems
| Component | Minimum Specification | Recommended Specification |
|---|---|---|
| **OS** | Linux x86_64 (glibc >= 2.31: Ubuntu 20.04+, Pop!_OS 20.04+, Debian 11+, Fedora 34+, Arch Linux) | Modern Linux distribution with Wayland or X11 |
| **Processor** | Dual-core 64-bit x86_64 processor | Quad-core Intel Core i5 / AMD Ryzen 5 or better |
| **RAM** | 4 GB | 8 GB or more |
| **Graphics** | OpenGL 3.3 / Vulkan 1.1 compatible GPU | Dedicated GPU (NVIDIA GTX 1060+ / AMD RX 580+ / Intel Arc) for Zenkai Vision 4K AI upscaling |
| **Storage** | 500 MB free disk space for application + space for downloaded anime | SSD storage |

### 1.2 Windows Systems
| Component | Minimum Specification | Recommended Specification |
|---|---|---|
| **OS** | Windows 10 (64-bit, Version 1909+) or Windows 11 | Windows 11 64-bit |
| **Processor** | 64-bit Intel or AMD processor (x64) | Intel Core i5 10th Gen / AMD Ryzen 5 3600 or better |
| **RAM** | 4 GB | 8 GB or 16 GB |
| **Graphics** | DirectX 12 / DirectML compatible GPU | Dedicated NVIDIA RTX / AMD Radeon RX 6000+ / Intel Arc GPU |
| **Storage** | 600 MB free disk space + space for offline downloads | Fast NVMe/SATA SSD |

---

## 2. Linux Installation Instructions (AppImage)

The Linux package is distributed as a self-contained **AppImage**, which requires no root privileges or package manager installation.

### Step 1: Download the AppImage
Download `Zenkai-Desktop-<version>-x86_64.AppImage` from GitHub Releases.

### Step 2: Make the File Executable
Open your terminal in the directory where you downloaded the file:

```bash
chmod +x Zenkai-Desktop-<version>-x86_64.AppImage
```

Alternatively, right-click the file in your desktop file manager (GNOME Files, Dolphin, Nautilus), select **Properties** → **Permissions**, and check **"Allow executing file as program"**.

### Step 3: Run Zenkai Desktop
Launch directly from terminal or file manager:

```bash
./Zenkai-Desktop-<version>-x86_64.AppImage
```

*(Optional: Use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) to automatically integrate Zenkai Desktop into your desktop application menu).*

---

## 3. Windows Installation Instructions (Setup EXE)

The Windows package is distributed as a standard Nullsoft Scriptable Install System (NSIS) installer.

### Step 1: Download the Installer
Download `Zenkai-Desktop-Setup-<version>-x64.exe` from GitHub Releases.

### Step 2: Run the Installer
Double-click `Zenkai-Desktop-Setup-<version>-x64.exe` to launch the installation wizard.

### Step 3: Select Installation Options
1. Choose your preferred installation directory (Default: `%LOCALAPPDATA%\Programs\Zenkai`).
2. The installer automatically configures:
   - Desktop shortcut
   - Start Menu program group (`Zenkai Desktop`)
   - `zenkai://` deep link URL protocol handler
   - `.zenkaits` file association
3. Click **Install**. Once finished, check **"Run Zenkai Desktop"** and click **Finish**.

---

## 4. Cryptographic Hash Verification

Before executing downloaded packages, you can verify their cryptographic integrity against official release checksums:

### On Linux:
```bash
sha256sum Zenkai-Desktop-<version>-x86_64.AppImage
# Compare against dist/SHA256SUMS.txt:
# a88280364a8729aadf11d3114811d2aede1da7daa1614cd150267f1fddb528fa
```

### On Windows (PowerShell):
```powershell
Get-FileHash -Algorithm SHA256 .\Zenkai-Desktop-Setup-<version>-x64.exe
# Compare against:
# dc51fde3a865c6cb1e8883da1cbcc27da7c9c0ff47d290188613ee167159f278
```

---

## 5. Troubleshooting & FAQ

### Linux: FUSE Error (`dlopen(): error loading libfuse.so.2`)
On newer Ubuntu/Debian versions (Ubuntu 22.04+), FUSE 2 is not installed by default:
```bash
sudo apt update && sudo apt install libfuse2
```
Or run the AppImage with:
```bash
./Zenkai-Desktop-<version>-x86_64.AppImage --appimage-extract-and-run
```

### Windows: SmartScreen Prompt ("Windows protected your PC")
Because initial releases may not possess an enterprise EV code signing certificate:
1. Click **More info**.
2. Click **Run anyway**.
*(Verify the SHA-256 hash above to ensure the binary is authentic and untampered).*

### Hardware Acceleration & Zenkai Vision
- To verify GPU acceleration, navigate to **Settings** → **Zenkai Vision** inside the app.
- On systems with dedicated NVIDIA or AMD GPUs, DirectML (Windows) or CUDA/Vulkan (Linux) acceleration is activated automatically.

