# Media

Brand and marketing assets for Gatekeeper (dark forest-green + mint, arched front-door motif).

## Banner & product art

| File | Purpose |
| --- | --- |
| `github-banner.png` | GitHub / README header (~1280×640) |
| `art-door-mark.png` | Product still — arched doorway mark |
| `art-ledger-trust.png` | Product still — public ledger & trust |
| `art-says-no.png` | Product still — closed door / says no |
| `demo.gif` | README walkthrough loop |

SVG sources for the docs stills live in [`svg/`](./svg/).

## App icons & social (web)

Served from [`apps/web/public/`](../../apps/web/public/):

- `favicon.ico`, `favicon-16.png`, `favicon-32.png`
- `icon.svg`, `icon-512.png`, `apple-touch-icon.png`
- `og.png` (1200×630 Open Graph / Twitter)
- SVG sources under `apps/web/public/brand/`

## Regenerate

From the repo root (requires `sharp` and `to-ico`):

```bash
npm install --prefix /tmp/gatekeeper-brand sharp to-ico
NODE_PATH=/tmp/gatekeeper-brand/node_modules node ./scripts/generate-brand-assets.mjs
```

Replace `demo.gif` with a real screen recording before launch (see [`../LAUNCH.md`](../LAUNCH.md) and `../../scripts/generate-demo-gif-placeholder.sh`).
