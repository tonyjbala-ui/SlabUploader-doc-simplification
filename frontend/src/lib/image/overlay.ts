/**
 * Overlay.
 *
 * A slab pixel keeps the photograph. A removed pixel becomes transparent, and a
 * light gray checkerboard shows through it (CSS background behind the preview,
 * same as the alpha preview of the inventory PNG).
 */

import type { RgbaImage } from './mask';

export const CHECKER_LIGHT = '#f0f0f0';
export const CHECKER_DARK = '#d4d4d4';
export const CHECKER_CELL = 16;

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