import type { Aggregator } from '@/types/aggregator.js';
import type { SectionKey } from '@/types/section.js';

export interface DeviceIdentity {
  id: string;
  name: string;
}

export interface DeviceRecord {
  name: string;
  keyHash: string;
  lastSeenAt: string | null;
}

export interface SectionPayload {
  data: unknown;
  hash: string | null;
  asOf: string | null;
  fetchedAt: string | null;
  stale: boolean;
}

export type SectionsPayload = Partial<Record<SectionKey, SectionPayload>>;

interface ServerMessageBase {
  epoch: string;
  seq: number;
  generatedAt: string;
}

export interface SnapshotMessage extends ServerMessageBase {
  type: 'snapshot';
  v: number;
  config: null;
  sections: SectionsPayload;
}

export interface SectionMessage extends ServerMessageBase {
  type: 'section';
  key: SectionKey;
  section: SectionPayload;
}

export interface ResumeMessage extends ServerMessageBase {
  type: 'resume';
}

export type ServerMessage = SnapshotMessage | SectionMessage | ResumeMessage;

export interface DeviceHubDeps {
  aggregator: Pick<Aggregator, 'getAll' | 'on' | 'off'>;
  authenticate: (key: string) => Promise<DeviceIdentity | null>;
  onSeen?: (device: DeviceIdentity) => void;
  heartbeatMs: number;
  now: () => Date;
  log: (message: string) => void;
  epoch?: string;
}

export interface DeviceHub {
  close(): Promise<void>;
  connectedDevices(): DeviceIdentity[];
}
