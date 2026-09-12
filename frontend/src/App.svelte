<script lang="ts">
  import { collectGateEnv, gate, NOT_SUPPORTED_COPY } from '$lib/browser/gate';
  import { applyMaskAlphaInto } from '$lib/image/overlay';
  import type { MaskRequest, MaskResponse, SheetMode } from '$lib/image/mask';

  type AppState = 'resume' | 'photo' | 'mask' | 'axis' | 'measure';

  const MASK_EMPTY_COPY = 'Mask is empty. Retake the photo.';
  const BUSY_AFTER_MS = 300;
  const OVERLAY_DEBOUNCE_MS = 2000;

  const gateResult = gate(collectGateEnv());

  let state = $state<AppState>('photo');
  let draftExists = $state(false);
  let fileInput: HTMLInputElement | null = $state(null);
  let previewCanvas: HTMLCanvasElement | null = $state(null);
  let wrapW = $state(360);
  let viewH = $state(800);

  let sheet = $state<SheetMode>('auto');
  let sensitivity = $state(50);
  let slabPixelCount = $state(0);
  let sheetUsed = $state<'green' | 'black' | null>(null);
  let busy = $state(false);
  let photoError = $state<string | null>(null);
  let maskError = $state<string | null>(null);

  // Source pixels and the work canvas are not reactive: they are large, and the
  // preview is display only. All math reads these, never the CSS size.
  let srcW = 0;
  let srcH = 0;
  let srcPixels: Uint8ClampedArray | null = null;
  let workPixels: Uint8ClampedArray | null = null;
  let workCanvas: HTMLCanvasElement | null = null;
  let mask: Uint8Array | null = null;
  let lastGoodMask = $state(false);
  let maskReady = false;
  let worker: Worker | null = null;
  let requestSeq = 0;
  let pendingId = 0;
  let busyTimer: ReturnType<typeof setTimeout> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const previewBox = $derived.by(() => {
    if (!srcW || !srcH) return { w: 0, h: 0 };
    const factor = state === 'measure' ? 0.46 : 0.44;
    const maxH = Math.max(180, Math.round(viewH * factor));
    let w = Math.min(wrapW, srcW);
    let h = (w * srcH) / srcW;
    if (h > maxH) {
      h = maxH;
      w = (maxH * srcW) / srcH;
    }
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  });

  function makeCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  async function onPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    await decodePhoto(file);
  }

  /** Decode once. Every later step works on these source pixels. */
  async function decodePhoto(blob: Blob) {
    photoError = null;
    maskError = null;
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      srcW = bitmap.width;
      srcH = bitmap.height;
      const canvas = makeCanvas(srcW, srcH);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d unavailable');
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, srcW, srcH);
      bitmap.close();
      srcPixels = imageData.data;
      workPixels = new Uint8ClampedArray(srcPixels.length);
      workPixels.set(srcPixels);
      workCanvas = canvas;
      mask = null;
      lastGoodMask = false;
      slabPixelCount = 0;
      sheetUsed = null;
      maskReady = true;
      state = 'mask';
      requestMask();
    } catch {
      photoError = 'Photo could not be read.';
      state = 'photo';
    }
  }

  function getWorker(): Worker {
    if (!worker) {
      worker = new Worker(new URL('./workers/mask.worker.ts', import.meta.url), {
        type: 'module'
      });
      worker.onmessage = onWorkerMessage;
      worker.onerror = onWorkerError;
    }
    return worker;
  }

  /** Runs in the worker. The last good overlay stays on screen while it runs. */
  function requestMask() {
    if (!srcPixels || !srcW || !srcH) return;
    const id = ++requestSeq;
    pendingId = id;
    if (busyTimer) clearTimeout(busyTimer);
    busyTimer = setTimeout(() => {
      if (pendingId === id) busy = true;
    }, BUSY_AFTER_MS);
    const request: MaskRequest = {
      id,
      data: srcPixels.slice(),
      width: srcW,
      height: srcH,
      sheet,
      sensitivity
    };
    getWorker().postMessage(request);
  }

  function onWorkerMessage(event: MessageEvent<MaskResponse>) {
    const response = event.data;
    if (response.id !== pendingId) return;
    if (busyTimer) clearTimeout(busyTimer);
    busy = false;
    if (!response.ok) {
      // Keep the last overlay. The user may retake.
      maskError = 'The last pass failed. Retake the photo if the overlay is wrong.';
      return;
    }
    maskError = null;
    mask = response.mask;
    lastGoodMask = true;
    slabPixelCount = response.slabPixelCount;
    sheetUsed = response.sheetUsed;
    paintMask();
  }

  function onWorkerError() {
    if (busyTimer) clearTimeout(busyTimer);
    busy = false;
    maskError = 'The last pass failed. Retake the photo if the overlay is wrong.';
  }

  /** Slab pixels stay the photograph; removed pixels show the checkerboard. */
  function paintMask() {
    if (!workCanvas || !workPixels || !srcPixels || !mask) return;
    const ctx = workCanvas.getContext('2d');
    if (!ctx) return;
    applyMaskAlphaInto(workPixels, srcPixels, mask);
    ctx.putImageData(new ImageData(workPixels, srcW, srcH), 0, 0);
    drawPreview();
  }

  function drawPreview() {
    if (!previewCanvas || !workCanvas) return;
    const { w, h } = previewBox;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    previewCanvas.width = Math.max(1, Math.round(w * dpr));
    previewCanvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(workCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
  }

  function setSheet(next: SheetMode) {
    if (sheet === next) return;
    sheet = next;
    requestMask();
  }

  function approveMask() {
    if (!lastGoodMask || slabPixelCount === 0) return;
    state = 'axis';
  }

  function retake() {
    srcPixels = null;
    workPixels = null;
    workCanvas = null;
    mask = null;
    lastGoodMask = false;
    slabPixelCount = 0;
    sheetUsed = null;
    maskReady = false;
    state = 'photo';
  }

  function back() {
    if (state === 'mask') retake();
    else if (state === 'axis') state = 'mask';
    else if (state === 'measure') state = 'axis';
    else if (state === 'photo' && draftExists) state = 'resume';
  }

  $effect(() => {
    viewH = window.innerHeight;
    const onResize = () => {
      viewH = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  });

  // 2.0 s after the last sensitivity change.
  $effect(() => {
    const value = sensitivity;
    void value;
    if (!maskReady) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => requestMask(), OVERLAY_DEBOUNCE_MS);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });

  $effect(() => {
    void previewBox.w;
    void previewBox.h;
    void state;
    drawPreview();
  });
</script>

{#snippet preview()}
  <div class="preview" bind:clientWidth={wrapW}>
    <div class="stage" style="width:{previewBox.w}px;height:{previewBox.h}px">
      <canvas
        bind:this={previewCanvas}
        style="width:{previewBox.w}px;height:{previewBox.h}px"
      ></canvas>
      {#if busy}
        <span class="busy" aria-label="working"></span>
      {/if}
    </div>
  </div>
{/snippet}

{#if !gateResult.supported}
  <div class="stop">
    <h1>{NOT_SUPPORTED_COPY}</h1>
  </div>
{:else}
  <div class="app">
    {#if state === 'resume'}
      <div class="field">
        <p class="label">You have a slab in progress on this device.</p>
        <div class="actions">
          <button class="primary" onclick={() => (state = 'mask')}>Continue</button>
          <button onclick={retake}>Start fresh</button>
        </div>
      </div>
    {/if}

    {#if state === 'photo'}
      <div class="field">
        <p class="label">Add photo</p>
        <ul class="rules">
          <li>Photograph the slab on a green or black sheet.</li>
          <li>Sheet fills the frame around the slab.</li>
          <li>Slab is fully on the sheet.</li>
          <li>First photo is top-down, lens parallel to the face.</li>
          <li>Length of the slab is aligned with the long side of the picture.</li>
        </ul>
        {#if photoError}
          <p class="error">{photoError}</p>
        {/if}
        <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onPick} />
        <button class="primary" onclick={() => fileInput?.click()}>Add photo</button>
      </div>
    {/if}

    {#if state === 'mask'}
      {@render preview()}

      <div class="field">
        <p class="label">Sheet</p>
        <div class="seg" role="group" aria-label="Sheet">
          <button aria-pressed={sheet === 'auto'} onclick={() => setSheet('auto')}>Auto</button>
          <button aria-pressed={sheet === 'green'} onclick={() => setSheet('green')}>Green</button>
          <button aria-pressed={sheet === 'black'} onclick={() => setSheet('black')}>Black</button>
        </div>
      </div>

      <div class="field">
        <div class="row">
          <span class="label">Sensitivity</span>
          <span class="grow"></span>
          <span class="value">{sensitivity}</span>
        </div>
        <div class="row">
          <button
            class="thumb"
            aria-label="less sensitivity"
            onclick={() => (sensitivity = Math.max(0, sensitivity - 1))}>−</button
          >
          <span class="grow">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={sensitivity}
              oninput={(event) => (sensitivity = Number(event.currentTarget.value))}
            />
          </span>
          <button
            class="thumb"
            aria-label="more sensitivity"
            onclick={() => (sensitivity = Math.min(100, sensitivity + 1))}>+</button
          >
        </div>
        {#if maskError}
          <p class="error">{maskError}</p>
        {/if}
        {#if lastGoodMask && slabPixelCount === 0}
          <p class="warn">{MASK_EMPTY_COPY}</p>
        {/if}
      </div>

      <div class="actions">
        <button class="primary" disabled={!lastGoodMask || slabPixelCount === 0} onclick={approveMask}>
          Approve mask
        </button>
        <button onclick={retake}>Retake photo</button>
      </div>
      <button class="text" onclick={back}>Back</button>
    {/if}

    {#if state === 'axis' || state === 'measure'}
      {@render preview()}
      <div class="field">
        <p class="label">{state === 'axis' ? 'Length axis' : 'Measure'}</p>
        <p class="hint">Not built yet.</p>
      </div>
      <button class="text" onclick={back}>Back</button>
    {/if}
  </div>
{/if}

<style>
  .stage {
    position: relative;
  }

  .stage canvas {
    position: absolute;
    left: 0;
    top: 0;
  }

  .busy {
    position: absolute;
    right: 8px;
    top: 8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.65);
    border-top-color: #1c1917;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>