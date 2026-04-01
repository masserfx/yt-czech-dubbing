#!/bin/bash
# YouTube Czech Dubbing - Build script
# Creates a distributable .zip file for Chrome extension sideloading

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(grep '"version"' "$SCRIPT_DIR/manifest.json" | sed 's/.*: *"\(.*\)".*/\1/')
OUTPUT_NAME="youtube-czech-dubbing-v${VERSION}.zip"
OUTPUT_PATH="$SCRIPT_DIR/$OUTPUT_NAME"

echo "Building YouTube Czech Dubbing v${VERSION}..."

# Remove old build if exists
rm -f "$OUTPUT_PATH"

# Create zip with required files only
cd "$SCRIPT_DIR"
zip -r "$OUTPUT_PATH" \
  manifest.json \
  icons/ \
  src/ \
  INSTALL.md \
  -x "*.DS_Store" \
  -x "__MACOSX/*" \
  -x "*.map"

echo ""
echo "Build complete: $OUTPUT_NAME"
echo "Size: $(du -h "$OUTPUT_PATH" | cut -f1)"
echo ""
echo "Distribution: share the .zip file."
echo "Installation: see INSTALL.md"
