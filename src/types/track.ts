export type Point = [x: number, y: number];

export interface TrackOutline {
  circuitId: string;
  name: string;
  sourceId: string;
  lengthM: number | null;
  width: number;
  height: number;
  points: Point[];
}
