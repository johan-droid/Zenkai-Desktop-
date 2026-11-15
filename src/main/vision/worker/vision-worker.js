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

process.on('message', (msg) => {
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
