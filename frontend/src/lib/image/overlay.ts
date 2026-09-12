import type { AxisBox } from '../math/axis';

export function drawCheckerOverlay(
  ctx: CanvasRenderingContext2D,
  source: ImageData,
  mask: Uint8Array,
  width: number,
  height: number
): void {
  const out = ctx.createImageData(width, height);
  const src = source.data;
  const dst = out.data;
  const tile = 12;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      if (mask[i]) {
        dst[o] = src[o]!;
        dst[o + 1] = src[o + 1]!;
        dst[o + 2] = src[o + 2]!;
        dst[o + 3] = 255;
      } else {
        const on = ((x / tile) | 0) + ((y / tile) | 0);
        const g = on % 2 === 0 ? 214 : 236;
        dst[o] = g;
        dst[o + 1] = g;
        dst[o + 2] = g;
        dst[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

export function drawAxisBox(
  ctx: CanvasRenderingContext2D,
  box: AxisBox,
  scaleX: number,
  scaleY: number
): void {
  const cx = box.center.x * scaleX;
  const cy = box.center.y * scaleY;
  const hw = (box.lengthPx / 2) * scaleX;
  const hh = (box.widthPx / 2) * scaleY;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(box.angleRad);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
  ctx.beginPath();
  ctx.moveTo(-hw, 0);
  ctx.lineTo(hw, 0);
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}
