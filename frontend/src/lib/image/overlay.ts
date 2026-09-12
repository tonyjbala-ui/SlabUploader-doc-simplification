/**
 * Overlay.
 *
 * A slab pixel keeps the photograph. A removed pixel becomes transparent, and a
 * light gray checkerboard shows through it (CSS background behind the preview,
 * same as the alpha preview of the inventory PNG).
 */

import type { RgbaImage } from './mask';
import type { AxisBox, SlabRect } from './minAreaRect';

export const CHECKER_LIGHT = '#f0f0f0';
export const CHECKER_DARK = '#d4d4d4';
export const CHECKER_CELL = 16;
export const AXIS_COLOR = '#9a3412';
export const RECT_COLOR = 'rgba(28, 25, 23, 0.85)';

/** Display scale: canvas pixels per source pixel, and the device pixel ratio. */
export type OverlayView = { k: number; dpr: number };

/**
 * Minimum-area bounding rectangle of the approved mask plus the length axis.
 * Drawn in display pixels; every stored number stays in source pixels.
 */
export function drawSlabOverlay(
  ctx: CanvasRenderingContext2D,
  rect: SlabRect,
  axis: AxisBox,
  view: OverlayView
): void {
  const { k, dpr } = view;
  const cssPx = (value: number) => (value * dpr) / k;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.lineJoin = 'round';

  const cos = Math.cos(rect.angleRad);
  const sin = Math.sin(rect.angleRad);
  const halfLength = rect.width / 2;
  const halfWidth = rect.height / 2;
  const corners: Array<[number, number]> = [
    [-halfLength, -halfWidth],
    [halfLength, -halfWidth],
    [halfLength, halfWidth],
    [-halfLength, halfWidth]
  ];
  ctx.lineWidth = cssPx(2);
  ctx.strokeStyle = RECT_COLOR;
  ctx.beginPath();
  corners.forEach(([u, v], index) => {
    const x = rect.cx + u * cos - v * sin;
    const y = rect.cy + u * sin + v * cos;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  const ux = Math.cos(axis.angleRad);
  const uy = Math.sin(axis.angleRad);
  const half = axis.lengthPx / 2;
  ctx.lineWidth = cssPx(3);
  ctx.strokeStyle = AXIS_COLOR;
  ctx.beginPath();
  ctx.moveTo(axis.cx - ux * half, axis.cy - uy * half);
  ctx.lineTo(axis.cx + ux * half, axis.cy + uy * half);
  ctx.stroke();

  ctx.fillStyle = AXIS_COLOR;
  ctx.beginPath();
  ctx.arc(axis.cx - ux * half, axis.cy - uy * half, cssPx(5), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(axis.cx + ux * half, axis.cy + uy * half, cssPx(5), 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Copy `source` into `target`, then zero the alpha of every pixel the mask drops.
 * Both buffers are RGBA at source resolution.
 */
export function applyMaskAlphaInto(
  target: Uint8ClampedArray,
  source: Uint8ClampedArray,
  mask: Uint8Array
): void {
  target.set(source);
  const n = Math.min(mask.length, source.length / 4);
  for (let i = 0; i < n; i++) {
    if (mask[i] !== 1) target[i * 4 + 3] = 0;
  }
}

/** Source pixels with the mask applied as alpha. */
export function maskedImageData(image: RgbaImage, mask: Uint8Array): ImageData {
  const out = new Uint8ClampedArray(image.data.length);
  applyMaskAlphaInto(out, image.data as Uint8ClampedArray, mask);
  return new ImageData(out, image.width, image.height);
}

export function maskPixelCount(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) count++;
  return count;
}