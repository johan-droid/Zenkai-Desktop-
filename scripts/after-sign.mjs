// electron-builder afterSign hook — macOS notarization (T13).
// B4 is on the unsigned path: without APPLE_* credentials this logs and skips,
// so unsigned mac builds still package. @electron/notarize must be installed
// (devDependency) before credentials are actually provided.
export default async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn(
      "[after-sign] APPLE_* credentials missing — skipping notarization (B4 unsigned path)",
    );
    return;
  }

  const { notarize } = await import("@electron/notarize");
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
  console.log("[after-sign] notarization complete");
}
