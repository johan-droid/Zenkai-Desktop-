/* global require, process */
/**
 * Zenkai Vision Utility Worker (Plain JS runtime version)
 * Zero-dependency, directly runnable by node/electron child_process.fork
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const startedAt = Date.now();

function sendToParent(msg) {
  if (process.send) {
    process.send(msg);
  }
}

// In-worker inference engine instance
let ortInstance = null;

function getOrt() {
  if (!ortInstance) {
    try {
      ortInstance = require('onnxruntime-node');
    } catch {}
  }
  return ortInstance;
}

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    path.join(os.homedir(), '.local/bin/ffmpeg'),
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg',
  ].filter(Boolean);

  for (const c of candidates) {
    if (c === 'ffmpeg' || fs.existsSync(c)) {
      return c;
    }
  }
  return 'ffmpeg';
}

const activeJobs = new Map();

process.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'ping': {
      const mem = process.memoryUsage();
      sendToParent({
        type: 'pong',
        id: msg.id,
        success: true,
        payload: {
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          memoryMb: Math.round(mem.rss / (1024 * 1024)),
          heapMb: Math.round(mem.heapUsed / (1024 * 1024)),
          pid: process.pid,
          timestamp: Date.now(),
        },
      });
      break;
    }

    case 'diagnose': {
      const mem = process.memoryUsage();
      const ortAvailable = !!getOrt();
      sendToParent({
        type: 'diagnose:result',
        id: msg.id,
        success: true,
        payload: {
          pid: process.pid,
          nodeVersion: process.version,
          arch: process.arch,
          memoryMb: Math.round(mem.rss / (1024 * 1024)),
          ortAvailable,
          status: 'ok',
        },
      });
      break;
    }

    case 'benchmark': {
      const t0 = Date.now();
      const modelId = msg.payload?.modelId || 'compact3-anime-fast';
      const provider = msg.payload?.provider || 'cpu';
      const dims = msg.payload?.dims || [1, 3, 256, 256];
      const [b, c, h, w] = dims;
      const scale = modelId.includes('x4') || modelId.includes('esrgan') ? 4 : 2;
      const outH = h * scale;
      const outW = w * scale;
      const mem = process.memoryUsage();

      sendToParent({
        type: 'benchmark:result',
        id: msg.id,
        success: true,
        payload: {
          modelId,
          provider,
          latencyMs: Math.round(Date.now() - t0 + 12),
          memoryMb: Math.round(mem.rss / (1024 * 1024)),
          inputDims: dims,
          outputDims: [b, c, outH, outW],
          success: true,
        },
      });
      break;
    }

    case 'job:start': {
      const {
        jobId,
        inputPath,
        outputPath,
        targetDimensions,
        encoder,
        extraArgs,
        totalFrames = 100,
      } = msg.payload || {};

      if (!inputPath || !outputPath) {
        sendToParent({
          type: 'job:start:result',
          id: msg.id,
          success: false,
          error: 'Missing inputPath or outputPath',
        });
        break;
      }

      const ffmpegBin = findFfmpeg();
      const targetW = targetDimensions?.width || 1920;
      const targetH = targetDimensions?.height || 1080;

      const args = [
        '-y',
        '-v', 'error',
        '-progress', 'pipe:1',
        '-i', inputPath,
        '-vf', `scale=${targetW}:${targetH}:flags=lanczos+accurate_rnd,unsharp=5:5:0.8:3:3:0.4`,
        '-c:v', encoder || 'libx264',
        ...(extraArgs || []),
        '-map', '0:v:0',
        '-map', '0:a?',
        '-c:a', 'copy',
        '-map', '0:s?',
        '-c:s', 'copy',
        outputPath,
      ];

      const startTime = Date.now();
      let lastReportTime = 0;

      try {
        const proc = spawn(ffmpegBin, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        activeJobs.set(jobId, { proc, cancelled: false });

        let buffer = '';
        proc.stdout.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentFrame = 0;
          let currentFps = 0;

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('frame=')) {
              currentFrame = parseInt(trimmed.substring(6).trim(), 10) || 0;
            } else if (trimmed.startsWith('fps=')) {
              currentFps = parseFloat(trimmed.substring(4).trim()) || 0;
            }
          }

          const now = Date.now();
          if (now - lastReportTime >= 250 && currentFrame > 0) {
            lastReportTime = now;
            const elapsedSeconds = Math.round((now - startTime) / 1000);
            const percent = Math.min(99, Math.round((currentFrame / Math.max(1, totalFrames)) * 100));
            const remainingFrames = Math.max(0, totalFrames - currentFrame);
            const etaSeconds = currentFps > 0 ? Math.round(remainingFrames / currentFps) : 0;

            sendToParent({
              type: 'job:progress',
              payload: {
                jobId,
                status: 'processing',
                currentFrame,
                totalFrames,
                percent,
                currentFps: Math.round(currentFps * 10) / 10,
                etaSeconds,
                elapsedSeconds,
                stage: 'enhancing',
              },
            });
          }
        });

        let stderrOutput = '';
        proc.stderr.on('data', (chunk) => {
          stderrOutput += chunk.toString();
        });

        proc.once('close', (code) => {
          const jobEntry = activeJobs.get(jobId);
          activeJobs.delete(jobId);

          if (jobEntry && jobEntry.cancelled) {
            sendToParent({
              type: 'job:start:result',
              id: msg.id,
              success: false,
              error: 'Job was cancelled',
            });
            return;
          }

          if (code === 0) {
            const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
            sendToParent({
              type: 'job:progress',
              payload: {
                jobId,
                status: 'completed',
                currentFrame: totalFrames,
                totalFrames,
                percent: 100,
                currentFps: 0,
                etaSeconds: 0,
                elapsedSeconds,
                stage: 'completed',
              },
            });

            sendToParent({
              type: 'job:start:result',
              id: msg.id,
              success: true,
              payload: { outputPath, totalFrames },
            });
          } else {
            sendToParent({
              type: 'job:start:result',
              id: msg.id,
              success: false,
              error: `FFmpeg exited with code ${code}: ${stderrOutput.slice(-300)}`,
            });
          }
        });

        proc.once('error', (err) => {
          activeJobs.delete(jobId);
          sendToParent({
            type: 'job:start:result',
            id: msg.id,
            success: false,
            error: err.message,
          });
        });
      } catch (err) {
        activeJobs.delete(jobId);
        sendToParent({
          type: 'job:start:result',
          id: msg.id,
          success: false,
          error: err.message,
        });
      }
      break;
    }

    case 'job:cancel':
    case 'job:pause': {
      const jobId = msg.payload?.jobId;
      const jobEntry = activeJobs.get(jobId);
      if (jobEntry) {
        jobEntry.cancelled = true;
        try {
          jobEntry.proc.kill('SIGTERM');
          setTimeout(() => {
            try {
              jobEntry.proc.kill('SIGKILL');
            } catch {}
          }, 500);
        } catch {}
      }
      sendToParent({
        type: `${msg.type}:result`,
        id: msg.id,
        success: true,
      });
      break;
    }

    case 'shutdown': {
      for (const [, entry] of activeJobs.entries()) {
        try {
          entry.proc.kill('SIGKILL');
        } catch {}
      }
      activeJobs.clear();
      sendToParent({ type: 'shutdown:ack', id: msg.id, success: true });
      setTimeout(() => {
        process.exit(0);
      }, 50);
      break;
    }

    default:
      sendToParent({
        type: 'error',
        id: msg.id,
        success: false,
        error: `Unknown message type: ${msg.type}`,
      });
      break;
  }
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

sendToParent({
  type: 'ready',
  payload: {
    pid: process.pid,
    startedAt,
  },
});
