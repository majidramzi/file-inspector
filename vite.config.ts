import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages project site: assets must be served under /file-inspector/
export default defineConfig({
  base: "/file-inspector/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  // Allow the sandboxed preview host in addition to localhost.
  preview: {
    allowedHosts: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    globals: true,
  },
});
