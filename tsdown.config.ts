import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    opaque: "src/opaque.ts",
    wrapped: "src/wrapped.ts",
    cli: "bin/cli.ts",
  },
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  platform: "node",
});
