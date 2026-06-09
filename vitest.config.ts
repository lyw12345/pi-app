import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", ".next-dev-*", "dist/**", "tmp/**"],
    pool: "forks",
    testTimeout: 8000,
    hookTimeout: 8000,
  },
});
