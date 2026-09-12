# Milestone 1 — Capture

Runs in the browser on phone and PC as ordinary client code.
No inference URL. No model. No backend. Mask, rectangle, measurements, and PNG encode are deterministic functions of the photo and user inputs.

Milestone 1 uses one reference photo. Further angles are later milestones.
Milestone 1 ends when the user sees the inventory PNG and measurements. Milestone 2 is Review. Milestone 3 is Create. This file does not create a WooCommerce product.

## Setup

Photograph the slab on a green or black sheet.

- Sheet fills the frame around the slab.
- Slab is fully on the sheet.
- First photo is top-down, lens parallel to the face.
- Length of the slab is aligned with the long side of the picture.

The app expects that sheet. Background removal keys green or black. Other backgrounds are out of Milestone 1.

## Use case

If a device draft exists:

- App opens Resume.
- User chooses Continue or Start fresh.
- Continue: app restores the last approved state.
- Start fresh: app discards the draft and opens Add photo.

Otherwise the app opens Add photo.

1. User adds one photo taken under Setup.
2. App decodes the photo and opens Mask. App keys green or black and shows an overlay: slab stays the photograph; removed pixels are a light gray checkerboard.
3. User sets sheet Auto / Green / Black and sensitivity 0–100 (slider or minus / plus). App updates the control immediately. App recomputes the overlay 2.0 seconds after the last sensitivity change. User adjusts until only the slab remains, then approves. App blocks approve if the mask has no slab pixels; user retakes. The approved mask is the footprint for every later step.
4. App draws the minimum-area bounding rectangle of the mask and the length axis on the long side of that rectangle. User rotates the axis if it does not follow the slab length, then approves the axis.
5. User enters length `L` in inches (1/8 in steps) and thickness (1/8 in steps), then presses Calculate.
6. App sets `scale = longest_axis_px / L`.
7. App computes widths, sqft, and bdft from the mask, and writes the inventory PNG.
8. User sees the PNG and the numbers. Milestone 1 stops here.

Calculate does not create a WooCommerce product.

## Browsers

Phone: iOS Safari, Android Chrome.
PC: Chrome, Edge, Firefox.
Other clients get a hard stop.

## States

One photo component is reused. Each state advances on approve. Back returns to the previous state. A device draft restores the last approved state.

1. Resume — only when a device draft exists. Continue or Start fresh.
2. Add photo — camera or picker. One photo. Setup rules visible.
3. Mask — background removal on that photo.
4. Length axis — bounding rectangle and long-side axis on the same photo.
5. Measure — length, thickness, Calculate, inventory PNG, widths, sqft, bdft. Milestone 1 stops here.

## Display

Preview fits the device width. Height is capped so Mask and Measure controls stay on screen. Phone and PC use the same states.

The preview is display only. Mask, rectangle, `scale`, sqft, and PNG encode use the source photo pixels, not the CSS size of the preview.

## Runtime

Browser APIs: `createImageBitmap`, `canvas` / `OffscreenCanvas`, Web Worker, `convertToBlob({ type: "image/png" })`, IndexedDB.
`idb-keyval` may wrap IndexedDB.
No OpenCV, ONNX, U2Net, or image-editor kit.
Sensitivity 0–100 maps to green chroma tightness and black brightness cutoff in the worker.

## Mask

Overlay: slab remains the photograph. Removed pixels are a light gray checkerboard.

Controls on this state, with the photo visible:

- Sheet: Auto, Green, or Black
- Sensitivity: 0–100, step 1. Slider with minus and plus on each side. Button hit targets sized for a thumb.

The control value updates immediately. The overlay recomputes 2.0 seconds after the last sensitivity change. A sheet change may recompute on the change.

Mask work runs in the worker. The last good overlay stays visible while a pass runs. Show a busy mark only if a pass lasts more than a fraction of a second. If a pass fails, keep the last overlay; the user may retake.

Approve is blocked when the mask has no slab pixels. User retakes.

User approves the mask when only the slab remains. That mask is the footprint for Length axis, measurements, and the inventory PNG.

## Length axis

On the same photo, draw the minimum-area bounding rectangle of the mask and the length axis on the long side of that rectangle. User rotates the axis if it does not follow the slab length, then approves the axis.

## Measure

User enters length `L` in inches (1/8 in steps) and thickness (1/8 in steps), then presses Calculate.

- `scale = longest_axis_px / L`
- Widths: min, max, avg, sampled every 6 in along the approved length axis, perpendicular to it
- `sqft = (mask_pixels / scale²) / 144` (2 decimals)
- `bdft = sqft × thickness_in` (2 decimals)

User sees the inventory PNG and those numbers. Stop. Calculate does not create a WooCommerce product.

## Device draft

One in-progress slab is stored on the device. This is not a WooCommerce draft.

On open or refresh, if that draft exists, the app opens in Resume.

- Continue restores the last approved state, including Measure.
- Start fresh discards the device draft and opens Add photo.

Milestone 3 clears the device draft after Woo create.

## Inventory PNG

Role: `kind=inventory`. Filename is an implementation detail.
The first inventory photo is the measurement reference. Later inventory photos use the same file properties.

| Property | Value |
|---|---|
| Format | PNG, 8-bit RGBA (`image/png`) |
| Alpha | Kept through encode and upload |
| Aspect | 3:4 portrait |
| Layout | Slab centered, 80% fill at the widest and tallest points |
| Size | After crop, shorter side ≥ 1600px when the source can supply it |

Source below that floor: warn and require a new photo. No upscale from an undersized source.
Editor preview of alpha is a light gray checkerboard. The storefront uses the theme background.
