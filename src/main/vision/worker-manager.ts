import { fork, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { VisionWorkerStatus } from '../../shared/vision-types';

export class VisionWorkerManager {
  private worker: ChildProcess | null = null;
  private state: VisionWorkerStatus['state'] = 'idle';
  private startedAt: number | null = null;
  private crashTimestamps: number[] = [];
  private lastError?: string;
  private lastHeartbeat?: number;
  private listeners: Set<(status: VisionWorkerStatus) => void> = new Set();
  private pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }> = new Map();

  constructor() {
    // Bind process cleanup
    process.once('exit', () => this.forceKill());
  }

  public getStatus(): VisionWorkerStatus {
    return {
      state: this.state,
      pid: this.worker?.pid,
      uptimeSeconds: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : undefined,
      crashCount: this.crashTimestamps.length,
      lastError: this.lastError,
      lastHeartbeat: this.lastHeartbeat,
    };
  }

  public onStatusChange(cb: (status: VisionWorkerStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emitStatus() {
    const s = this.getStatus();
    for (const l of this.listeners) {
      try {
        l(s);
      } catch {}
    }
  }

  /**
   * Resolves the path to the worker executable script.
   */
  private resolveWorkerPath(): string {
    const candidates = [
      path.join(__dirname, 'vision-worker.js'),
      path.join(__dirname, 'worker/vision-worker.js'),
      path.join(__dirname, 'vision/worker/vision-worker.js'),
      path.resolve(__dirname, '../../src/main/vision/worker/vision-worker.js'),
      path.resolve(process.cwd(), 'src/main/vision/worker/vision-worker.js'),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }

    throw new Error('Could not locate vision-worker.js runtime script');
  }

  /**
   * Spawns the isolated background worker process.
   */
  public async start(): Promise<{ success: boolean; pid?: number; message?: string }> {
    if (this.state === 'running' && this.worker) {
      return { success: true, pid: this.worker.pid };
    }

    // Clean old crashes older than 60 seconds
    const now = Date.now();
    this.crashTimestamps = this.crashTimestamps.filter((t) => now - t < 60000);

    // Prevent rapid restart loops
    if (this.crashTimestamps.length >= 3) {
      this.state = 'crashed';
      this.lastError = 'Worker crashed repeatedly (>3 times in 60s). Auto-restart suspended.';
      this.emitStatus();
      return {
        success: false,
        message: this.lastError,
      };
    }

    this.state = 'starting';
    this.emitStatus();

    try {
      const scriptPath = this.resolveWorkerPath();

      const child = fork(scriptPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      });

      this.worker = child;

      // Setup IPC message router
      child.on('message', (msg: any) => {
        if (!msg || typeof msg !== 'object') return;

        if (msg.id && this.pendingRequests.has(msg.id)) {
          const req = this.pendingRequests.get(msg.id)!;
          clearTimeout(req.timer);
          this.pendingRequests.delete(msg.id);
          if (msg.success) {
            req.resolve(msg.payload);
          } else {
            req.reject(new Error(msg.error || 'Worker request failed'));
          }
        }

        if (msg.type === 'ready') {
          this.state = 'running';
          this.startedAt = Date.now();
          this.lastHeartbeat = Date.now();
          this.lastError = undefined;
          this.emitStatus();
        }
      });

      // Handle worker process exit
      child.once('exit', (code, signal) => {
        const wasIntentional = this.state === 'stopping' || this.state === 'stopped';
        this.worker = null;
        this.startedAt = null;

        if (wasIntentional) {
          this.state = 'stopped';
          this.emitStatus();
        } else {
          this.crashTimestamps.push(Date.now());
          this.state = 'crashed';
          this.lastError = `Worker process terminated unexpectedly (code: ${code}, signal: ${signal})`;
          this.emitStatus();
        }

        // Reject any pending requests
        for (const [id, req] of this.pendingRequests.entries()) {
          clearTimeout(req.timer);
          req.reject(new Error(this.lastError || 'Worker process terminated'));
          this.pendingRequests.delete(id);
        }
      });

      // Wait up to 3000ms for ready signal
      return await new Promise((resolve) => {
        const checkReady = setInterval(() => {
          if (this.state === 'running' && child.pid) {
            clearInterval(checkReady);
            resolve({ success: true, pid: child.pid });
          }
        }, 50);

        setTimeout(() => {
          clearInterval(checkReady);
          if (this.state === 'running' && child.pid) {
            resolve({ success: true, pid: child.pid });
          } else if (child.pid) {
            // Started, assume running
            this.state = 'running';
            this.startedAt = Date.now();
            this.emitStatus();
            resolve({ success: true, pid: child.pid });
          } else {
            resolve({ success: false, message: 'Worker failed to respond within timeout' });
          }
        }, 3000);
      });
    } catch (err: any) {
      this.state = 'stopped';
      this.lastError = err?.message || 'Failed to fork worker process';
      this.emitStatus();
      return { success: false, message: this.lastError };
    }
  }

  /**
   * Sends a request to the worker and awaits its typed response.
   */
  public async request<T = any>(type: string, payload?: any, timeoutMs = 5000): Promise<T> {
    if (!this.worker || this.state !== 'running') {
      throw new Error(`Worker is not running (state: ${this.state})`);
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Worker request timed out after ${timeoutMs}ms (${type})`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.worker!.send({ type, id, payload });
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Pings the worker to measure IPC roundtrip latency and resource metrics.
   */
  public async ping(): Promise<{ latencyMs: number; memoryMb: number; uptimeSeconds: number }> {
    const t0 = Date.now();
    const res = await this.request('ping', {}, 2000);
    const latencyMs = Date.now() - t0;
    this.lastHeartbeat = Date.now();
    return {
      latencyMs,
      memoryMb: res.memoryMb || 0,
      uptimeSeconds: res.uptimeSeconds || 0,
    };
  }

  /**
   * Gracefully shuts down the worker process.
   */
  public async stop(): Promise<{ success: boolean }> {
    if (!this.worker || this.state === 'stopped') {
      this.state = 'stopped';
      this.emitStatus();
      return { success: true };
    }

    this.state = 'stopping';
    this.emitStatus();

    try {
      await this.request('shutdown', {}, 1500).catch(() => {});
    } catch {}

    // Force kill if still lingering
    this.forceKill();

    this.state = 'stopped';
    this.worker = null;
    this.startedAt = null;
    this.emitStatus();
    return { success: true };
  }

  /**
   * Forcefully kills the worker process.
   */
  public forceKill(): void {
    if (this.worker) {
      try {
        this.worker.kill('SIGKILL');
      } catch {}
      this.worker = null;
    }
  }
}

// Global singleton instance
export const visionWorker = new VisionWorkerManager();
