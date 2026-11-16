#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== Zenkai Desktop: QA Registry & Traceability Validator ===\n');

const featuresPath = path.join(rootDir, 'qa/registry/features.json');
const componentsPath = path.join(rootDir, 'qa/registry/components.json');
const gatesPath = path.join(rootDir, 'qa/registry/gates.json');

const errors = [];
const warnings = [];

// 1. Load files
function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing mandatory registry file: ${label} (${filePath})`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    errors.push(`Corrupt JSON in ${label}: ${err.message}`);
    return null;
  }
}

const features = loadJson(featuresPath, 'features.json');
const components = loadJson(componentsPath, 'components.json');
const gates = loadJson(gatesPath, 'gates.json');

if (!features || !components || !gates) {
  console.error('Fatal: Could not load all registry files.');
  process.exit(1);
}

console.log(`Loaded ${features.length} features, ${components.length} components, and ${gates.length} gates.`);

// 2. Validate counts
if (features.length < 38) {
  errors.push(`Discovered features count mismatch: expected at least 38, found ${features.length}`);
}
if (components.length < 50) {
  errors.push(`Discovered components count mismatch: expected at least 50, found ${components.length}`);
}
if (gates.length < 20) {
  errors.push(`Acceptance gates count mismatch: expected at least 20, found ${gates.length}`);
}

const gateIds = new Set(gates.map((g) => g.id));

// 3. Validate Features
for (const feat of features) {
  if (!feat.id) errors.push(`Feature entry missing ID: ${JSON.stringify(feat)}`);
  if (!feat.name) errors.push(`Feature ${feat.id} missing name`);
  if (!feat.testFile) {
    errors.push(`Feature ${feat.id} has no test mapping`);
  } else {
    const fullTestPath = path.join(rootDir, feat.testFile);
    if (!fs.existsSync(fullTestPath)) {
      errors.push(`Feature ${feat.id} references non-existent test file: ${feat.testFile}`);
    }
  }
  if (!feat.acceptanceGate || !gateIds.has(feat.acceptanceGate)) {
    errors.push(`Feature ${feat.id} references invalid gate: ${feat.acceptanceGate}`);
  }
  if (!feat.evidenceLocation) {
    errors.push(`Feature ${feat.id} missing evidence location`);
  } else {
    const fullEvidencePath = path.join(rootDir, feat.evidenceLocation);
    if (!fs.existsSync(fullEvidencePath)) {
      errors.push(`Feature ${feat.id} references non-existent evidence: ${feat.evidenceLocation}`);
    }
  }
}

// 4. Validate Components
for (const comp of components) {
  if (!comp.id) errors.push(`Component entry missing ID: ${JSON.stringify(comp)}`);
  if (!comp.selector) errors.push(`Component ${comp.id} missing selector`);
  if (!comp.testFile) {
    errors.push(`Component ${comp.id} has no test mapping`);
  } else {
    const fullTestPath = path.join(rootDir, comp.testFile);
    if (!fs.existsSync(fullTestPath)) {
      errors.push(`Component ${comp.id} references non-existent test file: ${comp.testFile}`);
    }
  }
  if (!comp.gate || !gateIds.has(comp.gate)) {
    errors.push(`Component ${comp.id} references invalid gate: ${comp.gate}`);
  }
}

// 5. Validate Gates
for (const gate of gates) {
  if (!gate.id) errors.push(`Gate entry missing ID: ${JSON.stringify(gate)}`);
  if (!gate.mandatoryCriteria || gate.mandatoryCriteria.length === 0) {
    errors.push(`Gate ${gate.id} has no mandatory criteria`);
  }
  if (!gate.testFiles || gate.testFiles.length === 0) {
    errors.push(`Gate ${gate.id} has no test files configured`);
  } else {
    for (const tf of gate.testFiles) {
      const fullTestPath = path.join(rootDir, tf);
      if (!fs.existsSync(fullTestPath)) {
        errors.push(`Gate ${gate.id} references non-existent test file: ${tf}`);
      }
    }
  }
  if (!gate.gateFile) {
    errors.push(`Gate ${gate.id} missing gateFile reference`);
  } else {
    const fullGatePath = path.join(rootDir, gate.gateFile);
    if (!fs.existsSync(fullGatePath)) {
      errors.push(`Gate ${gate.id} references non-existent gate document: ${gate.gateFile}`);
    }
  }
  if (!gate.mandatoryEvidence) {
    errors.push(`Gate ${gate.id} missing mandatoryEvidence`);
  } else {
    const fullEvidencePath = path.join(rootDir, gate.mandatoryEvidence);
    if (!fs.existsSync(fullEvidencePath)) {
      errors.push(`Gate ${gate.id} references non-existent evidence: ${gate.mandatoryEvidence}`);
    }
  }
}

// 6. Summary Output
console.log('--- Registry Traceability Validation Summary ---');
console.log(`Features validated:   ${features.length} / 38`);
console.log(`Components validated: ${components.length} / 50`);
console.log(`Gates validated:      ${gates.length} / 20`);

if (warnings.length > 0) {
  console.warn(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) {
    console.warn(`  [WARN] ${w}`);
  }
}

if (errors.length > 0) {
  console.error(`\nValidation FAILED with ${errors.length} error(s):`);
  for (const err of errors) {
    console.error(`  [FAIL] ${err}`);
  }
  process.exit(1);
}

console.log('\n✓ PASS: All features, components, tests, and acceptance gates are 100% traceable and valid.');
process.exit(0);

