import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    opaque: "src/codecs/opaque/index.ts",
    reverse: "src/codecs/reverse/index.ts",
    signed: "src/codecs/signed/index.ts",
    wrapped: "src/codecs/wrapped/index.ts",
    digest: "src/codecs/digest/index.ts",
    drizzle: "src/adapters/drizzle.ts",
    hono: "src/adapters/hono.ts",
    kysely: "src/adapters/kysely.ts",
    prisma: "src/adapters/prisma.ts",
    express: "src/adapters/express.ts",
    fastify: "src/adapters/fastify.ts",
    graphql: "src/adapters/graphql.ts",
    nestjs: "src/adapters/nestjs.ts",
    cli: "bin/cli.ts",
  },
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  platform: "node",
});
