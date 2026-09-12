/**
 * Rectangle and axis geometry for the approved mask.
 *
 * The minimum-area bounding rectangle is found with rotating calipers over the
 * convex hull of the mask. The default length axis is the long side of that
 * rectangle. Angles and lengths are in source photo pixels.
 */

export type SlabRect = {
  cx: number;
  cy: number;
  /** Long side, in source pixels. */
  width: number;
  /** Short side, in source pixels. */
  height: number;
  /** Direction of the long side, radians, in (-PI/2, PI/2]. */
  angleRad: number;
};

export type AxisBox = {
  cx: number;
  cy: number;
  /** Slab extent along the axis, in source pixels. */
  lengthPx: number;
  /** Slab extent across the axis, in source pixels. */
  widthPx: number;
  angleRad: number;
};

const HALF_PI = Math.PI / 2;

/** Fold an axis angle to (-PI/2, PI/2]. An axis has no direction, only a line. */
export function normalizeAxisAngle(angleRad: number): number {
  let angle = angleRad % Math.PI;
  if (angle < 0) angle += Math.PI;
  if (angle > HALF_PI) angle -= Math.PI;
  return angle;
}

/** Boundary pixels of the mask, subsampled when the boundary is very long. */
export function boundaryPoints(
  mask: Uint8Array,
  width: number,
  height: number,
  maxPoints = 40000
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] !== 1) continue;
      const left = x === 0 ? 0 : mask[row + x - 1];
      const right = x === width - 1 ? 0 : mask[row + x + 1];
      const up = y === 0 ? 0 : mask[row - width + x];
      const down = y === height - 1 ? 0 : mask[row + width + x];
      if (left === 1 && right === 1 && up === 1 && down === 1) continue;
      // Pixel centres: the mask covers the pixel square, so a span of n pixels
      // is n pixels wide once the +1 footprint correction is applied below.
      points.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length; i += stride) out.push(points[i]!);
  return out;
}

function cross(o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex hull (monotone chain), returned as [x0, y0, x1, y1, ...]. */
export function convexHull(points: Array<{ x: number; y: number }>): Float64Array {
  const sorted = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (sorted.length <= 2) {
    const out = new Float64Array(sorted.length * 2);
    sorted.forEach((p, i) => {
      out[i * 2] = p.x;
      out[i * 2 + 1] = p.y;
    });
    return out;
  }
  const lower: Array<{ x: number; y: number }> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  const out = new Float64Array(hull.length * 2);
  hull.forEach((p, i) => {
    out[i * 2] = p.x;
    out[i * 2 + 1] = p.y;
  });
  return out;
}

export function hullFromMask(
  mask: Uint8Array,
  width: number,
  height: number
): Float64Array | null {
  const points = boundaryPoints(mask, width, height);
  if (points.length === 0) return null;
  return convexHull(points);
}

type Extents = { minU: number; maxU: number; minV: number; maxV: number };

function project(hull: Float64Array, angleRad: number): Extents {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < hull.length; i += 2) {
    const x = hull[i]!;
    const y = hull[i + 1]!;
    const u = x * cos + y * sin;
    const v = -x * sin + y * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return { minU, maxU, minV, maxV };
}

/** Extent of a pixel-centre span, corrected to the pixel footprint (+1 px). */
function span(min: number, max: number): number {
  return max - min + 1;
}

/** Minimum-area bounding rectangle of a convex hull. */
export function minAreaRectFromHull(hull: Float64Array): SlabRect | null {
  const count = hull.length / 2;
  if (count === 0) return null;
  if (count === 1) {
    return { cx: hull[0]!, cy: hull[1]!, width: 1, height: 1, angleRad: 0 };
  }
  let best: { angleRad: number; extents: Extents } | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const dx = hull[j * 2]! - hull[i * 2]!;
    const dy = hull[j * 2 + 1]! - hull[i * 2 + 1]!;
    if (dx === 0 && dy === 0) continue;
    const angle = Math.atan2(dy, dx);
    const extents = project(hull, angle);
    const area = (extents.maxU - extents.minU) * (extents.maxV - extents.minV);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      best = { angleRad: angle, extents };
    }
  }
  if (!best) return null;
  const { minU, maxU, minV, maxV } = best.extents;
  const cos = Math.cos(best.angleRad);
  const sin = Math.sin(best.angleRad);
  const midU = (minU + maxU) / 2;
  const midV = (minV + maxV) / 2;
  const cx = midU * cos - midV * sin;
  const cy = midU * sin + midV * cos;
  const sideU = span(minU, maxU);
  const sideV = span(minV, maxV);
  // width is the long side, so the stored angle points along the length.
  if (sideV > sideU) {
    return {
      cx,
      cy,
      width: sideV,
      height: sideU,
      angleRad: normalizeAxisAngle(best.angleRad + HALF_PI)
    };
  }
  return { cx, cy, width: sideU, height: sideV, angleRad: normalizeAxisAngle(best.angleRad) };
}

export function minAreaRectFromMask(
  mask: Uint8Array,
  width: number,
  height: number
): SlabRect | null {
  const hull = hullFromMask(mask, width, height);
  if (!hull) return null;
  return minAreaRectFromHull(hull);
}

/** Slab extent along an arbitrary axis through the hull. */
export function boxForAxis(hull: Float64Array, angleRad: number): AxisBox {
  const extents = project(hull, angleRad);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const midU = (extents.minU + extents.maxU) / 2;
  const midV = (extents.minV + extents.maxV) / 2;
  return {
    cx: midU * cos - midV * sin,
    cy: midU * sin + midV * cos,
    lengthPx: span(extents.minU, extents.maxU),
    widthPx: span(extents.minV, extents.maxV),
    angleRad
  };
}