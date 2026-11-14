import { randomBytes } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { z } from 'zod';
import type { DeviceHub, DeviceHubDeps, DeviceIdentity, ServerMessage } from '@/types/device.js';
import type { CacheEntry, SectionKey } from '@/types/section.js';
import { buildSnapshot, toSectionPayload } from './payload.js';

export const DEVICE_PATH = '/device';
const MAX_INCOMING_BYTES = 16 * 1024;
const CLOSE_REPLACED = 4000;
const CLOSE_REVOKED = 4001;
const CLOSE_GOING_AWAY = 1001;
const CLOSE_TIMEOUT_MS = 2000;

const DeviceMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ack'), seq: z.number().int().nonnegative() }),
  z.object({ type: z.literal('task.done'), taskId: z.string().min(1).max(100) }),
  z.object({ type: z.literal('jarvis.answer'), requestId: z.string().min(1).max(100), answer: z.enum(['yes', 'no']) }),
]);

interface Client {
  socket: WebSocket;
  device: DeviceIdentity;
  alive: boolean;
  lastAckSeq: number | null;
}

export function createDeviceHub(server: Server, deps: DeviceHubDeps): DeviceHub {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_INCOMING_BYTES });
  const epoch = deps.epoch ?? randomBytes(4).toString('hex');
  const clients = new Map<string, Client>();
  const lastSent = new Map<SectionKey, string>();
  let seq = 0;

  for (const entry of deps.aggregator.getAll()) lastSent.set(entry.key, sentKey(toSectionPayload(entry)));

  function send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function reject(socket: Duplex, status: string): void {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  async function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    socket.on('error', () => socket.destroy());

    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path !== DEVICE_PATH) return reject(socket, '404 Not Found');

    const key = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!key) return reject(socket, '401 Unauthorized');

    let device: DeviceIdentity | null;
    try {
      device = await deps.authenticate(key);
    } catch (err) {
      deps.log(`device auth failed: ${err instanceof Error ? err.message : String(err)}`);
      return reject(socket, '503 Service Unavailable');
    }
    if (!device) return reject(socket, '401 Unauthorized');

    const resume = req.headers['x-resume'];
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, device, typeof resume === 'string' ? resume : null));
  }

  function onConnection(socket: WebSocket, device: DeviceIdentity, resume: string | null): void {
    clients.get(device.id)?.socket.close(CLOSE_REPLACED, 'replaced by a newer connection');

    const client: Client = { socket, device, alive: true, lastAckSeq: null };
    clients.set(device.id, client);
    deps.log(`device "${device.name}" connected`);
    deps.onSeen?.(device);

    const now = deps.now();
    if (resume === `${epoch}:${seq}`) {
      send(socket, { type: 'resume', epoch, seq, generatedAt: now.toISOString() });
    } else {
      send(socket, buildSnapshot(deps.aggregator.getAll(), epoch, seq, now));
    }

    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('message', (raw, isBinary) => onMessage(client, raw, isBinary));
    socket.on('error', (err) => deps.log(`device "${device.name}" socket error: ${err.message}`));
    socket.on('close', (code) => {
      if (clients.get(device.id) === client) clients.delete(device.id);
      deps.log(`device "${device.name}" disconnected (${code})`);
      deps.onSeen?.(device);
    });
  }

  function onMessage(client: Client, raw: RawData, isBinary: boolean): void {
    let parsed: unknown;
    try {
      parsed = isBinary ? null : JSON.parse(raw.toString());
    } catch {
      parsed = null;
    }

    const result = DeviceMessageSchema.safeParse(parsed);
    if (!result.success) {
      deps.log(`device "${client.device.name}" sent an invalid message, ignored`);
      return;
    }

    const message = result.data;
    if (message.type === 'ack') {
      client.lastAckSeq = message.seq;
      return;
    }
    deps.log(`device "${client.device.name}" sent ${message.type}, not supported yet`);
  }

  // The cache changes when anything in the full data changes; only push when what the display shows changed.
  function onSection(entry: CacheEntry<unknown>): void {
    const section = toSectionPayload(entry);
    const key = sentKey(section);
    if (lastSent.get(entry.key) === key) return;
    lastSent.set(entry.key, key);

    seq++;
    const message: ServerMessage = {
      type: 'section',
      epoch,
      seq,
      generatedAt: deps.now().toISOString(),
      key: entry.key,
      section,
    };
    for (const client of clients.values()) send(client.socket, message);
  }

  function heartbeat(): void {
    for (const client of clients.values()) {
      if (!client.alive) {
        deps.log(`device "${client.device.name}" missed a heartbeat, dropping`);
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      client.socket.ping();
      void dropIfRevoked(client);
    }
  }

  // Keys are only checked on connect, so a key revoked mid-connection is caught here.
  async function dropIfRevoked(client: Client): Promise<void> {
    if (!deps.isActive) return;
    try {
      if (await deps.isActive(client.device.id)) return;
    } catch (err) {
      deps.log(`could not check device "${client.device.name}": ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    deps.log(`device "${client.device.name}" was revoked, disconnecting`);
    client.socket.close(CLOSE_REVOKED, 'device revoked');
  }

  const upgradeListener = (req: IncomingMessage, socket: Duplex, head: Buffer) => void onUpgrade(req, socket, head);
  server.on('upgrade', upgradeListener);
  deps.aggregator.on('section', onSection);
  const heartbeatTimer = setInterval(heartbeat, deps.heartbeatMs);

  return {
    async close() {
      clearInterval(heartbeatTimer);
      server.off('upgrade', upgradeListener);
      deps.aggregator.off('section', onSection);

      await Promise.all(
        [...clients.values()].map(
          ({ socket }) =>
            new Promise<void>((resolve) => {
              const force = setTimeout(() => {
                socket.terminate();
                resolve();
              }, CLOSE_TIMEOUT_MS);
              socket.once('close', () => {
                clearTimeout(force);
                resolve();
              });
              socket.close(CLOSE_GOING_AWAY, 'server shutting down');
            }),
        ),
      );
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },

    connectedDevices: () => [...clients.values()].map((c) => c.device),
  };
}

function sentKey(section: { hash: string | null; stale: boolean }): string {
  return `${section.hash}:${section.stale}`;
}
