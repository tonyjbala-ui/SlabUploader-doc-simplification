import { describe, expect, it } from 'vitest';
import { bdftFromSqft, sqftFromMask } from './area';
import { scalePxPerInch } from './scale';

describe('sqft = (mask_pixels / scale^2) / 144', () => {
  it('mask_pixels = 500000, scale = 50 -> sqft = 1.39', () => {
    // 500000 / 2500 / 144 = 1.3888... -> 1.39
    expect(sqftFromMask(500000, scalePxPerInch(4000, 80))).toBe(1.39);
  });

  it('carries the exact quotient, not a prettied one', () => {
    const sqft = sqftFromMask(500000, 50);
    expect(sqft).toBe(1.39);
    expect(sqft).not.toBe(1.4);
    expect(500000 / 2500 / 144).toBeCloseTo(1.3888888888888888, 12);
  });

  it('keeps 2 decimals at the display boundary', () => {
    expect(sqftFromMask(144 * 2500, 50)).toBe(1);
    expect(sqftFromMask(1, 1)).toBe(0.01);
    expect(sqftFromMask(0, 50)).toBe(0);
  });

  it('rejects a non positive scale', () => {
    expect(() => sqftFromMask(500000, 0)).toThrow();
  });
});

describe('bdft = sqft * thickness_in', () => {
  it('sqft = 1.39, thickness = 2 -> bdft = 2.78', () => {
    expect(bdftFromSqft(1.39, 2)).toBe(2.78);
  });

  it('is never divided by 12', () => {
    expect(bdftFromSqft(1.39, 2)).not.toBeCloseTo(1.39 * 2 / 12, 6);
    expect(bdftFromSqft(12, 1)).toBe(12);
    expect(bdftFromSqft(10, 2)).toBe(20);
  });

  it('rounds to 2 decimals', () => {
    expect(bdftFromSqft(1.3888888888888888, 2)).toBe(2.78);
    expect(bdftFromSqft(3.3333, 1.25)).toBe(4.17);
  });
});