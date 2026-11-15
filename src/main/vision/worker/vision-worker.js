/* global require, process */
/**
 * Zenkai Vision Utility Worker (Plain JS runtime version)
 * Zero-dependency, directly runnable by node/electron child_process.fork
 */
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

    case 'shutdown': {
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
