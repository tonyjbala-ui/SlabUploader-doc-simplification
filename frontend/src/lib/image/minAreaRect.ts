import type { AxisBox } from '../math/axis';
import { pickLengthAxis } from '../math/axis';

export function minAreaRectFromMask(
  mask: Uint8Array,
  width: number,
  height: number
): AxisBox | null {
  const pts: Array<{ x: number; y: number }> = [];
  const step = mask.length > 250_000 ? 2 : 1;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (mask[y * width + x]) pts.push({ x, y });
    }
  }
  if (pts.length < 2) return null;

  let bestArea = Infinity;
  let best: { minX: number; maxX: number; minY: number; maxY: number; theta: number } | null = null;

  for (let deg = 0; deg < 180; deg++) {
    const theta = (deg * Math.PI) / 180;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      const rx = p.x * c + p.y * s;
      const ry = -p.x * s + p.y * c;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea) {
      bestArea = area;
      best = { minX, maxX, minY, maxY, theta };
    }
  }
  if (!best) return null;

  const c = Math.cos(best.theta);
  const s = Math.sin(best.theta);
  const midX = (best.minX + best.maxX) / 2;
  const midY = (best.minY + best.maxY) / 2;
  const center = { x: midX * c - midY * s, y: midX * s + midY * c };
  const sideA = best.maxX - best.minX;
  const sideB = best.maxY - best.minY;
  return pickLengthAxis({ center, lengthPx: sideA, widthPx: sideB, angleRad: best.theta });
}
