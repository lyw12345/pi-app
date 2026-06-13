#!/usr/bin/env bash
# Pin pi-app to the latest @earendil-works/pi-coding-agent + pi-ai on npm.
# Uses npm 10 for lockfile entries compatible with GitHub Actions publish workflow.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PI_VERSION="${PI_VERSION:-$(npm view @earendil-works/pi-coding-agent version)}"
AI_VERSION="${AI_VERSION:-$(npm view @earendil-works/pi-ai version)}"

if [[ "$PI_VERSION" != "$AI_VERSION" ]]; then
  echo "error: pi-coding-agent ($PI_VERSION) != pi-ai ($AI_VERSION) on npm" >&2
  exit 1
fi

echo "pinning @earendil-works/pi-coding-agent and pi-ai to $PI_VERSION..."
NPM="${NPM:-npx -y npm@10.9.8}"
$NPM install --save-exact "@earendil-works/pi-coding-agent@${PI_VERSION}" "@earendil-works/pi-ai@${PI_VERSION}" --min-release-age=0

echo ""
node scripts/release-version.mjs
echo ""
echo "Run: node_modules/.bin/tsc --noEmit && npm run lint && npm run test:run"
