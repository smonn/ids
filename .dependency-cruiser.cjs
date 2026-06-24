/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "adapter-types-imports-allowlist",
      severity: "error",
      comment:
        "adapter-types may import only types — it must not pull in codec constructors, layouts, wire internals, or higher-layer modules",
      from: { path: "^src/adapters/adapter-types\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(types|error)\\.ts$",
      },
    },
    {
      name: "wire-no-layouts",
      severity: "error",
      comment: "wire layer must not depend on layouts",
      from: { path: "^src/wire" },
      to: { path: "^src/codecs/[^/]+/layout\\.ts$" },
    },
    {
      name: "wire-no-shell",
      severity: "error",
      from: { path: "^src/wire" },
      to: {
        path: "^src/codecs/[^/]+/index\\.ts$|^src/adapters/[^/]+\\.ts$|^src/cli/index\\.ts$",
      },
    },
    {
      name: "adapters-no-internals",
      severity: "error",
      comment:
        "adapters may import only types, error surface, and adapter-types from @smonn/ids internals; adapter-types is the hub (types, error only); adding a new adapter requires zero depcruise edits",
      from: {
        path: "^src/adapters/[^/]+\\.ts$",
        pathNot: "^src/adapters/adapter-types\\.ts$|\\.test\\.ts$",
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
      from: { path: "^src/wire/(parse|envelope)\\.ts$" },
      to: { path: "^src/wire/(parse|envelope|codec-shell)\\.ts$" },
    },
    {
      name: "wire-leaves-no-upward",
      severity: "error",
      from: { path: "^src/wire/(invariants|timestamp-bytes)\\.ts$" },
      to: { path: "^src/wire/(parse|envelope|codec-shell)" },
    },
    {
      name: "wire-parse-imports-allowlist",
      severity: "error",
      comment: "parse may import only invariants, base32, and types",
      from: { path: "^src/wire/parse\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/invariants|wire/base32|types)\\.ts$",
      },
    },
    {
      name: "wire-envelope-imports-allowlist",
      severity: "error",
      comment: "envelope may import only base32 and types",
      from: { path: "^src/wire/envelope\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/base32|types)\\.ts$",
      },
    },
    {
      name: "wire-timestamp-bytes-imports-allowlist",
      severity: "error",
      comment: "timestamp-bytes may import only base32",
      from: { path: "^src/wire/timestamp-bytes\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/wire/base32\\.ts$",
      },
    },
    {
      name: "codec-shell-parse-invariants-only",
      severity: "error",
      comment: "codec-shell may import only wire/parse and wire/invariants",
      from: { path: "^src/wire/codec-shell\\.ts$" },
      to: {
        path: "^src/wire",
        pathNot: "^src/wire/(parse|invariants)\\.ts$",
      },
    },
    {
      name: "codec-constructors-wire-codec-shell-only",
      severity: "error",
      from: { path: "^src/codecs/[^/]+/index\\.ts$" },
      to: { path: "^src/wire", pathNot: "^src/wire/codec-shell" },
    },
    {
      name: "codec-constructors-layouts-only",
      severity: "error",
      comment: "only codec constructors may import layouts",
      from: {
        path: "^src",
        pathNot: "^src/codecs/[^/]+/index\\.ts$",
      },
      to: { path: "^src/codecs/[^/]+/layout\\.ts$" },
    },
    {
      name: "layouts-no-shell",
      severity: "error",
      from: { path: "^src/codecs/[^/]+/layout\\.ts$" },
      to: {
        path: "^src/codecs/[^/]+/index\\.ts$|^src/cli/index\\.ts$",
      },
    },
    {
      name: "layouts-no-sibling-layouts",
      severity: "error",
      comment: "layouts must not import sibling layout modules",
      from: { path: "^src/codecs/[^/]+/layout\\.ts$" },
      to: { path: "^src/codecs/[^/]+/layout\\.ts$" },
    },
    {
      name: "layouts-wire-imports-allowlist",
      severity: "error",
      comment:
        "layouts may import wire/envelope, wire/invariants, wire/timestamp-bytes, and types only",
      from: { path: "^src/codecs/[^/]+/layout\\.ts$" },
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
      from: { path: "^(src/cli/|bin/cli\\.ts$)" },
      to: {
        path: "^src/wire|^src/codecs/_kernel/(brand|registry|bytes)\\.ts$|^src/codecs/[^/]+/(key|layout)\\.ts$",
      },
    },
    {
      name: "_kernel-brand-registry-only-from-codec-constructors",
      severity: "error",
      comment: "only codec constructors may import brand or registry from _kernel",
      from: {
        path: "^src",
        pathNot: "^src/codecs/[^/]+/index\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/(brand|registry)" },
    },
    {
      name: "leaves-no-upward",
      severity: "error",
      from: { path: "^src/(wire/base32|codecs/_kernel/bytes|types|codecs/_kernel/brand)\\.ts$" },
      to: { path: "^src/(wire|layouts|timestamp|opaque|cli|codecs/_kernel/registry)" },
    },
    {
      name: "key-material-leaf-restricted",
      severity: "error",
      comment:
        "key-material is a leaf importable only by codec key-handle modules (codecs/<name>/key.ts)",
      from: {
        path: "^src.*\\.ts$",
        pathNot: "^src/codecs/[^/]+/key\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/key-material\\.ts$" },
    },
    {
      name: "key-material-leaf-no-upward",
      severity: "error",
      comment: "key-material leaf may only import bytes and error",
      from: { path: "^src/codecs/_kernel/key-material\\.ts$" },
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
      from: { path: "^src/codecs/([^_][^/]+)/", pathNot: "\\.test\\.ts$" },
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
        path: "^src/codecs/[^_][^/]*/",
        pathNot: "^src/codecs/[^/]+/(index|layout|key)\\.ts$|^src/codecs/[^/]+/[^/]+\\.test\\.ts$",
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
