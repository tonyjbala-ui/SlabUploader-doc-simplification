/**
 * Width sampling along the approved length axis.
 *
 * Stations every 6 in along the axis, perpendicular to it, and only through slab
 * mask pixels. All of it in source photo pixels.
 */

import { round2 } from '../math/scale';
import type { AxisBox } from './minAreaRect';

export const WIDTH_SAMPLE_STEP_IN = 6;

export type WidthStats = {
  min: number;
  max: number;
  avg: number;
  samples: number;
};

/** Station positions in inches from the start of the length axis. */
export function widthStations(lengthIn: number, stepIn = WIDTH_SAMPLE_STEP_IN): number[] {
  if (!(lengthIn > 0)) return [];
  if (lengthIn < stepIn) return [lengthIn / 2];
  const count = Math.max(1, Math.floor(lengthIn / stepIn));
  const stations: number[] = [];
  for (let k = 0; k < count; k++) stations.push((k + 0.5) * stepIn);
  const covered = count * stepIn;
  const tail = lengthIn - covered;
  if (tail >= stepIn / 2) stations.push((covered + lengthIn) / 2);
  return stations;
}

export function maskAt(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return false;
  return mask[yi * width + xi] === 1;
}

/** Width of the slab across the axis at one point, in pixels. */
export function widthAtPoint(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  axisAngleRad: number
): number {
  if (!maskAt(mask, width, height, x, y)) return 0;
  const vx = -Math.sin(axisAngleRad);
  const vy = Math.cos(axisAngleRad);
  const limit = Math.max(width, height);
  let left = 0;
  let right = 0;
  while (left < limit && maskAt(mask, width, height, x - vx * (left + 1), y - vy * (left + 1))) {
    left++;
  }
  while (right < limit && maskAt(mask, width, height, x + vx * (right + 1), y + vy * (right + 1))) {
    right++;
  }
  return left + right + 1;
}

export function sampleWidths(
  mask: Uint8Array,
  width: number,
  height: number,
  axis: AxisBox,
  lengthIn: number,
  scalePxPerIn: number
): WidthStats {
  if (!(lengthIn > 0) || !(scalePxPerIn > 0)) return { min: 0, max: 0, avg: 0, samples: 0 };
  const ux = Math.cos(axis.angleRad);
  const uy = Math.sin(axis.angleRad);
  const half = axis.lengthPx / 2;
  const widthsIn: number[] = [];
  for (const stationIn of widthStations(lengthIn)) {
    const along = -half + stationIn * scalePxPerIn;
    const x = axis.cx + ux * along;
    const y = axis.cy + uy * along;
    const widthPx = widthAtPoint(mask, width, height, x, y, axis.angleRad);
    if (widthPx > 0) widthsIn.push(round2(widthPx / scalePxPerIn));
  }
  if (widthsIn.length === 0) return { min: 0, max: 0, avg: 0, samples: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const value of widthsIn) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  return {
    min,
    max,
    avg: round2(sum / widthsIn.length),
    samples: widthsIn.length
  };
}