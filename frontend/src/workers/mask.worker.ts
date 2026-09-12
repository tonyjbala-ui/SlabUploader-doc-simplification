import { runMask, type SheetMode } from '../lib/image/mask';

self.onmessage = (ev: MessageEvent) => {
  const { id, width, height, buffer, sheet, sensitivity } = ev.data as {
    id: number;
    width: number;
    height: number;
    buffer: ArrayBuffer;
    sheet: SheetMode;
    sensitivity: number;
  };
  try {
    const data = new Uint8ClampedArray(buffer);
    const result = runMask({ data, width, height }, sheet, sensitivity);
    const maskCopy = result.mask.buffer.slice(0);
    (self as DedicatedWorkerGlobalScope).postMessage(
      {
        id,
        ok: true,
        width: result.width,
        height: result.height,
        pixelCount: result.pixelCount,
        sheetUsed: result.sheetUsed,
        mask: maskCopy
      },
      [maskCopy]
    );
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
};
