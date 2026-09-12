import { describe, expect, it } from 'vitest';
import {
  boxForAxis,
  hullFromMask,
  minAreaRectFromMask,
  normalizeAxisAngle,
  type SlabRect
} from './minAreaRect';

type Mask = { mask: Uint8Array; width: number; height: number };

/** Rasterise a rectangle centred at (cx, cy), long side along angleRad. */
function rectMask(
  width: number,
  height: number,
  cx: number,
  cy: number,
  lengthPx: number,
  acrossPx: number,
  angleRad: number
): Mask {
  const mask = new Uint8Array(width * height);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      if (Math.abs(u) <= lengthPx / 2 && Math.abs(v) <= acrossPx / 2) mask[y * width + x] = 1;
    }
  }
  return { mask, width, height };
}

/** Axis angles are lines: compare modulo PI/2 for the rectangle cases. */
function angleDiffMod90(a: number, b: number): number {
  let d = (a - b) % (Math.PI / 2);
  if (d > Math.PI / 4) d -= Math.PI / 2;
  if (d < -Math.PI / 4) d += Math.PI / 2;
  return Math.abs(d);
}

describe('minimum-area bounding rectangle', () => {
  it('finds the long side of an axis aligned slab', () => {
    const image = rectMask(400, 300, 200, 150, 200, 50, 0);
    const rect = minAreaRectFromMask(image.mask, image.width, image.height) as SlabRect;
    expect(rect).not.toBeNull();
    expect(rect.width).toBeGreaterThan(198);
    expect(rect.width).toBeLessThan(202);
    expect(rect.height).toBeGreaterThan(48);
    expect(rect.height).toBeLessThan(52);
    expect(angleDiffMod90(rect.angleRad, 0)).toBeLessThan(0.02);
    expect(rect.cx).toBeCloseTo(200, 0);
    expect(rect.cy).toBeCloseTo(150, 0);
  });

  it('finds a slab rotated 30 degrees', () => {
    const angle = (30 * Math.PI) / 180;
    const image = rectMask(500, 500, 250, 250, 240, 60, angle);
    const rect = minAreaRectFromMask(image.mask, image.width, image.height) as SlabRect;
    expect(rect).not.toBeNull();
    expect(Math.abs(rect.width - 240)).toBeLessThan(2.5);
    expect(Math.abs(rect.height - 60)).toBeLessThan(2.5);
    expect(angleDiffMod90(rect.angleRad, angle)).toBeLessThan(0.02);
  });

  it('measures the slab extent along a chosen axis', () => {
    const image = rectMask(400, 300, 200, 150, 200, 50, 0);
    const hull = hullFromMask(image.mask, image.width, image.height);
    expect(hull).not.toBeNull();
    const along = boxForAxis(hull!, 0);
    expect(along.lengthPx).toBeGreaterThan(198);
    expect(along.lengthPx).toBeLessThan(202);
    expect(along.widthPx).toBeGreaterThan(48);
    expect(along.widthPx).toBeLessThan(52);
    // Rotated a quarter turn the extents swap: the user can pick either axis.
    const across = boxForAxis(hull!, Math.PI / 2);
    expect(across.lengthPx).toBeGreaterThan(48);
    expect(across.lengthPx).toBeLessThan(52);
    expect(across.widthPx).toBeGreaterThan(198);
    expect(across.widthPx).toBeLessThan(202);
  });

  it('returns null for an empty mask', () => {
    expect(minAreaRectFromMask(new Uint8Array(100), 10, 10)).toBeNull();
  });

  it('reports the pixel footprint, not the centre span', () => {
    const image = rectMask(400, 300, 200, 150, 200, 50, 0);
    const rect = minAreaRectFromMask(image.mask, image.width, image.height) as SlabRect;
    expect(rect.width).toBeCloseTo(200, 1);
    expect(rect.height).toBeCloseTo(50, 1);
  });

  it('folds axis angles into (-PI/2, PI/2]', () => {
    expect(normalizeAxisAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10);
    expect(normalizeAxisAngle(Math.PI)).toBeCloseTo(0, 10);
    expect(normalizeAxisAngle(-Math.PI / 4)).toBeCloseTo(-Math.PI / 4, 10);
    expect(normalizeAxisAngle((-3 * Math.PI) / 4)).toBeCloseTo(Math.PI / 4, 10);
  });
});