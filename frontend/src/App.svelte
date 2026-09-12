<script lang="ts">
  import { collectGateEnv, gate, NOT_SUPPORTED_COPY } from '$lib/browser/gate';
  import { applyMaskAlphaInto, drawSlabOverlay, maskPixelCount } from '$lib/image/overlay';
  import {
    clearDraft,
    loadDraft,
    saveDraft,
    type Draft,
    type DraftState
  } from '$lib/draft/store';
  import { boxForAxis, hullFromMask, minAreaRectFromHull, type SlabRect } from '$lib/image/minAreaRect';
  import { sampleWidths, type WidthStats } from '$lib/image/sampleWidths';
  import {
    TOO_SMALL_COPY,
    encodeInventoryPng,
    type EncodeOutcome
  } from '$lib/image/encodePng';
  import { bdftFromSqft, sqftFromMask } from '$lib/math/area';
  import { INCH_STEP, scalePxPerInch, snapToEighth } from '$lib/math/scale';
  import type { MaskRequest, MaskResponse, SheetMode } from '$lib/image/mask';

  type AppState = 'resume' | 'photo' | 'mask' | 'axis' | 'measure';

  const MASK_EMPTY_COPY = 'Mask is empty. Retake the photo.';
  const BUSY_AFTER_MS = 300;
  const OVERLAY_DEBOUNCE_MS = 2000;

  const gateResult = gate(collectGateEnv());

  let state = $state<AppState>('photo');
  let draftExists = $state(false);
  let photoBlob = $state<Blob | null>(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let previewCanvas: HTMLCanvasElement | null = $state(null);
  let overlayCanvas: HTMLCanvasElement | null = $state(null);
  let wrapW = $state(360);
  let viewH = $state(800);

  let sheet = $state<SheetMode>('auto');
  let sensitivity = $state(50);
  let slabPixelCount = $state(0);
  let sheetUsed = $state<'green' | 'black' | null>(null);
  let busy = $state(false);
  let photoError = $state<string | null>(null);
  let maskError = $state<string | null>(null);

  let lengthText = $state('');
  let thicknessText = $state('');
  let scalePx = $state<number | null>(null);
  let widths = $state<WidthStats | null>(null);
  let sqft = $state<number | null>(null);
  let bdft = $state<number | null>(null);
  let inventoryUrl = $state<string | null>(null);
  let inventorySize = $state<{ w: number; h: number } | null>(null);
  let inventoryBlob: Blob | null = null;
  let sizeWarning = $state<string | null>(null);
  let calculating = $state(false);

  // Source pixels and the work canvas are not reactive: they are large, and the
  // preview is display only. All math reads these, never the CSS size.
  let srcW = $state(0);
  let srcH = $state(0);
  let srcPixels: Uint8ClampedArray | null = null;
  let workPixels: Uint8ClampedArray | null = null;
  let workCanvas: HTMLCanvasElement | null = null;
  let mask = $state<Uint8Array | null>(null);
  let lastGoodMask = $state(false);
  let hull = $state<Float64Array | null>(null);
  let rect = $state<SlabRect | null>(null);
  let axisAngleDeg = $state(0);
  let maskReady = false;
  let loadedDraft: Draft | null = null;
  let worker: Worker | null = null;
  let requestSeq = 0;
  let pendingId = 0;
  let busyTimer: ReturnType<typeof setTimeout> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Slab extent along the approved length axis, in source pixels. */
  const axisBox = $derived.by(() =>
    hull ? boxForAxis(hull, (axisAngleDeg * Math.PI) / 180) : null
  );

  const previewSource = $derived(
    state === 'measure' && inventorySize ? inventorySize : { w: srcW, h: srcH }
  );

  const previewBox = $derived.by(() => {
    const sw = previewSource.w;
    const sh = previewSource.h;
    if (!sw || !sh) return { w: 0, h: 0 };
    const factor = state === 'measure' ? (sqft === null ? 0.46 : 0.32) : 0.44;
    const maxH = Math.max(180, Math.round(viewH * factor));
    let w = Math.min(wrapW, sw);
    let h = (w * sh) / sw;
    if (h > maxH) {
      h = maxH;
      w = (maxH * sw) / sh;
    }
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  });

  const showInventoryPng = $derived(state === 'measure' && !!inventoryUrl);
  const showAxisOverlay = $derived(
    !!rect && !!axisBox && (state === 'axis' || (state === 'measure' && !showInventoryPng))
  );

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
    photoBlob = file;
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
    if (!lastGoodMask || slabPixelCount === 0 || !mask) return;
    hull = hullFromMask(mask, srcW, srcH);
    rect = hull ? minAreaRectFromHull(hull) : null;
    axisAngleDeg = rect ? (rect.angleRad * 180) / Math.PI : 0;
    state = 'axis';
    void persist('axis');
  }

  function approveAxis() {
    if (!rect || !axisBox) return;
    state = 'measure';
    void persist('measure');
  }

  function parseInches(text: string): number | null {
    const value = Number(text);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const canCalculate = $derived(
    parseInches(lengthText) !== null &&
      parseInches(thicknessText) !== null &&
      lastGoodMask &&
      slabPixelCount > 0 &&
      !!axisBox
  );

  function step(text: string, direction: 1 | -1): string {
    const value = parseInches(text) ?? 0;
    const next = Math.max(0, snapToEighth(value + direction * INCH_STEP));
    return String(Math.round(next * 1000) / 1000);
  }

  /**
   * scale = longest_axis_px / L, then widths, sqft, bdft, and the inventory PNG.
   * Calculate does not create a WooCommerce product.
   */
  async function calculate() {
    const lengthIn = parseInches(lengthText);
    const thicknessIn = parseInches(thicknessText);
    if (!mask || !axisBox || !workCanvas || lengthIn === null || thicknessIn === null) return;
    calculating = true;
    try {
      const nextScale = scalePxPerInch(axisBox.lengthPx, lengthIn);
      scalePx = nextScale;
      widths = sampleWidths(mask, srcW, srcH, axisBox, lengthIn, nextScale);
      sqft = sqftFromMask(slabPixelCount, nextScale);
      bdft = bdftFromSqft(sqft, thicknessIn);
      const outcome: EncodeOutcome = await encodeInventoryPng(workCanvas, axisBox);
      if (outcome.requiresRetake) {
        sizeWarning = outcome.reason ?? TOO_SMALL_COPY;
        inventoryBlob = null;
        inventorySize = null;
        if (inventoryUrl) URL.revokeObjectURL(inventoryUrl);
        inventoryUrl = null;
      } else {
        sizeWarning = null;
        inventoryBlob = outcome.blob;
        if (inventoryUrl) URL.revokeObjectURL(inventoryUrl);
        inventoryUrl = outcome.blob ? URL.createObjectURL(outcome.blob) : null;
        inventorySize = { w: outcome.widthPx, h: outcome.heightPx };
      }
      onCalculated();
    } finally {
      calculating = false;
    }
  }

  /** One in-progress slab on the device. Not a WooCommerce draft. */
  function currentDraft(draftState: DraftState): Draft | null {
    if (!photoBlob || !srcW || !srcH) return null;
    // IndexedDB structured clones the record, so reaction wrappers must come off.
    return {
      version: 1,
      state: draftState,
      photoBlob,
      sheet,
      sensitivity,
      mask: mask ? { width: srcW, height: srcH, mask: $state.snapshot(mask) } : null,
      rect: $state.snapshot(rect),
      axisAngleRad: (axisAngleDeg * Math.PI) / 180,
      lengthIn: parseInches(lengthText),
      thicknessIn: parseInches(thicknessText),
      scale: scalePx,
      widths: $state.snapshot(widths),
      sqft,
      bdft,
      inventoryPngBlob: inventoryBlob
    };
  }
  async function persist(draftState: DraftState) {
    const draft = currentDraft(draftState);
    if (!draft) return;
    await saveDraft(draft);
  }

  /** Rectangle corners as a hull, used when a restored mask is unavailable. */
  function hullFromRect(r: SlabRect): Float64Array {
    const cos = Math.cos(r.angleRad);
    const sin = Math.sin(r.angleRad);
    const halfLength = r.width / 2;
    const halfWidth = r.height / 2;
    const out = new Float64Array(8);
    const corners: Array<[number, number]> = [
      [-halfLength, -halfWidth],
      [halfLength, -halfWidth],
      [halfLength, halfWidth],
      [-halfLength, halfWidth]
    ];
    corners.forEach(([u, v], index) => {
      out[index * 2] = r.cx + u * cos - v * sin;
      out[index * 2 + 1] = r.cy + u * sin + v * cos;
    });
    return out;
  }

  /** Continue: restore the last approved state, including Measure. */
  async function continueDraft() {
    const draft = loadedDraft;
    if (!draft) {
      state = 'mask';
      return;
    }
    sheet = draft.sheet;
    sensitivity = draft.sensitivity;
    state = 'mask';
    await decodePhoto(draft.photoBlob);
    photoBlob = draft.photoBlob;

    if (draft.mask && draft.mask.width === srcW && draft.mask.height === srcH) {
      mask = draft.mask.mask;
      lastGoodMask = true;
      slabPixelCount = maskPixelCount(mask);
      paintMask();
    }

    rect = draft.rect;
    hull = mask ? hullFromMask(mask, srcW, srcH) : null;
    if (!hull && rect) hull = hullFromRect(rect);
    axisAngleDeg = draft.rect ? (draft.axisAngleRad * 180) / Math.PI : 0;

    lengthText = draft.lengthIn === null ? '' : String(draft.lengthIn);
    thicknessText = draft.thicknessIn === null ? '' : String(draft.thicknessIn);
    scalePx = draft.scale;
    widths = draft.widths;
    sqft = draft.sqft;
    bdft = draft.bdft;

    if (draft.inventoryPngBlob) {
      inventoryBlob = draft.inventoryPngBlob;
      if (inventoryUrl) URL.revokeObjectURL(inventoryUrl);
      inventoryUrl = URL.createObjectURL(draft.inventoryPngBlob);
      try {
        const bitmap = await createImageBitmap(draft.inventoryPngBlob);
        inventorySize = { w: bitmap.width, h: bitmap.height };
        bitmap.close();
      } catch {
        inventorySize = null;
      }
    }

    state = draft.state;
  }

  async function startFresh() {
    loadedDraft = null;
    draftExists = false;
    await clearDraft();
    retake();
  }

  /** Slice 6 persists the device draft here. */
  async function onCalculated() {
    await persist('measure');
    draftExists = true;
  }

  /** Rectangle and axis are drawn in display pixels from source-pixel geometry. */
  function drawAxis() {
    if (!overlayCanvas || !rect || !axisBox) return;
    const { w, h } = previewBox;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    overlayCanvas.width = Math.max(1, Math.round(w * dpr));
    overlayCanvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;
    drawSlabOverlay(ctx, rect, axisBox, { k: (w * dpr) / srcW, dpr });
  }

  function retake() {
    srcPixels = null;
    workPixels = null;
    workCanvas = null;
    mask = null;
    lastGoodMask = false;
    hull = null;
    rect = null;
    axisAngleDeg = 0;
    slabPixelCount = 0;
    sheetUsed = null;
    maskReady = false;
    if (inventoryUrl) URL.revokeObjectURL(inventoryUrl);
    inventoryUrl = null;
    inventoryBlob = null;
    inventorySize = null;
    widths = null;
    sqft = null;
    bdft = null;
    scalePx = null;
    sizeWarning = null;
    lengthText = '';
    thicknessText = '';
    loadedDraft = null;
    draftExists = false;
    void clearDraft();
    state = 'photo';
  }

  function back() {
    if (state === 'mask') retake();
    else if (state === 'axis') state = 'mask';
    else if (state === 'measure') state = 'axis';
    else if (state === 'photo' && draftExists) state = 'resume';
  }

  $effect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadDraft();
      if (cancelled || !draft) return;
      loadedDraft = draft;
      draftExists = true;
      state = 'resume';
    })();
    return () => {
      cancelled = true;
    };
  });

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
    void axisAngleDeg;
    void showInventoryPng;
    drawPreview();
    if (showAxisOverlay) drawAxis();
  });
</script>

{#snippet preview()}
  <div class="preview" bind:clientWidth={wrapW}>
    <div class="stage" style="width:{previewBox.w}px;height:{previewBox.h}px">
      {#if showInventoryPng}
        <img
          class="png"
          src={inventoryUrl}
          alt="Inventory PNG"
          style="width:{previewBox.w}px;height:{previewBox.h}px"
        />
      {:else}
        <canvas
          bind:this={previewCanvas}
          style="width:{previewBox.w}px;height:{previewBox.h}px"
        ></canvas>
        {#if showAxisOverlay}
          <canvas
            class="overlay"
            bind:this={overlayCanvas}
            style="width:{previewBox.w}px;height:{previewBox.h}px"
          ></canvas>
        {/if}
      {/if}
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
          <button class="primary" onclick={continueDraft}>Continue</button>
          <button onclick={startFresh}>Start fresh</button>
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

    {#if state === 'axis'}
      {@render preview()}

      <div class="field">
        <div class="row">
          <span class="label">Rotate axis</span>
          <span class="grow"></span>
          <span class="value">{axisAngleDeg.toFixed(1)}°</span>
        </div>
        <div class="row">
          <button
            class="thumb"
            aria-label="rotate axis counter clockwise"
            onclick={() => (axisAngleDeg = Math.max(-90, axisAngleDeg - 0.5))}>−</button
          >
          <span class="grow">
            <input
              type="range"
              min="-90"
              max="90"
              step="0.5"
              value={axisAngleDeg}
              oninput={(event) => (axisAngleDeg = Number(event.currentTarget.value))}
            />
          </span>
          <button
            class="thumb"
            aria-label="rotate axis clockwise"
            onclick={() => (axisAngleDeg = Math.min(90, axisAngleDeg + 0.5))}>+</button
          >
        </div>
      </div>

      <div class="actions">
        <button class="primary" disabled={!rect || !axisBox} onclick={approveAxis}>Approve axis</button>
      </div>
      <button class="text" onclick={back}>Back</button>
    {/if}

    {#if state === 'measure'}
      {@render preview()}

      <div class="field">
        <p class="label">Length (in)</p>
        <div class="row">
          <button
            class="thumb"
            aria-label="shorter length"
            onclick={() => (lengthText = step(lengthText, -1))}>−</button
          >
          <span class="grow">
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="0.125"
              placeholder="0"
              value={lengthText}
              oninput={(event) => (lengthText = event.currentTarget.value)}
            />
          </span>
          <button
            class="thumb"
            aria-label="longer length"
            onclick={() => (lengthText = step(lengthText, 1))}>+</button
          >
        </div>
      </div>

      <div class="field">
        <p class="label">Thickness (in)</p>
        <div class="row">
          <button
            class="thumb"
            aria-label="thinner"
            onclick={() => (thicknessText = step(thicknessText, -1))}>−</button
          >
          <span class="grow">
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="0.125"
              placeholder="0"
              value={thicknessText}
              oninput={(event) => (thicknessText = event.currentTarget.value)}
            />
          </span>
          <button
            class="thumb"
            aria-label="thicker"
            onclick={() => (thicknessText = step(thicknessText, 1))}>+</button
          >
        </div>
      </div>

      <div class="actions">
        <button class="primary" disabled={!canCalculate || calculating} onclick={calculate}>
          Calculate
        </button>
      </div>

      {#if sizeWarning}
        <div class="field">
          <p class="warn">{sizeWarning}</p>
          <button onclick={retake}>Retake photo</button>
        </div>
      {/if}

      {#if sqft !== null && widths}
        <div class="field">
          <p class="label">Inventory</p>
          <div class="readout">
            <span class="k">Width min</span><span class="v">{widths.min.toFixed(2)} in</span>
            <span class="k">Width max</span><span class="v">{widths.max.toFixed(2)} in</span>
            <span class="k">Width avg</span><span class="v">{widths.avg.toFixed(2)} in</span>
            <span class="k">Sq ft</span><span class="v">{sqft.toFixed(2)}</span>
            <span class="k">Bd ft</span><span class="v">{(bdft ?? 0).toFixed(2)}</span>
          </div>
        </div>
      {/if}

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

  .stage img.png {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
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