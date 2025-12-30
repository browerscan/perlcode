import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwind from "@astrojs/tailwind";

// https://astro.build/config
export default defineConfig({
  site: "https://freeperlcode.com",
  output: "static",
  integrations: [preact({ compat: true }), tailwind()],
  build: {
    // Inline small scripts for faster initial load
    inlineStylesheets: "auto",
  },
  vite: {
    build: {
      // Optimize bundle size
      cssMinify: "lightningcss",
    },
  },
});
