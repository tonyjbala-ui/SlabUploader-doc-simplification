/**
 * Area helpers.
 *
 * sqft = (mask_pixels / scale^2) / 144
 * bdft = sqft * thickness_in
 *
 * Board feet are never divided by 12.
 */

import { round2 } from './scale';

export const SQ_IN_PER_SQ_FT = 144;

export function sqInFromMask(maskPixels: number, scalePxPerIn: number): number {
  if (!(scalePxPerIn > 0)) throw new Error('scale must be greater than 0');
  return maskPixels / (scalePxPerIn * scalePxPerIn);
}

export function sqftFromMask(maskPixels: number, scalePxPerIn: number): number {
  return round2(sqInFromMask(maskPixels, scalePxPerIn) / SQ_IN_PER_SQ_FT);
}

export function bdftFromSqft(sqft: number, thicknessIn: number): number {
  return round2(sqft * thicknessIn);
}