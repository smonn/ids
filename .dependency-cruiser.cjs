/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
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
      to: { path: "^src/(id|opaque|cli|registry)\\.ts$" },
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
      from: { path: "^src/(id|opaque)\\.ts$" },
      to: { path: "^src/wire", pathNot: "^src/wire/codec-shell" },
    },
    {
      name: "layouts-no-shell",
      severity: "error",
      from: { path: "^src/layouts" },
      to: { path: "^src/(id|opaque|cli|registry)\\.ts$" },
    },
    {
      name: "layouts-no-sibling-layouts",
      severity: "error",
      comment: "layouts must not import sibling layout modules",
      from: { path: "^src/layouts" },
      to: { path: "^src/layouts" },
    },
    {
      name: "layouts-no-base32",
      severity: "error",
      comment: "layouts reach base32 through wire/envelope",
      from: { path: "^src/layouts" },
      to: { path: "^src/base32" },
    },
    {
      name: "codec-constructors-no-base32",
      severity: "error",
      from: { path: "^src/(id|opaque)\\.ts$" },
      to: { path: "^src/base32" },
    },
    {
      name: "cli-no-internals",
      severity: "error",
      from: { path: "^src/cli\\.ts$" },
      to: { path: "^src/(wire|layouts)" },
    },
    {
      name: "registry-only-from-codec-constructors",
      severity: "error",
      from: { path: "^src", pathNot: "^src/(id|opaque)\\.ts$" },
      to: { path: "^src/registry" },
    },
    {
      name: "leaves-no-upward",
      severity: "error",
      from: { path: "^src/(base32|bytes|types|brand)\\.ts$" },
      to: { path: "^src/(wire|layouts|id|opaque|cli|registry)" },
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
