import mongoose from 'mongoose';
import { env } from '@/config/env.js';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    console.error('Could not connect to MongoDB. Is it running? Try: docker compose up -d');
    throw err;
  }

  // stderr: the MCP server shares this, and over stdio stdout is the protocol channel.
  console.error(`Connected to MongoDB (${mongoose.connection.name})`);
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
