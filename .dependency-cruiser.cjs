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
      name: "layouts-no-shell",
      severity: "error",
      from: { path: "^src/layouts" },
      to: { path: "^src/(id|opaque|cli|registry)\\.ts$" },
    },
    {
      name: "layouts-no-sibling-timestamp-to-opaque",
      severity: "error",
      from: { path: "^src/layouts/timestamp" },
      to: { path: "^src/layouts/opaque" },
    },
    {
      name: "layouts-no-sibling-opaque-to-timestamp",
      severity: "error",
      from: { path: "^src/layouts/opaque" },
      to: { path: "^src/layouts/timestamp" },
    },
    {
      name: "layouts-no-base32",
      severity: "error",
      comment: "layouts reach base32 through wire/envelope",
      from: { path: "^src/layouts" },
      to: { path: "^src/base32" },
    },
    {
      name: "factories-no-base32",
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
      name: "registry-only-from-factories",
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
