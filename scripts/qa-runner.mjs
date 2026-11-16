#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===========================================================');
console.log('       Zenkai Desktop — Comprehensive QA Release Gate       ');
console.log('===========================================================\n');

const steps = [
  { name: '1. QA Doctor Prerequisites', command: 'node scripts/qa-doctor.mjs' },
  { name: '2. Machine-Readable Traceability', command: 'node scripts/validate-qa-registry.mjs' },
  { name: '3. Static Type Verification', command: 'pnpm typecheck' },
  { name: '4. Code Quality & Linting', command: 'pnpm lint' },
  { name: '5. Unit & Subsystem Test Suite', command: 'pnpm test' },
  { name: '6. Playwright Electron E2E & Workflows', command: 'env -u ELECTRON_RUN_AS_NODE xvfb-run -a pnpm e2e' },
  { name: '7. QA Report & Release Readiness Generation', command: 'node scripts/generate-qa-report.mjs' },
];

const results = [];
let overallPass = true;

const startTime = Date.now();

for (const step of steps) {
  process.stdout.write(`Executing: ${step.name}... `);
  const stepStart = Date.now();
  try {
    execSync(step.command, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env },
    });
    const duration = ((Date.now() - stepStart) / 1000).toFixed(1);
    console.log(`✓ PASSED (${duration}s)`);
    results.push({ ...step, status: 'PASS', duration: `${duration}s` });
  } catch (err) {
    const duration = ((Date.now() - stepStart) / 1000).toFixed(1);
    console.log(`✗ FAILED (${duration}s)`);
    console.error(`\n--- Error in ${step.name} ---\n`);
    if (err.stdout) console.error(err.stdout.toString().slice(-2000));
    if (err.stderr) console.error(err.stderr.toString().slice(-2000));
    results.push({ ...step, status: 'FAIL', duration: `${duration}s`, error: err.message });
    overallPass = false;
    break;
  }
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('\n===========================================================');
console.log(`QA Release Gate Completed in ${totalDuration}s`);
console.log('===========================================================');
for (const r of results) {
  const badge = r.status === 'PASS' ? '✓ PASS' : '✗ FAIL';
  console.log(`- ${r.name.padEnd(45)} [${badge}] (${r.duration})`);
}

if (!overallPass) {
  console.error('\nRelease Gate FAILED. Application is NOT eligible for release.');
  process.exit(1);
} else {
  console.log('\n✓ Release Gate PASSED. All mandatory quality invariants satisfied.');
  process.exit(0);
}

