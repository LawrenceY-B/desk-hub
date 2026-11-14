import { after, before, type TestContext } from 'node:test';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';

// Test files run in parallel, so each gets its own database to drop.
export function useTestDatabase(name: string, setup?: () => Promise<void>) {
  let connected = false;

  before(async () => {
    try {
      await mongoose.connect(env.MONGODB_URI, { dbName: `desk-hub-test-${name}`, serverSelectionTimeoutMS: 2000 });
      await setup?.();
      connected = true;
    } catch {
      connected = false;
    }
  });

  after(async () => {
    if (connected) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  return {
    isConnected: () => connected,
    requireDb(t: TestContext): boolean {
      if (!connected) t.skip('MongoDB not running (docker compose up -d)');
      return connected;
    },
  };
}
