# Product requirements

SlabUploader creates one WooCommerce listing per wood slab for Whidbey Wood Store.

Each slab is one unit and one listing. Photos and metadata are the inventory record.

Photographs are taken of the slab on a green or black sheet. That is the capture starting state.

## Complete listing

- Inventory photo(s), uniform 3:4 transparent PNG
- SKU, length, thickness, price
- Species, wood category, edge type, figure, grade
- Thickness band, moisture
- One or more `fig-*` tags
- Title, short title, description
- Zero or more `feat-*` tags

Store categories, attributes, and `fig-*` / `feat-*` tags are the filters. Measured values feed title and description templates.

## Decision rights

| Field | Source |
|---|---|
| Length, thickness | User |
| SKU | User |
| Mask and crop | App proposal, user approve |
| Widths, sqft, bdft | App, from approved reference photo + length + thickness |
| Species, wood category, edge, figure, grade, tags | App may propose; user may change |
| Price | App proposal `bdft × species $/bdft`; user may replace |
| Title, short title, description | Templates from listing facts; user may edit |

## System seams

Milestone 1 runs in the browser. No backend and no inference URL.
Handoff is the device draft: source photo, approved mask, inventory PNG, length, thickness, widths, sqft, bdft.
Milestone 3 uses FastAPI as the Woo client. Store credentials stay on the server.

## Create

`SLAB-UAT-*` creates as a WooCommerce draft (store status).
Duplicate SKU blocks create.
A listing can be created with inference off.
A device draft in the app is separate from a WooCommerce draft.

## Milestones

Work is split into four milestones. Each milestone is done when its acceptance can be demonstrated.

### Milestone 1 — Capture

Spec: `docs/CAPTURE.md`. Current work.

User stories:
- Photograph a slab on a green or black sheet and remove the background.
- Set length from the bounding rectangle and get widths, sqft, and bdft.
- Leave and later Continue or Start fresh.

Acceptance: inventory PNG and measurements visible on a phone. No Woo create.

### Milestone 2 — Review

Remaining listing fields in the app.
Acceptance: every field in Complete listing is filled or proposed and editable.

### Milestone 3 — Create

WooCommerce draft for a practice SKU. Then clear the device draft.
Acceptance: `SLAB-UAT-*` exists in the store as draft.

### Milestone 4 — Assist

Optional vision and generated copy on the manual path from Milestones 1–3.
Acceptance: create still works with inference off.
