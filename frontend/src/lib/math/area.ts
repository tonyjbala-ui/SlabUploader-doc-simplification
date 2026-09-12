import { roundArea, roundBdft } from './units';

export function computeScale(longestAxisPx: number, lengthInches: number): number {
  if (!(longestAxisPx > 0)) throw new RangeError(`computeScale longestAxisPx: ${longestAxisPx}`);
  if (!(lengthInches > 0)) throw new RangeError(`computeScale lengthInches: ${lengthInches}`);
  return longestAxisPx / lengthInches;
}

export function computeSqft(maskPixelCount: number, scalePxPerInch: number): number {
  if (!(maskPixelCount >= 0) || !Number.isFinite(maskPixelCount)) {
    throw new RangeError(`computeSqft maskPixelCount: ${maskPixelCount}`);
  }
  if (!(scalePxPerInch > 0)) throw new RangeError(`computeSqft scale: ${scalePxPerInch}`);
  return roundArea(maskPixelCount / (scalePxPerInch * scalePxPerInch) / 144);
}

/** bdft = sqft × thickness_in. Never divide by 12. */
export function computeBdft(sqft: number, thicknessInches: number): number {
  if (!Number.isFinite(sqft) || sqft < 0) throw new RangeError(`computeBdft sqft: ${sqft}`);
  if (!Number.isFinite(thicknessInches) || thicknessInches < 0) {
    throw new RangeError(`computeBdft thickness: ${thicknessInches}`);
  }
  return roundBdft(sqft * thicknessInches);
}
