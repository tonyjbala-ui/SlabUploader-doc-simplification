import type { ConfirmedAxis } from '../math/axis';
import { widthStations, summarizeWidths, type WidthStats } from '../math/widths';
import { roundTo2Decimals } from '../math/units';

function maskAt(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return false;
  return mask[yi * width + xi] === 1;
}

export function sampleWidthsAlongAxis(
  mask: Uint8Array,
  width: number,
  height: number,
  axis: ConfirmedAxis,
  lengthIn: number,
  scalePxPerInch: number
): WidthStats {
  const stations = widthStations(lengthIn);
  const ux = Math.cos(axis.angleRad);
  const uy = Math.sin(axis.angleRad);
  const px = -uy;
  const py = ux;
  const half = axis.lengthPx / 2;
  const samples = stations.map((stationIn) => {
    const t = stationIn / lengthIn;
    const along = -half + t * axis.lengthPx;
    const ox = axis.center.x + ux * along;
    const oy = axis.center.y + uy * along;
    let left = 0;
    let right = 0;
    const maxScan = Math.max(width, height);
    while (left < maxScan && maskAt(mask, width, height, ox - px * (left + 1), oy - py * (left + 1))) {
      left++;
    }
    while (right < maxScan && maskAt(mask, width, height, ox + px * (right + 1), oy + py * (right + 1))) {
      right++;
    }
    const widthPx = left + right;
    return { stationIn, widthIn: roundTo2Decimals(widthPx / scalePxPerInch) };
  });
  return summarizeWidths(samples);
}
