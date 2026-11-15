/**
 * Zenkai Vision Isolated Utility Worker Process
 * Executes offline AI video enhancement and background tasks without blocking Electron main or renderer threads.
 */

interface WorkerMessage {
  type: 'ping' | 'diagnose' | 'shutdown';
  id?: string;
  payload?: any;
}

function sendToParent(msg: { type: string; id?: string; payload?: any; success?: boolean; error?: string }) {
  if (process.send) {
    process.send(msg);
  }
}

// Log startup
const startedAt = Date.now();

process.on('message', async (msg: WorkerMessage) => {
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
      sendToParent({
        type: 'diagnose:result',
        id: msg.id,
        success: true,
        payload: {
          pid: process.pid,
          nodeVersion: process.version,
          arch: process.arch,
          memoryMb: Math.round(mem.rss / (1024 * 1024)),
          status: 'ok',
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
        error: `Unknown message type: ${(msg as any).type}`,
      });
      break;
  }
});

// Handle graceful termination signals
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

// Notify parent that worker is ready
sendToParent({
  type: 'ready',
  payload: {
    pid: process.pid,
    startedAt,
  },
});
