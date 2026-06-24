/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "adapter-types-imports-allowlist",
      severity: "error",
      comment:
        "adapter-types may import only types — it must not pull in codec constructors, layouts, wire internals, or higher-layer modules",
      from: { path: "^src/adapter-types\\.ts$" },
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
      to: { path: "^src/layouts" },
    },
    {
      name: "wire-no-shell",
      severity: "error",
      from: { path: "^src/wire" },
      to: {
        path: "^src/(timestamp|opaque|reverse|wrapped|signed|digest|drizzle|kysely|cli|registry)\\.ts$",
      },
    },
    {
      name: "drizzle-adapter-no-internals",
      severity: "error",
      comment:
        "drizzle adapter may import only types, error surface, and adapter-types from @smonn/ids internals",
      from: { path: "^src/drizzle\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(types|error|adapter-types)\\.ts$",
      },
    },
    {
      name: "kysely-adapter-no-internals",
      severity: "error",
      comment:
        "kysely adapter may import only types, error surface, and adapter-types from @smonn/ids internals; kysely imports readIdColumn and IdColumnCodec directly from adapter-types (not via drizzle) to avoid pulling drizzle-orm into the kysely adapter's module graph",
      from: { path: "^src/kysely\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(types|error|adapter-types)\\.ts$",
      },
    },
    {
      name: "prisma-adapter-no-internals",
      severity: "error",
      comment:
        "prisma adapter may import only types, error surface, and adapter-types from @smonn/ids internals",
      from: { path: "^src/prisma\\.ts$" },
      to: {
        path: "^src",
        pathNot: "^src/(types|error|adapter-types)\\.ts$",
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
      from: { path: "^src/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$" },
      to: { path: "^src/wire", pathNot: "^src/wire/codec-shell" },
    },
    {
      name: "codec-constructors-layouts-only",
      severity: "error",
      comment: "only codec constructors may import layouts",
      from: {
        path: "^src",
        pathNot: "^src/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$",
      },
      to: { path: "^src/layouts" },
    },
    {
      name: "layouts-no-shell",
      severity: "error",
      from: { path: "^src/layouts" },
      to: { path: "^src/(timestamp|opaque|reverse|wrapped|signed|digest|cli|registry)\\.ts$" },
    },
    {
      name: "layouts-no-sibling-layouts",
      severity: "error",
      comment: "layouts must not import sibling layout modules",
      from: { path: "^src/layouts" },
      to: { path: "^src/layouts" },
    },
    {
      name: "layouts-wire-imports-allowlist",
      severity: "error",
      comment:
        "layouts may import wire/envelope, wire/invariants, wire/timestamp-bytes, and types only",
      from: { path: "^src/layouts" },
      to: {
        path: "^src",
        pathNot: "^src/(wire/(envelope|invariants|timestamp-bytes)|types)\\.ts$",
      },
    },
    {
      name: "cli-no-internals",
      severity: "error",
      comment:
        "CLI uses public codec entrypoints and Opaque key helpers via timestamp.ts/opaque.ts",
      from: { path: "^(src/cli\\.ts|src/cli/|bin/cli\\.ts$)" },
      to: {
        path: "^src/(wire|layouts|codecs/_kernel/brand|codecs/_kernel/registry|codecs/_kernel/bytes|opaque-key|wrapping-key)",
      },
    },
    {
      name: "brand-only-from-codec-constructors",
      severity: "error",
      comment: "only codec constructors may import brand",
      from: {
        path: "^src",
        pathNot: "^src/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/brand" },
    },
    {
      name: "registry-only-from-codec-constructors",
      severity: "error",
      from: {
        path: "^src",
        pathNot: "^src/(timestamp|opaque|reverse|wrapped|signed|digest)\\.ts$",
      },
      to: { path: "^src/codecs/_kernel/registry" },
    },
    {
      name: "leaves-no-upward",
      severity: "error",
      from: { path: "^src/(wire/base32|codecs/_kernel/bytes|types|codecs/_kernel/brand)\\.ts$" },
      to: { path: "^src/(wire|layouts|timestamp|opaque|cli|registry)" },
    },
    {
      name: "key-material-leaf-restricted",
      severity: "error",
      comment:
        "key-material is a leaf importable only by the four key-handle modules (opaque-key, wrapping-key, signing-key, digest-key)",
      from: {
        path: "^src.*\\.ts$",
        pathNot: "^src/(opaque-key|wrapping-key|signing-key|digest-key)\\.ts$",
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
