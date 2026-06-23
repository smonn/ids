/**
 * Depcruise config for negative fixture tests.
 *
 * All rules duplicate the main config with `from.path` / `from.pathNot`
 * remapped from `^src/` → `^test/fixtures/depcruise/` so that fixture files
 * under test/fixtures/depcruise/ match the `from` side while the real `src/`
 * files they import match the existing `to` patterns unchanged.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "adapter-types-imports-allowlist",
      severity: "error",
      comment:
        "adapter-types may import only types — it must not pull in codec constructors, layouts, wire internals, or higher-layer modules",
      from: { path: "^test/fixtures/depcruise/adapter-types\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/types\\.ts$",
      },
    },
    {
      name: "wire-no-layouts",
      severity: "error",
      comment: "wire layer must not depend on layouts",
      from: { path: "^test/fixtures/depcruise/wire" },
      to: { path: "^src/layouts" },
    },
    {
      name: "wire-no-shell",
      severity: "error",
      from: { path: "^test/fixtures/depcruise/wire" },
      to: {
        path: "^src/(timestamp|opaque|reverse|wrapped|signed|digest|drizzle|kysely|cli|registry)\\.ts$",
      },
    },
    {
      name: "drizzle-adapter-no-internals",
      severity: "error",
      comment:
        "drizzle adapter may import only types, error surface, and adapter-types from @smonn/ids internals",
      from: { path: "^test/fixtures/depcruise/drizzle\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(types|error|adapter-types)\\.ts$",
      },
    },
    {
      name: "kysely-adapter-no-internals",
      severity: "error",
      comment:
        "kysely adapter may import only types, error surface, and the drizzle adapter from @smonn/ids internals; adapter-types is reachable transitively via drizzle (kysely imports IdColumnCodec from drizzle, which re-exports it from adapter-types) — this transitive path is intentional",
      from: { path: "^test/fixtures/depcruise/kysely\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(types|drizzle|error)\\.ts$",
      },
    },
    {
      name: "prisma-adapter-no-internals",
      severity: "error",
      comment:
        "prisma adapter may import only types, error surface, and adapter-types from @smonn/ids internals",
      from: { path: "^test/fixtures/depcruise/prisma\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(types|error|adapter-types)\\.ts$",
      },
    },
    {
      name: "wire-middle-no-siblings",
      severity: "error",
      comment: "parse and envelope import invariants only, not each other",
      from: { path: "^test/fixtures/depcruise/wire/(parse-middle|envelope)\\.ts$" },
      to: { path: "^src/wire/(parse|envelope|codec-shell)\\.ts$" },
    },
    {
      name: "wire-leaves-no-upward",
      severity: "error",
      from: {
        path: "^test/fixtures/depcruise/wire/(invariants|timestamp-bytes)\\.ts$",
      },
      to: { path: "^src/wire/(parse|envelope|codec-shell)" },
    },
    {
      name: "wire-parse-imports-allowlist",
      severity: "error",
      comment: "parse may import only invariants, base32, and types",
      from: { path: "^test/fixtures/depcruise/wire/parse-allowlist\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/invariants|base32|types)\\.ts$",
      },
    },
    {
      name: "wire-envelope-imports-allowlist",
      severity: "error",
      comment: "envelope may import only base32 and types",
      from: { path: "^test/fixtures/depcruise/wire/envelope\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(base32|types)\\.ts$",
      },
    },
    {
      name: "wire-timestamp-bytes-imports-allowlist",
      severity: "error",
      comment: "timestamp-bytes may import only base32",
      from: { path: "^test/fixtures/depcruise/wire/timestamp-bytes\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/base32\\.ts$",
      },
    },
    {
      name: "codec-shell-parse-invariants-only",
      severity: "error",
      comment: "codec-shell may import only wire/parse and wire/invariants",
      from: { path: "^test/fixtures/depcruise/wire/codec-shell\\.ts$" },
      to: {
        path: "^src/wire",
        pathNot: "^src/wire/(parse|invariants)\\.ts$",
      },
    },
    {
      name: "codec-constructors-wire-codec-shell-only",
      severity: "error",
      from: {
        path: "^test/fixtures/depcruise/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$",
      },
      to: { path: "^src/wire", pathNot: "^src/wire/codec-shell" },
    },
    {
      name: "codec-constructors-layouts-only",
      severity: "error",
      comment: "only codec constructors may import layouts",
      from: {
        path: "^test/fixtures/depcruise",
        pathNot: "^test/fixtures/depcruise/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$",
      },
      to: { path: "^src/layouts" },
    },
    {
      name: "layouts-no-shell",
      severity: "error",
      from: { path: "^test/fixtures/depcruise/layouts" },
      to: {
        path: "^src/(timestamp|opaque|reverse|wrapped|signed|digest|cli|registry)\\.ts$",
      },
    },
    {
      name: "layouts-no-sibling-layouts",
      severity: "error",
      comment: "layouts must not import sibling layout modules",
      from: { path: "^test/fixtures/depcruise/layouts" },
      to: { path: "^src/layouts" },
    },
    {
      name: "layouts-wire-imports-allowlist",
      severity: "error",
      comment:
        "layouts may import wire/envelope, wire/invariants, wire/timestamp-bytes, and types only",
      from: { path: "^test/fixtures/depcruise/layouts" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/(envelope|invariants|timestamp-bytes)|types)\\.ts$",
      },
    },
    {
      name: "layouts-no-base32",
      severity: "error",
      comment: "layouts reach base32 through wire/envelope",
      from: { path: "^test/fixtures/depcruise/layouts" },
      to: { path: "^src/base32" },
    },
    {
      name: "codec-constructors-no-base32",
      severity: "error",
      from: {
        path: "^test/fixtures/depcruise/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$",
      },
      to: { path: "^src/base32" },
    },
    {
      name: "cli-no-internals",
      severity: "error",
      comment:
        "CLI uses public codec entrypoints and Opaque key helpers via timestamp.ts/opaque.ts",
      from: {
        path: "^(test/fixtures/depcruise/cli\\.ts|test/fixtures/depcruise/cli/)",
      },
      to: {
        path: "^src/(wire|layouts|brand|registry|base32|bytes|opaque-key|wrapping-key)",
      },
    },
    {
      name: "brand-only-from-codec-constructors",
      severity: "error",
      comment: "only codec constructors may import brand",
      from: {
        path: "^test/fixtures/depcruise",
        pathNot: "^test/fixtures/depcruise/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$",
      },
      to: { path: "^src/brand" },
    },
    {
      name: "registry-only-from-codec-constructors",
      severity: "error",
      from: {
        path: "^test/fixtures/depcruise",
        pathNot: "^test/fixtures/depcruise/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$",
      },
      to: { path: "^src/registry" },
    },
    {
      name: "leaves-no-upward",
      severity: "error",
      from: {
        path: "^test/fixtures/depcruise/(base32|bytes|types|brand)\\.ts$",
      },
      to: {
        path: "^src/(wire|layouts|timestamp|opaque|cli|registry)",
      },
    },
    {
      name: "key-material-leaf-restricted",
      severity: "error",
      comment:
        "key-material is a leaf importable only by the four key-handle modules (opaque-key, wrapping-key, signing-key, digest-key)",
      from: {
        path: "^test/fixtures/depcruise.*\\.ts$",
        pathNot: "^test/fixtures/depcruise/(opaque-key|wrapping-key|signing-key|digest-key)\\.ts$",
      },
      to: { path: "^src/key-material\\.ts$" },
    },
    {
      name: "key-material-leaf-no-upward",
      severity: "error",
      comment: "key-material leaf may only import bytes and error",
      from: { path: "^test/fixtures/depcruise/key-material\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(bytes|error)\\.ts$",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
