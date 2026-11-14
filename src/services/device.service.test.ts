import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { DeviceModel } from '@/models/device.model.js';
import { useTestDatabase } from '@/test/db.js';
import {
  authenticateDevice,
  createDevice,
  generateDeviceKey,
  hashDeviceKey,
  isDeviceActive,
  listDevices,
  markDeviceSeen,
  revokeDevice,
} from './device.service.js';

const AT = new Date('2026-11-14T12:00:00.000Z');

describe('device keys', () => {
  test('keys are prefixed, long and unique', () => {
    const a = generateDeviceKey();
    assert.match(a, /^dh_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, generateDeviceKey());
  });

  test('hashing is stable and does not contain the key', () => {
    const key = generateDeviceKey();
    assert.equal(hashDeviceKey(key), hashDeviceKey(key));
    assert.ok(!hashDeviceKey(key).includes(key.slice(3)));
  });
});

describe('device.service (MongoDB)', () => {
  const { isConnected, requireDb } = useTestDatabase('devices', async () => {
    await DeviceModel.syncIndexes();
  });

  beforeEach(async () => {
    if (isConnected()) await DeviceModel.deleteMany({});
  });

  test('only the hash is stored, never the key', async (t) => {
    if (!requireDb(t)) return;
    const { key } = await createDevice('Desk');
    const stored = JSON.stringify(await DeviceModel.findOne().lean());
    assert.ok(!stored.includes(key));
    assert.ok(stored.includes(hashDeviceKey(key)));
  });

  test('the right key authenticates', async (t) => {
    if (!requireDb(t)) return;
    const { key, device } = await createDevice('Desk');
    assert.deepEqual(await authenticateDevice(key), device);
  });

  test('wrong, malformed or oversized keys do not', async (t) => {
    if (!requireDb(t)) return;
    await createDevice('Desk');
    assert.equal(await authenticateDevice(generateDeviceKey()), null);
    assert.equal(await authenticateDevice('not-a-device-key'), null);
    assert.equal(await authenticateDevice(`dh_${'x'.repeat(200)}`), null);
  });

  test('markDeviceSeen records the time', async (t) => {
    if (!requireDb(t)) return;
    const { device } = await createDevice('Desk');
    await markDeviceSeen(device.id, new Date('2026-11-14T12:00:00.000Z'));
    assert.equal((await DeviceModel.findById(device.id).lean())?.lastSeenAt, '2026-11-14T12:00:00.000Z');
  });

  test('a revoked key no longer authenticates and the device is inactive', async (t) => {
    if (!requireDb(t)) return;
    const { key, device } = await createDevice('Desk');
    await revokeDevice(device.id, AT);
    assert.equal(await authenticateDevice(key), null);
    assert.equal(await isDeviceActive(device.id), false);
  });

  test('revoking by exact name works', async (t) => {
    if (!requireDb(t)) return;
    const { device } = await createDevice('Kitchen');
    assert.deepEqual(await revokeDevice('Kitchen', AT), device);
  });

  test('an ambiguous name is refused and lists the ids', async (t) => {
    if (!requireDb(t)) return;
    const a = await createDevice('Desk');
    await createDevice('Desk');
    await assert.rejects(revokeDevice('Desk', AT), (err: Error) => err.message.includes('2 devices') && err.message.includes(a.device.id));
    assert.equal(await isDeviceActive(a.device.id), true);
  });

  test('unknown or already revoked: refused', async (t) => {
    if (!requireDb(t)) return;
    const { device } = await createDevice('Desk');
    await assert.rejects(revokeDevice('Nope', AT), /No active device/);
    await revokeDevice(device.id, AT);
    await assert.rejects(revokeDevice(device.id, AT), /No active device/);
  });

  test('revoking one device leaves the others working', async (t) => {
    if (!requireDb(t)) return;
    const a = await createDevice('Desk');
    const b = await createDevice('Kitchen');
    await revokeDevice(a.device.id, AT);
    assert.deepEqual(await authenticateDevice(b.key), b.device);
  });

  test('the revoked device stays listed, with when it was revoked', async (t) => {
    if (!requireDb(t)) return;
    const { device } = await createDevice('Desk');
    await revokeDevice(device.id, AT);
    const [listed] = await listDevices();
    assert.equal(listed?.id, device.id);
    assert.equal(listed?.revokedAt, AT.toISOString());
  });
});
