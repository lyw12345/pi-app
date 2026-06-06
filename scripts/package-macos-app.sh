#!/usr/bin/env bash
# Assemble Pi.app: PiWorkbench + clean production pi-web + embedded Node + prod deps only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-Pi}"
OUT_DIR="${OUT_DIR:-$ROOT/dist/macos}"
SWIFT_BUILD="${SWIFT_BUILD:-$ROOT/macos/PiWorkbench/.build/release/PiWorkbench}"
NODE_VERSION="${NODE_VERSION:-22.16.0}"
SKIP_NODE_EMBED="${SKIP_NODE_EMBED:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
PACK_NEXT="${PACK_NEXT:-$ROOT/.next-package}"

if [[ ! -f "$ROOT/package-lock.json" ]]; then
  echo "error: missing package-lock.json" >&2
  exit 1
fi

SWIFT_SRC="$ROOT/macos/PiWorkbench/Sources"
needs_swift_build=0
if [[ ! -x "$SWIFT_BUILD" ]]; then
  needs_swift_build=1
else
  while IFS= read -r -d '' src; do
    if [[ "$src" -nt "$SWIFT_BUILD" ]]; then
      needs_swift_build=1
      break
    fi
  done < <(find "$SWIFT_SRC" -type f \( -name '*.swift' -o -name '*.plist' \) -print0)
fi
if [[ "$needs_swift_build" == "1" ]]; then
  echo "building PiWorkbench release binary..."
  (cd "$ROOT/macos/PiWorkbench" && swift build -c release)
fi

APP_VERSION="$(node -e "console.log(require('$ROOT/package.json').version)")"

APP="$OUT_DIR/$APP_NAME.app"
CONTENTS="$APP/Contents"
RES="$CONTENTS/Resources"
MACOS="$CONTENTS/MacOS"
NODE_DIR="$RES/node"
PI_WEB_RES="$RES/pi-web"
PI_MONO="${PI_MONO:-$(cd "$ROOT/../pi" && pwd)}"

uses_local_pi_deps() {
  node -e "
    const d=require('$ROOT/package.json').dependencies||{};
    const v=d['@earendil-works/pi-coding-agent']||'';
    process.exit(String(v).startsWith('file:') ? 0 : 1);
  "
}

ensure_local_pi_built() {
  local marker="$PI_MONO/packages/coding-agent/dist/cli.js"
  if [[ ! -f "$marker" ]]; then
    echo "error: local pi not built — run: cd \"$PI_MONO\" && npm run build" >&2
    exit 1
  fi
  local ver
  ver="$(node -e "console.log(require('$PI_MONO/packages/coding-agent/package.json').version)")"
  echo "local pi version: $ver"
}

pack_local_pi_vendor() {
  local vendor_dir="$PI_WEB_RES/vendor"
  rm -rf "$vendor_dir"
  mkdir -p "$vendor_dir"
  local pkg
  for pkg in ai agent tui coding-agent; do
    echo "packing pi $pkg into bundle vendor..."
    (cd "$PI_MONO/packages/$pkg" && npm pack --pack-destination "$vendor_dir" >/dev/null)
  done
  ls -1 "$vendor_dir"/*.tgz
}

write_bundle_package_json_for_local_pi() {
  node - "$PI_WEB_RES/package.json" "$PI_WEB_RES/vendor" <<'NODE'
const fs = require("fs");
const [pkgPath, vendorDir] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const tggs = fs.readdirSync(vendorDir).filter((f) => f.endsWith(".tgz"));

function fileRef(name) {
  const slug = name.replace(/^@/, "").replace("/", "-");
  const hit = tggs.find((f) => f.startsWith(`${slug}-`));
  if (!hit) throw new Error(`missing vendor tgz for ${name}`);
  return `file:./vendor/${hit}`;
}

const piPackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-tui",
  "@earendil-works/pi-coding-agent",
];

for (const name of piPackages) {
  const ref = fileRef(name);
  if (pkg.dependencies[name]) pkg.dependencies[name] = ref;
  pkg.overrides = pkg.overrides || {};
  pkg.overrides[name] = ref;
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
}

build_production_next() {
  if [[ "$SKIP_BUILD" == "1" && -f "$PACK_NEXT/BUILD_ID" ]]; then
    echo "SKIP_BUILD=1 — reusing $PACK_NEXT"
    return 0
  fi
  rm -rf "$PACK_NEXT"
  echo "building production .next (isolated, no dev cache)..."
  # NEXT_DIST_DIR must be relative to repo root; absolute paths are ignored by Next.
  (cd "$ROOT" && NEXT_DIST_DIR=".next-package" npm run build)
  rm -rf "$PACK_NEXT/cache" "$PACK_NEXT/dev" 2>/dev/null || true
  find "$PACK_NEXT" -name "*.map" -delete 2>/dev/null || true
  if [[ ! -f "$PACK_NEXT/BUILD_ID" ]]; then
    echo "error: production build failed (no $PACK_NEXT/BUILD_ID)" >&2
    exit 1
  fi
  echo "production .next size: $(du -sh "$PACK_NEXT" | cut -f1)"
}

embed_node() {
  if [[ "$SKIP_NODE_EMBED" == "1" ]]; then
    echo "SKIP_NODE_EMBED=1 — bundle will use PATH/homebrew node at runtime"
    return 0
  fi
  local arch os_id tarball cache_dir extract_dir node_bin
  arch="$(uname -m)"
  case "$arch" in
    arm64) os_id="darwin-arm64" ;;
    x86_64) os_id="darwin-x64" ;;
    *)
      echo "error: unsupported arch $arch for embedded Node" >&2
      exit 1
      ;;
  esac
  tarball="node-v${NODE_VERSION}-${os_id}.tar.gz"
  cache_dir="$OUT_DIR/.cache/node-v${NODE_VERSION}"
  extract_dir="$cache_dir/${tarball%.tar.gz}"
  node_bin="$NODE_DIR/bin/node"

  if [[ ! -x "$extract_dir/bin/node" ]]; then
    mkdir -p "$cache_dir"
    url="https://nodejs.org/dist/v${NODE_VERSION}/${tarball}"
    echo "downloading Node ${NODE_VERSION} (${os_id})..."
    curl -fsSL "$url" -o "$cache_dir/$tarball"
    rm -rf "$extract_dir"
    tar -xzf "$cache_dir/$tarball" -C "$cache_dir"
  fi

  mkdir -p "$NODE_DIR/bin"
  cp "$extract_dir/bin/node" "$node_bin"
  chmod +x "$node_bin"
  xattr -cr "$NODE_DIR" 2>/dev/null || true
  echo "embedded Node: $("$node_bin" -v)"
}

install_production_deps() {
  rm -rf "$PI_WEB_RES/node_modules"
  if uses_local_pi_deps; then
    ensure_local_pi_built
    pack_local_pi_vendor
    write_bundle_package_json_for_local_pi
    rm -f "$PI_WEB_RES/package-lock.json"
    echo "npm install --omit=dev in bundle (local pi vendor tarballs)..."
    (cd "$PI_WEB_RES" && npm install --omit=dev --ignore-scripts --no-package-lock)
    local bundled_ver
    bundled_ver="$(node -e "
      const p=require('$PI_WEB_RES/node_modules/@earendil-works/pi-coding-agent/package.json');
      console.log(p.version);
    ")"
    echo "bundled pi-coding-agent version: $bundled_ver"
  else
    echo "npm ci --omit=dev in bundle..."
    (cd "$PI_WEB_RES" && npm ci --omit=dev --ignore-scripts)
  fi
  find "$PI_WEB_RES/node_modules" -name "*.map" -delete 2>/dev/null || true
  echo "node_modules size: $(du -sh "$PI_WEB_RES/node_modules" | cut -f1)"
}

build_production_next

rm -rf "$APP"
mkdir -p "$MACOS" "$PI_WEB_RES" "$NODE_DIR/bin"

cp "$SWIFT_BUILD" "$MACOS/$APP_NAME"
chmod +x "$MACOS/$APP_NAME"

echo "copying pi-web runtime files..."
rsync -a \
  "$ROOT/bin" \
  "$ROOT/public" \
  "$ROOT/package.json" \
  "$ROOT/next.config.ts" \
  "$PI_WEB_RES/"
if ! uses_local_pi_deps; then
  rsync -a "$ROOT/package-lock.json" "$PI_WEB_RES/"
fi
rsync -a \
  --exclude cache \
  --exclude dev \
  --exclude '**/*.map' \
  "$PACK_NEXT/" \
  "$PI_WEB_RES/.next/"

embed_node
install_production_deps
chmod +x "$PI_WEB_RES/bin/pi-web.js" 2>/dev/null || true

if [[ ! -d "$PI_WEB_RES/node_modules/next" ]]; then
  echo "error: next not found under bundle node_modules" >&2
  exit 1
fi

cat > "$CONTENTS/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>works.earendil.pi</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$APP_VERSION</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

# Clear quarantine; sign only executables (avoid deep-signing huge node_modules).
xattr -cr "$APP" 2>/dev/null || true
if command -v codesign >/dev/null 2>&1; then
  codesign --force -s - "$MACOS/$APP_NAME" 2>/dev/null || true
  if [[ -x "$NODE_DIR/bin/node" ]]; then
    codesign --force -s - "$NODE_DIR/bin/node" 2>/dev/null || true
  fi
fi

TOTAL="$(du -sh "$APP" | cut -f1)"
echo ""
echo "assembled $APP ($TOTAL)"
echo "install (recommended): ditto \"$APP\" /Applications/$APP_NAME.app"
echo "remove old copy first: rm -rf /Applications/$APP_NAME.app"
echo "open: open /Applications/$APP_NAME.app"
