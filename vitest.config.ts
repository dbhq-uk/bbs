import { defineConfig } from "vitest/config";

// The Worker tests only. The shell has its own vitest config because it
// resolves `bbs-core` from core/pkg and needs jsdom; running both from
// here picks up shell tests without that resolution and fails on an
// import rather than on anything real.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
