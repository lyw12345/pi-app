// postinstall: make `pi` available globally for `npm i -g pi-app`.
// Creates or refreshes our shim; updates when a previous pi-app shim exists.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  getGlobalBinDir,
  getLauncherPath,
  getLinkPath,
  isGlobalInstall,
  log,
  makeExecutable,
  nodeShimContents,
  pathOccupied,
  shimIsOurs,
  warn,
} from "./cli-link-common.mjs";

function createShim(linkPath, launcher) {
  mkdirSync(dirname(linkPath), { recursive: true });
  writeFileSync(linkPath, nodeShimContents(launcher), "utf8");
  makeExecutable(linkPath);
}

function main() {
  if (!isGlobalInstall()) return;

  const launcher = getLauncherPath();
  if (!pathOccupied(launcher)) {
    warn(`launcher not found at ${launcher}; skipping pi CLI setup.`);
    return;
  }

  const linkPath = getLinkPath(getGlobalBinDir());
  const existed = pathOccupied(linkPath);

  if (existed && !shimIsOurs(linkPath)) {
    log(`existing pi found at ${linkPath}; keeping it (not overwriting).`);
    return;
  }

  createShim(linkPath, launcher);
  log(existed ? `pi CLI refreshed -> ${linkPath}` : `pi CLI installed -> ${linkPath}`);
}

try {
  main();
} catch (err) {
  warn(`could not set up the pi CLI automatically: ${err?.message ?? err}`);
}
