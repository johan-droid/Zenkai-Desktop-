import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ModelVerificationResult } from '../../../shared/vision-models';
import { ensureModelsDir, getModelById, resolveModelPath } from './registry';

/**
 * Sanitizes a model identifier to ensure it contains only safe alphanumeric and hyphen characters.
 */
export function sanitizeModelId(id: string): string {
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`Invalid model identifier: ${id}`);
  }
  const clean = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!clean) {
    throw new Error(`Invalid model identifier: ${id}`);
  }
  return clean;
}

/**
 * Computes the SHA-256 hash of a file on disk.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Verifies the presence, file size, and cryptographic hash of an on-disk model.
 */
export async function verifyModelFile(
  modelId: string,
  customDir?: string,
): Promise<ModelVerificationResult> {
  const cleanId = sanitizeModelId(modelId);
  const manifest = getModelById(cleanId);

  if (!manifest) {
    return {
      modelId: cleanId,
      valid: false,
      exists: false,
      expectedSha256: '',
      error: `Model '${cleanId}' is not registered in the official manifest.`,
    };
  }

  const filePath = resolveModelPath(cleanId, customDir);

  if (!filePath || !fs.existsSync(filePath)) {
    return {
      modelId: cleanId,
      valid: false,
      exists: false,
      expectedSha256: manifest.sha256,
      error: `Model file '${manifest.localFileName}' is not installed locally.`,
    };
  }

  try {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return {
        modelId: cleanId,
        valid: false,
        exists: true,
        fileSizeBytes: 0,
        expectedSha256: manifest.sha256,
        error: 'Model file is empty (0 bytes).',
      };
    }

    const actualHash = await computeFileSha256(filePath);
    const matches = actualHash.toLowerCase() === manifest.sha256.toLowerCase();

    return {
      modelId: cleanId,
      valid: matches,
      exists: true,
      fileSizeBytes: stats.size,
      expectedSha256: manifest.sha256,
      actualSha256: actualHash,
      error: matches ? undefined : 'Cryptographic SHA-256 hash mismatch. File may be corrupted or tampered.',
    };
  } catch (err: any) {
    return {
      modelId: cleanId,
      valid: false,
      exists: true,
      expectedSha256: manifest.sha256,
      error: `Failed to verify model file: ${err?.message || 'Read error'}`,
    };
  }
}

/**
 * Installs a model atomically: verifies SHA-256 of temporary download, then moves into position.
 */
export async function installModelAtomically(
  modelId: string,
  tempFilePath: string,
  customDir?: string,
): Promise<ModelVerificationResult> {
  const cleanId = sanitizeModelId(modelId);
  const manifest = getModelById(cleanId);

  if (!manifest) {
    throw new Error(`Model '${cleanId}' not found in registry`);
  }

  if (!fs.existsSync(tempFilePath)) {
    throw new Error(`Temporary file '${tempFilePath}' does not exist`);
  }

  const tempHash = await computeFileSha256(tempFilePath);
  if (tempHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
    try {
      fs.unlinkSync(tempFilePath);
    } catch {}
    throw new Error(`SHA-256 hash mismatch for model '${cleanId}' (expected: ${manifest.sha256}, got: ${tempHash})`);
  }

  const targetDir = ensureModelsDir(customDir);
  const finalPath = path.join(targetDir, manifest.localFileName);

  fs.renameSync(tempFilePath, finalPath);

  return {
    modelId: cleanId,
    valid: true,
    exists: true,
    fileSizeBytes: fs.statSync(finalPath).size,
    expectedSha256: manifest.sha256,
    actualSha256: tempHash,
  };
}
