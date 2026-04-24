#!/bin/bash
# Syncs Chrome extension sources + iOS overrides into Xcode Resources folder on SSD.
# Idempotent — run after any edit on branch ios-safari-mvp.

set -euo pipefail

REPO="/Users/lhradek/code/work/react_generator/youtube-czech-dubbing"
# Xcode project is on SSD; converter copied resources in --copy-resources mode,
# so updates must go directly into the Resources folder.
DEST="/Volumes/2TB_SSD_Gigabyte/safari-extension/YouTubeCzechDubbing/Shared (Extension)/Resources"
STAGING="/Volumes/2TB_SSD_Gigabyte/safari-extension/staging"

if [[ ! -d "$DEST" ]]; then
  echo "ERROR: Xcode Resources folder not found: $DEST" >&2
  exit 1
fi

echo "→ Clearing old resources (keeping .DS_Store etc)"
rm -rf "$DEST/src" "$DEST/icons" "$DEST/rules" "$DEST/manifest.json"

echo "→ Copying shared Chrome sources"
cp -R "$REPO/src"   "$DEST/src"
cp -R "$REPO/icons" "$DEST/icons"

echo "→ Overlaying iOS-specific files"
cp "$REPO/ios-safari/manifest-ios.json" "$DEST/manifest.json"
cp "$REPO/ios-safari/popup-ios.html"    "$DEST/src/popup-ios.html"
cp "$REPO/ios-safari/popup-ios.js"      "$DEST/src/popup-ios.js"
cp "$REPO/ios-safari/ios-shim.js"       "$DEST/src/ios-shim.js"

echo "→ Removing Chrome-only files (unused on iOS)"
rm -f "$DEST/src/page-script.js"
rm -f "$DEST/src/offscreen.html" "$DEST/src/offscreen.js"
rm -f "$DEST/src/sidepanel.html" "$DEST/src/sidepanel.js"
rm -f "$DEST/src/popup.html" "$DEST/src/popup.js"
rm -f "$DEST/src/voicedub-client.test.js"
rm -f "$DEST/src/mic-permission.html"

echo "✓ Sync complete → $DEST"
ls "$DEST/src" | head -30
