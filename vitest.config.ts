import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // File-level isolation (vitest default) MUST remain enabled: codec tests register
    // process-global brands via src/codecs/_kernel/registry.ts; each test file runs in
    // its own worker context so brand-registry state never leaks between files.
    // Disabling pool isolation (e.g. isolate: false) would cause false duplicate-brand
    // warnings and break tests that rely on a clean registry.
    setupFiles: ["test/setup.ts"],
    coverage: {
      provider: "v8",
      // bin/ is intentionally excluded: bin/cli.ts is a thin shim (top-level-await
      // entry point) that cannot be instrumented by the in-process v8 runner. Its
      // behaviour is fully exercised by the src/cli/ unit tests.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/test-helpers.ts"],
      thresholds: {
        100: true,
      },
    },
  },
});
