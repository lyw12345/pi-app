// Install or refresh the global `pi` CLI when Pi.app is installed/launched.
// Always writes/updates our shim (including when a global `pi` already exists).

import { accessSync, constants, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  log,
  makeExecutable,
  resolvePiAppCliInstallPath,
  shellShimContents,
  warn,
} from "./cli-link-common.mjs";

function parseArgs(argv) {
  let piWebRoot = "";
  let nodePath = "";
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pi-web-root" && argv[i + 1]) {
      piWebRoot = argv[++i];
    } else if (arg === "--node" && argv[i + 1]) {
      nodePath = argv[++i];
    }
  }
  return { piWebRoot: resolve(piWebRoot), nodePath: resolve(nodePath) };
}

export function installPiCliFromApp({ piWebRoot, nodePath }) {
  const launcher = join(piWebRoot, "bin", "pi.js");
  try {
    accessSync(launcher, constants.R_OK);
    accessSync(nodePath, constants.X_OK);
  } catch {
    warn(`launcher or node missing (launcher=${launcher}, node=${nodePath}); skipping pi CLI setup.`);
    return { ok: false, reason: "missing-runtime" };
  }

  const linkPath = resolvePiAppCliInstallPath();
  mkdirSync(dirname(linkPath), { recursive: true });
  writeFileSync(linkPath, shellShimContents(nodePath, launcher), "utf8");
  makeExecutable(linkPath);
  log(`pi CLI installed/updated -> ${linkPath}`);
  return { ok: true, linkPath };
}

function main() {
  const { piWebRoot, nodePath } = parseArgs(process.argv);
  if (!piWebRoot || !nodePath) {
    warn("usage: install-pi-cli-from-app.mjs --pi-web-root <dir> --node <node-binary>");
    process.exitCode = 1;
    return;
  }
  installPiCliFromApp({ piWebRoot, nodePath });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    warn(`could not set up the pi CLI: ${err?.message ?? err}`);
    process.exitCode = 1;
  }
}
