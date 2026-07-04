/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
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
        path: "^src/codecs/[^/]+/index\\.ts$|^src/adapters/[^/]+\\.ts$|^src/cli/",
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
      name: "wire-uuid-imports-allowlist",
      severity: "error",
      comment: "uuid may import only wire/envelope, error, and types",
      from: { path: "^src/wire/uuid\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/envelope|error|types)\\.ts$",
      },
    },
    {
      name: "wire-timestamp-bytes-imports-allowlist",
      severity: "error",
      comment: "timestamp-bytes may import only base32 and error",
      from: { path: "^src/wire/timestamp-bytes\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/base32|error)\\.ts$",
      },
    },
    {
      name: "codec-shell-parse-invariants-only",
      severity: "error",
      comment: "codec-shell may import only wire/parse, wire/invariants, and wire/uuid",
      from: { path: "^src/wire/codec-shell\\.ts$" },
      to: {
        path: "^src/wire",
        pathNot: "^src/wire/(parse|invariants|uuid)\\.ts$",
      },
    },
    {
      name: "codec-constructors-imports-allowlist",
      severity: "error",
      comment:
        "codec constructors may only import wire/codec-shell, their own layout and key, _kernel modules, types, and error",
      from: { path: "^src/codecs/[^/]+/index\\.ts$" },
      to: {
        path: "^src",
        pathNot:
          "^src/wire/codec-shell|^src/codecs/[^/]+/(layout|key)\\.ts$|^src/codecs/_kernel/|^src/(types|error)\\.ts$",
      },
    },
    {
      name: "codec-key-imports-allowlist",
      severity: "error",
      comment: "codec key modules may only import from _kernel and types/error",
      from: { path: "^src/codecs/[^/]+/key\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/codecs/_kernel/|^src/(types|error)\\.ts$",
      },
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
        path: "^src/codecs/[^/]+/index\\.ts$|^src/cli/",
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
        "layouts may import wire/envelope, wire/invariants, wire/timestamp-bytes, types, codecs/_kernel/bytes, and codecs/_kernel/crypto only",
      from: { path: "^src/codecs/[^/]+/layout\\.ts$" },
      to: {
        path: "^src",
        pathNot:
          "^src/(wire/(envelope|invariants|timestamp-bytes)|types)\\.ts$|^src/codecs/_kernel/(bytes|crypto)\\.ts$",
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
      comment:
        "only codec constructors may import brand or registry from _kernel; tests may use the resetBrandRegistry hook (ADR-0021)",
      from: {
        path: "^src",
        pathNot: "^src/codecs/[^/]+/index\\.ts$|\\.test\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/(brand|registry)" },
    },
    {
      name: "leaves-no-upward",
      severity: "error",
      comment:
        "covers all codec paths post-ADR-0018 (layouts/timestamp/opaque moved under src/codecs/)",
      from: {
        path: "^src/(wire/base32|codecs/_kernel/bytes|types|codecs/_kernel/brand|codecs/_kernel/registry)\\.ts$",
      },
      to: { path: "^src/(wire|cli|codecs)" },
    },
    {
      name: "key-material-leaf-restricted",
      severity: "error",
      comment:
        "key-material is a leaf importable only by codec key-handle modules (codecs/<name>/key.ts)",
      from: {
        path: "^src.*\\.ts$",
        pathNot: "^src/codecs/[^/]+/key\\.ts$|\\.test\\.ts$",
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
      name: "crypto-leaf-restricted",
      severity: "error",
      comment: "_kernel/crypto is a leaf importable only by layout modules and key-handle modules",
      from: {
        path: "^src.*\\.ts$",
        pathNot: "^src/codecs/[^/]+/(layout|key)\\.ts$|\\.test\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/crypto\\.ts$" },
    },
    {
      name: "crypto-leaf-no-upward",
      severity: "error",
      comment: "_kernel/crypto leaf may only import _kernel/bytes and wire/invariants",
      from: { path: "^src/codecs/_kernel/crypto\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(codecs/_kernel/bytes|wire/invariants)\\.ts$",
      },
    },
    {
      name: "rng-leaf-restricted",
      severity: "error",
      comment:
        "_kernel/rng is a leaf importable only by codec constructors (codecs/<name>/index.ts)",
      from: {
        path: "^src.*\\.ts$",
        pathNot: "^src/codecs/[^/]+/index\\.ts$|\\.test\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/rng\\.ts$" },
    },
    {
      name: "rng-leaf-no-upward",
      severity: "error",
      comment: "_kernel/rng leaf may not import any src/ module",
      from: { path: "^src/codecs/_kernel/rng\\.ts$" },
      to: { path: "^src" },
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
