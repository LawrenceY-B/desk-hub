import { connectDb, disconnectDb } from '@/config/db.js';
import { env } from '@/config/env.js';

console.log(`Desk Hub backend starting (${env.NODE_ENV}, port ${env.PORT})`);

await connectDb();

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  await disconnectDb();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
