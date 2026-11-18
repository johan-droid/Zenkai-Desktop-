# Zenkai Desktop — Release Process

The canonical release process is maintained in **[`docs/releases/RELEASE_PROCESS.md`](releases/RELEASE_PROCESS.md)**.

In short:

1. `package.json.version` is the only version source; bump it and `CHANGELOG.md` together.
2. Push to `main` and let `CI` + `QA — Main Branch Integration` pass.
3. Push the approved `v<version>` tag. `.github/workflows/release.yml` builds Linux (AppImage/deb/rpm) and Windows (NSIS setup/portable zip), verifies every artifact, and publishes the GitHub Release.
4. The app updates itself from that release (`latest-linux.yml`, `latest.yml`, `SHA256SUMS.txt`).
