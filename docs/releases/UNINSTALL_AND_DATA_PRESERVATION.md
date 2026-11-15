# Zenkai Desktop — Uninstallation & Data Preservation Architecture

**Document Version:** 1.0.0  
**Target Release:** Zenkai Desktop v0.0.1  
**Status:** Certified Specification

---

## 1. Data Preservation Philosophy

Zenkai Desktop follows a strict **Non-Destructive User Data Policy**:
- **Application Binaries** and system integrations belong to the operating system installer domain.
- **User Content** (downloaded offline video files, watch progress, local settings, credentials, and custom AI models) belongs exclusively to the end user.
- **Standard Uninstallation** removes the application binaries and OS shortcuts cleanly without wiping or corrupting the user's library.
- **Complete Purge** instructions are transparently documented for users who wish to remove every trace of application data.

---

## 2. Directory Hierarchy Across Operating Systems

| Directory Role | Linux File Path | Windows File Path | Preservation Policy |
|---|---|---|---|
| **Installation Binaries** | Portable AppImage file OR `/opt/zenkai-desktop/` (deb/rpm) | `%LOCALAPPDATA%\Programs\Zenkai\` | **Removed by Uninstaller** |
| **Shortcuts & Desktop Entries** | `~/.local/share/applications/zenkai.desktop` | Desktop shortcut & `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Zenkai Desktop` | **Removed by Uninstaller** |
| **Registry Entries** | N/A (MIME registered in `mimeapps.list`) | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Zenkai Desktop` | **Removed by Uninstaller** |
| **User Data (`userData`)** | `~/.config/Zenkai/` | `%APPDATA%\Zenkai\` | **Preserved by Default** |
| **Offline Downloads** | `~/.config/Zenkai/downloads/` | `%APPDATA%\Zenkai\downloads\` | **Preserved by Default** |
| **AI Models Cache** | `~/.config/Zenkai/models/` | `%APPDATA%\Zenkai\models\` | **Preserved by Default** |
| **Application Cache** | `~/.cache/Zenkai/` | `%LOCALAPPDATA%\Zenkai\Cache\` | **Cleaned on exit / uninstall** |
| **Application Logs** | `~/.config/Zenkai/logs/` | `%APPDATA%\Zenkai\logs\` | **Preserved for troubleshooting** |

---

## 3. Uninstallation Lifecycle

### 3.1 Windows NSIS Uninstaller
1. When the user initiates uninstallation from Windows Settings / "Apps & Features" or runs `Uninstall Zenkai Desktop.exe`:
   - Checks if `Zenkai.exe` is currently running and prompts the user to close it.
   - De-registers the `zenkai://` URL protocol handler from the Windows Registry.
   - De-registers file association `.zenkaits` from the Windows Registry.
   - Removes Start Menu shortcuts and Desktop shortcuts.
   - Deletes all binaries, DLLs, ASAR files, and resources in `%LOCALAPPDATA%\Programs\Zenkai\`.
   - Cleans the uninstaller entry from `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Zenkai Desktop`.
   - **Retains** `%APPDATA%\Zenkai` so the user's downloaded anime, watch history, and AI enhancement models remain intact if they re-install or upgrade.

### 3.2 Linux AppImage Removal
1. Because AppImage is a single-file portable executable:
   - Delete the `.AppImage` file: `rm Zenkai-Desktop-*.AppImage`.
   - If integrated with desktop environments via AppImageLauncher: desktop entries in `~/.local/share/applications/appimagekit_*-Zenkai.desktop` are removed automatically.
   - User data in `~/.config/Zenkai/` remains safe.

---

## 4. Manual Purge & Clean Reset Instructions

If a user wishes to execute a 100% complete clean wipe of all local data:

### On Linux:
```bash
# 1. Remove the AppImage executable
rm -f ~/Downloads/Zenkai-Desktop-*.AppImage
rm -f ~/Applications/Zenkai-Desktop-*.AppImage

# 2. Remove configuration, downloads, watch history, and AI models
rm -rf ~/.config/Zenkai

# 3. Remove runtime cache
rm -rf ~/.cache/Zenkai
```

### On Windows (PowerShell):
```powershell
# 1. Run the official uninstaller from Windows Settings or CLI:
& "$env:LOCALAPPDATA\Programs\Zenkai\Uninstall Zenkai Desktop.exe" /S

# 2. To completely purge saved data, downloads, and models:
Remove-Item -Recurse -Force "$env:APPDATA\Zenkai"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Zenkai"
```
