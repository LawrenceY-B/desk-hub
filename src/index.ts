import { createAggregator } from '@/aggregator/aggregator.js';
import { connectDb, disconnectDb } from '@/config/db.js';
import { env } from '@/config/env.js';
import { createF1Provider } from '@/providers/f1.provider.js';

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

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  // Stop first: an in-flight fetch still needs Mongo to save its result.
  await aggregator.stop();
  await disconnectDb();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
