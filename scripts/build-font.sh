#!/usr/bin/env bash
# Builds fonts/liquid-inter.woff2, the Inter subset that liquid-core ships (see README, "Font").
#
# The built file is committed, so neither CI nor consumers run this script. Run it only to rebuild the
# font on purpose. It fails when the result differs from OUTPUT_SHA256; after an intended change, update
# OUTPUT_SHA256 and FONT_SHA256/FONT_BYTES in test/font-file.test.ts.
#
# Usage: [OUT=/path/out.woff2] PYTHON=/path/to/python scripts/build-font.sh [Inter-4.1.zip]
#   The font is built in a temporary directory and its sha256 is checked there; only a match is copied to
#   OUT (default: fonts/liquid-inter.woff2). A mismatch leaves the committed file untouched. Set OUT to a
#   scratch path for a check-only run.
#   Without an argument the zip is downloaded from SOURCE_URL into a temporary directory.
#   PYTHON must have fonttools 4.68.0 and brotli 1.2.1 (pip install fonttools==4.68.0 brotli==1.2.1).
#
# Source: rsms/inter v4.1, InterVariable.ttf (upright, axes wght 100..900 and opsz 14..32).
# Output, as committed (fonttools 4.68.0, brotli 1.2.1, Python 3.13):
#   fonts/liquid-inter.woff2  43,008 bytes
#   sha256 ec9d62021ca5940db5f5b700613aebf24d379039553795447cd407cd35b253d7
set -euo pipefail

SOURCE_URL="https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip"
SOURCE_SHA256="9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e"
FONTTOOLS_VERSION="4.68.0"
BROTLI_VERSION="1.2.1"
# fontTools writes the build time into head.modified, and the woff2 size depends on it. Pinning it makes
# the output byte-reproducible. This is the build time of the measured file (2026-11-24 11:35:01 UTC).
export SOURCE_DATE_EPOCH=1795520101
OUTPUT_SHA256="ec9d62021ca5940db5f5b700613aebf24d379039553795447cd407cd35b253d7"

# Variable axes kept: weight 200..600 (the range the cards use), optical size pinned to 14 (text size).
AXES=(wght=200:600 opsz=14)
# Latin (Google Fonts "latin" range), arrows, minus, <= and >=, plus Latin Extended-A (U+0100-017F).
# Keep this in sync with LIQUID_FONT_UNICODE_RANGE in src/font.ts.
UNICODES="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2264-2265,U+FEFF,U+FFFD,U+0100-017F"
FEATURES="kern,liga,calt,ccmp,locl,mark,mkmk,tnum"
NAME_IDS="0,1,2,3,4,5,6,13,14"

root=$(cd "$(dirname "$0")/.." && pwd)
out=${OUT:-$root/fonts/liquid-inter.woff2}
py=${PYTHON:-python3}

have=$("$py" -I -c 'import fontTools, brotli; print(fontTools.version, brotli.__version__)')
if [ "$have" != "$FONTTOOLS_VERSION $BROTLI_VERSION" ]; then
  echo "need fonttools $FONTTOOLS_VERSION and brotli $BROTLI_VERSION, $py has: $have" >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

zip=${1:-}
if [ -z "$zip" ]; then
  zip="$work/Inter-4.1.zip"
  curl -fsSL --proto '=https' -o "$zip" "$SOURCE_URL"
fi
echo "$SOURCE_SHA256  $zip" | sha256sum -c -

# Only the variable TTF is read from the zip; nothing in it is executed.
mkdir "$work/src"
unzip -q -j "$zip" InterVariable.ttf -d "$work/src"

"$py" -I -m fontTools.varLib.instancer "$work/src/InterVariable.ttf" "${AXES[@]}" -o "$work/instance.ttf" -q
"$py" -I -m fontTools.subset "$work/instance.ttf" \
  --unicodes="$UNICODES" \
  --layout-features="$FEATURES" \
  --name-IDs="$NAME_IDS" \
  --no-hinting \
  --drop-tables+=DSIG \
  --flavor=woff2 \
  --output-file="$work/liquid-inter.woff2"

built="$work/liquid-inter.woff2"
if ! echo "$OUTPUT_SHA256  $built" | sha256sum -c --quiet - 2>/dev/null; then
  echo "sha256 differs from the committed build: $(sha256sum "$built" | cut -d' ' -f1); $out was not changed" >&2
  echo "if the change is intended, update OUTPUT_SHA256 here and FONT_SHA256/FONT_BYTES in test/font-file.test.ts" >&2
  exit 1
fi
cp "$built" "$out"
echo "wrote $out ($(wc -c < "$out") bytes)"
echo "sha256 matches the committed build"
