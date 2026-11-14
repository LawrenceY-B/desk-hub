import { TRACK_OUTLINES } from '@/data/track-outlines.generated.js';
import type { TrackOutline } from '@/types/track.js';

export function getTrackOutline(circuitId: string): TrackOutline | null {
  return TRACK_OUTLINES.get(circuitId) ?? null;
}
