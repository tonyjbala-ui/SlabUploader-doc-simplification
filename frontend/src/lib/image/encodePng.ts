/**
 * Inventory PNG.
 *
 * kind = inventory. 8-bit RGBA PNG, alpha kept, 3:4 portrait, slab centred and
 * filling 80% of the frame at its widest and tallest points. The crop is the
 * source at native resolution: a source that cannot supply the size floor gets a
 * warning and a new photo, never an upscale.
 */

import type { AxisBox } from './minAreaRect';

export const INVENTORY_FILL = 0.8;
/** width / height */
export const INVENTORY_ASPECT = 3 / 4;
export const INVENTORY_MIN_SHORT_SIDE = 1600;
export const TOO_SMALL_COPY = 'Photo is too small. Take a closer photo.';

export type SourceSize = { width: number; height: number };

export type CropPlan = {
  widthPx: number;
  heightPx: number;
  /** 1 = native crop, below 1 = the frame was pulled back to stay on the photo. */
  fit: number;
  requiresRetake: boolean;
};

export type EncodeOutcome = {
  blob: Blob | null;
  widthPx: number;
  heightPx: number;
  requiresRetake: boolean;
  reason: string | null;
};

export function planInventoryCrop(box: AxisBox, source: SourceSize): CropPlan {
  const fill = INVENTORY_FILL;
  // Height from the length, width from the slab width, whichever binds first.
  let heightPx = Math.max(box.lengthPx / fill, box.widthPx / (fill * INVENTORY_ASPECT));
  let widthPx = heightPx * INVENTORY_ASPECT;

  if (!(heightPx > 0) || !(widthPx > 0)) {
    return { widthPx: 0, heightPx: 0, fit: 1, requiresRetake: true };
  }

  const cos = Math.abs(Math.cos(box.angleRad));
  const sin = Math.abs(Math.sin(box.angleRad));
  const boundingW = heightPx * cos + widthPx * sin;
  const boundingH = heightPx * sin + widthPx * cos;
  const fit = Math.min(1, source.width / boundingW, source.height / boundingH);
  if (fit < 1) {
    heightPx *= fit;
    widthPx *= fit;
  }

  // Exact 3:4, rounded up to a multiple of 4 so the ratio is exact.
  heightPx = 4 * Math.ceil(heightPx / 4);
  widthPx = (heightPx / 4) * 3;

  return {
    widthPx,
    heightPx,
    fit,
    requiresRetake: widthPx < INVENTORY_MIN_SHORT_SIDE
  };
}

/** Shift, in source pixels, that keeps the crop inside the photo. */
export function cropShift(box: AxisBox, plan: CropPlan, source: SourceSize): { x: number; y: number } {
  const ux = Math.cos(box.angleRad);
  const uy = Math.sin(box.angleRad);
  const vx = -uy;
  const vy = ux;
  const halfLength = plan.heightPx / 2;
  const halfWidth = plan.widthPx / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      const x = box.cx + su * halfLength * ux + sv * halfWidth * vx;
      const y = box.cy + su * halfLength * uy + sv * halfWidth * vy;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  let x = 0;
  let y = 0;
  if (minX < 0) x = -minX;
  else if (maxX > source.width) x = source.width - maxX;
  if (minY < 0) y = -minY;
  else if (maxY > source.height) y = source.height - maxY;
  return { x, y };
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function toPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'function' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => resolve(blob), 'image/png');
  });
}

export async function encodeInventoryPng(
  source: HTMLCanvasElement | OffscreenCanvas,
  box: AxisBox
): Promise<EncodeOutcome> {
  const size = { width: source.width, height: source.height };
  const plan = planInventoryCrop(box, size);
  if (plan.requiresRetake) {
    return {
      blob: null,
      widthPx: plan.widthPx,
      heightPx: plan.heightPx,
      requiresRetake: true,
      reason: TOO_SMALL_COPY
    };
  }

  const canvas = createCanvas(plan.widthPx, plan.heightPx);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) {
    return {
      blob: null,
      widthPx: plan.widthPx,
      heightPx: plan.heightPx,
      requiresRetake: true,
      reason: 'canvas 2d unavailable'
    };
  }

  const shift = cropShift(box, plan, size);
  ctx.clearRect(0, 0, plan.widthPx, plan.heightPx);
  ctx.save();
  ctx.translate(plan.widthPx / 2, plan.heightPx / 2);
  // Put the approved length axis on the vertical of the portrait frame.
  ctx.rotate(-box.angleRad - Math.PI / 2);
  ctx.translate(-(box.cx + shift.x), -(box.cy + shift.y));
  ctx.drawImage(source, 0, 0);
  ctx.restore();

  const blob = await toPngBlob(canvas);
  return {
    blob,
    widthPx: plan.widthPx,
    heightPx: plan.heightPx,
    requiresRetake: false,
    reason: null
  };
}