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
  if [[ "$SKIP_BUILD" == "1" && -d "$ROOT/.next/standalone" ]]; then
    echo "SKIP_BUILD=1 — reusing $ROOT/.next/standalone"
    return 0
  fi
  rm -rf "$ROOT/.next"
  echo "building production standalone .next (no dev cache)..."
  # PI_STANDALONE=1 turns on Next standalone output: the build traces the minimal
  # set of server runtime files into .next/standalone (a self-contained server.js
  # + pruned node_modules, no @next/swc), shrinking the bundle dramatically.
  # Build to the default .next so the baked distDir matches the bundle layout.
  (cd "$ROOT" && PI_STANDALONE=1 NEXT_DIST_DIR=.next npm run build)
  if [[ ! -d "$ROOT/.next/standalone" ]]; then
    echo "error: standalone output missing ($ROOT/.next/standalone)" >&2
    exit 1
  fi
  rm -rf "$ROOT/.next/cache" 2>/dev/null || true
  echo "standalone size: $(du -sh "$ROOT/.next/standalone" | cut -f1)"
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

# Trim non-runtime weight from the standalone node_modules. Safe to skip with
# SKIP_SLIM=1. Standalone tracing already drops @next/swc and unused packages;
# this only removes leftover non-runtime files (types/markdown/sourcemaps/docs).
slim_bundle() {
  if [[ "${SKIP_SLIM:-0}" == "1" ]]; then
    echo "SKIP_SLIM=1 — keeping full bundle node_modules"
    return 0
  fi
  local nm="$PI_WEB_RES/node_modules"
  [[ -d "$nm" ]] || return 0
  local before
  before="$(du -sh "$nm" | cut -f1)"

  # agent-browser (if traced) ships one prebuilt binary per platform; keep host's.
  local ab_bin="$nm/agent-browser/bin"
  if [[ -d "$ab_bin" ]]; then
    local keep=""
    case "$(uname -m)" in
      arm64) keep="agent-browser-darwin-arm64" ;;
      x86_64) keep="agent-browser-darwin-x64" ;;
    esac
    if [[ -n "$keep" ]]; then
      find "$ab_bin" -maxdepth 1 -type f -name 'agent-browser-*' ! -name "$keep" -delete 2>/dev/null || true
      echo "pruned agent-browser foreign binaries (kept $keep)"
    fi
  fi

  # Drop files never needed to run: TS types, markdown, sourcemaps, docs/examples.
  find "$nm" -type f \( -name '*.d.ts' -o -name '*.d.ts.map' -o -name '*.md' -o -name '*.markdown' -o -name '*.map' \) -delete 2>/dev/null || true
  find "$nm" -type d \( -name docs -o -name examples -o -name example -o -name __tests__ -o -name '.github' \) -prune -exec rm -rf {} + 2>/dev/null || true

  echo "bundle node_modules slimmed: $before -> $(du -sh "$nm" | cut -f1)"
}

build_production_next

rm -rf "$APP"
mkdir -p "$MACOS" "$PI_WEB_RES" "$NODE_DIR/bin"

cp "$SWIFT_BUILD" "$MACOS/$APP_NAME"
chmod +x "$MACOS/$APP_NAME"

echo "assembling standalone runtime into bundle..."
# 1) standalone root: self-contained server.js + traced node_modules + minimal
#    .next server files + package.json (no @next/swc, no dev cache).
rsync -a "$ROOT/.next/standalone/" "$PI_WEB_RES/"
# 2) static assets + public are not copied by standalone; place them where the
#    standalone server expects them (.next/static and ./public).
mkdir -p "$PI_WEB_RES/.next/static"
rsync -a --exclude '**/*.map' "$ROOT/.next/static/" "$PI_WEB_RES/.next/static/"
rsync -a "$ROOT/public" "$PI_WEB_RES/"
# 3) launcher (bin/pi-app.js detects server.js and runs it directly).
rsync -a "$ROOT/bin" "$PI_WEB_RES/"

embed_node
slim_bundle
chmod +x "$PI_WEB_RES/bin/pi-app.js" 2>/dev/null || true
# Compat symlink for any older Swift build that still looks up the old name.
ln -sf pi-app.js "$PI_WEB_RES/bin/pi-web.js"

if [[ ! -f "$PI_WEB_RES/server.js" ]]; then
  echo "error: standalone server.js not found in bundle" >&2
  exit 1
fi
if [[ ! -d "$PI_WEB_RES/node_modules/next" ]]; then
  echo "error: next not found under bundle node_modules" >&2
  exit 1
fi

# App icon (built from docs/Pi-LOGO.png, regenerated by `make icon` or the
# build pipeline; see macos/PiWorkbench/Resources/AppIcon.iconset/).
APP_ICON_SRC="$ROOT/macos/PiWorkbench/Resources/AppIcon.icns"
if [[ ! -f "$APP_ICON_SRC" ]]; then
  echo "error: $APP_ICON_SRC missing; run \`make icon\` in macos/PiWorkbench/Resources/ first" >&2
  exit 1
fi
cp "$APP_ICON_SRC" "$RES/AppIcon.icns"
echo "copied AppIcon.icns -> $RES/AppIcon.icns"

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
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
</dict>
</plist>
EOF

# Clear quarantine, then ad-hoc DEEP-sign the whole bundle. Signing only the top
# executables leaves nested native binaries (embedded node, *.node addons, sharp
# libvips *.dylib) unsigned; a quarantined download is then flagged "damaged" on
# Apple Silicon. Deep ad-hoc signing gives every nested binary a valid signature
# (still unnotarized: a downloaded copy needs one right-click > Open, or
# `xattr -dr com.apple.quarantine /Applications/Pi.app`).
xattr -cr "$APP" 2>/dev/null || true
if command -v codesign >/dev/null 2>&1; then
  echo "ad-hoc deep-signing bundle (covers nested native binaries)..."
  if ! codesign --force --deep --timestamp=none -s - "$APP"; then
    echo "warning: codesign failed; downloaded app may be flagged as damaged" >&2
  fi
  if ! codesign --verify --deep --strict "$APP" 2>/dev/null; then
    echo "warning: codesign --verify did not pass" >&2
  fi
fi

TOTAL="$(du -sh "$APP" | cut -f1)"
echo ""
echo "assembled $APP ($TOTAL)"
echo "install (recommended): ditto \"$APP\" /Applications/$APP_NAME.app"
echo "remove old copy first: rm -rf /Applications/$APP_NAME.app"
echo "open: open /Applications/$APP_NAME.app"
