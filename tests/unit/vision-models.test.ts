import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getAllModels,
  getModelById,
  resolveModelPath,
} from '../../src/main/vision/models/registry';
import {
  computeFileSha256,
  installModelAtomically,
  sanitizeModelId,
  verifyModelFile,
} from '../../src/main/vision/models/verifier';

describe('Vision Model Registry & Manifest Validation', () => {
  it('contains at least 4 qualified and licensed models', () => {
    const models = getAllModels();
    expect(models.length).toBeGreaterThanOrEqual(4);

    for (const m of models) {
      expect(m.id).toBeTypeOf('string');
      expect(m.displayName).toBeTypeOf('string');
      expect([2, 4]).toContain(m.scale);
      expect(m.supportedProviders.length).toBeGreaterThan(0);
      expect(m.minVramMb).toBeGreaterThanOrEqual(512);
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/i);
      expect(m.commercialUse).toBe(true);
      expect(['BSD-3-Clause', 'Apache-2.0', 'MIT']).toContain(m.license);
      expect(m.publisher).toBeTypeOf('string');
      expect(m.downloadUrl).toMatch(/^https:\/\//);
    }
  });

  it('retrieves specific models by id', () => {
    const esrgan = getModelById('real-esrgan-animevideo-v3');
    expect(esrgan).toBeDefined();
    expect(esrgan?.scale).toBe(4);
    expect(esrgan?.architecture).toBe('esrgan');

    const compact = getModelById('compact3-anime-fast');
    expect(compact).toBeDefined();
    expect(compact?.scale).toBe(2);
    expect(compact?.architecture).toBe('compact');
  });

  it('sanitizes model identifiers and blocks path traversal', () => {
    expect(sanitizeModelId('real-esrgan-animevideo-v3')).toBe('real-esrgan-animevideo-v3');
    expect(sanitizeModelId('  COMPACT3-anime  ')).toBe('compact3-anime');

    expect(() => sanitizeModelId('../../etc/passwd')).toThrow(/Invalid model identifier/);
    expect(() => sanitizeModelId('')).toThrow(/Invalid model identifier/);
  });
});

describe('Vision Model Integrity & Verification', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenkai-model-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('detects uninstalled models and returns proper status', async () => {
    const res = await verifyModelFile('compact3-anime-fast', tempDir);
    expect(res.valid).toBe(false);
    expect(res.exists).toBe(false);
    expect(res.error).toMatch(/not installed locally/i);
  });

  it('detects empty or corrupted files', async () => {
    const model = getModelById('compact3-anime-fast')!;
    const dummyFile = path.join(tempDir, model.localFileName);
    fs.writeFileSync(dummyFile, Buffer.alloc(0)); // 0-byte file

    const res = await verifyModelFile('compact3-anime-fast', tempDir);
    expect(res.valid).toBe(false);
    expect(res.exists).toBe(true);
    expect(res.error).toMatch(/file is empty/i);
  });

  it('verifies SHA-256 integrity and handles atomic installation', async () => {
    const testContent = Buffer.from('MODEL_TENSOR_WEIGHT_TEST_BYTES');
    const tempFile = path.join(tempDir, 'download.part');
    fs.writeFileSync(tempFile, testContent);

    const actualHash = await computeFileSha256(tempFile);
    expect(actualHash).toBeTypeOf('string');
    expect(actualHash.length).toBe(64);

    // Mock manifest with matching hash to test atomic move
    const esrgan = getModelById('real-esrgan-animevideo-v3')!;
    const originalHash = esrgan.sha256;
    (esrgan as any).sha256 = actualHash;

    try {
      const installed = await installModelAtomically('real-esrgan-animevideo-v3', tempFile, tempDir);
      expect(installed.valid).toBe(true);
      expect(installed.exists).toBe(true);
      expect(fs.existsSync(tempFile)).toBe(false); // Part file moved
      expect(fs.existsSync(path.join(tempDir, esrgan.localFileName))).toBe(true);
    } finally {
      (esrgan as any).sha256 = originalHash;
    }
  });
});

