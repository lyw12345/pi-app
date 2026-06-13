#!/usr/bin/env bash
# Sync local pi monorepo fork with earendil-works/pi upstream.
# Does NOT publish npm — upstream publishes @earendil-works/*; pi-app pins those versions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PI_MONO="${PI_MONO:-$(cd "$ROOT/../pi" 2>/dev/null && pwd || true)}"

if [[ -z "$PI_MONO" || ! -d "$PI_MONO/.git" ]]; then
  echo "error: PI_MONO not found (expected sibling ../pi with git)" >&2
  echo "  export PI_MONO=/path/to/pi" >&2
  exit 1
fi

echo "pi monorepo: $PI_MONO"
cd "$PI_MONO"

if ! git remote get-url upstream &>/dev/null; then
  echo "error: pi repo missing 'upstream' remote (expected https://github.com/earendil-works/pi.git)" >&2
  exit 1
fi

BEFORE="$(node -e "console.log(require('./packages/coding-agent/package.json').version)")"
echo "fetching upstream..."
git fetch upstream

if git merge-base --is-ancestor HEAD upstream/main 2>/dev/null && [[ "$(git rev-parse HEAD)" == "$(git rev-parse upstream/main)" ]]; then
  echo "already at upstream/main ($BEFORE)"
else
  echo "merging upstream/main..."
  git merge upstream/main --no-edit
fi

AFTER="$(node -e "console.log(require('./packages/coding-agent/package.json').version)")"
echo "local pi tree: $BEFORE -> $AFTER (upstream package.json; npm may differ)"

LATEST="$(npm view @earendil-works/pi-coding-agent version 2>/dev/null || echo unknown)"
echo "npm latest @earendil-works/pi-coding-agent: $LATEST"
echo "next: cd $ROOT && npm run release:sync-pi-deps"
