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

  console.log(`Connected to MongoDB (${mongoose.connection.name})`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
