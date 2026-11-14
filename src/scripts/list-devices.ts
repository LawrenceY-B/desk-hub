import { connectDb, disconnectDb } from '@/config/db.js';
import { listDevices } from '@/services/device.service.js';

await connectDb();
const devices = await listDevices();
await disconnectDb();

if (devices.length === 0) {
  console.log('\nNo devices yet. Create one with: npm run device:create -- "Desk display"');
} else {
  console.log('');
  for (const d of devices) {
    const status = d.revokedAt ? `REVOKED ${d.revokedAt}` : `active, last seen ${d.lastSeenAt ?? 'never'}`;
    console.log(`${d.id}  ${d.name.padEnd(24)}  ${status}`);
  }
}
