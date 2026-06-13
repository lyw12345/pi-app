#!/usr/bin/env bash
# Prepare a pi-app release: sync pi upstream, bump pi deps, test, bump app version.
#
# Full publish still requires manual steps (tag push triggers npm CI; github-release for DMG):
#   git push origin main && git push origin vX.Y.Z
#   npm run release:github
#
# Usage:
#   bash scripts/release-pi-app.sh              # interactive
#   bash scripts/release-pi-app.sh --yes        # non-interactive patch bump
#   bash scripts/release-pi-app.sh --skip-pi-sync
#   bash scripts/release-pi-app.sh --dry-run
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_PI_SYNC=0
DRY_RUN=0
ASSUME_YES=0
BUMP=patch

for arg in "$@"; do
  case "$arg" in
    --skip-pi-sync) SKIP_PI_SYNC=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --minor) BUMP=minor ;;
    --patch) BUMP=patch ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

confirm() {
  if [[ "$ASSUME_YES" == "1" ]]; then return 0; fi
  read -r -p "$1 [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]]
}

echo "=== pi-app release prepare ==="
echo ""

if [[ "$SKIP_PI_SYNC" != "1" ]]; then
  echo "Step 1/5: sync local pi monorepo with earendil-works/pi upstream..."
  run bash scripts/sync-pi-upstream.sh
else
  echo "Step 1/5: skipped (--skip-pi-sync)"
fi

echo ""
echo "Step 2/5: pin npm @earendil-works/pi-* to latest..."
run bash scripts/sync-pi-deps.sh

echo ""
echo "Step 3/5: verify + test..."
if [[ "$DRY_RUN" != "1" ]]; then
  node scripts/release-version.mjs --check --strict
  node_modules/.bin/tsc --noEmit
  npm run lint
  npm run test:run
fi

echo ""
echo "Step 4/5: bump pi-app version ($BUMP)..."
if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] npm version $BUMP --no-git-tag-version"
else
  if ! confirm "Bump pi-app $BUMP and commit release prep?"; then
    echo "aborted before version bump"
    exit 1
  fi
  NEW_VER="$(npm version "$BUMP" --no-git-tag-version)"
  echo "new pi-app version: ${NEW_VER#v}"
fi

echo ""
echo "Step 5/5: summary"
node scripts/release-version.mjs 2>/dev/null || true

cat <<'EOF'

--- manual finish (every release) ---

1. Update CHANGELOG.md for this version (include pi-app + pi versions).
2. Commit:
     git add package.json package-lock.json CHANGELOG.md
     git commit -m "chore(release): vX.Y.Z (+ pi A.B.C)"
3. Tag + push (triggers npm publish CI on tag v*):
     git tag vX.Y.Z
     git push origin main && git push origin vX.Y.Z
4. GitHub Release + Pi.app DMG:
     npm run release:github
5. Verify npm + health:
     npm view pi-app version
     curl -s http://127.0.0.1:30141/api/health

Version rule: sidebar shows {app}p{pi} e.g. 0.8.5p0.79.3
EOF
