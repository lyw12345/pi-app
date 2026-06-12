import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

const packageJson = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as {
  version: string;
  dependencies?: Record<string, string>;
};
const { version } = packageJson;
const usesLocalPi = String(packageJson.dependencies?.["@earendil-works/pi-coding-agent"] ?? "").startsWith("file:");
let piVersion = "unknown";
try {
  const piPkgPath = join(__dirname, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

const piServerExternalPackages = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-tui",
  "jiti",
  "typebox",
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Standalone output (enabled only when packaging) traces the minimal set of
  // server runtime files into .next/standalone, dramatically shrinking the
  // bundled node_modules. Dev/normal builds are unaffected.
  output: process.env.PI_STANDALONE === "1" ? "standalone" : undefined,
  serverExternalPackages: piServerExternalPackages,
  webpack: (config, { isServer }) => {
    if (!isServer) return config;
    // file: linked pi packages are still bundled by webpack dev unless forced external.
    const prev = config.externals;
    config.externals = [
      ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
      ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
        if (!request) return callback();
        if (
          piServerExternalPackages.some((pkg) => request === pkg || request.startsWith(`${pkg}/`))
        ) {
          return callback(undefined, `module ${request}`);
        }
        callback();
      },
    ];
    return config;
  },
  devIndicators: process.env.NODE_ENV === "development" ? {
    position: "bottom-right",
  } : false,
  turbopack: {
    // Turbopack won't resolve file:/npm-link deps outside the app root unless root is widened.
    root: usesLocalPi ? join(__dirname, "..") : __dirname,
  },
  allowedDevOrigins: ["192.168.*.*"],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
