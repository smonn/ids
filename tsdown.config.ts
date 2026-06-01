import { defineConfig } from "tsdown";

export default defineConfig({
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  platform: "node",
  exports: true,
});
