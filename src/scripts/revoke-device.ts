import { connectDb, disconnectDb } from '@/config/db.js';
import { revokeDevice } from '@/services/device.service.js';

const idOrName = process.argv.slice(2).join(' ').trim();
if (!idOrName) {
  console.error('Usage: npm run device:revoke -- <device id or exact name>   (see npm run device:list)');
  process.exit(1);
}

await connectDb();
try {
  const device = await revokeDevice(idOrName, new Date());
  console.log(`\nRevoked "${device.name}" (${device.id}).`);
  console.log('Its key no longer connects, and a running server disconnects it within 30 seconds.');
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
