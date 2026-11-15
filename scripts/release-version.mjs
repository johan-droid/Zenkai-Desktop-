#!/usr/bin/env node

/**
 * Zenkai Desktop — Semantic Release & Versioning Engine
 *
 * Implements Phase 1 automated version calculation from Conventional Commits:
 * - fix: / perf: -> patch release (X.Y.Z+1)
 * - feat: -> minor release (X.Y+1.0)
 * - BREAKING CHANGE: / feat!: / fix!: -> major release (X+1.0.0)
 * - docs:, test:, chore:, style:, refactor: -> no release unless overridden
 *
 * Guarantees:
 * 1. Authoritative version in package.json is updated deterministically.
 * 2. Next version is guaranteed to be strictly greater than any existing Git tag.
 * 3. Release notes are generated in GitHub-flavored markdown.
 * 4. Outputs workflow parameters for GitHub Actions steps.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options }).trim();
  } catch (err) {
    if (options.allowFail) return "";
    throw err;
  }
}

function parseSemver(v) {
  const clean = v.replace(/^v/, "").trim();
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    raw: v,
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function compareSemver(a, b) {
  const sa = typeof a === "string" ? parseSemver(a) : a;
  const sb = typeof b === "string" ? parseSemver(b) : b;
  if (!sa || !sb) return 0;
  if (sa.major !== sb.major) return sa.major - sb.major;
  if (sa.minor !== sb.minor) return sa.minor - sb.minor;
  if (sa.patch !== sb.patch) return sa.patch - sb.patch;
  if (!sa.prerelease && sb.prerelease) return 1;
  if (sa.prerelease && !sb.prerelease) return -1;
  return 0;
}

function getExistingTags() {
  const rawTags = run("git tag -l", { allowFail: true });
  if (!rawTags) return [];
  return rawTags
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => parseSemver(t) !== null)
    .sort(compareSemver);
}

function getLatestTag() {
  const tags = getExistingTags();
  return tags.length > 0 ? tags[tags.length - 1] : null;
}

function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const logFormat = "%H%x1f%s%x1f%b%x1e";
  const raw = run(`git log ${range} --format="${logFormat}"`, { allowFail: true });
  if (!raw) return [];

  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body] = record.split("\x1f");
      return {
        hash: hash?.trim() || "",
        subject: subject?.trim() || "",
        body: body?.trim() || "",
      };
    });
}

function analyzeCommits(commits) {
  let bump = null; // null | 'patch' | 'minor' | 'major'
  const features = [];
  const fixes = [];
  const performance = [];
  const breaking = [];
  const others = [];

  for (const c of commits) {
    const fullMessage = `${c.subject}\n${c.body}`;
    const isBreaking =
      /BREAKING CHANGE:/i.test(fullMessage) ||
      /^[a-z]+(\([a-z0-9_.-]+\))?!:/i.test(c.subject);

    if (isBreaking) {
      bump = "major";
      breaking.push(c);
      continue;
    }

    const match = c.subject.match(/^([a-z]+)(?:\(([a-z0-9_.-]+)\))?:\s*(.+)$/i);
    if (!match) {
      others.push(c);
      continue;
    }

    const type = match[1].toLowerCase();
    const scope = match[2];
    const desc = match[3];

    if (type === "feat") {
      if (bump !== "major") bump = "minor";
      features.push({ scope, desc, hash: c.hash });
    } else if (type === "fix") {
      if (!bump) bump = "patch";
      fixes.push({ scope, desc, hash: c.hash });
    } else if (type === "perf") {
      if (!bump) bump = "patch";
      performance.push({ scope, desc, hash: c.hash });
    } else {
      others.push({ type, scope, desc, hash: c.hash });
    }
  }

  return {
    bump,
    features,
    fixes,
    performance,
    breaking,
    others,
    hasReleaseWorthyChanges: bump !== null,
  };
}

function calculateNextVersion(currentVersionStr, bump) {
  const current = parseSemver(currentVersionStr);
  if (!current) throw new Error(`Invalid semver: ${currentVersionStr}`);

  let nextMajor = current.major;
  let nextMinor = current.minor;
  let nextPatch = current.patch;

  if (bump === "major") {
    nextMajor += 1;
    nextMinor = 0;
    nextPatch = 0;
  } else if (bump === "minor") {
    nextMinor += 1;
    nextPatch = 0;
  } else if (bump === "patch") {
    nextPatch += 1;
  }

  return `${nextMajor}.${nextMinor}.${nextPatch}`;
}

function generateReleaseNotes(version, analysis) {
  const lines = [];
  lines.push(`## Zenkai Desktop v${version}`);
  lines.push("");
  lines.push(`*Release Date: ${new Date().toISOString().split("T")[0]}*`);
  lines.push("");

  if (analysis.breaking.length > 0) {
    lines.push("### ⚠️ Breaking Changes");
    for (const c of analysis.breaking) {
      lines.push(`- ${c.subject} (${c.hash.slice(0, 7)})`);
    }
    lines.push("");
  }

  if (analysis.features.length > 0) {
    lines.push("### ✨ Features");
    for (const f of analysis.features) {
      const prefix = f.scope ? `**${f.scope}**: ` : "";
      lines.push(`- ${prefix}${f.desc} (${f.hash.slice(0, 7)})`);
    }
    lines.push("");
  }

  if (analysis.fixes.length > 0) {
    lines.push("### 🐛 Bug Fixes");
    for (const f of analysis.fixes) {
      const prefix = f.scope ? `**${f.scope}**: ` : "";
      lines.push(`- ${prefix}${f.desc} (${f.hash.slice(0, 7)})`);
    }
    lines.push("");
  }

  if (analysis.performance.length > 0) {
    lines.push("### ⚡ Performance Improvements");
    for (const p of analysis.performance) {
      const prefix = p.scope ? `**${p.scope}**: ` : "";
      lines.push(`- ${prefix}${p.desc} (${p.hash.slice(0, 7)})`);
    }
    lines.push("");
  }

  lines.push("### 📦 Distribution Packages");
  lines.push("- **Linux (x86_64)**: `Zenkai-Desktop-${version}-x86_64.AppImage`");
  lines.push("- **Windows (x64)**: `Zenkai-Desktop-Setup-${version}-x64.exe`");
  lines.push("- **Integrity**: Verified via HTTPS, SHA-256 digests in `SHA256SUMS.txt`.");
  lines.push("");

  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const packageVersion = pkg.version;
  const latestTag = getLatestTag();
  const latestTagVersion = latestTag ? latestTag.replace(/^v/, "") : "0.0.0";

  // Base version is the max of package.json and highest git tag
  const baseVersion = compareSemver(packageVersion, latestTagVersion) >= 0 ? packageVersion : latestTagVersion;
  const commits = getCommitsSinceTag(latestTag);
  const analysis = analyzeCommits(commits);

  console.log(`[release-version] Authoritative package.json version: ${packageVersion}`);
  console.log(`[release-version] Highest Git tag: ${latestTag || "(none)"}`);
  console.log(`[release-version] Base version resolved: ${baseVersion}`);
  console.log(`[release-version] Commits since ${latestTag || "inception"}: ${commits.length}`);

  if (!analysis.hasReleaseWorthyChanges) {
    console.log("[release-version] No release-worthy commits detected (only chore/docs/test or clean history).");
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `should_release=false\n`);
    }
    return;
  }

  const nextVersion = calculateNextVersion(baseVersion, analysis.bump);
  const nextTag = `v${nextVersion}`;
  const releaseNotes = generateReleaseNotes(nextVersion, analysis);

  console.log(`[release-version] Recommended bump: ${analysis.bump}`);
  console.log(`[release-version] Calculated next version: ${nextVersion} (${nextTag})`);

  if (isApply) {
    // 1. Update package.json
    pkg.version = nextVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    console.log(`[release-version] Updated ${packageJsonPath} to ${nextVersion}`);

    // 2. Write release notes to file for CI
    const notesPath = path.join(rootDir, "RELEASE_NOTES.tmp.md");
    fs.writeFileSync(notesPath, releaseNotes, "utf8");
    console.log(`[release-version] Wrote release notes to ${notesPath}`);
  }

  // Export to GitHub Actions if present
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `should_release=true\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${nextTag}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `bump=${analysis.bump}\n`);
  }

  console.log("\n--- Generated Release Notes Preview ---");
  console.log(releaseNotes);
  console.log("---------------------------------------\n");
}

main();
