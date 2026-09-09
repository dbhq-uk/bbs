import { resolve } from "node:path";
import { defineConfig } from "vite";

/// Two entry points: the board, and the ASCII art tool.
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
        tool: resolve(__dirname, "ascii-art-generator/index.html"),
      },
    },
  },
});
