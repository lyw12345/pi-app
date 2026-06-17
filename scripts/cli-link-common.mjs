// Shared helpers for installing/uninstalling the global `pi` command that
// forwards to the pi coding-agent CLI bundled with pi-app.
//
// Design notes:
// - We deliberately do NOT declare `bin.pi` in package.json. npm refuses to
//   overwrite a global bin owned by another package (EEXIST) and would make
//   `npm i -g pi-app` fail outright when the user already has `pi` installed.
// - Instead postinstall conditionally creates the link only when no `pi`
//   exists, and removes it only if we are the ones who made it.
// - The global `pi` is a STANDALONE shim (not a symlink into the package).
//   npm does not run uninstall lifecycle scripts (postuninstall), so after
//   `npm uninstall -g pi-app` the shim would otherwise dangle. A standalone
//   shim degrades gracefully: running `pi` then prints how to reinstall/remove
//   instead of failing with a confusing "no such file" error.

import { execFileSync } from "node:child_process";
import { chmodSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const isWindows = process.platform === "win32";

/** Marker embedded in every shim we generate, used to detect ownership. */
export const SHIM_MARKER = "pi-app-managed-cli";

const here = dirname(fileURLToPath(import.meta.url));

/** pi-app package root (the dir containing package.json). */
export function getPkgRoot() {
  return resolve(here, "..");
}

/** Absolute path to the launcher the shim forwards to. */
export function getLauncherPath() {
  return join(getPkgRoot(), "bin", "pi.js");
}

/** True when npm is running this lifecycle script for a global install. */
export function isGlobalInstall() {
  return process.env.npm_config_global === "true";
}

/**
 * Resolve the directory npm links global bins into.
 * Unix: <prefix>/bin. Windows: <prefix> itself.
 */
export function getGlobalBinDir() {
  const prefix = process.env.npm_config_prefix;
  if (prefix) return isWindows ? prefix : join(prefix, "bin");

  // Fallback: derive from the install location of this package.
  // Unix:    <prefix>/lib/node_modules/pi-app
  // Windows: <prefix>/node_modules/pi-app
  const pkgRoot = getPkgRoot();
  return isWindows
    ? resolve(pkgRoot, "..", "..")
    : resolve(pkgRoot, "..", "..", "..", "bin");
}

/** Path of the global command file we manage. */
export function getLinkPath(binDir) {
  return join(binDir, isWindows ? "pi.cmd" : "pi");
}

/** Whether an existing global `pi` is a shim created by us (safe to manage). */
export function shimIsOurs(linkPath) {
  try {
    return readFileSync(linkPath, "utf8").includes(SHIM_MARKER);
  } catch {
    return false;
  }
}

/** True if some `pi` command is already resolvable on PATH. */
export function piExistsOnPath() {
  const finder = isWindows ? "where" : "which";
  try {
    execFileSync(finder, ["pi"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Best-effort detection of "something already occupies this path". */
export function pathOccupied(linkPath) {
  try {
    lstatSync(linkPath); // lstat so broken symlinks count as occupied too
    return true;
  } catch {
    return false;
  }
}

export function makeExecutable(file) {
  if (isWindows) return;
  try {
    chmodSync(file, 0o755);
  } catch {
    // best effort
  }
}

/** Resolve the path of an existing `pi` on PATH, if any. */
export function getExistingPiPath() {
  const finder = isWindows ? "where" : "which";
  try {
    const out = execFileSync(finder, ["pi"], { encoding: "utf8" });
    const line = out.split(/\r?\n/).find((l) => l.trim());
    return line?.trim() || null;
  } catch {
    return null;
  }
}

/** Default user-local bin dir for Pi.app installs (~/.local/bin). */
export function getDefaultUserBinDir() {
  return join(homedir(), ".local", "bin");
}

/**
 * Pick where to install the global `pi` command for Pi.app.
 * Prefer updating an existing `pi` location; otherwise ~/.local/bin/pi.
 */
export function resolvePiAppCliInstallPath() {
  const existing = getExistingPiPath();
  if (existing) return existing;
  return getLinkPath(getDefaultUserBinDir());
}

/** Shell shim for Pi.app: uses the bundled node binary explicitly. */
export function shellShimContents(nodePath, launcherPath) {
  const node = JSON.stringify(nodePath);
  const launcher = JSON.stringify(launcherPath);
  return [
    "#!/bin/sh",
    `# ${SHIM_MARKER} (do not edit) - Pi.app managed pi CLI`,
    `NODE=${node}`,
    `LAUNCHER=${launcher}`,
    'if [ ! -x "$NODE" ] || [ ! -f "$LAUNCHER" ]; then',
    '  echo "pi: Pi.app runtime missing. Reinstall Pi.app from the official release." >&2',
    "  exit 127",
    "fi",
    'exec "$NODE" "$LAUNCHER" "$@"',
    "",
  ].join("\n");
}

/** Node shim for npm global installs (forwards to launcher via require('node')). */
export function nodeShimContents(launcherPath) {
  if (isWindows) {
    const q = `"${launcherPath}"`;
    return [
      "@ECHO off",
      `REM ${SHIM_MARKER} (do not edit) - forwards to the pi CLI bundled with pi-app`,
      `IF EXIST ${q} (`,
      `  node ${q} %*`,
      ") ELSE (",
      "  echo pi: this command is provided by pi-app, which is no longer installed. Reinstall: npm i -g pi-app 1>&2",
      "  EXIT /B 127",
      ")",
      "",
    ].join("\r\n");
  }
  return [
    "#!/usr/bin/env node",
    `// ${SHIM_MARKER} (do not edit) - forwards to the pi CLI bundled with pi-app`,
    '"use strict";',
    'const fs = require("fs");',
    `const launcher = ${JSON.stringify(launcherPath)};`,
    "if (!fs.existsSync(launcher)) {",
    '  process.stderr.write("pi: this command is provided by pi-app, which is no longer installed.\\n");',
    '  process.stderr.write("Reinstall with: npm i -g pi-app  (or delete this file: " + process.argv[1] + ")\\n");',
    "  process.exit(127);",
    "}",
    "require(launcher);",
    "",
  ].join("\n");
}

const TAG = "[pi-app] ";
export function log(msg) {
  process.stdout.write(`${TAG}${msg}\n`);
}
export function warn(msg) {
  process.stderr.write(`${TAG}${msg}\n`);
}
