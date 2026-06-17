#!/usr/bin/env bash
# Pin pi-app to the latest @livos/pi-coding-agent + pi-ai on npm (fork scope).
# Uses npm 10 for lockfile entries compatible with GitHub Actions publish workflow.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PI_SCOPE="${PI_SCOPE:-@livos}"
PI_VERSION="${PI_VERSION:-$(npm view "${PI_SCOPE}/pi-coding-agent" version)}"
AI_VERSION="${AI_VERSION:-$(npm view "${PI_SCOPE}/pi-ai" version)}"

if [[ "$PI_VERSION" != "$AI_VERSION" ]]; then
  echo "error: ${PI_SCOPE}/pi-coding-agent ($PI_VERSION) != ${PI_SCOPE}/pi-ai ($AI_VERSION) on npm" >&2
  exit 1
fi

echo "pinning @earendil-works/pi-* to ${PI_SCOPE}@${PI_VERSION} (npm package aliases)..."
NPM="${NPM:-npx -y npm@10.9.8}"
$NPM install --save-exact "@earendil-works/pi-coding-agent@npm:${PI_SCOPE}/pi-coding-agent@${PI_VERSION}" "@earendil-works/pi-ai@npm:${PI_SCOPE}/pi-ai@${AI_VERSION}" --min-release-age=0

# Keep nested pi packages on the same ${PI_SCOPE} release.
node -e "
const fs = require('fs');
const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const v = process.argv[1];
const scope = process.argv[2];
pkg.overrides = pkg.overrides || {};
for (const name of ['pi-agent-core', 'pi-tui']) {
  pkg.overrides[\`@earendil-works/\${name}\`] = \`npm:\${scope}/\${name}@\${v}\`;
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
" "$PI_VERSION" "$PI_SCOPE"

$NPM install --min-release-age=0

echo ""
node scripts/release-version.mjs
echo ""
echo "Run: node_modules/.bin/tsc --noEmit && npm run lint && npm run test:run"
