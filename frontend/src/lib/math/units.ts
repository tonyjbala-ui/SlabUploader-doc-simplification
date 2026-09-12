import { AREA_DECIMALS, BDFT_DECIMALS, INCH_STEP } from './constants';

export function roundHalfUp(value: number, decimals: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`roundHalfUp: ${value}`);
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`roundHalfUp decimals: ${decimals}`);
  }
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const rounded = Number(Math.round(Number(abs + 'e' + decimals)) + 'e-' + decimals);
  return sign * rounded;
}

export function roundLengthToEighth(inches: number): number {
  if (!Number.isFinite(inches)) throw new RangeError(`roundLengthToEighth: ${inches}`);
  return roundHalfUp(Math.round(inches / INCH_STEP) * INCH_STEP, 3);
}

export function roundArea(sqft: number): number {
  return roundHalfUp(sqft, AREA_DECIMALS);
}

export function roundBdft(bdft: number): number {
  return roundHalfUp(bdft, BDFT_DECIMALS);
}

export function roundTo2Decimals(value: number): number {
  return roundHalfUp(value, 2);
}
