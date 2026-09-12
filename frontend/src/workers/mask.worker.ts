/// <reference lib="webworker" />
/**
 * Mask worker. The key runs here and nowhere else, on source pixels.
 */

import { runMask, type MaskRequest, type MaskResponse } from '../lib/image/mask';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<MaskRequest>) => {
  const { id, data, width, height, sheet, sensitivity } = event.data;
  try {
    const outcome = runMask({ data, width, height }, sheet, sensitivity);
    const response: MaskResponse = {
      id,
      ok: true,
      mask: outcome.mask,
      width: outcome.width,
      height: outcome.height,
      slabPixelCount: outcome.slabPixelCount,
      sheetUsed: outcome.sheetUsed
    };
    ctx.postMessage(response, [outcome.mask.buffer as ArrayBuffer]);
  } catch (error) {
    const response: MaskResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
    ctx.postMessage(response);
  }
};