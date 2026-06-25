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
    "mikro-orm": "src/adapters/mikro-orm.ts",
    prisma: "src/adapters/prisma.ts",
    express: "src/adapters/express.ts",
    fastify: "src/adapters/fastify.ts",
    typeorm: "src/adapters/typeorm.ts",
    graphql: "src/adapters/graphql.ts",
    nestjs: "src/adapters/nestjs.ts",
    cli: "bin/cli.ts",
  },
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  platform: "node",
  inputOptions: {
    onLog(level, log, defaultHandler) {
      // rolldown-plugin-dts:fake-js transforms .d.ts files to fake-JS for bundling
      // without emitting an intermediate sourcemap, triggering SOURCEMAP_BROKEN.
      // The final .d.mts.map files are produced correctly by TypeScript's declarationMap,
      // so this warning is a false alarm about the internal processing chain.
      if (log.code === "SOURCEMAP_BROKEN" && log.plugin === "rolldown-plugin-dts:fake-js") return;
      defaultHandler(level, log);
    },
  },
});
