import { WIDTH_SAMPLE_IN } from './constants';
import { roundTo2Decimals } from './units';

export type WidthSample = { stationIn: number; widthIn: number };
export type WidthStats = { min: number; max: number; avg: number; samples: WidthSample[] };

export function widthStations(lengthInches: number, stepIn: number = WIDTH_SAMPLE_IN): number[] {
  if (!(lengthInches > 0)) throw new RangeError(`widthStations length: ${lengthInches}`);
  if (!(stepIn > 0)) throw new RangeError(`widthStations step: ${stepIn}`);
  const stations: number[] = [];
  for (let s = 0; s <= lengthInches + 1e-9; s = roundTo2Decimals(s + stepIn)) {
    if (s > lengthInches + 1e-9) break;
    stations.push(roundTo2Decimals(s));
    if (stations.length > 10_000) break;
  }
  return stations;
}

export function summarizeWidths(samples: WidthSample[]): WidthStats {
  if (samples.length === 0) throw new RangeError('summarizeWidths: empty');
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const s of samples) {
    if (!Number.isFinite(s.widthIn) || s.widthIn < 0) {
      throw new RangeError(`summarizeWidths widthIn: ${s.widthIn}`);
    }
    min = Math.min(min, s.widthIn);
    max = Math.max(max, s.widthIn);
    sum += s.widthIn;
  }
  return {
    min: roundTo2Decimals(min),
    max: roundTo2Decimals(max),
    avg: roundTo2Decimals(sum / samples.length),
    samples: [...samples]
  };
}
