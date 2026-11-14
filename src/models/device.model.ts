import { model, Schema } from 'mongoose';
import type { DeviceRecord } from '@/types/device.js';

const deviceSchema = new Schema<DeviceRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    keyHash: { type: String, required: true, unique: true },
    lastSeenAt: { type: String, default: null },
  },
  { timestamps: true },
);

export const DeviceModel = model<DeviceRecord>('Device', deviceSchema);
