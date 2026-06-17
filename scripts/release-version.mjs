#!/usr/bin/env node
/**
 * Read and validate pi-app + bundled @earendil-works/pi-coding-agent versions.
 *
 * Bundle id (UI):  {appVersion}p{piVersion}  e.g. 0.8.4p0.79.3
 *
 * Usage:
 *   node scripts/release-version.mjs              # human summary
 *   node scripts/release-version.mjs --json
 *   node scripts/release-version.mjs --check      # exit 1 if deps stale or mismatched
 *   node scripts/release-version.mjs --notes-header
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = join(ROOT, "package.json");
const PI_PKG = join(ROOT, "node_modules/@earendil-works/pi-coding-agent/package.json");

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function npmView(pkg, field) {
	try {
		const raw = execFileSync("npm", ["view", pkg, field, "--json"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		try {
			const parsed = JSON.parse(raw);
			return typeof parsed === "string" ? parsed : String(parsed);
		} catch {
			return raw;
		}
	} catch {
		return null;
	}
}

function parsePinVersion(spec) {
	const s = String(spec ?? "");
	const alias = s.match(/@(\d+\.\d+\.\d+)$/);
	if (alias) return alias[1];
	return s.replace(/^[\^~]/, "");
}

export function getVersions() {
	const pkg = readJson(PKG_PATH);
	const appVersion = pkg.version ?? "0.0.0";
	const pinnedPi = parsePinVersion(pkg.dependencies?.["@earendil-works/pi-coding-agent"]);
	let installedPi = null;
	if (existsSync(PI_PKG)) {
		installedPi = readJson(PI_PKG).version ?? null;
	}
	const latestPi = npmView("@livos/pi-coding-agent", "version") ?? npmView("@earendil-works/pi-coding-agent", "version");
	const bundle = `${appVersion}p${installedPi ?? pinnedPi ?? "?"}`;
	return { appVersion, pinnedPi, installedPi, latestPi, bundle };
}

function check() {
	const v = getVersions();
	const errors = [];
	const warnings = [];

	if (!v.pinnedPi) {
		errors.push("package.json missing @earendil-works/pi-coding-agent dependency");
	}
	const pkg = readJson(PKG_PATH);
	const piPin = parsePinVersion(pkg.dependencies?.["@earendil-works/pi-coding-agent"]);
	const aiPin = parsePinVersion(pkg.dependencies?.["@earendil-works/pi-ai"]);
	if (piPin && aiPin && piPin !== aiPin) {
		errors.push(`pi-ai pin (${aiPin}) must match pi-coding-agent pin (${piPin})`);
	}

	if (v.installedPi && v.pinnedPi && v.installedPi !== v.pinnedPi) {
		errors.push(`node_modules pi (${v.installedPi}) != package.json pin (${v.pinnedPi}) — run npm ci`);
	}
	if (v.latestPi && v.pinnedPi && v.pinnedPi !== v.latestPi) {
		const msg = `pinned pi ${v.pinnedPi} is behind @livos latest ${v.latestPi} — run npm run release:sync-pi-deps`;
		if (args.has("--strict")) errors.push(msg);
		else warnings.push(msg);
	}

	return { v, errors, warnings };
}

function notesHeader(v) {
	return [
		`## pi-app v${v.appVersion} + pi v${v.installedPi ?? v.pinnedPi}`,
		"",
		`| Component | Version |`,
		`|-----------|---------|`,
		`| **pi-app** | \`${v.appVersion}\` |`,
		`| **@earendil-works/pi-coding-agent** | \`${v.installedPi ?? v.pinnedPi}\` |`,
		`| **Bundle id** (sidebar click) | \`${v.bundle}\` |`,
		"",
	].join("\n");
}

const args = new Set(process.argv.slice(2));

if (args.has("--json")) {
	console.log(JSON.stringify(getVersions(), null, 2));
	process.exit(0);
}

if (args.has("--notes-header")) {
	const v = getVersions();
	console.log(notesHeader(v));
	process.exit(0);
}

if (args.has("--bundle")) {
	console.log(getVersions().bundle);
	process.exit(0);
}

if (args.has("--check")) {
	const { v, errors, warnings } = check();
	for (const w of warnings) console.error(`warning: ${w}`);
	for (const e of errors) console.error(`error: ${e}`);
	if (errors.length === 0) {
		console.log(`ok: pi-app ${v.appVersion} + pi ${v.installedPi ?? v.pinnedPi} (bundle ${v.bundle})`);
		if (v.latestPi) console.log(`@livos latest pi: ${v.latestPi}`);
	}
	process.exit(errors.length > 0 ? 1 : 0);
}

const v = getVersions();
console.log(`pi-app:  ${v.appVersion}`);
console.log(`pi pin:  ${v.pinnedPi || "(none)"}`);
console.log(`pi inst: ${v.installedPi ?? "(not installed)"}`);
console.log(`npm pi:  ${v.latestPi ?? "(unknown)"} (@livos)`);
console.log(`bundle:  ${v.bundle}`);
