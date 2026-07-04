/**
 * Depcruise config for negative fixture tests.
 *
 * Derived programmatically from the main config: the `to` side of every rule
 * is copied verbatim so it can never drift from the main config. Only the
 * `from` side is remapped from `^src` → `^test/fixtures/depcruise`. A small
 * override table covers rules whose fixture files are named differently from
 * the corresponding source files (e.g. parse.ts is exercised by both
 * parse-middle.ts and parse-allowlist.ts in the fixture tree).
 */
const mainConfig = require("./.dependency-cruiser.cjs");

/** Replace every `^src` occurrence with the fixture root prefix. */
function remapSrc(str) {
  return str.replace(/\^src/g, "^test/fixtures/depcruise");
}

function remapFrom(from) {
  const result = {};
  if (from.path != null) result.path = remapSrc(from.path);
  if (from.pathNot != null) result.pathNot = remapSrc(from.pathNot);
  return result;
}

/**
 * Per-rule `from` overrides for rules whose fixture files are named
 * differently from the source files they mirror.
 */
const FROM_OVERRIDES = {
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

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: mainConfig.forbidden
    .filter((rule) => rule.from.path != null || rule.from.pathNot != null)
    .map((rule) => ({
      ...rule,
      from: FROM_OVERRIDES[rule.name] ?? remapFrom(rule.from),
    })),
  options: mainConfig.options,
};
