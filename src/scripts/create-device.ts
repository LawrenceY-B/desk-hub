import { connectDb, disconnectDb } from '@/config/db.js';
import { createDevice } from '@/services/device.service.js';

const name = process.argv.slice(2).join(' ').trim();
if (!name) {
  console.error('Usage: npm run device:create -- "Desk display"');
  process.exit(1);
}

await connectDb();
const { device, key } = await createDevice(name);
await disconnectDb();

console.log(`\nCreated device "${device.name}" (${device.id})`);
console.log(`\nDevice key (shown once, only its hash is stored):\n\n  ${key}\n`);
console.log('Put it in the firmware secrets and send it as: Authorization: Bearer <key>');
