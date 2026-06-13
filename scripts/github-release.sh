#!/usr/bin/env bash
# Build Pi.app, create DMG, publish GitHub Release for current package.json version.
# Tag must already exist on origin (vX.Y.Z).
#
# Usage:
#   npm run release:github
#   npm run release:github -- v0.8.5
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  VER="$(node -e "console.log(require('./package.json').version)")"
  TAG="v${VER}"
fi
VER="${TAG#v}"

OUT="$ROOT/dist/macos"
DMG="$OUT/Pi-${VER}.dmg"
REPO="${GITHUB_REPO:-asiachrispy/pi-app}"

if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag $TAG not found locally — create and push first" >&2
  exit 1
fi

NOTES_HEADER="$(node scripts/release-version.mjs --notes-header)"
CHANGELOG_SECTION=""
if [[ -f CHANGELOG.md ]]; then
  CHANGELOG_SECTION="$(node - "$VER" <<'NODE'
const fs = require("fs");
const ver = process.argv[2];
const text = fs.readFileSync("CHANGELOG.md", "utf8");
const re = new RegExp(`## \\[${ver.replace(/\./g, "\\.")}\\][\\s\\S]*?(?=\\n## \\[|$)`);
const m = text.match(re);
if (m) process.stdout.write(m[0].replace(/^## \[[^\]]+\][^\n]*\n?/, "").trim());
NODE
)"
fi

echo "building Pi.app for $TAG..."
npm run package:macos

echo "creating $DMG..."
rm -f "$DMG"
hdiutil create -volname "Pi" -srcfolder "$OUT/Pi.app" -ov -format UDZO "$DMG"
hdiutil verify "$DMG"

NOTES="$(cat <<EOF
${NOTES_HEADER}
${CHANGELOG_SECTION:+### Changes

${CHANGELOG_SECTION}

}
### Install

**macOS (Pi.app)**: download \`Pi-${VER}.dmg\` below, drag Pi to Applications.

> 应用未做 Apple 公证：下载版**首次打开请右键 →「打开」**，或执行 \`xattr -dr com.apple.quarantine /Applications/Pi.app\`。

**npm**: \`npm install -g pi-app@${VER}\` (bundles pi $(node -e "console.log(require('./package.json').dependencies['@earendil-works/pi-coding-agent'])"))

Bundle id (sidebar title click): \`$(node scripts/release-version.mjs --bundle)\`
EOF
)"

if gh release view "$TAG" --repo "$REPO" &>/dev/null; then
  echo "updating existing GitHub release $TAG..."
  gh release upload "$TAG" "$DMG" --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" --notes "$NOTES" --latest
else
  echo "creating GitHub release $TAG..."
  gh release create "$TAG" --repo "$REPO" --title "$TAG" --latest --notes "$NOTES" "$DMG"
fi

echo ""
echo "done: https://github.com/${REPO}/releases/tag/${TAG}"
ls -lh "$DMG"
