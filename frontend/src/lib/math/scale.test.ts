import { describe, expect, it } from 'vitest';
import { round2, scalePxPerInch, snapToEighth } from './scale';

describe('scale = longest_axis_px / L', () => {
  it('L = 80 in, longest_axis_px = 4000 -> scale = 50', () => {
    expect(scalePxPerInch(4000, 80)).toBe(50);
  });

  it('is a plain division of source pixels by inches', () => {
    expect(scalePxPerInch(2000, 40)).toBe(50);
    expect(scalePxPerInch(3000, 96)).toBeCloseTo(31.25, 10);
  });

  it('rejects a zero or negative length', () => {
    expect(() => scalePxPerInch(4000, 0)).toThrow();
    expect(() => scalePxPerInch(0, 80)).toThrow();
  });
});

describe('display rounding', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1.3888888888888888)).toBe(1.39);
    expect(round2(2.7777777777777777)).toBe(2.78);
    expect(round2(1.004)).toBe(1);
    expect(round2(1.005)).toBe(1.01);
  });

  it('snaps typed inches to 1/8 in steps', () => {
    expect(snapToEighth(80.3)).toBeCloseTo(80.25, 10);
    expect(snapToEighth(2.06)).toBeCloseTo(2, 10);
  });
});