// money-hub patch: a build of one screen with fixture data, for a true-size picture before shipping
// (the owner wants to see new UI before it lands). Same plugins, aliases and CSS as the app;
// only the entry, the output folder and the public folder differ.
//
//   BUILD_TARGET=web pnpm exec vite build -c vite.preview.config.ts
//   then serve preview-dist/ statically and open preview/subscriptions.html?view=page&theme=dark
//
// Fixture data (real transactions) and copied logos live in preview/*.fixture.json and
// preview/public/, both ignored by git.
import path from "path";
import { defineConfig } from "vitest/config";

import base from "./vite.config";

const baseConfig = base as unknown as Record<string, unknown> & { build: Record<string, unknown> };

export default defineConfig({
  ...baseConfig,
  publicDir: "preview/public",
  build: {
    ...baseConfig.build,
    outDir: "preview-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        subscriptions: path.resolve(__dirname, "preview/subscriptions.html"),
        "credit-cards": path.resolve(__dirname, "preview/credit-cards.html"),
        "free-cash": path.resolve(__dirname, "preview/free-cash.html"),
      },
    },
  },
} as unknown as import("vitest/config").UserConfigExport);
