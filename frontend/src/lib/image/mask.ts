import {
  BLACK_THRESH, GREEN_HUE_HI, GREEN_HUE_LO, GREEN_SAT_MIN, GREEN_VAL_MIN
} from '../math/constants';

export type SheetMode = 'auto' | 'green' | 'black';
export type ImageDataLike = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
export type MaskResult = {
  mask: Uint8Array; width: number; height: number; pixelCount: number; sheetUsed: 'green' | 'black';
};

export function rgbToHsv(p: { r: number; g: number; b: number }) {
  const r = p.r / 255, g = p.g / 255, b = p.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

export function classifySheetFromHsv(avg: { h: number; s: number; v: number }) {
  if (avg.h >= GREEN_HUE_LO && avg.h <= GREEN_HUE_HI && avg.s >= GREEN_SAT_MIN) return 'green' as const;
  if (avg.v <= BLACK_THRESH && avg.s <= 20) return 'black' as const;
  return 'unknown' as const;
}

export function averageBorderHsv(image: ImageDataLike) {
  const { data, width, height } = image;
  const strip = Math.max(1, Math.floor(Math.min(width, height) * 0.03));
  let sumH = 0, sumS = 0, sumV = 0, n = 0;
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const hsv = rgbToHsv({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
    sumH += hsv.h; sumS += hsv.s; sumV += hsv.v; n++;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y < strip || y >= height - strip || x < strip || x >= width - strip) sample(x, y);
    }
  }
  return n === 0 ? { h: 0, s: 0, v: 0 } : { h: sumH / n, s: sumS / n, v: sumV / n };
}

export function thresholdsForSensitivity(sensitivity0to100: number) {
  const s = Math.min(100, Math.max(0, sensitivity0to100)) / 100;
  const d = s - 0.5;
  return {
    hueLo: GREEN_HUE_LO - d * 20,
    hueHi: GREEN_HUE_HI + d * 20,
    satMin: GREEN_SAT_MIN - d * 40,
    valMin: GREEN_VAL_MIN - d * 40,
    blackThresh: BLACK_THRESH + d * 40,
    blackSatMax: 20 + d * 20
  };
}

function isSheetPixel(hsv: { h: number; s: number; v: number }, sheet: 'green' | 'black', t: ReturnType<typeof thresholdsForSensitivity>) {
  if (sheet === 'green') return hsv.h >= t.hueLo && hsv.h <= t.hueHi && hsv.s >= t.satMin && hsv.v >= t.valMin;
  return hsv.v <= t.blackThresh && hsv.s <= t.blackSatMax;
}

export function buildSheetColorMap(image: ImageDataLike, sheet: 'green' | 'black', sensitivity0to100: number) {
  const { data, width, height } = image;
  const n = width * height;
  const t = thresholdsForSensitivity(sensitivity0to100);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = isSheetPixel(rgbToHsv({ r: data[o]!, g: data[o + 1]!, b: data[o + 2]! }), sheet, t) ? 1 : 0;
  }
  return out;
}

export function floodFillRemoveBorderSheet(isSheetColor: Uint8Array, width: number, height: number) {
  const n = width * height;
  const removed = new Uint8Array(n);
  const visited = new Uint8Array(n);
  const qx = new Int32Array(n);
  const qy = new Int32Array(n);
  let qh = 0, qt = 0;
  const push = (x: number, y: number) => {
    const i = y * width + x;
    if (visited[i] || !isSheetColor[i]) return;
    visited[i] = 1; removed[i] = 1; qx[qt] = x; qy[qt] = y; qt++;
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (qh < qt) {
    const x = qx[qh]!, y = qy[qh]!; qh++;
    if (x > 0) push(x - 1, y);
    if (x + 1 < width) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < height) push(x, y + 1);
  }
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = removed[i] ? 0 : 1;
  return mask;
}

export function countMaskPixels(mask: Uint8Array) {
  let c = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) c++; return c;
}

function resolveSheet(image: ImageDataLike, mode: SheetMode): 'green' | 'black' {
  if (mode === 'green' || mode === 'black') return mode;
  const avg = averageBorderHsv(image);
  const c = classifySheetFromHsv(avg);
  if (c === 'green' || c === 'black') return c;
  return avg.v <= 40 ? 'black' : 'green';
}

export function runMask(imageData: ImageDataLike, sheet: SheetMode, sensitivity0to100: number): MaskResult {
  const { width, height } = imageData;
  const sheetUsed = resolveSheet(imageData, sheet);
  const isSheet = buildSheetColorMap(imageData, sheetUsed, sensitivity0to100);
  const mask = floodFillRemoveBorderSheet(isSheet, width, height);
  return { mask, width, height, pixelCount: countMaskPixels(mask), sheetUsed };
}
