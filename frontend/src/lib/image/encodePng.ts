import type { AxisBox } from '../math/axis';
import { planNormalizeCrop } from './normalize';

export type EncodeResult = {
  blob: Blob | null;
  objectUrl: string | null;
  requiresRetake: boolean;
  retakeReason: string | null;
  cropWidthPx: number;
  cropHeightPx: number;
};

export async function encodeInventoryPng(
  source: ImageData,
  mask: Uint8Array,
  box: AxisBox
): Promise<EncodeResult> {
  const plan = planNormalizeCrop(
    { widthPx: box.widthPx, heightPx: box.lengthPx },
    { widthPx: source.width, heightPx: source.height }
  );
  if (plan.requiresRetake) {
    return {
      blob: null,
      objectUrl: null,
      requiresRetake: true,
      retakeReason: plan.retakeReason,
      cropWidthPx: plan.cropWidthPx,
      cropHeightPx: plan.cropHeightPx
    };
  }
  const outW = Math.round(plan.cropWidthPx);
  const outH = Math.round(plan.cropHeightPx);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, outW, outH);
  const tmp = document.createElement('canvas');
  tmp.width = source.width;
  tmp.height = source.height;
  const tctx = tmp.getContext('2d')!;
  tctx.putImageData(source, 0, 0);
  const masked = tctx.getImageData(0, 0, source.width, source.height);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) masked.data[i * 4 + 3] = 0;
  }
  tctx.putImageData(masked, 0, 0);
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(-box.angleRad + Math.PI / 2);
  ctx.drawImage(tmp, -box.center.x, -box.center.y);
  ctx.restore();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  return {
    blob,
    objectUrl: blob ? URL.createObjectURL(blob) : null,
    requiresRetake: false,
    retakeReason: null,
    cropWidthPx: outW,
    cropHeightPx: outH
  };
}
