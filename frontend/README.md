# Milestone 1 — Capture

```bash
cd frontend
npm install
node scripts/check-math.mjs
npm test
npm run dev
```

Phone or PC: iOS Safari, Android Chrome, desktop Chrome / Edge / Firefox.

Docker:

```bash
docker build -t slabuploader-m1 frontend
docker run --rm -p 18080:80 slabuploader-m1
```

Acceptance in `docs/CAPTURE.md`: one photo, approve mask, approve length axis, length + thickness, Calculate. PNG, widths, sqft, bdft on screen. No Woo create.
