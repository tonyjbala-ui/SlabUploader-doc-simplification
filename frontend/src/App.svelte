<script lang="ts">
  import { onMount } from 'svelte';
  import { checkBrowser } from '$lib/browser/gate';
  import { clearDraft, loadDraft, saveDraft, type DraftRecord } from '$lib/draft/store';
  import { MASK_DEBOUNCE_MS } from '$lib/math/constants';
  import { computeBdft, computeScale, computeSqft } from '$lib/math/area';
  import { roundLengthToEighth } from '$lib/math/units';
  import { confirmAxis, rotateBox, type AxisBox } from '$lib/math/axis';
  import { minAreaRectFromMask } from '$lib/image/minAreaRect';
  import { drawAxisBox, drawCheckerOverlay } from '$lib/image/overlay';
  import { sampleWidthsAlongAxis } from '$lib/image/sampleWidths';
  import { encodeInventoryPng } from '$lib/image/encodePng';
  import type { SheetMode } from '$lib/image/mask';
  import type { WidthStats } from '$lib/math/widths';
  import MaskWorker from './workers/mask.worker.ts?worker';

  const gate = checkBrowser();
  let state = $state('add-photo');
  let photoDataUrl = $state(null);
  let sourceImage = $state(null);
  let sheet = $state('auto');
  let sensitivity = $state(50);
  let mask = $state(null);
  let pixelCount = $state(0);
  let sheetUsed = $state(null);
  let overlayUrl = $state(null);
  let busy = $state(false);
  let box = $state(null);
  let userRot = $state(0);
  let lengthIn = $state(96);
  let thicknessIn = $state(1.5);
  let sqft = $state(null);
  let bdft = $state(null);
  let widths = $state(null);
  let pngUrl = $state(null);
  let retake = $state(null);
  let error = $state(null);
  let worker = null;
  let jobId = 0;
  let debounce;
  let preview = $state();

  onMount(() => {
    worker = new MaskWorker();
    worker.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg.ok) { busy = false; return; }
      mask = new Uint8Array(msg.mask);
      pixelCount = msg.pixelCount;
      sheetUsed = msg.sheetUsed;
      paintOverlay();
      busy = false;
      persist();
    };
    loadDraft().then((d) => {
      if (!d) return;
      state = 'resume';
      applyDraft(d);
    });
    return () => worker?.terminate();
  });

  function applyDraft(d) {
    photoDataUrl = d.photoDataUrl;
    sheet = d.sheet;
    sensitivity = d.sensitivity;
    lengthIn = d.lengthIn ?? 96;
    thicknessIn = d.thicknessIn ?? 1.5;
    if (d.photoDataUrl) void decodeFromUrl(d.photoDataUrl);
    if (d.axis) {
      box = { center: d.axis.center, lengthPx: d.axis.lengthPx, widthPx: d.axis.widthPx, angleRad: d.axis.angleRad };
      userRot = d.axis.userRotationRad;
    }
  }

  async function persist() {
    const draft = {
      state: state === 'resume' ? 'add-photo' : state,
      photoDataUrl, sheet, sensitivity, maskPixelCount: pixelCount,
      axis: box ? { center: box.center, lengthPx: box.lengthPx, widthPx: box.widthPx, angleRad: box.angleRad, userRotationRad: userRot } : null,
      lengthIn, thicknessIn, updatedAt: Date.now()
    };
    await saveDraft(draft);
  }

  async function decodeFromUrl(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    sourceImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  async function onFile(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    error = null;
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    sourceImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    state = 'mask';
    scheduleMask(true);
    persist();
  }

  function scheduleMask(immediate = false) {
    if (!sourceImage || !worker) return;
    window.clearTimeout(debounce);
    const run = () => {
      if (!sourceImage || !worker) return;
      busy = true;
      const copy = sourceImage.data.buffer.slice(0);
      worker.postMessage({ id: ++jobId, width: sourceImage.width, height: sourceImage.height, buffer: copy, sheet, sensitivity }, [copy]);
    };
    if (immediate) run();
    else debounce = window.setTimeout(run, MASK_DEBOUNCE_MS);
  }

  function paintOverlay() {
    if (!sourceImage || !mask || !preview) return;
    preview.width = sourceImage.width;
    preview.height = sourceImage.height;
    drawCheckerOverlay(preview.getContext('2d'), sourceImage, mask, sourceImage.width, sourceImage.height);
    overlayUrl = preview.toDataURL('image/png');
  }

  function paintAxis() {
    if (!sourceImage || !mask || !preview || !box) return;
    preview.width = sourceImage.width;
    preview.height = sourceImage.height;
    const ctx = preview.getContext('2d');
    drawCheckerOverlay(ctx, sourceImage, mask, sourceImage.width, sourceImage.height);
    drawAxisBox(ctx, rotateBox(box, userRot), 1, 1);
    overlayUrl = preview.toDataURL('image/jpeg', 0.7);
  }

  function approveMask() {
    if (!mask || pixelCount <= 0 || !sourceImage) { error = 'No slab pixels. Retake the photo.'; return; }
    const found = minAreaRectFromMask(mask, sourceImage.width, sourceImage.height);
    if (!found) { error = 'Could not fit a rectangle. Retake.'; return; }
    box = found; userRot = 0; state = 'axis'; error = null; paintAxis(); persist();
  }

  function approveAxis() {
    if (!box) return;
    box = rotateBox(box, userRot); userRot = 0; state = 'measure'; persist();
  }

  async function calculate() {
    if (!mask || !box || !sourceImage) return;
    const L = roundLengthToEighth(lengthIn);
    const T = roundLengthToEighth(thicknessIn);
    lengthIn = L; thicknessIn = T;
    const confirmed = confirmAxis(box, 0);
    const scale = computeScale(confirmed.lengthPx, L);
    sqft = computeSqft(pixelCount, scale);
    bdft = computeBdft(sqft, T);
    widths = sampleWidthsAlongAxis(mask, sourceImage.width, sourceImage.height, confirmed, L, scale);
    const encoded = await encodeInventoryPng(sourceImage, mask, confirmed);
    retake = encoded.retakeReason;
    if (pngUrl) URL.revokeObjectURL(pngUrl);
    pngUrl = encoded.objectUrl;
    persist();
  }

  async function startFresh() {
    await clearDraft();
    photoDataUrl = sourceImage = mask = overlayUrl = box = pngUrl = sqft = bdft = widths = retake = null;
    pixelCount = 0; state = 'add-photo';
  }

  function continueDraft() {
    if (photoDataUrl && sourceImage) {
      state = mask && pixelCount > 0 ? (box ? 'measure' : 'mask') : 'mask';
      if (state === 'mask') scheduleMask(true);
      if (box && mask) paintAxis();
    } else state = 'add-photo';
  }
</script>

<div class="wrap">
  <h1>SlabUploader — Capture</h1>
  {#if !gate.ok}
    <div class="card warn">{gate.reason}</div>
  {:else}
    <canvas bind:this={preview} hidden></canvas>
    {#if state === 'resume'}
      <div class="stack card">
        <p>A device draft is on this phone. Continue or start fresh.</p>
        <div class="row">
          <button onclick={continueDraft}>Continue</button>
          <button class="secondary" onclick={startFresh}>Start fresh</button>
        </div>
      </div>
    {/if}
    {#if state === 'add-photo'}
      <div class="stack card">
        <p>Photograph the slab on a green or black sheet. Top-down. Sheet around the slab. Length along the long side of the picture.</p>
        <label>Add photo<input type="file" accept="image/*" capture="environment" onchange={onFile} /></label>
      </div>
    {/if}
    {#if state === 'mask'}
      <div class="stack">
        {#if overlayUrl}<img class="preview" src={overlayUrl} alt="Mask overlay" />
        {:else if photoDataUrl}<img class="preview" src={photoDataUrl} alt="Source" />{/if}
        {#if busy}<div class="busy">Updating mask…</div>{/if}
        <div class="card stack">
          <label>Sheet
            <select bind:value={sheet} onchange={() => scheduleMask(true)}>
              <option value="auto">Auto</option><option value="green">Green</option><option value="black">Black</option>
            </select>
          </label>
          <div class="row">
            <button class="secondary" onclick={() => { sensitivity = Math.max(0, sensitivity - 1); scheduleMask(); }}>-</button>
            <label style="flex:1">Sensitivity {sensitivity}
              <input type="range" min="0" max="100" step="1" bind:value={sensitivity} oninput={() => scheduleMask()} />
            </label>
            <button class="secondary" onclick={() => { sensitivity = Math.min(100, sensitivity + 1); scheduleMask(); }}>+</button>
          </div>
          <p>Slab pixels: {pixelCount}{sheetUsed ? ` · keyed ${sheetUsed}` : ''}</p>
          {#if error}<p class="warn">{error}</p>{/if}
          <div class="row">
            <button class="secondary" onclick={() => (state = 'add-photo')}>Back</button>
            <button disabled={pixelCount <= 0} onclick={approveMask}>Approve mask</button>
          </div>
        </div>
      </div>
    {/if}
    {#if state === 'axis'}
      <div class="stack">
        {#if overlayUrl}<img class="preview" src={overlayUrl} alt="Length axis" />{/if}
        <div class="card stack">
          <p>Yellow box is the minimum-area rectangle. Cyan line is the length axis. Rotate if it does not follow the slab.</p>
          <div class="row">
            <button class="secondary" onclick={() => { userRot -= Math.PI / 36; paintAxis(); }}>Rotate −5°</button>
            <button class="secondary" onclick={() => { userRot += Math.PI / 36; paintAxis(); }}>Rotate +5°</button>
          </div>
          <div class="row">
            <button class="secondary" onclick={() => (state = 'mask')}>Back</button>
            <button onclick={approveAxis}>Approve axis</button>
          </div>
        </div>
      </div>
    {/if}
    {#if state === 'measure'}
      <div class="stack">
        {#if pngUrl}<img class="preview" src={pngUrl} alt="Inventory PNG" />
        {:else if overlayUrl}<img class="preview" src={overlayUrl} alt="Slab" />{/if}
        <div class="card stack">
          <div class="nums">
            <label>Length (in)<input type="number" step="0.125" min="0.125" bind:value={lengthIn} /></label>
            <label>Thickness (in)<input type="number" step="0.125" min="0.125" bind:value={thicknessIn} /></label>
          </div>
          <button onclick={calculate}>Calculate</button>
          {#if sqft !== null && bdft !== null}<p class="ok">sqft {sqft.toFixed(2)} · bdft {bdft.toFixed(2)}</p>{/if}
          {#if widths}<p>Widths in: min {widths.min} · max {widths.max} · avg {widths.avg}</p>{/if}
          {#if retake}<p class="warn">{retake}</p>{/if}
          <div class="row">
            <button class="secondary" onclick={() => (state = 'axis')}>Back</button>
            <button class="secondary" onclick={startFresh}>Start fresh</button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
