import { ASPECT_H, ASPECT_W, FILL_TARGET, OUTPUT_PX_MIN } from '../math/constants';

export type SlabBoundsPx = { widthPx: number; heightPx: number };
export type SourceImageSize = { widthPx: number; heightPx: number };

export type NormalizePlan = {
  cropWidthPx: number;
  cropHeightPx: number;
  fillX: number;
  fillY: number;
  fillAtExtremes: number;
  shorterSidePx: number;
  requiresRetake: boolean;
  retakeReason: string | null;
};

export function planNormalizeCrop(slab: SlabBoundsPx, source?: SourceImageSize): NormalizePlan {
  if (!(slab.widthPx > 0) || !(slab.heightPx > 0)) {
    throw new RangeError('planNormalizeCrop: slab bounds must be > 0');
  }
  const fill = FILL_TARGET;
  const cropWFromWidth = slab.widthPx / fill;
  const cropHFromWidth = (cropWFromWidth * ASPECT_H) / ASPECT_W;
  const cropHFromHeight = slab.heightPx / fill;
  const cropWFromHeight = (cropHFromHeight * ASPECT_W) / ASPECT_H;

  let cropWidthPx: number;
  let cropHeightPx: number;
  if (cropWFromWidth >= cropWFromHeight) {
    cropWidthPx = cropWFromWidth;
    cropHeightPx = cropHFromWidth;
  } else {
    cropWidthPx = cropWFromHeight;
    cropHeightPx = cropHFromHeight;
  }

  const fillX = slab.widthPx / cropWidthPx;
  const fillY = slab.heightPx / cropHeightPx;
  const fillAtExtremes = Math.max(fillX, fillY);
  const shorterSidePx = Math.min(cropWidthPx, cropHeightPx);

  let requiresRetake = false;
  let retakeReason: string | null = null;
  if (shorterSidePx + 1e-9 < OUTPUT_PX_MIN) {
    requiresRetake = true;
    retakeReason = `shorter side ${shorterSidePx.toFixed(0)}px < ${OUTPUT_PX_MIN}px; retake, no upscale`;
  }
  if (source) {
    if (cropWidthPx > source.widthPx + 1e-9 || cropHeightPx > source.heightPx + 1e-9) {
      requiresRetake = true;
      retakeReason =
        retakeReason ??
        `crop ${cropWidthPx.toFixed(0)}×${cropHeightPx.toFixed(0)} exceeds source ${source.widthPx}×${source.heightPx}`;
    }
  }
  return {
    cropWidthPx,
    cropHeightPx,
    fillX,
    fillY,
    fillAtExtremes,
    shorterSidePx,
    requiresRetake,
    retakeReason
  };
}
