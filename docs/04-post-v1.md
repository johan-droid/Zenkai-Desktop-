# 04 — Post-v1: Flatpak (T18, optional)

Out of scope for v1. Start only after Phase 6 ships.

### T18 — Flatpak
- **Deps:** T12
- **Files:** `flathub/app.zenkai.desktop.yml`
- **Steps:**
  1. Runtime `org.freedesktop.Platform`.
  2. Build from AppImage or source per Flathub rules.
- **Acceptance:**
  - [ ] `flatpak-builder` builds locally
