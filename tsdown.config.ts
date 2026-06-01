import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  platform: "node",
  exports: true,
});
