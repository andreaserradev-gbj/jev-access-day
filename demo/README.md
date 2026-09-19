# Demo page — 24 decisions, 4 engines

Static, self-contained page presenting the measured comparison. All numbers
are generated from committed run files.

## Regenerate data

    node scripts/gen-demo-data.cjs

This rewrites `demo/data.js` from `results/<wave>/run-*.json` and the probe
artifacts in `results/2026-09-18-access-day/`. Never hand-edit `data.js`.

## Structure

- `index.html` — the page (no build step, no external calls; contains a commented social-card block to uncomment with the deploy URL)
- `data.js`   — GENERATED, `window.DEMO_DATA`
- `assets/`   — TypeSafe mark, published pricing/pareto charts (from typesafe.ai), `og-card.png` (1200×630 social card)
- `og-src.html` — source for the social card; re-render with a 1200×630 headless screenshot after editing
- `fonts/`    — Archivo + JetBrains Mono (variable woff2, latin subset), no CDN calls
- `vercel.json` — cache headers for drag-and-drop or `vercel` CLI deploy

## Deploy

Drag the `demo/` folder into Vercel, or `cd demo && vercel --prod`.
