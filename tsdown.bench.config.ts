import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["bench/index.ts", "bench/compare.ts"],
  outDir: "bench/dist",
  format: "esm",
  platform: "node",
  dts: false,
  sourcemap: false,
  clean: true,
});
