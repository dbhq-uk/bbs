import { resolve } from "node:path";
import { defineConfig } from "vite";

/// Four entry points. Every page here has to be listed: rollup only walks
/// from these, so an HTML file that is not named is simply never built and
/// its URL 404s in production while working perfectly in `vite dev`.
///
/// The tool has its own URL because it has to be findable. The board's
/// keyword cluster is tiny - "telnet bbs" is 390 searches a month
/// worldwide - while image-to-ASCII conversion is ~95,000, and a single-
/// page site cannot rank for a thing it never mentions in a URL or a title.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about/index.html"),
        projects: resolve(__dirname, "projects/index.html"),
        tool: resolve(__dirname, "ascii-art-generator/index.html"),
      },
    },
  },
});
