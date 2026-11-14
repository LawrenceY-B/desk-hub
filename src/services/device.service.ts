import { createHash, randomBytes } from 'node:crypto';
import { DeviceModel } from '@/models/device.model.js';
import type { DeviceIdentity } from '@/types/device.js';

const KEY_PREFIX = 'dh_';
const MAX_KEY_LENGTH = 100;

export function generateDeviceKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

// A plain SHA-256 is enough here: the key is 256 random bits, not a guessable password.
export function hashDeviceKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function createDevice(name: string): Promise<{ device: DeviceIdentity; key: string }> {
  const key = generateDeviceKey();
  const doc = await DeviceModel.create({ name, keyHash: hashDeviceKey(key) });
  return { device: { id: doc.id as string, name: doc.name }, key };
}

export async function authenticateDevice(key: string): Promise<DeviceIdentity | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length > MAX_KEY_LENGTH) return null;
  const doc = await DeviceModel.findOne({ keyHash: hashDeviceKey(key) });
  return doc ? { id: doc.id as string, name: doc.name } : null;
}

export async function markDeviceSeen(id: string, at: Date): Promise<void> {
  await DeviceModel.updateOne({ _id: id }, { $set: { lastSeenAt: at.toISOString() } });
}
