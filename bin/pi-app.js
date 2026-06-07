#!/usr/bin/env node
"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("util");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require("os");

const pkgDir = path.join(__dirname, "..");
const nextDir = path.join(pkgDir, ".next");

function resolveAgentDir() {
  if (process.env.PI_CODING_AGENT_DIR) return process.env.PI_CODING_AGENT_DIR;
  return path.join(os.homedir(), ".pi", "agent");
}

function applyRemoteEnvFromConfig() {
  const configPath = path.join(resolveAgentDir(), "pi-web-remote.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(raw);
    if (config.enabled) {
      process.env.PI_WEB_REMOTE = "1";
      if (config.signingSecret) process.env.PI_WEB_REMOTE_SIGNING_SECRET = config.signingSecret;
      if (config.readOnly) process.env.PI_WEB_REMOTE_READ_ONLY = "1";
      else delete process.env.PI_WEB_REMOTE_READ_ONLY;
    }
  } catch {
    // no remote config yet
  }
}

// Resolve next's CLI entry directly to avoid relying on .bin symlinks (which
// may not exist when installed via npx).
let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next", { paths: [pkgDir] });
} catch {
  // Fallback: locate next package root and derive the bin path manually.
  try {
    const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
    nextBin = path.join(path.dirname(nextPkg), "dist", "bin", "next");
  } catch {
    nextBin = path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
  }
}

const { values: cliArgs } = parseArgs({
  options: {
    port:     { type: "string", short: "p" },
    hostname: { type: "string", short: "H" },
    remote:   { type: "boolean" },
  },
  strict: false,
});

const port     = cliArgs.port     ?? process.env.PORT     ?? "30141";
let hostname = cliArgs.hostname ?? process.env.HOSTNAME ?? null;
const remoteFlag = cliArgs.remote === true || process.env.PI_WEB_REMOTE === "1";

applyRemoteEnvFromConfig();

if (remoteFlag) {
  process.env.PI_WEB_REMOTE = "1";
  if (!hostname) hostname = "0.0.0.0";
}

if (process.env.PI_WEB_REMOTE_TOKEN) {
  process.env.PI_WEB_REMOTE = "1";
}

if (!fs.existsSync(nextDir)) {
  console.error("Build artifacts not found. Please report this issue.");
  process.exit(1);
}

const nextArgs = ["start", "-p", port];
if (hostname) nextArgs.push("-H", hostname);

const childEnv = { ...process.env };
if (remoteFlag && !childEnv.PI_WEB_REMOTE) childEnv.PI_WEB_REMOTE = "1";

// Always run next's JS entry with node directly — avoids .bin symlink issues
// and path-with-spaces problems on Windows when shell: true is used.
const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: pkgDir,
  stdio: ["inherit", "pipe", "inherit"],
  env: childEnv,
});

let browserOpened = false;
const openHost = !hostname || hostname === "0.0.0.0" ? "localhost" : hostname;
const url = `http://${openHost}:${port}`;

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!browserOpened && text.includes("Ready") && !remoteFlag) {
    browserOpened = true;
    const isWindows = process.platform === "win32";
    const isMac = process.platform === "darwin";
    const openCmd = isWindows ? "start" : isMac ? "open" : "xdg-open";
    spawn(openCmd, [url], { shell: isWindows, stdio: "ignore", detached: true }).unref();
  }
});

child.on("exit", (code) => process.exit(code ?? 0));
