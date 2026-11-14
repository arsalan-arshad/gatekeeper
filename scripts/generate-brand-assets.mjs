#!/usr/bin/env node
/**
 * Rasterize Gatekeeper brand SVG sources → PNG / ICO.
 *
 * Usage (from repo root, with sharp + to-ico available):
 *   node scripts/generate-brand-assets.mjs
 *
 * Or: pnpm exec sharp is not required — this script imports sharp from
 * NODE_PATH / a local install. Prefer:
 *   npm install --prefix /tmp/gk-brand sharp to-ico && \
 *   NODE_PATH=/tmp/gk-brand/node_modules node scripts/generate-brand-assets.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function load(name) {
  const candidates = [
    process.env.NODE_PATH ? join(process.env.NODE_PATH, name) : null,
    '/tmp/gatekeeper-brand/node_modules/' + name,
    name,
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* try next */
    }
  }
  throw new Error(`Cannot load ${name}. Install sharp/to-ico first.`);
}

const sharp = load('sharp');
const toIco = load('to-ico');

async function svgToPng(svgPath, outPath, { width, height } = {}) {
  const svg = await readFile(svgPath);
  let pipeline = sharp(svg, { density: 288 });
  if (width || height) {
    pipeline = pipeline.resize({
      width,
      height,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  await mkdir(dirname(outPath), { recursive: true });
  await pipeline.png().toFile(outPath);
  console.log('wrote', outPath.replace(root + '/', ''));
}

async function main() {
  const publicDir = join(root, 'apps/web/public');
  const brandDir = join(publicDir, 'brand');
  const mediaDir = join(root, 'docs/media');
  const mediaSvg = join(mediaDir, 'svg');

  // App icons from door mark
  await svgToPng(join(brandDir, 'door-mark.svg'), join(publicDir, 'icon-512.png'), {
    width: 512,
    height: 512,
  });
  await svgToPng(join(brandDir, 'door-mark.svg'), join(publicDir, 'apple-touch-icon.png'), {
    width: 180,
    height: 180,
  });

  // Favicons
  await svgToPng(join(brandDir, 'favicon-mark.svg'), join(publicDir, 'favicon-16.png'), {
    width: 16,
    height: 16,
  });
  await svgToPng(join(brandDir, 'favicon-mark.svg'), join(publicDir, 'favicon-32.png'), {
    width: 32,
    height: 32,
  });

  const ico16 = await sharp(await readFile(join(publicDir, 'favicon-16.png')))
    .png()
    .toBuffer();
  const ico32 = await sharp(await readFile(join(publicDir, 'favicon-32.png')))
    .png()
    .toBuffer();
  const icoBuf = await toIco([ico16, ico32]);
  await writeFile(join(publicDir, 'favicon.ico'), icoBuf);
  console.log('wrote apps/web/public/favicon.ico');

  // OG
  await svgToPng(join(brandDir, 'og.svg'), join(publicDir, 'og.png'), {
    width: 1200,
    height: 630,
  });

  // Docs media
  await svgToPng(join(mediaSvg, 'github-banner.svg'), join(mediaDir, 'github-banner.png'), {
    width: 1280,
    height: 640,
  });
  await svgToPng(join(mediaSvg, 'art-door-mark.svg'), join(mediaDir, 'art-door-mark.png'), {
    width: 1200,
    height: 900,
  });
  await svgToPng(join(mediaSvg, 'art-ledger-trust.svg'), join(mediaDir, 'art-ledger-trust.png'), {
    width: 1200,
    height: 900,
  });
  await svgToPng(join(mediaSvg, 'art-says-no.svg'), join(mediaDir, 'art-says-no.png'), {
    width: 1200,
    height: 900,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
