import { describe, expect, it } from 'vitest';
import { runVisionDiagnostics } from '../../src/main/vision/diagnostics';

describe('Vision Diagnostics Engine', () => {
  it('executes diagnostics suite and generates structured report', async () => {
    const report = await runVisionDiagnostics();

    expect(report.timestamp).toBeTypeOf('number');
    expect(report.passed).toBeTypeOf('boolean');
    expect(report.hardware).toBeDefined();
    expect(report.hardware.devices.length).toBeGreaterThan(0);
    expect(report.hardware.providers.length).toBeGreaterThan(0);
    expect(report.hardware.profile).toBeDefined();

    // Verify all 5 check items are present
    const checkNames = report.checks.map((c) => c.name);
    expect(checkNames).toContain('GPU Device Discovery');
    expect(checkNames).toContain('Hardware Compute Backends');
    expect(checkNames).toContain('Media Pipeline (FFmpeg)');
    expect(checkNames).toContain('Isolated Vision Worker');
    expect(checkNames).toContain('Capability Profile Qualification');

    // Verify benchmark and recommendations
    expect(report.benchmark).toBeDefined();
    expect(Array.isArray(report.recommendations)).toBe(true);
  });
});
