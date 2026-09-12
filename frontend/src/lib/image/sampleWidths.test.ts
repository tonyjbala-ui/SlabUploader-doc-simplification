import { describe, expect, it } from 'vitest';
import { sampleWidths, widthStations } from './sampleWidths';
import type { AxisBox } from './minAreaRect';

/**
 * Synthetic slab: 200 px long, 50 px wide, axis along the length, 10 px per inch.
 * Length is 20 in, so the width is 5.00 in.
 */
function slabMask(width = 400, height = 300) {
  const mask = new Uint8Array(width * height);
  for (let y = 125; y <= 174; y++) {
    for (let x = 100; x <= 299; x++) mask[y * width + x] = 1;
  }
  return mask;
}

const axis: AxisBox = { cx: 200, cy: 150, lengthPx: 200, widthPx: 50, angleRad: 0 };
const SCALE = 10; // px per inch
const LENGTH_IN = 20; // 200 px / 10

describe('width stations', () => {
  it('walks the length every 6 in', () => {
    expect(widthStations(20)).toEqual([3, 9, 15]);
    expect(widthStations(6)).toEqual([3]);
    expect(widthStations(2)).toEqual([1]);
    expect(widthStations(0)).toEqual([]);
  });
});

describe('width sampler', () => {
  it('samples every 6 in and reports avg width 5.00 in', () => {
    const stats = sampleWidths(slabMask(), 400, 300, axis, LENGTH_IN, SCALE);
    expect(stats.samples).toBe(3);
    expect(stats.avg).toBeGreaterThanOrEqual(4.9);
    expect(stats.avg).toBeLessThanOrEqual(5.1);
    expect(stats.min).toBeGreaterThanOrEqual(4.9);
    expect(stats.max).toBeLessThanOrEqual(5.1);
  });

  it('is exact on a clean rectangle', () => {
    const stats = sampleWidths(slabMask(), 400, 300, axis, LENGTH_IN, SCALE);
    expect(stats.min).toBe(5);
    expect(stats.max).toBe(5);
    expect(stats.avg).toBe(5);
  });

  it('measures across the axis when the axis is a quarter turn off', () => {
    const turned: AxisBox = { ...axis, angleRad: Math.PI / 2, lengthPx: 50 };
    const stats = sampleWidths(slabMask(), 400, 300, turned, 5, SCALE);
    // Length axis across the slab: 50 px = 5 in long, width is the 200 px side.
    expect(stats.avg).toBeGreaterThanOrEqual(19.9);
    expect(stats.avg).toBeLessThanOrEqual(20.1);
  });

  it('returns empty stats when nothing is sampled', () => {
    const empty = new Uint8Array(400 * 300);
    expect(sampleWidths(empty, 400, 300, axis, LENGTH_IN, SCALE)).toEqual({
      min: 0,
      max: 0,
      avg: 0,
      samples: 0
    });
  });
});