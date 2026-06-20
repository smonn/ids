import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    opaque: "src/opaque.ts",
    reverse: "src/reverse.ts",
    signed: "src/signed.ts",
    wrapped: "src/wrapped.ts",
    drizzle: "src/drizzle.ts",
    hono: "src/hono.ts",
    kysely: "src/kysely.ts",
    prisma: "src/prisma.ts",
    express: "src/express.ts",
    cli: "bin/cli.ts",
  },
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  platform: "node",
});
