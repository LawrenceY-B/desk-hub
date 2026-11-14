import { createServer } from 'node:http';
import { createAggregator } from '@/aggregator/aggregator.js';
import { connectDb, disconnectDb } from '@/config/db.js';
import { env } from '@/config/env.js';
import { createDeviceHub, DEVICE_PATH } from '@/device/device-hub.js';
import { createF1Provider } from '@/providers/f1.provider.js';
import { authenticateDevice, isDeviceActive, markDeviceSeen } from '@/services/device.service.js';

const HEARTBEAT_MS = 30_000;

console.log(`Desk Hub backend starting (${env.NODE_ENV}, port ${env.PORT})`);

await connectDb();

const aggregator = createAggregator([createF1Provider()]);
aggregator.on('section', (entry) => {
  console.log(`Section ${entry.key} updated (hash ${entry.hash}, stale ${entry.stale})`);
});
await aggregator.start();

for (const entry of aggregator.getAll()) {
  const cached = entry.data === null ? 'no cached data' : `cached from ${entry.fetchedAt}`;
  console.log(`Section ${entry.key}: ${cached}, next run ${entry.nextRunAt}`);
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end();
});

const pendingWrites = new Set<Promise<void>>();

const deviceHub = createDeviceHub(server, {
  aggregator,
  authenticate: authenticateDevice,
  isActive: isDeviceActive,
  onSeen: (device) => {
    const write = markDeviceSeen(device.id, new Date())
      .catch((err: unknown) => {
        console.error(`Could not update lastSeenAt for ${device.name}: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => pendingWrites.delete(write));
    pendingWrites.add(write);
  },
  heartbeatMs: HEARTBEAT_MS,
  now: () => new Date(),
  log: (message) => console.log(`[device] ${message}`),
});

try {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.PORT, resolve);
  });
} catch (err) {
  const inUse = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
  console.error(inUse ? `Port ${env.PORT} is already in use. Is another Desk Hub running?` : String(err));
  await deviceHub.close();
  await aggregator.stop();
  await Promise.allSettled(pendingWrites);
  await disconnectDb();
  process.exit(1);
}
console.log(`Listening on http://localhost:${env.PORT} (devices: ws://localhost:${env.PORT}${DEVICE_PATH})`);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  // Reverse of startup: devices, HTTP, aggregator (an in-flight fetch still needs Mongo), then Mongo.
  await deviceHub.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await aggregator.stop();
  await Promise.allSettled(pendingWrites);
  await disconnectDb();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
