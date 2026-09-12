# AGENTS.md

## Agent context

Read this file and `docs/CAPTURE.md`.
Implement Milestone 1 only. Specification: `docs/CAPTURE.md`.
PRD: `docs/PRODUCT.md` for destination and field names. Do not implement Milestone 2, 3, or 4.

## Milestone 1

Capture.
Acceptance: on a phone, one real slab, approved mask, approved length-axis rectangle, user length and thickness, inventory PNG on screen, widths and board feet on screen.

Milestone 1 is inference-free. Background removal, rectangle, measurements, and PNG encode run in the browser as ordinary code. There is no inference URL and no model call in this milestone.

## Invariants

- Quantity per listing is one.
- User enters length, thickness, and SKU.
- App proposes remaining listing fields. User reviews before create.
- Non-math fields remain editable until create.
- `bdft = sqft × thickness_in`
- Price proposal is `bdft × species $/bdft`. User may replace it. Missing rate leaves price empty.
- User-entered length, thickness, SKU, price, and taxonomy override computed or inferred values.
- SKUs matching `SLAB-UAT-*` create as Woo draft.
- Create works with inference off.
- Source below the PNG size floor requires a new photo.
- Existing store SKU blocks create.
