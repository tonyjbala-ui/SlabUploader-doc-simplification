/**
 * Scale helpers.
 *
 * `scale` is pixels per inch in the source photo:
 *   scale = longest_axis_px / L
 */

export const MM_PER_INCH = 25.4;
export const INCH_STEP = 1 / 8;

/** Round for display only. Never feed a rounded value back into a formula path. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function scalePxPerInch(longestAxisPx: number, lengthIn: number): number {
  if (!(longestAxisPx > 0)) throw new Error('longest_axis_px must be greater than 0');
  if (!(lengthIn > 0)) throw new Error('length_in must be greater than 0');
  return longestAxisPx / lengthIn;
}

/** Snap a user typed number to the 1/8 in step. */
export function snapToEighth(valueIn: number): number {
  return Math.round(valueIn / INCH_STEP) * INCH_STEP;
}