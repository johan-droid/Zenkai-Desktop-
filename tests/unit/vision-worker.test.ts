import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VisionWorkerManager } from '../../src/main/vision/worker-manager';

describe('Vision Worker Process Lifecycle & Fault Tolerance', () => {
  let manager: VisionWorkerManager;

  beforeEach(() => {
    manager = new VisionWorkerManager();
  });

  afterEach(async () => {
    await manager.stop();
  });

  it('starts in idle state', () => {
    const status = manager.getStatus();
    expect(status.state).toBe('idle');
    expect(status.pid).toBeUndefined();
    expect(status.crashCount).toBe(0);
  });

  it('spawns worker process and reports running with valid PID', async () => {
    const res = await manager.start();
    expect(res.success).toBe(true);
    expect(res.pid).toBeTypeOf('number');

    const status = manager.getStatus();
    expect(status.state).toBe('running');
    expect(status.pid).toBe(res.pid);
  });

  it('responds to IPC ping with latency, memory, and uptime metrics', async () => {
    await manager.start();
    const ping = await manager.ping();

    expect(ping.latencyMs).toBeGreaterThanOrEqual(0);
    expect(ping.memoryMb).toBeGreaterThan(0);
    expect(ping.uptimeSeconds).toBeGreaterThanOrEqual(0);

    const status = manager.getStatus();
    expect(status.lastHeartbeat).toBeTypeOf('number');
  });

  it('handles graceful shutdown and transitions to stopped state', async () => {
    await manager.start();
    const stopRes = await manager.stop();
    expect(stopRes.success).toBe(true);

    const status = manager.getStatus();
    expect(status.state).toBe('stopped');
    expect(status.pid).toBeUndefined();
  });

  it('isolates worker crash, records crash count, and transitions to crashed state', async () => {
    await manager.start();
    const statusBefore = manager.getStatus();
    expect(statusBefore.state).toBe('running');

    // Forcibly kill worker process externally
    manager.forceKill();

    // Allow event loop to process exit event
    await new Promise((r) => setTimeout(r, 100));

    const statusAfter = manager.getStatus();
    expect(statusAfter.state).toBe('crashed');
    expect(statusAfter.crashCount).toBe(1);
    expect(statusAfter.lastError).toMatch(/terminated unexpectedly/i);
  });
});
