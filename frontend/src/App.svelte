<script lang="ts">
  import { collectGateEnv, gate, NOT_SUPPORTED_COPY } from '$lib/browser/gate';

  type AppState = 'resume' | 'photo' | 'mask' | 'axis' | 'measure';

  const gateResult = gate(collectGateEnv());

  let state = $state<AppState>('photo');
  let photoUrl = $state<string | null>(null);
  let photoBlob = $state<Blob | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  // A device draft is the only reason Resume appears. Milestone 1 slice 6 wires it.
  let draftExists = $state(false);

  function onPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    photoBlob = file;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(file);
    state = 'mask';
  }

  function startFresh() {
    draftExists = false;
    photoBlob = null;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    state = 'photo';
  }
</script>

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
        <input
          bind:this={fileInput}
          type="file"
          accept="image/*"
          hidden
          onchange={onPick}
        />
        <button class="primary" onclick={() => fileInput?.click()}>Add photo</button>
      </div>
    {/if}

    {#if state === 'mask' || state === 'axis' || state === 'measure'}
      <div class="field">
        <p class="label">{state === 'mask' ? 'Mask' : state === 'axis' ? 'Length axis' : 'Measure'}</p>
        <p class="hint">Not implemented in this slice.</p>
      </div>
    {/if}
  </div>
{/if}