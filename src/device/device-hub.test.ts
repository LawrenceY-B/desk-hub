import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, test } from 'node:test';
import { WebSocket } from 'ws';
import { createEmptyEntry } from '@/services/section-cache.service.js';
import type { DeviceHub, DeviceHubDeps, ServerMessage } from '@/types/device.js';
import type { CacheEntry } from '@/types/section.js';
import { hashData } from '@/utils/hash.js';
import { createDeviceHub } from './device-hub.js';

const KEY = 'dh_test-key';
const NOW = new Date('2026-11-14T12:00:00.000Z');

// 'mkt' has no display mapper yet, so its data reaches the device unchanged.
function mktEntry(data: unknown, hash: string, stale = false): CacheEntry<unknown> {
  return { ...createEmptyEntry('mkt', NOW), data, hash, stale, fetchedAt: NOW.toISOString(), asOf: '2026-11-08T17:00:00.000Z' };
}

function fakeAggregator(entries: CacheEntry<unknown>[]) {
  const events = new EventEmitter();
  return {
    getAll: () => entries,
    on: (_: 'section', listener: (entry: CacheEntry<unknown>) => void) => void events.on('section', listener),
    off: (_: 'section', listener: (entry: CacheEntry<unknown>) => void) => void events.off('section', listener),
    emit: (entry: CacheEntry<unknown>) => events.emit('section', entry),
  };
}

let server: Server;
let hub: DeviceHub;
let logs: string[];
const open: WebSocket[] = [];

async function start(overrides: Partial<DeviceHubDeps> = {}, entries = [mktEntry({ round: 21 }, 'h1')]) {
  const aggregator = fakeAggregator(entries);
  logs = [];
  server = createServer();
  hub = createDeviceHub(server, {
    aggregator,
    authenticate: async (key) => (key === KEY ? { id: 'd1', name: 'Desk' } : null),
    heartbeatMs: 60_000,
    now: () => NOW,
    log: (m) => logs.push(m),
    epoch: 'e1',
    ...overrides,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { aggregator, url: `ws://127.0.0.1:${port}/device` };
}

function connect(url: string, headers: Record<string, string> = { authorization: `Bearer ${KEY}` }, options = {}) {
  const socket = new WebSocket(url, { headers, ...options });
  const messages: ServerMessage[] = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString()) as ServerMessage));
  socket.on('error', () => {});
  open.push(socket);
  return { socket, messages };
}

const opened = (socket: WebSocket) => new Promise<void>((resolve, reject) => {
  socket.once('open', () => resolve());
  socket.once('error', reject);
});
const rejected = (socket: WebSocket) =>
  new Promise<number>((resolve) => socket.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0)));
const closed = (socket: WebSocket) => new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

afterEach(async () => {
  for (const socket of open.splice(0)) socket.terminate();
  await hub.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('auth', () => {
  test('no key: 401 before upgrading', async () => {
    const { url } = await start();
    assert.equal(await rejected(connect(url, {}).socket), 401);
  });

  test('wrong key: 401', async () => {
    const { url } = await start();
    assert.equal(await rejected(connect(url, { authorization: 'Bearer dh_wrong' }).socket), 401);
  });

  test('auth backend down: 503, and it is logged', async () => {
    const { url } = await start({
      authenticate: async () => {
        throw new Error('mongo down');
      },
    });
    assert.equal(await rejected(connect(url).socket), 503);
    assert.ok(logs.some((l) => l.includes('mongo down')));
  });

  test('other paths: 404', async () => {
    const { url } = await start();
    assert.equal(await rejected(connect(url.replace('/device', '/other')).socket), 404);
  });
});

describe('messages', () => {
  test('a snapshot on connect with every section', async () => {
    const { url } = await start();
    const { socket, messages } = connect(url);
    await opened(socket);
    await until(() => messages.length === 1);

    const snapshot = messages[0]!;
    assert.equal(snapshot.type, 'snapshot');
    assert.equal(snapshot.seq, 0);
    assert.equal(snapshot.epoch, 'e1');
    if (snapshot.type === 'snapshot') {
      assert.deepEqual(snapshot.sections.mkt, {
        data: { round: 21 },
        hash: hashData({ round: 21 }),
        asOf: '2026-11-08T17:00:00.000Z',
        fetchedAt: NOW.toISOString(),
        stale: false,
      });
    }
  });

  test('the snapshot leaves out internal run state', async () => {
    const { url } = await start();
    const { socket, messages } = connect(url);
    await opened(socket);
    await until(() => messages.length === 1);
    const raw = JSON.stringify(messages[0]);
    for (const field of ['consecutiveFailures', 'nextRunAt', 'lastError', 'retryAt']) assert.ok(!raw.includes(field), field);
  });

  test('section events are pushed with an increasing seq', async () => {
    const { url, aggregator } = await start();
    const { socket, messages } = connect(url);
    await opened(socket);
    await until(() => messages.length === 1);

    aggregator.emit(mktEntry({ round: 22 }, 'h2'));
    aggregator.emit(mktEntry({ round: 23 }, 'h3'));
    await until(() => messages.length === 3);

    assert.deepEqual(messages.slice(1).map((m) => [m.type, m.seq]), [['section', 1], ['section', 2]]);
  });

  test('a cache change the display cannot see is not pushed', async () => {
    const { url, aggregator } = await start();
    const { socket, messages } = connect(url);
    await opened(socket);
    await until(() => messages.length === 1);

    aggregator.emit(mktEntry({ round: 21 }, 'a-different-cache-hash'));
    aggregator.emit(mktEntry({ round: 22 }, 'h2'));
    await until(() => messages.length === 2);

    assert.deepEqual([messages[1]?.type, messages[1]?.seq], ['section', 1]);
  });

  test('a stale flip is pushed even when the data is the same', async () => {
    const { url, aggregator } = await start();
    const { socket, messages } = connect(url);
    await opened(socket);
    await until(() => messages.length === 1);

    aggregator.emit(mktEntry({ round: 21 }, 'h1', true));
    await until(() => messages.length === 2);
    assert.equal(messages[1]?.type === 'section' && messages[1].section.stale, true);
  });

  test('resume with the current epoch and seq: no snapshot', async () => {
    const { url, aggregator } = await start();
    aggregator.emit(mktEntry({ round: 22 }, 'h2'));
    const { socket, messages } = connect(url, { authorization: `Bearer ${KEY}`, 'x-resume': 'e1:1' });
    await opened(socket);
    await until(() => messages.length === 1);
    assert.deepEqual([messages[0]?.type, messages[0]?.seq], ['resume', 1]);
  });

  test('resume after missing an update: snapshot', async () => {
    const { url, aggregator } = await start();
    aggregator.emit(mktEntry({ round: 22 }, 'h2'));
    const { socket, messages } = connect(url, { authorization: `Bearer ${KEY}`, 'x-resume': 'e1:0' });
    await opened(socket);
    await until(() => messages.length === 1);
    assert.equal(messages[0]?.type, 'snapshot');
  });

  test('resume from before a server restart (old epoch): snapshot', async () => {
    const { url } = await start();
    const { socket, messages } = connect(url, { authorization: `Bearer ${KEY}`, 'x-resume': 'old:0' });
    await opened(socket);
    await until(() => messages.length === 1);
    assert.equal(messages[0]?.type, 'snapshot');
  });

  test('invalid messages are logged and ignored; the connection stays open', async () => {
    const { url } = await start();
    const { socket, messages } = connect(url);
    await opened(socket);
    socket.send('not json');
    socket.send(JSON.stringify({ type: 'ack', seq: -1 }));
    socket.send(JSON.stringify({ type: 'task.done', taskId: 't1' }));
    await until(() => logs.filter((l) => l.includes('invalid')).length === 2 && logs.some((l) => l.includes('not supported')));
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal(messages.length, 1);
  });
});

describe('connections', () => {
  test('a second connection from the same device replaces the first', async () => {
    const { url } = await start();
    const first = connect(url);
    await opened(first.socket);
    const firstClosed = closed(first.socket);

    const second = connect(url);
    await opened(second.socket);

    assert.equal(await firstClosed, 4000);
    assert.equal(hub.connectedDevices().length, 1);
  });

  test('connect and disconnect mark the device as seen', async () => {
    const seen: string[] = [];
    const { url } = await start({ onSeen: (d) => seen.push(d.id) });
    const { socket } = connect(url);
    await opened(socket);
    socket.close();
    await until(() => seen.length === 2);
  });

  test('a device that stops answering pings is dropped', async () => {
    const { url } = await start({ heartbeatMs: 30 });
    const { socket } = connect(url, { authorization: `Bearer ${KEY}` }, { autoPong: false });
    await opened(socket);
    await closed(socket);
    assert.ok(logs.some((l) => l.includes('missed a heartbeat')));
    await until(() => hub.connectedDevices().length === 0);
  });

  test('a device that answers pings stays connected', async () => {
    const { url } = await start({ heartbeatMs: 30 });
    const { socket } = connect(url);
    await opened(socket);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(socket.readyState, WebSocket.OPEN);
  });

  test('close() tells devices the server is going away', async () => {
    const { url } = await start();
    const { socket } = connect(url);
    await opened(socket);
    const code = closed(socket);
    await hub.close();
    assert.equal(await code, 1001);
    hub = { close: async () => {}, connectedDevices: () => [] };
  });
});
