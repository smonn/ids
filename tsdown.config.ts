import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    opaque: "src/opaque.ts",
    reverse: "src/reverse.ts",
    wrapped: "src/wrapped.ts",
    drizzle: "src/drizzle.ts",
    hono: "src/hono.ts",
    cli: "bin/cli.ts",
  },
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  platform: "node",
});
