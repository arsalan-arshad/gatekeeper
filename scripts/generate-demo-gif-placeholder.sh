#!/usr/bin/env bash
# Creates a static placeholder GIF for the README until a real screen recording exists.
# Prefers ImageMagick (`magick` / `convert`); falls back to a tiny valid GIF.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/media/demo.gif"
mkdir -p "$(dirname "$OUT")"

if command -v magick >/dev/null 2>&1; then
  magick -size 720x405 xc:'#0b1210' \
    -fill '#5fd4a4' -font Helvetica-Bold -pointsize 48 -gravity center \
    -annotate +0-40 'Gatekeeper' \
    -fill '#eef3ef' -font Helvetica -pointsize 22 \
    -annotate +0+30 'Demo GIF placeholder — replace with a real recording' \
    -delay 100 -loop 0 "$OUT"
  echo "Wrote $OUT (ImageMagick magick)"
  exit 0
fi

if command -v convert >/dev/null 2>&1; then
  convert -size 720x405 xc:'#0b1210' \
    -fill '#5fd4a4' -font Helvetica-Bold -pointsize 48 -gravity center \
    -annotate +0-40 'Gatekeeper' \
    -fill '#eef3ef' -font Helvetica -pointsize 22 \
    -annotate +0+30 'Demo GIF placeholder — replace with a real recording' \
    -delay 100 -loop 0 "$OUT"
  echo "Wrote $OUT (ImageMagick convert)"
  exit 0
fi

python3 - "$OUT" <<'PY'
import sys
from pathlib import Path

out = Path(sys.argv[1])
# Tiny valid GIF89a (1×1, dark green palette entry)
data = bytes(
    [
        0x47,
        0x49,
        0x46,
        0x38,
        0x39,
        0x61,
        0x01,
        0x00,
        0x01,
        0x00,
        0x80,
        0x00,
        0x00,
        0x0B,
        0x12,
        0x10,
        0x00,
        0x00,
        0x00,
        0x21,
        0xF9,
        0x04,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x2C,
        0x00,
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00,
        0x02,
        0x02,
        0x44,
        0x01,
        0x00,
        0x3B,
    ]
)
out.write_bytes(data)
print(f"Wrote {out} (minimal placeholder; install ImageMagick for a labeled frame)")
PY
