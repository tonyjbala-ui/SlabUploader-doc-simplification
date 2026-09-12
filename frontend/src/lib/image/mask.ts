/**
 * Deterministic sheet keying. No ML, no inference.
 *
 * Pipeline:
 *   1. auto only: score green vs black on border pixels, pick the stronger sheet
 *   2. key the sheet colour (green = chroma, black = brightness cutoff)
 *   3. background = sheet pixels connected to the photo border
 *   4. keep the largest connected non-sheet blob as the slab, drop specks
 *
 * Sensitivity 0 = loose: fewer pixels count as sheet, so more wood is kept and
 * some sheet may remain. Sensitivity 100 = tight: more pixels count as sheet.
 */

export type SheetMode = 'auto' | 'green' | 'black';
export type SheetUsed = 'green' | 'black';

export type RgbaImage = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
};

export type MaskOutcome = {
  mask: Uint8Array;
  width: number;
  height: number;
  slabPixelCount: number;
  sheetUsed: SheetUsed;
};

/** Worker protocol. The mask worker is the only place that runs the key. */
export type MaskRequest = {
  id: number;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  sheet: SheetMode;
  sensitivity: number;
};

export type MaskResponse =
  | {
      id: number;
      ok: true;
      mask: Uint8Array;
      width: number;
      height: number;
      slabPixelCount: number;
      sheetUsed: SheetUsed;
    }
  | { id: number; ok: false; error: string };

export const GREEN_EXCESS_LOOSE = 110;
export const GREEN_EXCESS_TIGHT = 18;
export const BLACK_CUT_LOOSE = 12;
export const BLACK_CUT_TIGHT = 120;
export const GREEN_MIN_CHANNEL = 40;
export const BLACK_BORDER_LUMA = 60;
export const GREEN_BORDER_EXCESS = 40;

export function clampSensitivity(sensitivity0to100: number): number {
  if (!Number.isFinite(sensitivity0to100)) return 50;
  return Math.min(100, Math.max(0, sensitivity0to100));
}

export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Green chroma: how far green leads the strongest of red and blue. */
export function greenExcess(r: number, g: number, b: number): number {
  return g - Math.max(r, b);
}

/** Green sheet pixels at a given sensitivity. */
export function isGreenSheet(r: number, g: number, b: number, sensitivity0to100: number): boolean {
  const s = clampSensitivity(sensitivity0to100) / 100;
  const cut = GREEN_EXCESS_LOOSE + (GREEN_EXCESS_TIGHT - GREEN_EXCESS_LOOSE) * s;
  return greenExcess(r, g, b) >= cut && g >= GREEN_MIN_CHANNEL;
}

/** Black sheet pixels at a given sensitivity (brightness cutoff). */
export function isBlackSheet(r: number, g: number, b: number, sensitivity0to100: number): boolean {
  const s = clampSensitivity(sensitivity0to100) / 100;
  const cut = BLACK_CUT_LOOSE + (BLACK_CUT_TIGHT - BLACK_CUT_LOOSE) * s;
  return luminance(r, g, b) <= cut;
}

export function isSheetPixel(
  r: number,
  g: number,
  b: number,
  sheet: SheetUsed,
  sensitivity0to100: number
): boolean {
  return sheet === 'green'
    ? isGreenSheet(r, g, b, sensitivity0to100)
    : isBlackSheet(r, g, b, sensitivity0to100);
}

/**
 * Auto: score green against black on the border band and pick the stronger.
 * The spec puts the slab on a sheet that fills the frame, so the border is sheet.
 */
export function scoreBorder(image: RgbaImage): { green: number; black: number; samples: number } {
  const { data, width, height } = image;
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const step = Math.max(1, Math.round(band / 8));
  let green = 0;
  let black = 0;
  let samples = 0;
  const visit = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    if (greenExcess(r, g, b) >= GREEN_BORDER_EXCESS && g >= GREEN_MIN_CHANNEL) green++;
    if (luminance(r, g, b) <= BLACK_BORDER_LUMA) black++;
    samples++;
  };
  const ys: number[] = [];
  const xs: number[] = [];
  for (let y = 0; y < height; y += step) ys.push(y);
  for (let x = 0; x < width; x += step) xs.push(x);
  if (ys.length === 0 || xs.length === 0) return { green: 0, black: 0, samples: 0 };
  for (const y of ys) {
    const top = y < band;
    const bottom = y >= height - band;
    if (top || bottom) {
      for (const x of xs) visit(x, y);
      continue;
    }
    for (const x of xs) {
      if (x < band || x >= width - band) visit(x, y);
    }
  }
  return { green, black, samples };
}

export function resolveSheet(image: RgbaImage): SheetUsed {
  const { green, black } = scoreBorder(image);
  return green > black ? 'green' : 'black';
}

/** 1 = sheet colour, 0 = not sheet colour. */
export function buildSheetMap(
  image: RgbaImage,
  sheet: SheetUsed,
  sensitivity0to100: number
): Uint8Array {
  const { data, width, height } = image;
  const n = width * height;
  const map = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    map[i] = isSheetPixel(
      data[o] ?? 0,
      data[o + 1] ?? 0,
      data[o + 2] ?? 0,
      sheet,
      sensitivity0to100
    )
      ? 1
      : 0;
  }
  return map;
}

function growInt32(buf: Int32Array, need: number): Int32Array {
  if (need <= buf.length) return buf;
  let size = buf.length || 1024;
  while (size < need) size *= 2;
  const next = new Int32Array(size);
  next.set(buf);
  return next;
}

/**
 * Sheet pixels connected to the photo border are background. Everything else is
 * a slab candidate. Mutates `sheetMap` (marks background as 2) and returns the
 * candidate map (1 = candidate).
 */
export function removeBorderSheet(sheetMap: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  let stack = new Int32Array(Math.min(n, 1 << 18));
  let top = 0;
  const push = (index: number) => {
    if (sheetMap[index] !== 1) return;
    sheetMap[index] = 2;
    stack = growInt32(stack, top + 1);
    stack[top++] = index;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (top > 0) {
    const index = stack[--top]!;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) push(index - 1);
    if (x + 1 < width) push(index + 1);
    if (y > 0) push(index - width);
    if (y + 1 < height) push(index + width);
  }
  const candidates = new Uint8Array(n);
  for (let i = 0; i < n; i++) candidates[i] = sheetMap[i] === 0 ? 1 : 0;
  return candidates;
}

/**
 * Keep the largest 4-connected candidate blob as the slab. Every other blob is a
 * speck and is dropped. Mutates `candidates`.
 */
export function keepLargestBlob(
  candidates: Uint8Array,
  width: number,
  height: number
): { mask: Uint8Array; pixelCount: number } {
  const n = width * height;
  const mask = new Uint8Array(n);
  let stack = new Int32Array(Math.min(n, 1 << 18));
  let blob = new Int32Array(Math.min(n, 1 << 14));
  let bestBlob = new Int32Array(0);
  let top = 0;
  let blobLen = 0;
  let best = 0;

  const push = (index: number) => {
    if (candidates[index] !== 1) return;
    candidates[index] = 0;
    stack = growInt32(stack, top + 1);
    stack[top++] = index;
    blob = growInt32(blob, blobLen + 1);
    blob[blobLen++] = index;
  };

  for (let seed = 0; seed < n; seed++) {
    if (candidates[seed] !== 1) continue;
    top = 0;
    blobLen = 0;
    push(seed);
    while (top > 0) {
      const index = stack[--top]!;
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0) push(index - 1);
      if (x + 1 < width) push(index + 1);
      if (y > 0) push(index - width);
      if (y + 1 < height) push(index + width);
    }
    if (blobLen > best) {
      best = blobLen;
      bestBlob = blob.slice(0, blobLen);
    }
  }
  for (let i = 0; i < bestBlob.length; i++) mask[bestBlob[i]!] = 1;
  return { mask, pixelCount: best };
}

export function countMaskPixels(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) count++;
  return count;
}

export function runMask(image: RgbaImage, sheet: SheetMode, sensitivity0to100: number): MaskOutcome {
  const { width, height } = image;
  const sheetUsed: SheetUsed = sheet === 'auto' ? resolveSheet(image) : sheet;
  const sheetMap = buildSheetMap(image, sheetUsed, sensitivity0to100);
  const candidates = removeBorderSheet(sheetMap, width, height);
  const { mask, pixelCount } = keepLargestBlob(candidates, width, height);
  return { mask, width, height, slabPixelCount: pixelCount, sheetUsed };
}