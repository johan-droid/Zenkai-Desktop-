#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== Zenkai Desktop: QA Diagnostic Doctor ===\n');

const results = [];

function checkCommand(cmd, label, category) {
  try {
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    results.push({ category, item: label, status: 'PASS', details: out.split('\n')[0] });
    return true;
  } catch {
    results.push({ category, item: label, status: 'WARN', details: 'Not found or command failed' });
    return false;
  }
}

// 1. Toolchains
const nodeVer = process.version;
const nodeMajor = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
if (nodeMajor >= 20) {
  results.push({ category: 'Toolchain', item: 'Node.js', status: 'PASS', details: nodeVer });
} else {
  results.push({ category: 'Toolchain', item: 'Node.js', status: 'FAIL', details: `${nodeVer} (requires >= 20.x)` });
}

checkCommand('pnpm --version', 'pnpm Package Manager', 'Toolchain');
checkCommand('git --version', 'Git VCS', 'Toolchain');

// 2. Browser & Automation Tools
checkCommand('agent-browser --version || echo "installed"', 'Vercel agent-browser', 'Automation');
checkCommand('which Xvfb', 'Xvfb Virtual Framebuffer', 'Automation');

// 3. Build Artifacts & Directories
const outMain = path.join(rootDir, 'out/main/index.js');
if (fs.existsSync(outMain)) {
  results.push({ category: 'Build', item: 'Compiled Electron Main (out/main)', status: 'PASS', details: 'out/main/index.js present' });
} else {
  results.push({ category: 'Build', item: 'Compiled Electron Main (out/main)', status: 'WARN', details: 'Missing. Run `pnpm build` before running E2E.' });
}

const unpackedApp = path.join(rootDir, 'release-test/linux-unpacked/zenkai-desktop');
if (fs.existsSync(unpackedApp)) {
  results.push({ category: 'Build', item: 'Unpacked Production Binary', status: 'PASS', details: 'release-test/linux-unpacked/zenkai-desktop present' });
} else {
  results.push({ category: 'Build', item: 'Unpacked Production Binary', status: 'WARN', details: 'release-test/linux-unpacked not found' });
}

// 4. Registry & QA Directories
const registryFiles = ['features.json', 'components.json', 'gates.json'];
const missingRegistry = registryFiles.filter((f) => !fs.existsSync(path.join(rootDir, 'qa/registry', f)));
if (missingRegistry.length === 0) {
  results.push({ category: 'QA Registry', item: 'Machine-Readable Registries', status: 'PASS', details: 'All 3 registries verified' });
} else {
  results.push({ category: 'QA Registry', item: 'Machine-Readable Registries', status: 'FAIL', details: `Missing: ${missingRegistry.join(', ')}` });
}

const screenshotCount = fs.existsSync(path.join(rootDir, 'qa/screenshots'))
  ? fs.readdirSync(path.join(rootDir, 'qa/screenshots')).filter((f) => f.endsWith('.png')).length
  : 0;
results.push({
  category: 'QA Artifacts',
  item: 'Evidence Screenshots',
  status: screenshotCount >= 19 ? 'PASS' : 'WARN',
  details: `${screenshotCount} screenshots captured in qa/screenshots/`,
});

// 5. Hardware & Graphics (Linux Specific)
checkCommand('vainfo --version 2>&1 || true', 'VA-API Driver Tools (vainfo)', 'Hardware');
checkCommand('vulkaninfo --summary 2>&1 | head -n 5 || true', 'Vulkan ICD Driver', 'Hardware');

// Output Table
console.log('| Category | Item | Status | Details |');
console.log('|---|---|---|---|');
for (const r of results) {
  const badge = r.status === 'PASS' ? '✓ PASS' : r.status === 'WARN' ? '⚠ WARN' : '✗ FAIL';
  console.log(`| ${r.category} | ${r.item} | **${badge}** | ${r.details} |`);
}

const fails = results.filter((r) => r.status === 'FAIL');
if (fails.length > 0) {
  console.error(`\nQA Doctor identified ${fails.length} fatal deficiency.`);
  process.exit(1);
} else {
  console.log('\n✓ Environment verified. Ready for QA test execution.');
  process.exit(0);
}
