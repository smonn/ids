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
      from: { path: "^test/fixtures/depcruise/adapters/adapter-types\\.ts$" },
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
      to: { path: "^src/codecs/[^/]+/layout\\.ts$" },
    },
    {
      name: "wire-no-shell",
      severity: "error",
      from: { path: "^test/fixtures/depcruise/wire" },
      to: {
        path: "^src/codecs/[^/]+/index\\.ts$|^src/adapters/[^/]+\\.ts$|^src/cli/index\\.ts$",
      },
    },
    {
      name: "adapters-no-internals",
      severity: "error",
      comment:
        "adapters may import only types, error surface, and adapter-types from @smonn/ids internals; adding a new adapter requires zero depcruise edits",
      from: {
        path: "^test/fixtures/depcruise/adapters/[^/]+\\.ts$",
        pathNot: "^test/fixtures/depcruise/adapters/adapter-types\\.ts$",
      },
      to: {
        path: "^src",
        pathNot: "^src/(types|error)\\.ts$|^src/adapters/adapter-types\\.ts$",
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
        pathNot: "^src/(wire/invariants|wire/base32|types)\\.ts$",
      },
    },
    {
      name: "wire-envelope-imports-allowlist",
      severity: "error",
      comment: "envelope may import only base32 and types",
      from: { path: "^test/fixtures/depcruise/wire/envelope\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/base32|types)\\.ts$",
      },
    },
    {
      name: "wire-timestamp-bytes-imports-allowlist",
      severity: "error",
      comment: "timestamp-bytes may import only base32",
      from: { path: "^test/fixtures/depcruise/wire/timestamp-bytes\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/wire/base32\\.ts$",
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
        path: "^test/fixtures/depcruise/codecs/[^/]+/index\\.ts$",
      },
      to: { path: "^src/wire", pathNot: "^src/wire/codec-shell" },
    },
    {
      name: "codec-constructors-layouts-only",
      severity: "error",
      comment: "only codec constructors may import layouts",
      from: {
        path: "^test/fixtures/depcruise",
        pathNot: "^test/fixtures/depcruise/codecs/[^/]+/index\\.ts$",
      },
      to: { path: "^src/codecs/[^/]+/layout\\.ts$" },
    },
    {
      name: "layouts-no-shell",
      severity: "error",
      from: { path: "^test/fixtures/depcruise/codecs/[^/]+/layout\\.ts$" },
      to: {
        path: "^src/codecs/[^/]+/index\\.ts$|^src/cli/index\\.ts$",
      },
    },
    {
      name: "layouts-no-sibling-layouts",
      severity: "error",
      comment: "layouts must not import sibling layout modules",
      from: { path: "^test/fixtures/depcruise/codecs/[^/]+/layout\\.ts$" },
      to: { path: "^src/codecs/[^/]+/layout\\.ts$" },
    },
    {
      name: "layouts-wire-imports-allowlist",
      severity: "error",
      comment:
        "layouts may import wire/envelope, wire/invariants, wire/timestamp-bytes, and types only",
      from: { path: "^test/fixtures/depcruise/codecs/[^/]+/layout\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/(envelope|invariants|timestamp-bytes)|types)\\.ts$",
      },
    },
    {
      name: "cli-no-internals",
      severity: "error",
      comment:
        "CLI uses public codec entrypoints and Opaque key helpers via codecs/opaque/index.ts etc.",
      from: {
        path: "^(test/fixtures/depcruise/cli\\.ts|test/fixtures/depcruise/cli/)",
      },
      to: {
        path: "^src/wire|^src/codecs/_kernel/(brand|registry|bytes)\\.ts$|^src/codecs/[^/]+/(key|layout)\\.ts$",
      },
    },
    {
      name: "_kernel-brand-registry-only-from-codec-constructors",
      severity: "error",
      comment: "only codec constructors may import brand or registry from _kernel",
      from: {
        path: "^test/fixtures/depcruise",
        pathNot: "^test/fixtures/depcruise/codecs/[^/]+/index\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/(brand|registry)" },
    },
    {
      name: "leaves-no-upward",
      severity: "error",
      comment:
        "covers all codec paths post-ADR-0018 (layouts/timestamp/opaque moved under src/codecs/)",
      from: {
        path: "^test/fixtures/depcruise/(wire/base32|codecs/_kernel/bytes|types|codecs/_kernel/brand)\\.ts$",
      },
      to: {
        path: "^src/(wire|cli|codecs)",
      },
    },
    {
      name: "key-material-leaf-restricted",
      severity: "error",
      comment:
        "key-material is a leaf importable only by codec key-handle modules (codecs/<name>/key.ts)",
      from: {
        path: "^test/fixtures/depcruise.*\\.ts$",
        pathNot: "^test/fixtures/depcruise/codecs/[^/]+/key\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/key-material\\.ts$" },
    },
    {
      name: "key-material-leaf-no-upward",
      severity: "error",
      comment: "key-material leaf may only import bytes and error",
      from: { path: "^test/fixtures/depcruise/codecs/_kernel/key-material\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(codecs/_kernel/bytes|error)\\.ts$",
      },
    },
    {
      name: "codec-slice-no-cross-codec-imports",
      severity: "error",
      comment:
        "a codec slice may only import from its own directory or from codecs/_kernel; uses $1 back-reference (dependency-cruiser@17.4.3+)",
      from: {
        path: "^test/fixtures/depcruise/codecs/([^_][^/]+)/",
        pathNot: "\\.test\\.ts$",
      },
      to: {
        path: "^src/codecs/",
        pathNot: "^src/codecs/($1/|_kernel/)",
      },
    },
    {
      name: "codec-slice-filename-convention",
      severity: "error",
      comment: "files in codecs/<name>/ must be index.ts, layout.ts, key.ts, or *.test.ts",
      from: {
        path: "^test/fixtures/depcruise/codecs/[^_][^/]*/",
        pathNot:
          "^test/fixtures/depcruise/codecs/[^/]+/(index|layout|key)\\.ts$|^test/fixtures/depcruise/codecs/[^/]+/[^/]+\\.test\\.ts$",
      },
      to: { path: "." },
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
