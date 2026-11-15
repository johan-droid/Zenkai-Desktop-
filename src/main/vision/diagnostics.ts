import type {
  DiagnosticCheckItem,
  VisionDiagnosticsReport,
} from '../../shared/vision-types';
import { getCompleteHardwareProfile } from './qualification';
import { visionWorker } from './worker-manager';

/**
 * Runs the comprehensive 10-step Zenkai Vision diagnostics suite.
 */
export async function runVisionDiagnostics(): Promise<VisionDiagnosticsReport> {
  const hardware = getCompleteHardwareProfile();
  const checks: DiagnosticCheckItem[] = [];
  const recommendations: string[] = [];

  // 1. GPU Device Check
  const primaryGpu = hardware.selectedDevice;
  if (!primaryGpu || primaryGpu.type === 'virtual') {
    checks.push({
      name: 'GPU Device Discovery',
      status: 'warn',
      detail: primaryGpu
        ? `Virtual / Software adapter: ${primaryGpu.model}`
        : 'No physical GPU detected. Using CPU software fallback.',
    });
    recommendations.push('A dedicated NVIDIA, AMD, or Intel GPU is recommended for optimal video enhancement.');
  } else {
    checks.push({
      name: 'GPU Device Discovery',
      status: 'pass',
      detail: `${primaryGpu.vendor.toUpperCase()} - ${primaryGpu.model} (${primaryGpu.type.toUpperCase()})`,
    });
  }

  // 2. Compute Backend / Providers Check
  const availableProviders = hardware.providers.filter((p) => p.available);
  if (availableProviders.length <= 1) {
    // Only CPU available
    checks.push({
      name: 'Hardware Compute Backends',
      status: 'warn',
      detail: 'Only CPU execution provider is currently available.',
    });
    recommendations.push('Install GPU vendor graphics drivers to unlock hardware acceleration.');
  } else {
    const names = availableProviders.map((p) => p.provider.toUpperCase()).join(', ');
    checks.push({
      name: 'Hardware Compute Backends',
      status: 'pass',
      detail: `Supported providers: ${names}`,
    });
  }

  // 3. Media Processing Engine (FFmpeg)
  if (hardware.mediaBackend.ffmpegPath) {
    const hwList = hardware.mediaBackend.hwaccels.length > 0
      ? hardware.mediaBackend.hwaccels.join(', ')
      : 'software only';
    checks.push({
      name: 'Media Pipeline (FFmpeg)',
      status: 'pass',
      detail: `FFmpeg ${hardware.mediaBackend.ffmpegVersion || 'detected'} (Accels: ${hwList})`,
    });
  } else {
    checks.push({
      name: 'Media Pipeline (FFmpeg)',
      status: 'warn',
      detail: 'FFmpeg binary was not found in system paths. Offline export will require bundled fallback.',
    });
    recommendations.push('Ensure FFmpeg is installed or bundled in app resources for local video processing.');
  }

  // 4. Isolated Worker Process Lifecycle & IPC Check
  let workerBenchmark: { smallInferenceMs?: number; memoryUsageMb?: number; status: 'ok' | 'failed' | 'skipped'; error?: string } = {
    status: 'skipped',
  };

  try {
    const startRes = await visionWorker.start();
    if (startRes.success) {
      const pingRes = await visionWorker.ping();
      checks.push({
        name: 'Isolated Vision Worker',
        status: 'pass',
        detail: `Worker active (PID: ${startRes.pid}, IPC latency: ${pingRes.latencyMs}ms, Memory: ${pingRes.memoryMb}MB)`,
      });
      workerBenchmark = {
        smallInferenceMs: pingRes.latencyMs,
        memoryUsageMb: pingRes.memoryMb,
        status: 'ok',
      };
    } else {
      checks.push({
        name: 'Isolated Vision Worker',
        status: 'warn',
        detail: `Worker start delayed: ${startRes.message || 'Unknown reason'}`,
      });
      workerBenchmark = {
        status: 'failed',
        error: startRes.message,
      };
    }
  } catch (err: any) {
    checks.push({
      name: 'Isolated Vision Worker',
      status: 'warn',
      detail: `Worker communication warning: ${err?.message || 'Unresponsive'}`,
    });
    workerBenchmark = {
      status: 'failed',
      error: err?.message,
    };
  }

  // 5. Capability Profile Assignment Check
  const prof = hardware.profile;
  checks.push({
    name: 'Capability Profile Qualification',
    status: prof.profile === 'unsupported' ? 'fail' : 'pass',
    detail: `Assigned Profile: ${prof.profile.toUpperCase()} (Max: ${prof.maxTargetResolution.toUpperCase()}, Budget: ${prof.memoryBudgetMb}MB)`,
  });

  if (prof.limitations.length > 0) {
    recommendations.push(...prof.limitations);
  }

  const passed = !checks.some((c) => c.status === 'fail');

  return {
    timestamp: Date.now(),
    passed,
    hardware,
    checks,
    benchmark: workerBenchmark,
    recommendations: Array.from(new Set(recommendations)),
  };
}

