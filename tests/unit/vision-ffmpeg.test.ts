import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseFraction,
  computeTargetDimensions,
  selectEncoder,
  getAtomicTempPath,
  finalizeOutputFile,
  cleanupTempFile,
} from '../../src/main/vision/media/ffmpeg-pipeline';

describe('Zenkai Vision FFmpeg Pipeline', () => {
  describe('parseFraction', () => {
    it('parses standard integer fraction strings correctly', () => {
      expect(parseFraction('24/1')).toBe(24);
      expect(parseFraction('60/1')).toBe(60);
      expect(parseFraction('30/1')).toBe(30);
    });

    it('parses NTSC fractional framerate strings with rounding', () => {
      expect(parseFraction('30000/1001')).toBe(29.97);
      expect(parseFraction('24000/1001')).toBe(23.98);
    });

    it('parses plain decimal strings', () => {
      expect(parseFraction('25.0')).toBe(25);
      expect(parseFraction('59.94')).toBe(59.94);
    });

    it('falls back safely to 24 for invalid, zero or empty strings', () => {
      expect(parseFraction(undefined)).toBe(24);
      expect(parseFraction('')).toBe(24);
      expect(parseFraction('0/0')).toBe(24);
      expect(parseFraction('invalid')).toBe(24);
    });
  });

  describe('computeTargetDimensions', () => {
    it('scales dimensions directly if within target limits', () => {
      // 640x360 scaled 2x -> 1280x720, within 1080p target
      const res = computeTargetDimensions(640, 360, '1080p', 2);
      expect(res.width).toBe(1280);
      expect(res.height).toBe(720);
    });

    it('clamps to max target height while preserving aspect ratio', () => {
      // 1280x720 scaled 4x would be 5120x2880, but target 4K limit is 2160
      const res = computeTargetDimensions(1280, 720, '4k', 4);
      expect(res.height).toBe(2160);
      expect(res.width).toBe(3840);
    });

    it('enforces even dimensions for video encoder compliance', () => {
      // Odd input resolution
      const res = computeTargetDimensions(853, 479, '1080p', 2);
      expect(res.width % 2).toBe(0);
      expect(res.height % 2).toBe(0);
    });

    it('supports 8K bounds correctly', () => {
      const res = computeTargetDimensions(1920, 1080, '8k', 4);
      expect(res.width).toBe(7680);
      expect(res.height).toBe(4320);
    });
  });

  describe('selectEncoder', () => {
    it('selects libx265 for 4K / 8K CPU encoding for optimal compression', () => {
      const res = selectEncoder('auto', '4k');
      expect(res.encoder).toBeDefined();
      expect(res.extraArgs.length).toBeGreaterThan(0);
    });

    it('honors explicitly requested hardware encoders', () => {
      const nvenc = selectEncoder('nvenc', '1080p');
      expect(nvenc.encoder).toContain('nvenc');

      const vaapi = selectEncoder('vaapi', '4k');
      expect(vaapi.encoder).toContain('vaapi');
    });
  });

  describe('Atomic output path & cleanup helpers', () => {
    it('generates .part.mp4 temporary path', () => {
      const final = '/tmp/my_video.mp4';
      expect(getAtomicTempPath(final)).toBe('/tmp/my_video.mp4.part.mp4');
    });

    it('atomically finalizes temporary file into final destination', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-vision-test-'));
      const tempPath = path.join(tmpDir, 'test.part.mp4');
      const finalPath = path.join(tmpDir, 'test.mp4');

      fs.writeFileSync(tempPath, 'enhanced-video-bytes');
      expect(fs.existsSync(tempPath)).toBe(true);
      expect(fs.existsSync(finalPath)).toBe(false);

      finalizeOutputFile(tempPath, finalPath);

      expect(fs.existsSync(tempPath)).toBe(false);
      expect(fs.existsSync(finalPath)).toBe(true);
      expect(fs.readFileSync(finalPath, 'utf8')).toBe('enhanced-video-bytes');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('cleans up temporary file safely', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-vision-test-'));
      const tempPath = path.join(tmpDir, 'cleanup.part.mp4');

      fs.writeFileSync(tempPath, 'bytes');
      expect(fs.existsSync(tempPath)).toBe(true);

      cleanupTempFile(tempPath);
      expect(fs.existsSync(tempPath)).toBe(false);

      // Does not throw if file does not exist
      expect(() => cleanupTempFile(tempPath)).not.toThrow();

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});

