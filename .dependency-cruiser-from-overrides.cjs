/**
 * Per-rule `from` overrides for rules whose fixture files are named
 * differently from the source files they mirror.
 * Shared between .dependency-cruiser-fixtures.cjs and the depcruise test suite.
 */
module.exports = {
  "wire-parse-imports-allowlist": {
    path: "^test/fixtures/depcruise/wire/parse-allowlist\\.ts$",
  },
  "wire-middle-no-siblings": {
    path: "^test/fixtures/depcruise/wire/(parse-middle|envelope)\\.ts$",
  },
  "wire-uuid-imports-allowlist": {
    path: "^test/fixtures/depcruise/wire/uuid-allowlist\\.ts$",
  },
  "cli-no-internals": {
    path: "^(test/fixtures/depcruise/cli\\.ts|test/fixtures/depcruise/cli/)",
  },
};
