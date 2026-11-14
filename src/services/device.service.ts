import { createHash, randomBytes } from 'node:crypto';
import { DeviceModel } from '@/models/device.model.js';
import { isValidObjectId } from 'mongoose';
import type { DeviceIdentity, DeviceSummary } from '@/types/device.js';

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
  const doc = await DeviceModel.findOne({ keyHash: hashDeviceKey(key), revokedAt: null });
  return doc ? { id: doc.id as string, name: doc.name } : null;
}

export async function isDeviceActive(id: string): Promise<boolean> {
  return (await DeviceModel.exists({ _id: id, revokedAt: null })) !== null;
}

export async function listDevices(): Promise<DeviceSummary[]> {
  const docs = await DeviceModel.find().sort({ createdAt: 1 });
  return docs.map((doc) => ({
    id: doc.id as string,
    name: doc.name,
    createdAt: (doc.get('createdAt') as Date).toISOString(),
    lastSeenAt: doc.lastSeenAt,
    revokedAt: doc.revokedAt,
  }));
}

// Matches by id, or by exact name when it is unambiguous. Revoked devices are kept for the record.
export async function revokeDevice(idOrName: string, at: Date): Promise<DeviceIdentity> {
  const filter = isValidObjectId(idOrName)
    ? { $or: [{ _id: idOrName }, { name: idOrName }], revokedAt: null }
    : { name: idOrName, revokedAt: null };
  const matches = await DeviceModel.find(filter);

  if (matches.length === 0) throw new Error(`No active device matches "${idOrName}"`);
  if (matches.length > 1) {
    const ids = matches.map((d) => `${d.id as string} (${d.name})`).join(', ');
    throw new Error(`"${idOrName}" matches ${matches.length} devices, revoke by id instead: ${ids}`);
  }

  const doc = matches[0]!;
  await DeviceModel.updateOne({ _id: doc._id }, { $set: { revokedAt: at.toISOString() } });
  return { id: doc.id as string, name: doc.name };
}

export async function markDeviceSeen(id: string, at: Date): Promise<void> {
  await DeviceModel.updateOne({ _id: id }, { $set: { lastSeenAt: at.toISOString() } });
}
