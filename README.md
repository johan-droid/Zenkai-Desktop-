# Zenkai Desktop

Electron wrapper for the Zenkai web app (`https://zenkai-web.pages.dev/`).

## Linux notes

- **Notifications** require libnotify (package `libnotify4` / `libnotify-bin` on
  Debian/Ubuntu). Without a notification daemon the app skips notifications
  gracefully and logs a one-time warning — nothing else is affected.
