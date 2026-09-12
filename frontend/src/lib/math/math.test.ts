import { describe, expect, it } from 'vitest';
import { computeBdft, computeScale, computeSqft } from './area';
import { widthStations, summarizeWidths } from './widths';
import { pickLengthAxis } from './axis';
import { roundHalfUp, roundLengthToEighth } from './units';

describe('units', () => {
  it('half-up 2 decimals (TV-10)', () => {
    expect(roundHalfUp(11.525, 2)).toBe(11.53);
    expect(roundHalfUp(12.345, 2)).toBe(12.35);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
  });
  it('length snaps to 1/8 in', () => {
    expect(roundLengthToEighth(96.06)).toBe(96);
    expect(roundLengthToEighth(12.1)).toBe(12.125);
  });
});

describe('area / bdft', () => {
  it('scale = longest_axis_px / L', () => {
    expect(computeScale(960, 96)).toBe(10);
  });
  it('sqft = (mask_px / scale²) / 144', () => {
    expect(computeSqft(14400, 10)).toBe(1);
  });
  it('bdft = sqft × thickness, never /12', () => {
    expect(computeBdft(1, 1)).toBe(1);
    expect(computeBdft(12.34, 2)).toBe(24.68);
    expect(computeBdft(0.64, 1.5)).toBe(0.96);
  });
  it('bdft grows monotonically with thickness and sqft', () => {
    expect(computeBdft(2, 2)).toBeGreaterThan(computeBdft(2, 1));
    expect(computeBdft(3, 1)).toBeGreaterThan(computeBdft(2, 1));
  });
});

describe('widths', () => {
  it('stations every 6 in including 0 and L', () => {
    expect(widthStations(18)).toEqual([0, 6, 12, 18]);
  });
  it('min max avg', () => {
    const s = summarizeWidths([
      { stationIn: 0, widthIn: 10 },
      { stationIn: 6, widthIn: 14 },
      { stationIn: 12, widthIn: 12 }
    ]);
    expect(s.min).toBe(10);
    expect(s.max).toBe(14);
    expect(s.avg).toBe(12);
  });
});

describe('axis', () => {
  it('picks the long side as length', () => {
    const picked = pickLengthAxis({
      center: { x: 0, y: 0 },
      lengthPx: 40,
      widthPx: 200,
      angleRad: 0
    });
    expect(picked.lengthPx).toBe(200);
    expect(picked.widthPx).toBe(40);
  });
});
