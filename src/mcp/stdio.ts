import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { connectDb, disconnectDb } from '@/config/db.js';
import { createServer } from './server.js';

// Never console.log here: over stdio, stdout is the protocol channel.
try {
  await connectDb();
} catch {
  console.error('[mcp] MongoDB unavailable: tools will fetch live from Jolpica instead of the cache');
}

void serveStdio(() => createServer());
console.error('desk-hub MCP server running on stdio');

process.stdin.once('close', () => {
  void disconnectDb().finally(() => process.exit(0));
});
