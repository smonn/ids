import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    opaque: "src/codecs/opaque/index.ts",
    reverse: "src/codecs/reverse/index.ts",
    signed: "src/codecs/signed/index.ts",
    wrapped: "src/codecs/wrapped/index.ts",
    digest: "src/codecs/digest/index.ts",
    drizzle: "src/drizzle.ts",
    hono: "src/hono.ts",
    kysely: "src/kysely.ts",
    prisma: "src/prisma.ts",
    express: "src/express.ts",
    fastify: "src/fastify.ts",
    cli: "bin/cli.ts",
  },
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  platform: "node",
});
