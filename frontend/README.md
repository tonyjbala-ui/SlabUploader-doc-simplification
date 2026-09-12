# SlabUploader — Milestone 1 (Capture)

Static app. Vite + Svelte 5 + TypeScript. No backend, no inference URL, no model call.
Spec: `../docs/CAPTURE.md`. Field names and destination: `../docs/PRODUCT.md`.

## Run

```bash
cd frontend
npm install
npm test          # vitest: math, rectangle, width sampler
npm run dev       # http://localhost:5173
npm run build     # static bundle in dist/
```

Docker:

```bash
docker build -f frontend/Dockerfile -t slabuploader-m1 frontend
docker run --rm -p 18080:80 slabuploader-m1
```

## What it does

One photo of a slab on a green or black sheet. The app keys the sheet, keeps the slab,
finds its minimum-area rectangle and length axis, asks for length and thickness, and shows
an inventory PNG with widths, sqft, and board feet. Milestone 1 stops there: there is no
WooCommerce create and no device-to-store handoff.

States: Resume → Add photo → Mask → Length axis → Measure. Back returns to the previous
state; approve advances. One photo component is reused by every state after Add photo.

## Browser support

Phone: iOS Safari, Android Chrome. PC: Chrome, Edge, Firefox. Anything else gets a hard
stop screen. The gate is engine based (`src/lib/browser/gate.ts`), so desktop Chromium
browsers other than Chrome/Edge also pass.

## Rules that matter

- Preview is display only. Mask, rectangle, scale, sqft, and PNG encode read source photo
  pixels, never the CSS size.
- The mask is deterministic: green chroma key or black brightness cutoff, background =
  sheet pixels connected to the photo border, then the largest non-sheet blob is the slab.
  No ML. Sensitivity 0 is loose, 100 is tight.
- `scale = longest_axis_px / L`, `sqft = (mask_pixels / scale²) / 144`, `bdft = sqft × thickness`.
  Board feet are never divided by 12.
- Inventory PNG: 8-bit RGBA, alpha kept, 3:4 portrait, slab centred at 80% fill, at least
  1600 px on the shorter side or the photo is refused. Never upscaled.
- One device draft in IndexedDB (not a WooCommerce draft). Continue restores the last
  approved state; Start fresh deletes it.
