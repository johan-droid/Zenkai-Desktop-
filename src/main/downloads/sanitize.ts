// T8 step 4: filename sanitizer — strip /\:*?"<>|, max 200 chars, no "..".
// Electron-free so it unit-tests without mocks.
const ILLEGAL = /[\/\\:*?"<>|]/g;

export function sanitizeFilename(raw: string): string {
  let name = (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, ""); // control chars
  name = name.replace(ILLEGAL, "_");
  name = name.replace(/\s+/g, " ").trim();
  // empty or all-dots (".", "..") would resolve to a directory, not a file
  if (!name || /^\.+$/.test(name)) return "download";
  name = name.replace(/\.\./g, "_"); // no ".." → no path traversal
  if (name.length > 200) name = name.slice(0, 200).trimEnd();
  if (!name) name = "download"; // truncation edge
  return name;
}
